"""
Agent 1 — TrendsHunterAgent
Discovers top trending sports topics in India.

Priority order (STRICT official Google Trends sources only):
  1. Gemini with search grounding (Agentic strategy — 150% accurate)
  2. Visual DOM Scraping (Playwright fallback)
  3. Google Trends RSS (Reliable fallback)
"""
import json
import logging
import re
import xml.etree.ElementTree as ET
import requests
from datetime import datetime, timezone as dt_tz
from django.conf import settings
import urllib.request
from .tools import configure_gemini, fetch_google_news_rss, classify_sport, get_model_priority_list
from ..visual_trends import run_visual_fetch

logger = logging.getLogger(__name__)

# ─── Working Google Trends RSS endpoint ──────────────────────────────────────
_TRENDS_RSS_URL = 'https://trends.google.com/trending/rss'

# Google News Sports RSS for India — ordered from most sports-specific to broadest
_GNEWS_SPORTS_URLS = [
    # Sports topic feed for India (mix of all sports)
    'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0FtVnVHZ0pWVXlnQVAB?hl=en-IN&gl=IN&ceid=IN:en',
    # IPL / cricket live scores and match reports
    'https://news.google.com/rss/search?q=IPL+2026+match+today+score&hl=en-IN&gl=IN&ceid=IN:en',
    # Broader India sports events
    'https://news.google.com/rss/search?q=India+cricket+football+kabaddi+tennis+hockey+match+result&hl=en-IN&gl=IN&ceid=IN:en',
]

# Topics that are too generic to be useful as trend cards (exact-match on lowercased topic)
_GENERIC_TOPICS = frozenset([
    'highlights', 'would', 'could', 'should', 'google', 'apple', 'inside',
    'american', 'americans', 'billion', 'million', 'cricket', 'football',
    'sports', 'indian', 'can', 'olympic', 'olympics', 'tennis', 'hockey',
    'kabaddi', 'badminton', 'news', 'live', 'today', 'latest', 'top',
    'big', 'new', 'report', 'update', 'analysis', 'preview', 'review',
    'video', 'watch', 'photo', 'photos', 'gallery', 'podcast', 'interview',
    'live cricket score', 'cricket score', 'live score', 'match score',
    'yesterday match result', 'match result', 'match prediction',
    'match today', 'ipl today', 'ipl score', 'today match',
])

_HUNTER_PROMPT = """Use Google Search Grounding to check EXACTLY what is on:
https://trends.google.com/trending?geo=IN&category=17&hours=4&status=active&sort=recency

Return a JSON array of the top {max_topics} SPORTS topics only. Each object:
- topic: concise name as shown on page (1-3 words, e.g. "Virat Kohli", "IPL")
- sport: cricket|football|kabaddi|tennis|hockey|badminton|general
- search_volume: e.g. "100K+", "Active"
- heat_score: 1-100 (higher = hotter trend)
- is_breaking: true only if published < 2 hours ago
- trending_since: ISO 8601 timestamp or empty string
- source: "google_search_realtime"

Return ONLY a raw JSON array. No markdown, no explanation."""

# Strips common " - Source Name" suffixes from news headlines
_SOURCE_STRIP = re.compile(r'\s*[-|]\s*[A-Z][^-|]{3,40}$')


