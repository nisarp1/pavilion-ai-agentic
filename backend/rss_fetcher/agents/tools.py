"""Shared utilities for the agentic trends pipeline."""
import json
import logging
import time
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
    configured = get_model_name()
    fallbacks = ['gemini-2.5-flash', 'gemini-2.0-flash']
    seen: set[str] = set()
    result = []
    for m in [configured] + fallbacks:
        if m not in seen:
            seen.add(m)
            result.append((m, []))  # tool_spec is empty; callers use call_gemini_grounded()
    return result


_vertex_creds_cache = {'creds': None, 'project': None, 'expires_at': 0}


def call_vertex_ai(prompt: str, model: str = 'gemini-2.5-flash', location: str = 'us-central1') -> str | None:
    """
    Call Vertex AI Gemini via the REST API using the GCP service account.
    Bypasses the AI Studio free-tier quota entirely — uses cloud-platform scope.
    Returns the response text, or None on failure.
    """
    import requests as http_requests
    try:
        import google.auth
        import google.auth.transport.requests

        cache = _vertex_creds_cache
        now = time.time()

        # Refresh credentials if missing or expiring within 60 s
        if cache['creds'] is None or now >= cache['expires_at'] - 60:
            creds, detected_project = google.auth.default(
                scopes=['https://www.googleapis.com/auth/cloud-platform']
            )
            auth_req = google.auth.transport.requests.Request()
            creds.refresh(auth_req)
            cache['creds'] = creds
            cache['project'] = detected_project
            # google.auth expiry is a datetime; convert to epoch
            expiry = getattr(creds, 'expiry', None)
            cache['expires_at'] = expiry.timestamp() if expiry else (now + 3600)

        creds = cache['creds']
        project = cache['project']

        # Strip litellm prefixes from model name (e.g. "vertex_ai/gemini-2.5-flash")
        if '/' in model:
            model = model.split('/', 1)[1]

        endpoint = (
            f'https://{location}-aiplatform.googleapis.com/v1'
            f'/projects/{project}/locations/{location}'
            f'/publishers/google/models/{model}:generateContent'
        )
        headers = {
            'Authorization': f'Bearer {creds.token}',
            'Content-Type': 'application/json',
        }
        body = {'contents': [{'role': 'user', 'parts': [{'text': prompt}]}]}

        resp = http_requests.post(endpoint, headers=headers, json=body, timeout=120)
        if resp.status_code == 200:
            data = resp.json()
            return data['candidates'][0]['content']['parts'][0]['text']
        logger.warning('Vertex AI %s returned %d: %s', model, resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning('call_vertex_ai failed (%s): %s', model, exc)
    return None


def configure_gemini():
    """Return a sentinel truthy value so callers can fall back to RSS when Gemini is unavailable."""
    try:
        import os
        vertex_project = os.environ.get('VERTEX_PROJECT') or os.environ.get('VERTEXAI_PROJECT', '')
        api_key = os.environ.get('GEMINI_API_KEY', '')
        if not vertex_project and not api_key:
            raise RuntimeError('Neither VERTEX_PROJECT nor GEMINI_API_KEY is configured')
        return True
    except Exception as exc:
        logger.warning('Gemini not available — agentic trends will use RSS fallback only: %s', exc)
        return None


def call_gemini_grounded(prompt: str, *, model: str | None = None) -> str | None:
    """
    Call Gemini with Google Search Grounding enabled via Vertex AI REST API.
    Falls back to plain generate_text() if Vertex AI is not configured.
    Returns response text, or None on failure.
    """
    from agents.gemini_client import generate_grounded, generate_text
    try:
        return generate_grounded(prompt)
    except Exception as exc:
        logger.warning('call_gemini_grounded failed: %s', exc)
        try:
            return generate_text(prompt)
        except Exception:
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
