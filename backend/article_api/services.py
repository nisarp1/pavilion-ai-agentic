"""Productized article-generation service.

Independent of the trends/RSS newsroom pipeline: topic -> research context ->
Gemini (via the provider router, capturing token usage) -> parsed article ->
cost metered into UsageRecord. Returns the article dict + usage.
"""
import logging

from agents import article_llm
from rss_fetcher.agents.news_writer import NewsWriterAgent
from tenants.models import UsageRecord

from .pricing import cost_inr

logger = logging.getLogger(__name__)


def _style_guide(tenant, style_profile_id):
    if not style_profile_id:
        return ""
    try:
        from .models import StyleProfile
        sp = StyleProfile.objects.get(id=style_profile_id, tenant=tenant, is_active=True)
        return sp.style_guide or ""
    except Exception:
        return ""


def generate(topic, tenant=None, style_profile_id=None, language="ml", enriched_data=None,
             persist=False):
    """Generate one article. Returns dict: title/meta_title/summary/body/sport/tags + usage."""
    agent = NewsWriterAgent()
    agent._tenant = tenant  # used by _build_prompt for the global style guide
    ctx = agent._research_topic(topic, enriched_data or {})
    prompt = agent._build_prompt(topic, ctx)

    guide = _style_guide(tenant, style_profile_id)
    if guide:
        prompt += ("\n\n═══ WRITER STYLE — emulate this voice faithfully "
                   "(do NOT add facts) ═══\n" + guide)

    text, usage = article_llm.generate(prompt, return_usage=True)
    parsed = agent._parse_response(text, topic, ctx) or {
        "title": topic, "summary": "", "body": "", "sport": ctx.get("sport", "general"),
        "tags": [], "status": "parse_failed",
    }

    usage["cost_inr"] = cost_inr(usage["provider"], usage["model"],
                                 usage["input_tokens"], usage["output_tokens"])

    if tenant is not None:
        try:
            UsageRecord.objects.create(
                tenant=tenant, metric_type="article_generated",
                meta={**usage, "topic": topic[:160], "style_profile_id": style_profile_id},
            )
        except Exception as exc:
            logger.warning("[article_api] usage record failed: %s", exc)

    if persist:
        try:
            import uuid
            from cms.models import Article
            art = Article.objects.create(
                tenant=tenant, title=(parsed.get("title") or topic)[:255],
                summary=parsed.get("summary", ""), body=parsed.get("body", ""),
                status="draft", source_feed="api-v1",
                slug="apiv1-" + uuid.uuid4().hex[:8],
            )
            parsed["article_id"] = art.id
        except Exception as exc:
            logger.warning("[article_api] persist failed: %s", exc)

    parsed["usage"] = usage
    parsed["topic"] = topic
    return parsed