def _clean_title(title: str) -> str:
    """
    Cleans a sports headline to extract a concise "Topic Name".
    Example: "MS Dhoni scores century in IPL - ESPN" -> "MS Dhoni"
    """
    # 0. Strip source suffix ( - ESPN, | BBC News)
    title = _SOURCE_STRIP.sub('', title).strip()

    # 1. "X vs Y" / "X v Y" — most common sports match format (case-insensitive "vs")
    vs_match = re.search(
        r'([A-Z][A-Za-z0-9]{1,15}(?:\s+[A-Z0-9][A-Za-z0-9]*){0,2})\s+[Vv][Ss]?\.?\s+([A-Z][A-Za-z0-9]{1,15}(?:\s+[A-Z0-9][A-Za-z0-9]*){0,2})',
        title,
    )
    if vs_match:
        return vs_match.group(0)[:40].strip()

    # 2. Extract from "Entity: Headline" pattern (entity must be ≤ 4 words, no leading quote)
    if ':' in title and not title.startswith("'") and not title.startswith('"'):
        parts = title.split(':', 1)
        if 1 <= len(parts[0].split()) <= 4:
            candidate = parts[0].strip().strip("'\"")
            if candidate:
                return candidate

    # 3. Quote-prefixed titles ("Quote about topic": Story) — skip the quote, use the story part
    if title.startswith("'") or title.startswith('"'):
        after_quote = re.sub(r'^[\'"].*?[\'\"]\s*:\s*', '', title).strip()
        if after_quote and len(after_quote) > 10:
            title = after_quote
        else:
            title = title.strip("'\"")

    # 4. Remove leading question/stop words (sentence-starters that aren't proper nouns)
    title = re.sub(
        r'^(?:How|Why|When|What|Where|Who|Is|Are|The|A|An|Top|New|Best|Inside|Could|Would|Should|Can|Will|More|After|Before|With|Despite|Watch|Check|Here|All|Some|Many|Just|Popular|Breaking|Opinion|Exclusive|Analysis|Recap|Report)\s+',
        '', title, flags=re.IGNORECASE,
    )

    # 5. Find first qualifying run of Proper Nouns (capitalized, ≥ 3 chars, ≤ 4 words)
    for match in re.finditer(r'([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){0,3})', title):
        potential = match.group(0).strip()
        if len(potential) >= 3 and len(potential) < 40:
            return potential

    # Fallback: first 3 words with punctuation stripped
    words = [re.sub(r'[^A-Za-z0-9]', '', w) for w in title.split()]
    words = [w for w in words if w]
    return ' '.join(words[:3])


