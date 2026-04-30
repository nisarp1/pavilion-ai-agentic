"""
Coordinator — runs the 3-agent Trends pipeline and manages Redis caching.
Entry point: run_trends_pipeline()
"""
import dataclasses
import logging
import re
import time
from datetime import datetime, timezone as dt_timezone
from django.core.cache import cache
from django.conf import settings

logger = logging.getLogger(__name__)

CACHE_KEY = 'agentic_trends_v1'
CACHE_TS_KEY = 'agentic_trends_v1_ts'
CACHE_PREV_KEY = 'agentic_trends_v1_prev'
LOCK_KEY = 'agentic_trends_pipeline_lock'
SOFT_TTL_RATIO = 0.8


@dataclasses.dataclass
class TrendResult:
    topic: str
    heat_score: float
    search_volume: str
    rank: int
    summary: str
    reason: str
    recency_trigger: str
    is_live_match: bool
    sport: str
    articles: list  # [{'title': str, 'url': str}]
    source: str
    trending_since: str  # ISO timestamp or pub_date string
    is_breaking: bool
    entities: list  # [str]
    ai_confidence: float
    editorial_angle: str = ''
    velocity: int = 0  # positive = rising rank, negative = falling


def _dict_to_result(d: dict) -> TrendResult:
    return TrendResult(
        topic=d.get('topic', ''),
        heat_score=float(d.get('heat_score', 0)),
        search_volume=d.get('search_volume', 'High'),
        rank=int(d.get('rank', 0)),
        summary=d.get('summary', ''),
        reason=d.get('reason', ''),
        recency_trigger=d.get('recency_trigger', ''),
        is_live_match=bool(d.get('is_live_match', False)),
        sport=d.get('sport', 'general'),
        articles=d.get('articles', []),
        source=d.get('source', ''),
        trending_since=d.get('_pub_date', '') or datetime.now(dt_timezone.utc).isoformat(),
        is_breaking=bool(d.get('is_breaking', False)),
        entities=d.get('entities', []),
        ai_confidence=float(d.get('ai_confidence', 0.5)),
        editorial_angle=d.get('editorial_angle', ''),
        velocity=int(d.get('velocity', 0)),
    )


def _deduplicate_topics(raw: list[dict]) -> list[dict]:
    """Normalize and deduplicate topics, keeping the higher heat_score entry."""
    seen: dict[str, dict] = {}
    for t in raw:
        key = re.sub(r'\b20\d{2}\b', '', t['topic'].lower()).strip()
        key = re.sub(r'\s+', ' ', key)
        if key not in seen:
            seen[key] = t
        elif t.get('heat_score', 0) > seen[key].get('heat_score', 0):
            seen[key] = t
    return list(seen.values())


def _trigger_background_refresh():
    """Fire-and-forget Celery task to refresh the trends cache in the background."""
    try:
        from workers.tasks import run_agentic_trends_celery
        run_agentic_trends_celery.delay()
        logger.info('Agentic trends: soft-TTL triggered background refresh')
    except Exception as exc:
        logger.warning('Agentic trends: background refresh trigger failed: %s', exc)


