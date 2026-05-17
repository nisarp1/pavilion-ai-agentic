"""
Coordinator — runs the agentic Trends pipeline.

Architecture (always-fresh design):
  Every request:
    1. Fetch LIVE sports headlines from Google News RSS (~1s, never stale)
    2. If Gemini enrichment is cached and fresh → merge context into live topics
    3. If enrichment is missing/stale → trigger background Celery task to rebuild it

  Background (Celery):
    run_trends_pipeline(force_refresh=True) → _run_enrichment_only()
    Runs Hunter → Enricher → Ranker with Gemini, stores per-topic enrichment map.

This guarantees:
  - Topics shown are ALWAYS real-time (never cached topic list)
  - Gemini context (reason, entities, editorial_angle) is best-effort from background
  - No scenario where stale or fallback topics replace live ones
"""
import dataclasses
import logging
import re
import time
from datetime import datetime, timezone as dt_timezone
from django.core.cache import cache
from django.conf import settings

logger = logging.getLogger(__name__)

# Enrichment cache: stores {topic_key → enriched_dict} (NOT the full payload)
ENRICHMENT_CACHE_KEY = 'agentic_enrichment_v2'
ENRICHMENT_TS_KEY    = 'agentic_enrichment_v2_ts'
LOCK_KEY             = 'agentic_trends_pipeline_lock'
SOFT_TTL_RATIO       = 0.8


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


def _topic_key(topic: str) -> str:
    """Normalised key for topic matching between RSS and enrichment."""
    k = re.sub(r'\b20\d{2}\b', '', topic.lower()).strip()
    return re.sub(r'\s+', ' ', k)


def _trigger_background_refresh():
    """Fire-and-forget: ask Celery to rebuild the Gemini enrichment cache."""
    try:
        from workers.tasks import run_agentic_trends_celery
        run_agentic_trends_celery.delay()
        logger.info('Agentic trends: background enrichment refresh triggered')
    except Exception as exc:
        logger.warning('Agentic trends: background refresh trigger failed: %s', exc)


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

def run_trends_pipeline(force_refresh: bool = False) -> dict:
    """
    Public entry point called by all trend views and the Celery beat task.

    Always returns LIVE data from sports RSS, augmented with cached Gemini enrichment.
    force_refresh is only used by the Celery beat task to rebuild enrichment.
    """
    try:
        if force_refresh:
            return _run_enrichment_only()

        cache_ttl = getattr(settings, 'TRENDS_CACHE_TTL', 300)
        soft_ttl  = int(cache_ttl * SOFT_TTL_RATIO)

        # ── Step 1: Always fetch live sports headlines ────────────────────────────
        fresh = _run_rss_only_pipeline()
        if fresh.get('fallback'):
            logger.warning('Agentic trends: both RSS and fallback failed, returning static fallback')
            return fresh

        # ── Step 2: Augment with Gemini enrichment if available and fresh ─────────
        enrichment_map = cache.get(ENRICHMENT_CACHE_KEY)
        enrichment_ts  = cache.get(ENRICHMENT_TS_KEY)

        if enrichment_map and enrichment_ts:
            try:
                # Guard against timezone-naive timestamps from an old cache entry
                ts = enrichment_ts
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=dt_timezone.utc)
                age = (datetime.now(dt_timezone.utc) - ts).total_seconds()
            except Exception:
                age = cache_ttl + 1  # treat as expired

            if age <= cache_ttl:
                fresh = _apply_enrichment(fresh, enrichment_map)
                fresh.pop('rss_only', None)
                fresh['cached'] = False
                if age > soft_ttl:
                    _trigger_background_refresh()
                logger.info('Agentic trends: live RSS + Gemini enrichment (age=%.0fs)', age)
            else:
                _trigger_background_refresh()
                logger.info('Agentic trends: live RSS only (enrichment expired at %.0fs)', age)
        else:
            _trigger_background_refresh()
            logger.info('Agentic trends: live RSS only (no enrichment cached)')

        return fresh

    except Exception as exc:
        logger.error('run_trends_pipeline unexpected error: %s', exc, exc_info=True)
        return _fallback_payload()


# ─────────────────────────────────────────────────────────────────────────────
# Background enrichment (Celery)
# ─────────────────────────────────────────────────────────────────────────────