class TrendsHunterAgent:
    def __init__(self):
        self.max_topics = getattr(settings, 'TRENDS_MAX_TOPICS', 15)
        self.sports = getattr(settings, 'TRENDS_SPORTS', [
            'cricket', 'football', 'kabaddi', 'tennis', 'hockey', 'badminton',
        ])

    def run(self) -> list[dict]:
        """
        Run Agent 1: returns a list of raw trend dicts.
        STRICT: Only returns topics found on official Google Trends sources.
        """
        # 1. Gemini Search Grounding (Strategy 1 — Most Accurate for Realtime Trends)
        genai = configure_gemini()
        if genai:
            try:
                logger.info("Strategy 1: Attempting Gemini Search Grounding for 150% accuracy...")
                result = self._run_gemini(genai)
                if result:
                    logger.info(f"Gemini found {len(result)} high-accuracy topics.")
                    return result
            except Exception as exc:
                logger.warning(f"Gemini search grounding failed: {exc}")

        # 2. Visual DOM Scraping — (Strategy 2 — Playwright fallback)
        try:
            logger.info("Strategy 2: Attempting Visual DOM Fetch (Playwright)...")
            visual_topics = run_visual_fetch()
            if visual_topics:
                results = []
                for idx, topic in enumerate(visual_topics[:self.max_topics]):
                    sport_label = classify_sport(topic)
                    if sport_label == 'general':
                        sport_label = 'sports'
                    results.append({
                        'topic': topic,
                        'sport': sport_label,
                        'search_volume': 'Active',
                        'heat_score': max(10, 90 - idx * 3),
                        'is_breaking': idx < 3,
                        'source': 'google_trends_visual',
                        '_articles': [], '_entities': [], '_pub_date': '', '_picture': '',
                    })
                logger.info(f"Visual strategy found {len(results)} exact topics.")
                return results
        except Exception as exc:
            logger.warning(f"Visual strategy failed: {exc}")

        # 3. Google Trends RSS — Reliable, concise topics (Strategy 3)
        result = self._fetch_trends_rss()
        if result:
            return result

        return []

    # -------------------------------------------------------------------------
    # 0. Google News Sports fast-lane (RSS, no Gemini, sports-specific)
    # -------------------------------------------------------------------------

    def fetch_sports_news_fast(self) -> list[dict]:
        """
        Fetch sports-specific headlines from Google News RSS.
        Used as the immediate response on cold cache; no Gemini required.
        Runs in ~1s.
        """
        results: list[dict] = []
        seen: set[str] = set()
        _headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, */*',
            'Accept-Language': 'en-IN,en-GB;q=0.9,en;q=0.8',
        }

        for url in _GNEWS_SPORTS_URLS:
            try:
                resp = requests.get(url, headers=_headers, timeout=6)
                resp.raise_for_status()
                root = ET.fromstring(resp.content)
                rank = 0
                for item in root.findall('.//item'):
                    title_el = item.find('title')
                    pub_el = item.find('pubDate')
                    link_el = item.find('link')
                    title = (title_el.text or '').strip() if title_el is not None else ''
                    if not title:
                        continue
                    sport = classify_sport(title)
                    # Only include sports-relevant headlines
                    if sport == 'general':
                        continue
                    topic = _clean_title(title)
                    key = topic[:40].lower()
                    # Skip generic single-word topics that aren't meaningful
                    if key in _GENERIC_TOPICS or len(key) < 3:
                        continue
                    if key in seen:
                        continue
                    seen.add(key)
                    pub_date = (pub_el.text or '').strip() if pub_el is not None else ''
                    is_breaking = False
                    if pub_date:
                        try:
                            from email.utils import parsedate_to_datetime
                            pub_dt = parsedate_to_datetime(pub_date)
                            age_hours = (datetime.now(dt_tz.utc) - pub_dt).total_seconds() / 3600
                            is_breaking = age_hours < 2
                        except Exception:
                            pass
                    article_url = link_el.text.strip() if link_el is not None and link_el.text else ''
                    results.append({
                        'topic': topic,
                        'sport': sport,
                        'search_volume': 'High',
                        'heat_score': max(10, 85 - rank * 3),
                        'is_breaking': is_breaking,
                        'source': 'google_news_sports_rss',
                        '_articles': [{'title': title, 'url': article_url}],
                        '_entities': [],
                        '_pub_date': pub_date,
                        '_picture': '',
                    })
                    rank += 1
                    if len(results) >= self.max_topics:
                        break
            except Exception as exc:
                logger.warning('fetch_sports_news_fast from %s failed: %s', url[:60], exc)

            if len(results) >= self.max_topics:
                break

        return results[:self.max_topics]

    # -------------------------------------------------------------------------
    # 1. Google Trends RSS
    # -------------------------------------------------------------------------

    def _fetch_trends_rss(self) -> list[dict]:
        """
        Fetch https://trends.google.com/trending/rss?geo=IN
        This RSS endpoint is publicly accessible and returns ~20 trending items.
        Returns ONLY what is found in the RSS (no supplemental improvisation).
        """
        sports_results, all_results = self._parse_trends_rss_url(_TRENDS_RSS_URL, params={'geo': 'IN'})

        if sports_results:
            logger.info('_fetch_trends_rss: %d sports trends found.', len(sports_results))
            return sports_results[:self.max_topics]

        # No sports-specific topics found — return empty so coordinator falls to sports RSS fast-lane
        logger.info('_fetch_trends_rss: no sports topics found in Google Trends RSS (total=%d), returning []', len(all_results))
        return []

    def _parse_trends_rss_url(self, url: str, params: dict = None) -> tuple[list[dict], list[dict]]:
        """Parse a Google Trends RSS URL. Returns (sports_results, all_results)."""
        try:
            resp = requests.get(
                url,
                params=params or {},
                timeout=8,
                headers={
                    'User-Agent': (
                        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                        '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                    ),
                    'Accept': 'application/rss+xml, application/xml, */*',
                    'Accept-Language': 'en-IN,en-GB;q=0.9,en;q=0.8',
                },
            )
            resp.raise_for_status()
        except Exception as exc:
            logger.warning('_parse_trends_rss_url %s failed: %s', url, exc)
            return [], []

        try:
            root = ET.fromstring(resp.content)
        except ET.ParseError as exc:
            logger.warning('_parse_trends_rss_url XML parse error: %s', exc)
            return [], []

        ht_ns = 'https://trends.google.com/trending/rss'
        all_results: list[dict] = []
        sports_results: list[dict] = []
        seen: set[str] = set()

        for i, item in enumerate(root.findall('.//item')):
            title_el = item.find('title')
            pub_el = item.find('pubDate')
            traffic_el = item.find(f'{{{ht_ns}}}approx_traffic')
            picture_el = item.find(f'{{{ht_ns}}}picture')

            title = (title_el.text or '').strip() if title_el is not None else ''
            if not title:
                continue

            key = title[:40].lower()
            if key in seen:
                continue
            seen.add(key)

            traffic = (traffic_el.text or 'High').strip() if traffic_el is not None else 'High'
            pub_date = (pub_el.text or '').strip() if pub_el is not None else ''
            picture_url = (picture_el.text or '').strip() if picture_el is not None else ''

            # Collect linked news articles (always in English, even for regional-script titles)
            articles = []
            for ni in item.findall(f'{{{ht_ns}}}news_item'):
                nt = ni.find(f'{{{ht_ns}}}news_item_title')
                nu = ni.find(f'{{{ht_ns}}}news_item_url')
                if nt is not None and nt.text:
                    articles.append({
                        'title': nt.text.strip(),
                        'url': (nu.text or '').strip() if nu is not None else '',
                    })

            # Classify using BOTH the trend title AND the English article headlines
            # This handles regional-language trend names (Kannada/Hindi/Tamil etc.)
            article_text = ' '.join(a['title'] for a in articles)
            sport = classify_sport(title + ' ' + article_text)

            # Heat score: items higher up in the RSS feed are hotter
            heat_score = max(10, 90 - i * 3)

            # is_breaking: published in the last 2 hours
            is_breaking = False
            if pub_date:
                try:
                    from email.utils import parsedate_to_datetime
                    pub_dt = parsedate_to_datetime(pub_date)
                    age_hours = (datetime.now(dt_tz.utc) - pub_dt).total_seconds() / 3600
                    is_breaking = age_hours < 2
                except Exception:
                    pass

            entry = {
                'topic': _clean_title(title),
                'sport': sport,
                'search_volume': traffic,
                'heat_score': heat_score,
                'is_breaking': is_breaking,
                'source': 'google_trends_rss',
                '_articles': articles[:3],
                '_entities': [],
                '_pub_date': pub_date,
                '_picture': picture_url,
                '_original_title': title,
            }
            all_results.append(entry)
            if sport != 'general':
                sports_results.append(entry)

        return sports_results, all_results

    # -------------------------------------------------------------------------
    # 2. Gemini Search Grounding (fixed for google-generativeai>=0.8)
    # -------------------------------------------------------------------------

    def _run_gemini(self, genai) -> list[dict]:
        for model_name, tool_spec in get_model_priority_list():
            try:
                model = genai.GenerativeModel(model_name=model_name, tools=tool_spec)
                prompt = _HUNTER_PROMPT.format(max_topics=self.max_topics)
                response = model.generate_content(prompt)
                result = self._parse_gemini_response(response.text)
                if result:
                    logger.info('TrendsHunterAgent: Gemini (%s) returned %d topics', model_name, len(result))
                    return result
            except Exception as exc:
                logger.warning('TrendsHunterAgent Gemini %s failed: %s', model_name, exc)

        return []

    def _parse_gemini_response(self, text: str) -> list[dict]:
        text = re.sub(r'```(?:json)?', '', text).strip().rstrip('`')
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if not match:
            return []
        try:
            items = json.loads(match.group())
            validated = []
            for item in items:
                if not isinstance(item, dict) or not item.get('topic'):
                    continue
                validated.append({
                    'topic': str(item.get('topic', '')).strip(),
                    'sport': str(item.get('sport', 'general')).lower(),
                    'search_volume': str(item.get('search_volume', 'High')).strip(),
                    'heat_score': int(item.get('heat_score', 50)),
                    'is_breaking': bool(item.get('is_breaking', False)),
                    'source': 'gemini_search',
                })
            return validated[:self.max_topics]
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning('TrendsHunterAgent Gemini parse error: %s', exc)
            return []
