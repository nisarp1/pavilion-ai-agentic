"""
Agent 3 — TrendRankerAgent
Computes a heat_score (0–100) for each enriched trend and ranks them.
Applies a self-training boost from click_count stored in Article.trend_data.
"""
import logging
from datetime import datetime, timezone as dt_timezone
from email.utils import parsedate_to_datetime

logger = logging.getLogger(__name__)


def _parse_pub_date(pub_date_str: str) -> datetime | None:
    """Parse RFC 2822 pub date from RSS; returns UTC datetime or None."""
    if not pub_date_str:
        return None
    try:
        dt = parsedate_to_datetime(pub_date_str)
        return dt.astimezone(dt_timezone.utc).replace(tzinfo=dt_timezone.utc)
    except Exception:
        return None


def _recency_score(pub_date_str: str) -> float:
    """Score 1.0 for < 1h old, 0.7 for < 6h, 0.4 for < 24h, 0.1 otherwise."""
    dt = _parse_pub_date(pub_date_str)
    if dt is None:
        return 0.5  # unknown recency gets middle score
    hours_old = (datetime.now(dt_timezone.utc) - dt).total_seconds() / 3600
    if hours_old < 1:
        return 1.0
    if hours_old < 6:
        return 0.7
    if hours_old < 24:
        return 0.4
    return 0.1


def _self_training_boost(topic: str) -> float:
    """
    Look up articles whose trend_data JSON has a click_count for this topic.
    Returns a boost in [0, 0.5] range.
    No migration required — trend_data JSONField already exists on Article model.
    """
    try:
        from cms.models import Article
        articles = Article.objects.filter(
            trend_data__has_key='click_count',
            title__icontains=topic[:30],
        ).values_list('trend_data', flat=True)[:5]
        total_clicks = sum(
            int(td.get('click_count', 0))
            for td in articles
            if isinstance(td, dict)
        )
        # Normalise: every 10 clicks = +0.05 boost, cap at 0.5
        return min(0.5, (total_clicks / 10) * 0.05)
    except Exception as exc:
        logger.debug(f'Self-training boost lookup failed: {exc}')
        return 0.0


class TrendRankerAgent:
    def rank(self, enriched_topics: list[dict], prev_ranks: dict | None = None) -> list[dict]:
        """Compute heat_score for each topic, apply self-training boost, sort descending."""
        prev_ranks = prev_ranks or {}
        scored = []
        for topic in enriched_topics:
            heat = self._compute_heat(topic)
            boost = _self_training_boost(topic.get('topic', ''))
            final_heat = min(100.0, heat + boost * 100)
            scored.append({**topic, 'heat_score': round(final_heat, 1)})

        scored.sort(key=lambda t: t['heat_score'], reverse=True)
        for i, t in enumerate(scored, start=1):
            t['rank'] = i
            prev = prev_ranks.get(t['topic'])
            t['velocity'] = (prev - i) if prev is not None else 0  # positive = rising

        logger.info(f'TrendRankerAgent: ranked {len(scored)} topics. Top: {scored[0]["topic"] if scored else "none"}')
        return scored

    def _compute_heat(self, topic: dict) -> float:
        articles = topic.get('articles', [])
        article_count = len(articles)
        source_diversity = len({self._domain(a.get('url', '')) for a in articles if a.get('url')})

        # Recency: use _pub_date from RSS or default 0.5
        recency = _recency_score(topic.get('_pub_date', ''))

        breaking = 1.0 if topic.get('is_breaking', False) else 0.0
        ai_confidence = float(topic.get('ai_confidence', 0.5))

        # Source-rank signal: hunter assigns heat_score 10-85 based on position/trending data
        # Normalise to [0,1] so it contributes as a 15-point factor
        source_heat = min(1.0, float(topic.get('heat_score', 50)) / 100)

        # Normalise counts to [0,1] — assume max 5 articles and 5 sources
        norm_articles = min(1.0, article_count / 5)
        norm_diversity = min(1.0, source_diversity / 5)

        heat = (
            norm_articles * 15 +
            norm_diversity * 15 +
            recency * 25 +
            breaking * 15 +
            ai_confidence * 15 +
            source_heat * 15
        )
        return heat

    @staticmethod
    def _domain(url: str) -> str:
        try:
            from urllib.parse import urlparse
            return urlparse(url).netloc
        except Exception:
            return url[:30]
