"""
Sports Trend Radar — the free, multi-source trend layer.

Aggregates what a human would otherwise open three browser tabs to check, and does
the part they cannot do by hand: sports-filter, merge across platforms, and rank by
CROSS-SOURCE momentum (a topic trending on BOTH Google and X is a stronger signal
than one seen in a single tab).

Sources (all free, no API keys, no LLM):
  - google_trends : trends.google.com/trending/rss?geo=IN   (real trend spikes + volume)
  - x             : trends24.in/india                        (X/Twitter India trends)
  - news          : Google News sports RSS                   (guaranteed-sports backbone → never empty)

Meta/Facebook is deliberately absent: it has had no public trends surface since ~2022,
so no product (or human) can source it. We don't fake it.

Cost: ZERO. This whole module is HTTP + keyword classification. Gemini enrichment
(context/"why trending") is a SEPARATE, optional, paid layer in the coordinator that
only runs on explicit Refresh when ENABLE_TRENDS_ENRICHMENT=true.

Reliability: every source is fetched under its own try/except — one dead source never
sinks the others, and the news backbone keeps the radar non-empty on a quiet sports day.
"""
import logging
import re

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
       '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')

# Human-readable labels for the source badges the UI shows.
SOURCE_LABELS = {'google_trends': 'Google', 'x': 'X', 'news': 'News'}


def _norm(topic: str) -> str:
    """Normalised key for matching the same topic across sources (drop year, punctuation)."""
    k = (topic or '').lower()
    k = re.sub(r'\b20\d{2}\b', '', k)
    k = re.sub(r'[^a-z0-9-￿ ]', ' ', k)   # keep alnum + non-ASCII (regional scripts)
    return re.sub(r'\s+', ' ', k).strip()


# ── Individual sources (each returns a list of normalized candidate dicts) ─────────

def _fetch_google_trends() -> list[dict]:
    """Real Google Trends spikes for India, already sports-filtered by the hunter."""
    try:
        from .trends_hunter import TrendsHunterAgent
        raw = TrendsHunterAgent()._fetch_trends_rss() or []
        out = []
        for t in raw:
            topic = (t.get('topic') or '').strip()
            if not topic:
                continue
            out.append({
                'topic': topic,
                'source': 'google_trends',
                'sport': t.get('sport', 'general'),
                'search_volume': t.get('search_volume', ''),
                'heat_score': float(t.get('heat_score', 60)),
                'articles': t.get('articles', []),
                '_pub_date': t.get('_pub_date', ''),
                'is_breaking': bool(t.get('is_breaking', False)),
            })
        logger.info('SportsRadar: google_trends → %d sports topics', len(out))
        return out
    except Exception as exc:
        logger.warning('SportsRadar: google_trends source failed: %s', exc)
        return []


def _fetch_x_trends() -> list[dict]:
    """X/Twitter India trends via Trends24, sports-filtered by keyword ONLY (no LLM)."""
    try:
        from .tools import classify_sport
        resp = requests.get('https://trends24.in/india/', timeout=12,
                            headers={'User-Agent': _UA})
        if resp.status_code != 200:
            logger.warning('SportsRadar: trends24 HTTP %s', resp.status_code)
            return []
        soup = BeautifulSoup(resp.content, 'html.parser')
        lists = soup.find_all('ol', class_='trend-card__list')

        def _text(li):
            a = li.find('a')
            t = a.get_text(strip=True) if a else re.sub(r'\s*\d+[KkMm]$', '', li.get_text(strip=True)).strip()
            return t

        seen, out = set(), []
        # top 3 hourly lists = the freshest X trends
        for lst in lists[:3]:
            for li in lst.find_all('li'):
                txt = _text(li)
                if not txt or len(txt) < 3 or txt.lower() in seen:
                    continue
                seen.add(txt.lower())
                sport = classify_sport(txt)
                if sport != 'general':                       # keyword sports-filter, free
                    out.append({'topic': txt, 'source': 'x', 'sport': sport,
                                'search_volume': '', 'heat_score': 55.0, 'articles': []})
        logger.info('SportsRadar: x/trends24 → %d sports topics', len(out))
        return out
    except Exception as exc:
        logger.warning('SportsRadar: x source failed: %s', exc)
        return []


def _fetch_news() -> list[dict]:
    """Google News sports RSS — the guaranteed-sports backbone that keeps the radar non-empty."""
    try:
        from .trends_hunter import TrendsHunterAgent
        raw = TrendsHunterAgent().fetch_sports_news_fast() or []
        out = []
        for t in raw:
            topic = (t.get('topic') or '').strip()
            if not topic:
                continue
            out.append({
                'topic': topic,
                'source': 'news',
                'sport': t.get('sport', 'general'),
                'search_volume': t.get('search_volume', ''),
                'heat_score': float(t.get('heat_score', 40)),
                'articles': t.get('articles', []),
                '_pub_date': t.get('_pub_date', ''),
                'is_breaking': bool(t.get('is_breaking', False)),
            })
        logger.info('SportsRadar: news → %d sports topics', len(out))
        return out
    except Exception as exc:
        logger.warning('SportsRadar: news source failed: %s', exc)
        return []


# ── Merge + rank ───────────────────────────────────────────────────────────────

# A topic confirmed by another independent platform is worth far more than raw heat —
# this is the whole point of the radar, so cross-source agreement dominates the sort.
_CROSS_SOURCE_BONUS = 1000