def run_trends_pipeline(force_refresh: bool = False) -> dict:
    """
    Run the full 3-agent pipeline.
    Returns a dict compatible with both old and new frontend:
      {
        'trending_topics': [str, ...],          # backward-compat flat list
        'enriched_trends': [{...}, ...],        # new enriched list
        'count': int,
        'timestamp': str,
        'cached': bool,
      }
    """
    cache_ttl = getattr(settings, 'TRENDS_CACHE_TTL', 300)
    soft_ttl = int(cache_ttl * SOFT_TTL_RATIO)

    if not force_refresh:
        cached = cache.get(CACHE_KEY)
        if cached:
            cached_at = cache.get(CACHE_TS_KEY)
            if cached_at:
                age = (datetime.now(dt_timezone.utc) - cached_at).total_seconds()
                if age > soft_ttl:
                    _trigger_background_refresh()
            cached['cached'] = True
            logger.info('Agentic trends: cache HIT')
            return cached

        # Cold start: return sports news immediately, trigger Celery to warm cache.
        # If another request already holds the lock (Gemini pipeline running), just
        # serve sports RSS immediately without waiting — Celery will warm the cache.
        logger.info('Agentic trends: cache MISS — returning sports RSS immediately, triggering Celery refresh')
        _trigger_background_refresh()
        return _run_rss_only_pipeline()

    else:
        # Force refresh: acquire lock to prevent duplicate forced-refresh runs
        if not cache.add(LOCK_KEY, 1, 120):
            logger.info('Agentic trends: forced refresh lock held — waiting for existing run')
            for _ in range(34):
                time.sleep(3)
                result = cache.get(CACHE_KEY)
                if result:
                    result['cached'] = True
                    return result
            return _run_rss_only_pipeline()

    logger.info('Agentic trends: running pipeline (Hunter → Enricher → Ranker)')
    try:
        from .trends_hunter import TrendsHunterAgent
        from .context_enricher import ContextEnricherAgent
        from .trend_ranker import TrendRankerAgent

        # Capture previous payload for velocity calculation
        old_payload = cache.get(CACHE_KEY)
        if old_payload:
            cache.set(CACHE_PREV_KEY, old_payload, cache_ttl * 4)
        prev_ranks = {
            t['topic']: t['rank']
            for t in (old_payload or {}).get('enriched_trends', [])
            if isinstance(t, dict)
        }

        raw_topics = TrendsHunterAgent().run()
        if not raw_topics:
            raise ValueError('TrendsHunterAgent returned no topics')

        raw_topics = _deduplicate_topics(raw_topics)
        enriched = ContextEnricherAgent().enrich(raw_topics)
        ranked = TrendRankerAgent().rank(enriched, prev_ranks=prev_ranks)

        results = [_dict_to_result(d) for d in ranked]
        payload = _build_payload(results, cached=False)

        cache.set(CACHE_KEY, payload, cache_ttl)
        cache.set(CACHE_TS_KEY, datetime.now(dt_timezone.utc), cache_ttl)
        return payload

    except Exception as exc:
        logger.error(f'Agentic trends pipeline failed: {exc}', exc_info=True)
        rss_payload = _run_rss_only_pipeline()
        # Cache the sports RSS result with a short TTL so we don't serve stale non-sports data
        if rss_payload.get('count', 0) > 0 and not rss_payload.get('fallback'):
            cache.set(CACHE_KEY, rss_payload, min(cache_ttl, 120))
            cache.set(CACHE_TS_KEY, datetime.now(dt_timezone.utc), min(cache_ttl, 120))
        return rss_payload

    finally:
        cache.delete(LOCK_KEY)


def _run_rss_only_pipeline() -> dict:
    """
    Fast sports news fallback: Google News Sports RSS + RSS enrichment.
    Takes ~1 second. Returns current sports headlines as interim data
    while the full Gemini pipeline runs in the background.
    """
    try:
        from .trends_hunter import TrendsHunterAgent
        from .context_enricher import ContextEnricherAgent
        from .trend_ranker import TrendRankerAgent

        hunter = TrendsHunterAgent()
        # Try sports-specific Google News RSS first (best sports coverage)
        raw = hunter.fetch_sports_news_fast()
        # Fall back to Google Trends RSS if Google News fails
        if not raw:
            raw = hunter._fetch_trends_rss()
        if not raw:
            return _fallback_payload()
        raw = _deduplicate_topics(raw)
        enriched = ContextEnricherAgent().enrich(raw, gemini_enabled=False)
        ranked = TrendRankerAgent().rank(enriched)
        results = [_dict_to_result(d) for d in ranked]
        payload = _build_payload(results, cached=False)
        payload['rss_only'] = True  # signal to frontend that Gemini data is pending
        return payload
    except Exception as exc:
        logger.error('Agentic trends RSS-only pipeline failed: %s', exc)
        return _fallback_payload()


def _build_payload(results: list[TrendResult], cached: bool) -> dict:
    return {
        'trending_topics': [r.topic for r in results],
        'enriched_trends': [dataclasses.asdict(r) for r in results],
        'count': len(results),
        'timestamp': datetime.now(dt_timezone.utc).isoformat(),
        'cached': cached,
    }


def _fallback_payload() -> dict:
    """Static fallback when both Gemini and RSS fail completely."""
    fallback_topics = [
        'IPL 2025 Latest Updates', 'India vs Australia Cricket', 'ISL Football Season',
        'Badminton India Open', 'Indian Football Team', 'Pro Kabaddi League',
        'Tennis Indian Wells Results', 'India Hockey League', 'Cricket World Cup Qualifiers',
        'IPL Auction 2025',
    ]
    results = [
        TrendResult(
            topic=t, heat_score=50.0 - i * 2, search_volume='High', rank=i + 1,
            summary='', reason='Trending in sports', recency_trigger='', is_live_match=False,
            sport='general', articles=[], source='fallback',
            trending_since=datetime.now(dt_timezone.utc).isoformat(),
            is_breaking=False, entities=[], ai_confidence=0.0,
        )
        for i, t in enumerate(fallback_topics)
    ]
    return {**_build_payload(results, cached=False), 'fallback': True}
