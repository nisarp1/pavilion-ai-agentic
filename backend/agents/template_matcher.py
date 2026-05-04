"""
TemplateMatcherTool — lightweight CrewAI tool for scene planning agents.

Why this exists:
  Passing the full catalog text (~600 tokens) into every scene planner prompt
  is wasteful. Instead, the Scene Planner calls this tool with content signals
  and gets back only the N best-matched templates with just the fields it needs.
  Full prop details are fetched separately via get_template_detail().

Token savings: ~400 tokens per planner invocation for a 7-template catalog;
scales linearly as more templates are added to registry.json.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from crewai.tools import tool as crewai_tool
    _CREWAI_AVAILABLE = True
except ImportError:
    _CREWAI_AVAILABLE = False
    # Provide a no-op decorator so the module still imports
    def crewai_tool(func):  # type: ignore
        return func


# ── Core matching logic (used by both the CrewAI tool and direct calls) ────────

def match_templates(
    content_types: list[str],
    format: str = "reel",
    max_results: int = 6,
    exclude_ids: Optional[list[str]] = None,
) -> list[dict]:
    """
    Return the top-N templates that match the given content signals.

    Args:
        content_types: List of content type keywords, e.g.
                       ["opening", "player_profile", "stats_display"]
        format:        Video format hint: "reel" | "short" | "long"
        max_results:   Cap on results returned
        exclude_ids:   Template IDs to skip (already used in the plan)

    Returns:
        List of slim template dicts with just: id, name, category, description,
        duration, required_props, suitable_for, asset_slots
    """
    from agents.scene_templates_catalog import get_all_templates

    all_templates = get_all_templates()
    exclude_ids = set(exclude_ids or [])
    content_types_lower = {c.lower() for c in content_types}

    def _score(t: dict) -> int:
        suitable = {s.lower() for s in t.get("suitable_for", [])}
        tags = {tag.lower() for tag in t.get("tags", [])}
        score = len(content_types_lower & suitable) * 3 + len(content_types_lower & tags)
        # Boost opening/ticker for reels
        if format == "reel" and t.get("category") in ("opening", "ticker"):
            score += 1
        return score

    candidates = [t for t in all_templates if t["id"] not in exclude_ids]
    ranked = sorted(candidates, key=_score, reverse=True)

    return [_slim(t) for t in ranked[:max_results]]


def get_template_detail(template_id: str) -> dict:
    """
    Return the full template dict for a given id, including all prop definitions.
    Call this only for templates the agent has already decided to use.
    """
    from agents.scene_templates_catalog import get_all_templates_by_id
    t = get_all_templates_by_id().get(template_id)
    if not t:
        return {"error": f"Template '{template_id}' not found"}
    return t


def get_all_template_ids() -> list[str]:
    """Return just the IDs of all active templates — ultra-cheap lookup."""
    from agents.scene_templates_catalog import get_all_templates
    return [t["id"] for t in get_all_templates()]


# ── Slim view (returned by the matcher — minimises tokens) ────────────────────

def _slim(t: dict) -> dict:
    return {
        "id": t["id"],
        "name": t["name"],
        "category": t.get("category", ""),
        "description": t["description"][:200],  # truncate — full desc in detail
        "default_duration_seconds": t.get("duration_seconds_default", 6),
        "required_props": t.get("required_props", []),
        "asset_slots": [a["slot"] for a in t.get("assets", [])],
        "suitable_for": t.get("suitable_for", []),
    }


# ── CrewAI Tool wrappers ───────────────────────────────────────────────────────

if _CREWAI_AVAILABLE:
    @crewai_tool("TemplateMatcher")
    def template_matcher_tool(query: str) -> str:
        """
        Find the best scene templates for your video. Pass a JSON string with:
          {
            "content_types": ["opening", "player_profile", "stats_display"],
            "format": "reel",
            "max_results": 5,
            "exclude_ids": ["hero_headline"]
          }
        Returns a JSON list of matching templates with id, name, category,
        description, required_props, and asset_slots.

        Call this BEFORE choosing template_ids for your scene plan.
        Only call get_template_detail for templates you have decided to use.
        """
        try:
            params = json.loads(query)
        except json.JSONDecodeError:
            # Fallback: treat as comma-separated content types
            params = {"content_types": [q.strip() for q in query.split(",")]}

        content_types = params.get("content_types", [])
        results = match_templates(
            content_types=content_types,
            format=params.get("format", "reel"),
            max_results=params.get("max_results", 6),
            exclude_ids=params.get("exclude_ids"),
        )
        return json.dumps(results, ensure_ascii=False, indent=2)

    @crewai_tool("TemplateDetail")
    def template_detail_tool(template_id: str) -> str:
        """
        Get the full prop definitions and asset requirements for a specific template.
        Pass just the template_id string (e.g. "hero_headline").
        Call this only for templates you have already selected.
        """
        detail = get_template_detail(template_id.strip())
        return json.dumps(detail, ensure_ascii=False, indent=2)

    TEMPLATE_TOOLS = [template_matcher_tool, template_detail_tool]

else:
    TEMPLATE_TOOLS = []


# ── Compact catalog text for prompt injection (token-optimised) ───────────────

def get_compact_catalog_text(max_desc_chars: int = 120) -> str:
    """
    Returns a compact catalog string for injection into agent prompts.
    Uses ~40% fewer tokens than get_full_catalog_text() by truncating descriptions
    and omitting optional props (agents can call TemplateDetail for those).
    """
    from agents.scene_templates_catalog import get_all_templates

    lines = ["AVAILABLE TEMPLATES (use TemplateMatcher tool for filtered lookup):\n"]
    for t in get_all_templates():
        desc = t["description"][:max_desc_chars].rstrip()
        if len(t["description"]) > max_desc_chars:
            desc += "…"
        lines.append(f"• {t['id']} ({t.get('duration_seconds_default', 6)}s) — {desc}")
        lines.append(f"  required: {', '.join(t.get('required_props', []))}")
        lines.append(f"  best for: {', '.join(t.get('suitable_for', [])[:4])}")
        lines.append("")
    return "\n".join(lines)
