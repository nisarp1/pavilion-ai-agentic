"""Subscription tier limits and enforcement helpers."""
from django.utils import timezone
from datetime import timedelta

TIER_LIMITS = {
    'basic': {
        'max_articles_per_month': 100,
        'max_ai_generations': 50,
        'max_users': 5,
        'max_rss_feeds': 5,
    },
    'pro': {
        'max_articles_per_month': 1000,
        'max_ai_generations': 500,
        'max_users': 25,
        'max_rss_feeds': 25,
    },
    'enterprise': {
        'max_articles_per_month': -1,   # -1 = unlimited
        'max_ai_generations': -1,
        'max_users': -1,
        'max_rss_feeds': -1,
    },
}


def get_limits(tenant):
    return TIER_LIMITS.get(tenant.subscription_tier, TIER_LIMITS['basic'])


def check_generation_limit(tenant):
    """
    Returns (allowed: bool, message: str).
    Counts AI generation UsageRecords in the current calendar month.
    """
    limits = get_limits(tenant)
    max_gen = limits['max_ai_generations']
    if max_gen == -1:
        return True, ''

    from tenants.models import UsageRecord
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    used = UsageRecord.objects.filter(
        tenant=tenant,
        metric_type='article_generated',
        created_at__gte=month_start,
    ).count()

    if used >= max_gen:
        return False, (
            f"Monthly AI generation limit reached ({used}/{max_gen}). "
            f"Upgrade to Pro or Enterprise for more."
        )
    return True, ''


def get_usage_summary(tenant):
    """Return current month usage vs limits."""
    from tenants.models import UsageRecord
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    limits = get_limits(tenant)

    records = UsageRecord.objects.filter(tenant=tenant, created_at__gte=month_start)
    usage = {}
    for metric in ('article_generated', 'audio_generated', 'video_generated'):
        usage[metric] = records.filter(metric_type=metric).count()

    return {
        'subscription_tier': tenant.subscription_tier,
        'limits': limits,
        'usage_this_month': usage,
    }