def _run_enrichment_only() -> dict:
    """
    Called by Celery: runs Gemini enrichment pipeline and caches the result.
    Stores a {topic_key → enriched_dict} map — NOT a full user-facing payload.
    Returns a status dict for the Celery task log.
    """
    cache_ttl = getattr(settings, 'TRENDS_CACHE_TTL', 300)

    if not cache.add(LOCK_KEY, 1, 120):
        logger.info('Agentic trends enrichment: lock held — skipping duplicate run')
        return {'status': 'locked'}

    try:
        from .trends_hunter import TrendsHunterAgent
        from .context_enricher import ContextEnricherAgent
        from .trend_ranker import TrendRankerAgent

        # Carry over previous ranks for velocity calculation
        prev_map = cache.get(ENRICHMENT_CACHE_KEY) or {}
        prev_ranks = {
            k: v.get('rank', 0)
            for k, v in prev_map.items()
            if isinstance(v, dict)
        }

        raw_topics = TrendsHunterAgent().run()
        if not raw_topics:
            raise ValueError('TrendsHunterAgent returned no topics')

        raw_topics = _deduplicate_topics(raw_topics)
        enriched   = ContextEnricherAgent().enrich(raw_topics)
        ranked     = TrendRankerAgent().rank(enriched, prev_ranks=prev_ranks)

        enrichment_map = {_topic_key(t.get('topic', '')): t for t in ranked}

        cache.set(ENRICHMENT_CACHE_KEY, enrichment_map, cache_ttl)
        cache.set(ENRICHMENT_TS_KEY, datetime.now(dt_timezone.utc), cache_ttl)
        logger.info('Agentic trends: enrichment cached (%d topics)', len(enrichment_map))
        return {'status': 'ok', 'count': len(enrichment_map)}

    except Exception as exc:
        logger.error('Agentic trends enrichment failed: %s', exc, exc_info=True)
        return {'status': 'error', 'error': str(exc)}

    finally:
        cache.delete(LOCK_KEY)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _apply_enrichment(payload: dict, enrichment_map: dict) -> dict:
    """
    Merge cached Gemini enrichment into fresh RSS topics.
    The fresh topic's identity (topic name, heat_score, rank from ranker) is preserved;
    Gemini provides reason/summary/entities/editorial_angle/articles.
    """
    enriched_topics = []
    for trend in payload.get('enriched_trends', []):
        if not isinstance(trend, dict):
            enriched_topics.append(trend)
            continue

        key = _topic_key(trend.get('topic', ''))
        ev  = enrichment_map.get(key)

        # Fuzzy match: find the enrichment whose key is a substring of this topic (or vice-versa)
        if ev is None:
            for ek, ev_candidate in enrichment_map.items():
                if ek and key and (ek in key or key in ek):
                    ev = ev_candidate
                    break

        if ev:
            # Start with enrichment data, then overlay the fresh RSS fields so
            # topic name / heat_score / sport / is_breaking stay current.
            merged = {**ev, **trend}
            # Restore enrichment context fields that fresh RSS doesn't have
            for field in ('reason', 'summary', 'entities', 'editorial_angle',
                          'ai_confidence', 'articles', 'recency_trigger',
                          'is_live_match', 'velocity'):
                val = ev.get(field)
                if val is not None and val != '' and val != [] and val != {}:
                    merged[field] = val
            enriched_topics.append(merged)
        else:
            enriched_topics.append(trend)

    return {**payload, 'enriched_trends': enriched_topics, 'cached': False}


def _run_rss_only_pipeline() -> dict:
    """
    Fast live-data path: Google News Sports RSS + basic RSS enrichment.
    Always returns current sports headlines. No Gemini, ~1 second.
    Sets rss_only=True to signal the frontend that Gemini context is pending.
    """
    try:
        from .trends_hunter import TrendsHunterAgent
        from .context_enricher import ContextEnricherAgent
        from .trend_ranker import TrendRankerAgent

        hunter = TrendsHunterAgent()
        raw = hunter.fetch_sports_news_fast()
        if not raw:
            raw = hunter._fetch_trends_rss()
        if not raw:
            return _fallback_payload()

        raw     = _deduplicate_topics(raw)
        enriched = ContextEnricherAgent().enrich(raw, gemini_enabled=False)
        ranked   = TrendRankerAgent().rank(enriched)
        results  = [_dict_to_result(d) for d in ranked]
        payload  = _build_payload(results, cached=False)
        payload['rss_only'] = True  # signal: Gemini enrichment is pending
        return payload

    except Exception as exc:
        logger.error('RSS-only pipeline failed: %s', exc)
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