def build_radar_topics(max_topics: int = 15) -> list[dict]:
    """Fetch all sources, merge by topic, rank by cross-source momentum. Free, never raises."""
    buckets: dict[str, dict] = {}
    for fetch in (_fetch_google_trends, _fetch_x_trends, _fetch_news):
        for cand in fetch():
            key = _norm(cand['topic'])
            if not key:
                continue
            b = buckets.get(key)
            if b is None:
                buckets[key] = {
                    'topic': cand['topic'],
                    'sources': [cand['source']],
                    'sport': cand.get('sport', 'general'),
                    'search_volume': cand.get('search_volume', ''),
                    'heat_score': cand.get('heat_score', 40.0),
                    'articles': cand.get('articles', []),
                    '_pub_date': cand.get('_pub_date', ''),
                    'is_breaking': cand.get('is_breaking', False),
                }
            else:
                if cand['source'] not in b['sources']:
                    b['sources'].append(cand['source'])
                # keep the richest data across sources
                b['heat_score'] = max(b['heat_score'], cand.get('heat_score', 0))
                if not b['search_volume'] and cand.get('search_volume'):
                    b['search_volume'] = cand['search_volume']
                if not b['articles'] and cand.get('articles'):
                    b['articles'] = cand['articles']
                if b.get('sport', 'general') == 'general' and cand.get('sport') not in (None, 'general'):
                    b['sport'] = cand['sport']
                b['is_breaking'] = b['is_breaking'] or cand.get('is_breaking', False)

    merged = list(buckets.values())
    for b in merged:
        b['cross_source'] = len(b['sources']) > 1
        b['momentum'] = (len(b['sources']) - 1) * _CROSS_SOURCE_BONUS + b['heat_score']
        # human-readable provenance, e.g. "Google + X"
        b['source'] = ' + '.join(SOURCE_LABELS.get(s, s) for s in b['sources'])
        if b['cross_source']:
            b['reason'] = 'Trending across ' + ' and '.join(SOURCE_LABELS.get(s, s) for s in b['sources'])
        else:
            b['reason'] = f"Trending on {SOURCE_LABELS.get(b['sources'][0], b['sources'][0])}"

    merged.sort(key=lambda x: x['momentum'], reverse=True)
    for i, b in enumerate(merged):
        b['rank'] = i + 1
    logger.info('SportsRadar: merged %d topics (%d cross-source)',
                len(merged), sum(1 for b in merged if b['cross_source']))
    return merged[:max_topics]


# ── Optional cheap enrichment: ONE batched Gemini call ─────────────────────────

def enrich_radar_batch(topics: list[dict]) -> list[dict]:
    """Clean + classify + contextualise the whole radar in a SINGLE Gemini call.

    Regex can't turn "Wayne Rooney Delivers Brutal…" into a clean card or tell cricket
    from football; one cheap LLM pass can. Given the merged candidates + their source
    headlines, the model returns, for each: a clean topic name, the correct sport, a
    one-line "why it's trending", and whether it's a real newsworthy sports story
    (junk fragments like "Skipper"/"Awkward" are dropped).

    ONE call for the entire list (~₹0.05), invoked only on explicit Refresh, cached and
    debounced upstream. FAIL-SAFE: any error returns the free topics unchanged — the
    radar never breaks or blocks on enrichment.
    """
    if not topics:
        return topics
    try:
        import json as _json
        lines = []
        for i, t in enumerate(topics):
            heads = '; '.join(a.get('title', '') for a in (t.get('articles') or [])[:2])
            lines.append(f'{i}. "{t.get("topic","")}" (sources: {t.get("source","")}; headlines: {heads[:180]})')
        prompt = (
            "You are a sports news desk editor. For each candidate trending item below, decide if it is a "
            "REAL, specific, newsworthy SPORTS story (a player, team, match, event or result) — not a vague "
            "fragment (e.g. 'Skipper', 'Awkward', 'Down'), not politics/entertainment.\n\n"
            "Return a JSON array; one object per input index with EXACTLY these keys:\n"
            '  "i": the input index (int)\n'
            '  "keep": true only if it is a real, specific sports story\n'
            '  "topic": a clean 1-4 word display name (e.g. "Kylian Mbappé", "India vs Australia", "Virat Kohli")\n'
            '  "sport": one of cricket|football|kabaddi|tennis|hockey|badminton|athletics|general\n'
            '  "why": one short factual line on why it is trending (<=12 words), or ""\n\n'
            "Use ONLY the given topic and headlines — never invent facts. Return ONLY the raw JSON array.\n\n"
            "CANDIDATES:\n" + "\n".join(lines)
        )
        from agents.gemini_client import generate_text as _gen
        raw = _gen(prompt, json_mode=True) or ""
        s, e = raw.find('['), raw.rfind(']')
        if s == -1 or e == -1:
            logger.warning('SportsRadar enrich: no JSON array in response; using free topics')
            return topics
        verdicts = _json.loads(raw[s:e + 1])
        by_i = {int(v['i']): v for v in verdicts if isinstance(v, dict) and 'i' in v}

        out = []
        for i, t in enumerate(topics):
            v = by_i.get(i)
            if v is None:
                out.append(t)                 # no verdict → keep as-is
                continue
            if not v.get('keep', True):
                continue                       # drop junk / non-sports
            t = dict(t)
            if v.get('topic'):
                t['topic'] = str(v['topic']).strip()
            if v.get('sport'):
                t['sport'] = str(v['sport']).strip()
            if v.get('why'):
                t['reason'] = str(v['why']).strip()
                t['editorial_angle'] = t['reason']
            t['enriched'] = True
            out.append(t)
        # re-rank after drops
        out.sort(key=lambda x: x.get('momentum', 0), reverse=True)
        for idx, t in enumerate(out):
            t['rank'] = idx + 1
        logger.info('SportsRadar enrich: %d in → %d kept (Gemini, 1 call)', len(topics), len(out))
        return out or topics
    except Exception as exc:
        logger.warning('SportsRadar enrich failed (%s); serving free topics', exc)
        return topics
