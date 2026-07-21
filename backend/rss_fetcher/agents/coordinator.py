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

# Hard kill-switch for PAID Claude trends enrichment. Default OFF so this stack
# never spends on AI trend refresh unless explicitly enabled. The free live-RSS
# topic path is unaffected. Enable with ENABLE_TRENDS_ENRICHMENT=true.
import os
TRENDS_ENRICHMENT_ENABLED = os.environ.get("ENABLE_TRENDS_ENRICHMENT", "false").strip().lower() == "true"

# Enrichment cache: stores {topic_key → enriched_dict} (NOT the full payload)
ENRICHMENT_CACHE_KEY = 'agentic_enrichment_v2'
ENRICHMENT_TS_KEY    = 'agentic_enrichment_v2_ts'
LOCK_KEY             = 'agentic_trends_pipeline_lock'
REFRESH_DEBOUNCE_KEY = 'agentic_trends_refresh_debounce'
ALERT_DEBOUNCE_KEY   = 'agentic_trends_degraded_alert'
SOFT_TTL_RATIO       = 0.8

# Sports Trend Radar: the FINAL enriched payload (clean topics) cached whole. 1-hour TTL
# caps paid Gemini refreshes at ~1/hour no matter how often Refresh is clicked → cheap.
RADAR_ENRICHED_KEY = 'radar_enriched_payload_v1'
RADAR_ENRICHED_TS  = 'radar_enriched_payload_v1_ts'
ENRICH_TTL         = 3600

# Freshness key written ONLY on real (non-placeholder) Gemini enrichment success.
HEALTH_TRENDS_LAST_ENRICHED = 'health:trends:last_enriched'


def _alert_degradation(reason: str, **context):
    """
    Fire a degradation alert, debounced so a hot request path can't spam Slack.

    run_trends_pipeline runs on every trend view, so the WARNING log (emitted by the
    caller, unconditionally) stays loud while the Slack POST happens at most once per
    TRENDS_CACHE_TTL window. The watchdog (pipeline_health_watchdog) owns the
    sustained-condition alerting; this is the immediate signal.
    """
    cache_ttl = getattr(settings, 'TRENDS_CACHE_TTL', 300)
    if not cache.add(ALERT_DEBOUNCE_KEY, '1', cache_ttl):
        return
    try:
        from pavilion_gemini.alerts import send_alert
        send_alert('WARNING', 'trends degraded to RSS-only/placeholder',
                   source='trends_coordinator', reason=reason, **context)
    except Exception as exc:
        logger.error('Agentic trends: degradation alert failed: %s', exc)


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
    sources: list = dataclasses.field(default_factory=list)  # e.g. ['google_trends','x']
    cross_source: bool = False  # trending on >1 platform → stronger signal
    momentum: float = 0.0  # cross-source-weighted rank score


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
        sources=d.get('sources', []),
        cross_source=bool(d.get('cross_source', False)),
        momentum=float(d.get('momentum', 0)),
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
    """
    Enqueue a Celery enrichment rebuild — the ONLY path that may run the paid
    enrichment (Hunter → Enricher → Ranker). Called solely from the explicit
    Refresh button (agentic-trends?refresh=true); the auto-poll never calls this.

    Debounced: cache.add is atomic, so at most one rebuild is enqueued per
    TRENDS_CACHE_TTL window no matter how often Refresh is clicked. Clicks while a
    rebuild is in flight (or recently completed) are no-ops — no stampede.
    """
    if not TRENDS_ENRICHMENT_ENABLED:
        logger.info('Agentic trends: paid enrichment disabled (ENABLE_TRENDS_ENRICHMENT=false) â Refresh is a no-op, serving live RSS only')
        return
    cache_ttl = getattr(settings, 'TRENDS_CACHE_TTL', 300)
    if not cache.add(REFRESH_DEBOUNCE_KEY, '1', cache_ttl):
        logger.info('Agentic trends: refresh debounced — a rebuild ran within the last %ss', cache_ttl)
        return
    try:
        from workers.tasks import run_agentic_trends_celery
        run_agentic_trends_celery.delay()
        logger.info('Agentic trends: background enrichment refresh enqueued (debounced)')
    except Exception as exc:
        # Enqueue failed (e.g. broker unreachable) — release the debounce so a
        # later Refresh can retry instead of being blocked for the whole TTL.
        cache.delete(REFRESH_DEBOUNCE_KEY)
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

        # ── Serve the cached ENRICHED radar if fresh (clean, Gemini-contextualised) ──
        # The auto-poll is READ-ONLY: it serves this cache but NEVER pays to rebuild it.
        # Only an explicit Refresh (gated + debounced) may spend on enrichment.
        enriched = cache.get(RADAR_ENRICHED_KEY)
        ts = cache.get(RADAR_ENRICHED_TS)
        if enriched and ts:
            try:
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=dt_timezone.utc)
                age = (datetime.now(dt_timezone.utc) - ts).total_seconds()
            except Exception:
                age = ENRICH_TTL + 1
            if age <= ENRICH_TTL:
                logger.info('SportsRadar: serving cached enriched payload (age=%.0fs)', age)
                return {**enriched, 'cached': True, 'rss_only': False, 'age_seconds': int(age)}
            # Expired enrichment → fall through to the free radar and make it LOUD.
            logger.warning('SportsRadar DEGRADED: enrichment expired (%.0fs); serving free radar', age)
            _alert_degradation(reason='radar_enrichment_expired', age_seconds=int(age))

        # ── Free multi-source radar (Google Trends + X + News; no LLM, no cost) ──
        fresh = _run_rss_only_pipeline()
        if fresh.get('fallback'):
            logger.warning('SportsRadar DEGRADED: all sources failed, returning static placeholder')
            _alert_degradation(reason='all_sources_failed_static_placeholder')
        return fresh

    except Exception as exc:
        logger.error('run_trends_pipeline unexpected error: %s', exc, exc_info=True)
        return _fallback_payload()


