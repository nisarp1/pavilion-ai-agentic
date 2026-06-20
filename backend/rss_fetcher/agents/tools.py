"""Shared utilities for the agentic trends pipeline."""
import json
import logging
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from django.conf import settings
import re

logger = logging.getLogger(__name__)

_SPORT_KEYWORDS = {
    'cricket': [
        r'cricket', r'ipl', r'bcci', r'test\s+match', r'odi', r't20', r'icc',
        r'virat', r'kohli', r'rohit\s+sharma', r'dhoni', r'bumrah', r'hardik', r'pandya',
        r'kl\s+rahul', r'pant', r'shami', r'gill', r'jaiswal', r'siraj', r'jadeja',
        r'babar\s+azam', r'stokes', r'cummins', r'root', r'smith', r'warner',
        r'world\s+cup', r'wicket', r'century', r'half-century', r'scorecard', r'live\s+score',
        r'batsman', r'bowler', r'all-rounder', r'stadium', r'lords', r'melbourne', r'wankhede',
        r'csk', r'mi', r'rcb', r'kkr', r'srh', r'lsg', r'gt', r'pbks', r'dc', r'rr',
        r'chennai\s+super\s+kings', r'mumbai\s+indians', r'royal\s+challengers', r'kolkata\s+knight\s+riders',
        r'sunrisers', r'lucknow\s+super\s+giants', r'gujarat\s+titans', r'punjab\s+kings', r'delhi\s+capitals', r'rajasthan\s+royals',
        r'ashwin', r'rahane', r'shikhar', r'iyer', r'sky', r'suryakumar', r'ishans\s+kishan', r'gaikwad',
    ],
    'football': [
        r'football', r'soccer', r'isl', r'fifa', r'premier\s+league', r'la\s+liga',
        r'serie\s+a', r'bundesliga', r'ligue\s+1', r'champions\s+league', r'ucl', r'uel',
        r'sunil\s+chhetri', r'messi', r'ronaldo', r'mbappe', r'haaland', r'neymar',
        r'liverpool', r'manchester\s+city', r'manchester\s+united', r'man\s+utd', r'man\s+city', r'arsenal', r'chelsea',
        r'real\s+madrid', r'barcelona', r'bayern', r'psg', r'juventus', r'inter\s+milan',
        r'ac\s+milan', r'goal', r'striker', r'midfielder', r'defender', r'goalkeeper',
        r'penalty', r'offside', r'var', r'transfer\s+news', r'hat-trick',
        r'mohun\s+bagan', r'east\s+bengal', r'kerala\s+blasters', r'mumbai\s+city\s+fc', r'bengaluru\s+fc',
    ],
    'kabaddi': [r'kabaddi', r'pkl', r'pro\s+kabaddi', r'raid', r'tackle', r'all-out'],
    'tennis': [
        r'tennis', r'wimbledon', r'us\s+open', r'french\s+open', r'australian\s+open',
        r'atp', r'wta', r'grand\s+slam', r'federer', r'nadal', r'djokovic', r'alcaraz',
        r'sinner', r'swiatek', r'sabalenka', r'rohan\s+bopanna',
    ],
    'hockey': [r'hockey', r'fih', r'field\s+hockey', r'p\s+r\s+sreejesh', r'manpreet\s+singh'],
    'badminton': [
        r'badminton', r'bwf', r'pv\s+sindhu', r'saina\s+nehwal', r'lakshya\s+sen',
        r'prannoy', r'chirag\s+shetty', r'satwiksairaj', r'kidambi\s+srikanth',
    ],
}

_SPORT_PATTERNS = {
    sport: [re.compile(r'\b' + kw + r'\b', re.IGNORECASE) for kw in keywords]
    for sport, keywords in _SPORT_KEYWORDS.items()
}


def get_model_priority_list():
    """Returns model names in priority order (for backward compat — tools arg ignored)."""
    from agents.gemini_client import get_model_name
    # All inference now routes through the shared Claude client; report the real model.
    return [(get_model_name(), [])]  # tool_spec is empty; callers use call_gemini_grounded()


def call_vertex_ai(prompt: str, model: str = '', location: str = '') -> str | None:
    """
    Text completion for the newsroom pipeline. Now routes through the shared Claude
    client (web-grounded when ENABLE_WEB_GROUNDING is set, plain otherwise). The
    `model`/`location` args are kept for call-site compatibility but ignored.
    Returns the response text, or None on failure.
    """
    from agents import claude_client
    try:
        return claude_client.complete_grounded(prompt)
    except Exception as exc:
        logger.warning('call_vertex_ai failed: %s', exc)
        return None


def configure_gemini():
    """Return a sentinel truthy value so callers can fall back to RSS when the LLM
    is unavailable. Now gated on ANTHROPIC_API_KEY (Claude) rather than Gemini."""
    try:
        import os
        if not os.environ.get('ANTHROPIC_API_KEY', ''):
            raise RuntimeError('ANTHROPIC_API_KEY is not configured')
        return True
    except Exception as exc:
        logger.warning('LLM not available — agentic trends will use RSS fallback only: %s', exc)
        return None


def call_gemini_grounded(prompt: str, *, model: str | None = None) -> str | None:
    """
    Web-grounded completion via the shared Claude client (web_search when
    ENABLE_WEB_GROUNDING is set, plain completion otherwise). The `model` arg is
    kept for call-site compatibility but ignored. Returns response text, or None.
    """
    from agents import claude_client
    try:
        return claude_client.complete_grounded(prompt)
    except Exception as exc:
        logger.warning('call_gemini_grounded failed: %s', exc)
        return None


def fetch_google_news_rss(query: str, geo: str = 'IN', max_items: int = 10) -> list[dict]:
    """
    Fetch Google News RSS for a query and return parsed items.
    Used as fallback when Gemini is unavailable or quota exceeded.
    """
    encoded = urllib.parse.quote(f'{query} India')
    url = (
        f'https://news.google.com/rss/search?q={encoded}'
        f'&hl=en-IN&gl={geo}&ceid={geo}:en'
    )
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            xml_data = resp.read()
        root = ET.fromstring(xml_data)
        items = []
        for item in root.findall('.//item')[:max_items]:
            title_el = item.find('title')
            link_el = item.find('link')
            pub_el = item.find('pubDate')
            if title_el is not None and title_el.text:
                items.append({
                    'title': title_el.text.strip(),
                    'url': link_el.text.strip() if link_el is not None and link_el.text else '',
                    'pub_date': pub_el.text.strip() if pub_el is not None and pub_el.text else '',
                })
        return items
    except Exception as exc:
        logger.warning(f'RSS fetch failed for "{query}": {exc}')
        return []


def classify_sport(text: str) -> str:
    """Keyword-based sport classification using regex word boundaries. Returns one of the sport keys or 'general'."""
    lower = text.lower()
    for sport, patterns in _SPORT_PATTERNS.items():
        for pattern in patterns:
            if pattern.search(lower):
                return sport
    return 'general'
