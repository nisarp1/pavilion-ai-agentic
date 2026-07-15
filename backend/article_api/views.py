"""Productized /api/v1/ endpoints: generate, usage, estimate, styles + a public demo."""
import logging
from collections import defaultdict

from rest_framework.decorators import (api_view, authentication_classes,
                                       permission_classes, throttle_classes)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from tenants.models import UsageRecord

from . import services
from .auth import APIKeyAuthentication
from .pricing import cost_inr

logger = logging.getLogger(__name__)


# ── Auth-keyed product endpoints ──────────────────────────────────────────────

@api_view(["POST"])
@authentication_classes([APIKeyAuthentication])
@permission_classes([IsAuthenticated])
def generate_view(request):
    topic = (request.data.get("topic") or "").strip()
    if not topic:
        return Response({"error": "topic is required"}, status=400)
    result = services.generate(
        topic, tenant=request.tenant,
        style_profile_id=request.data.get("style_profile_id"),
        language=request.data.get("language", "ml"),
        persist=bool(request.data.get("persist", False)),
    )
    return Response(result)


@api_view(["POST"])
@authentication_classes([APIKeyAuthentication])
@permission_classes([IsAuthenticated])
def estimate_view(request):
    """Rough pre-generation ₹ estimate from topic length (before spending)."""
    topic = (request.data.get("topic") or "").strip()
    # heuristic: prompt ~2200 input tokens, output ~1100 tokens for a 4-para article
    in_tok, out_tok = 2200, 1100
    provider = request.data.get("provider", "gemini")
    model = request.data.get("model", "gemini-2.5-flash")
    return Response({
        "estimated_input_tokens": in_tok, "estimated_output_tokens": out_tok,
        "estimated_cost_inr": cost_inr(provider, model, in_tok, out_tok),
        "model": model, "note": "estimate; actual usage returned on generate",
    })


def _aggregate_usage(tenant, limit_rows=2000):
    rows = list(UsageRecord.objects.filter(
        tenant=tenant, metric_type="article_generated").order_by("-created_at")[:limit_rows])
    it = ot = 0
    ci = 0.0
    byday = defaultdict(lambda: {"count": 0, "cost_inr": 0.0})
    for r in rows:
        m = r.meta or {}
        it += int(m.get("input_tokens", 0) or 0)
        ot += int(m.get("output_tokens", 0) or 0)
        ci += float(m.get("cost_inr", 0) or 0)
        d = r.created_at.date().isoformat()
        byday[d]["count"] += 1
        byday[d]["cost_inr"] += float(m.get("cost_inr", 0) or 0)
    recent = [{
        "topic": (r.meta or {}).get("topic"),
        "cost_inr": (r.meta or {}).get("cost_inr"),
        "model": (r.meta or {}).get("model"),
        "input_tokens": (r.meta or {}).get("input_tokens"),
        "output_tokens": (r.meta or {}).get("output_tokens"),
        "at": r.created_at.isoformat(),
    } for r in rows[:10]]
    by_day = [{"date": k, "count": v["count"], "cost_inr": round(v["cost_inr"], 2)}
              for k, v in sorted(byday.items())]
    return {
        "total_articles": len(rows), "input_tokens": it, "output_tokens": ot,
        "cost_inr": round(ci, 2), "by_day": by_day, "recent": recent,
    }


@api_view(["GET"])
@authentication_classes([APIKeyAuthentication])
@permission_classes([IsAuthenticated])
def usage_view(request):
    return Response(_aggregate_usage(request.tenant))


@api_view(["GET", "POST"])
@authentication_classes([APIKeyAuthentication])
@permission_classes([IsAuthenticated])
def styles_view(request):
    from .models import StyleProfile
    if request.method == "GET":
        rows = StyleProfile.objects.filter(tenant=request.tenant, is_active=True)
        return Response({"styles": [
            {"id": s.id, "name": s.name, "language": s.language,
             "exemplars": len(s.exemplars or [])} for s in rows]})
    # POST: create a persona from 10–15 exemplars, distill a style guide (one LLM pass)
    name = (request.data.get("name") or "").strip()
    exemplars = request.data.get("exemplars") or []
    if not name or not isinstance(exemplars, list) or len(exemplars) < 3:
        return Response({"error": "name and >=3 exemplars required"}, status=400)
    language = request.data.get("language", "ml")
    guide = ""
    try:
        from agents import article_llm
        joined = "\n\n---\n\n".join(str(x)[:2000] for x in exemplars[:15])
        distill_prompt = (
            "You are a writing-style analyst. Read these article samples by ONE writer and "
            "produce a concise STYLE GUIDE another model can follow to emulate this writer's "
            "voice: tone, sentence rhythm/length, vocabulary, structure, signature devices, "
            "and do/don'ts. Output plain text, ~200 words. Do NOT summarize the content.\n\n"
            f"SAMPLES:\n{joined}"
        )
        guide = article_llm.generate(distill_prompt)
    except Exception as exc:
        logger.warning("[article_api] style distill failed: %s", exc)
    sp = StyleProfile.objects.create(
        tenant=request.tenant, name=name, language=language,
        exemplars=[str(x) for x in exemplars[:15]], style_guide=guide or "")
    return Response({"id": sp.id, "name": sp.name, "style_guide_chars": len(sp.style_guide)},
                    status=201)


# ── Public demo endpoint (no key; strict per-IP throttle + hard cap) ──────────

class DemoThrottle(SimpleRateThrottle):
    scope = "article_demo"
    rate = "20/day"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
@throttle_classes([DemoThrottle])
def demo_generate_view(request):
    """Public, unauthenticated demo. Rate-limited to 20/day/IP; metered on the demo tenant."""
    topic = (request.data.get("topic") or "").strip()
    if not topic:
        return Response({"error": "topic is required"}, status=400)
    from tenants.models import Tenant
    tenant = Tenant.objects.filter(id=2).first() or Tenant.objects.first()
    result = services.generate(
        topic, tenant=tenant,
        style_profile_id=request.data.get("style_profile_id"),
        language=request.data.get("language", "ml"),
    )
    return Response(result)