# ─────────────────────────────────────────────────────────────────────────────
# Background enrichment (Celery)
# ─────────────────────────────────────────────────────────────────────────────

def _run_enrichment_only() -> dict:
    """
    Called by Celery on explicit Refresh: builds the free multi-source radar, then makes
    ONE batched Gemini call to clean/classify/contextualise it, and caches the FINISHED
    payload for ENRICH_TTL (1h). Lock-guarded so concurrent refreshes never double-spend.
    """
    if not TRENDS_ENRICHMENT_ENABLED:
        logger.info('SportsRadar enrichment: disabled (ENABLE_TRENDS_ENRICHMENT=false) - skipping paid run')
        return {'status': 'disabled'}

    if not cache.add(LOCK_KEY, 1, 120):
        logger.info('SportsRadar enrichment: lock held - skipping duplicate run')
        return {'status': 'locked'}

    try:
        from .sports_radar import build_radar_topics, enrich_radar_batch

        raw = build_radar_topics(max_topics=15)
        if not raw:
            raise ValueError('radar returned no topics')

        enriched = enrich_radar_batch(raw)          # the single paid Gemini call
        results  = [_dict_to_result(d) for d in enriched]
        payload  = _build_payload(results, cached=True)
        payload['multi_source'] = True
        payload['enriched'] = True

        cache.set(RADAR_ENRICHED_KEY, payload, ENRICH_TTL)
        cache.set(RADAR_ENRICHED_TS, datetime.now(dt_timezone.utc), ENRICH_TTL)
        cache.set(HEALTH_TRENDS_LAST_ENRICHED, datetime.now(dt_timezone.utc).isoformat(), None)
        logger.info('SportsRadar: enriched payload cached (%d topics)', len(results))
        return {'status': 'ok', 'count': len(results)}

    except Exception as exc:
        logger.error('SportsRadar enrichment failed: %s', exc, exc_info=True)
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
    Free multi-source Sports Trend Radar: Google Trends + X/Trends24 + Google News
    sports, merged and ranked by CROSS-SOURCE momentum. No Gemini, no cost, ~1-2s.

    This is the default (auto-poll) view — genuinely more than three tabs, for $0.
    Sets rss_only=True to signal the frontend that paid Gemini context is still pending
    (enrichment only runs on explicit Refresh when ENABLE_TRENDS_ENRICHMENT=true).
    """
    try:
        from .sports_radar import build_radar_topics
        raw = build_radar_topics(max_topics=15)
        if not raw:
            # Every source came back empty (rare — the news backbone normally holds).
            return _fallback_payload()

        results = [_dict_to_result(d) for d in raw]
        payload = _build_payload(results, cached=False)
        payload['rss_only'] = True       # Gemini context pending
        payload['multi_source'] = True   # radar (Google + X + News), not single-source
        return payload

    except Exception as exc:
        logger.error('Sports radar pipeline failed: %s', exc)
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
