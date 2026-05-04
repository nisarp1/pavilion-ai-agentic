"""
Template Registry Loader

Single source of truth for Remotion template metadata.
Reads from remotion-renderer/src/templates/registry.json and exposes
helpers used by both scene_templates_catalog.py and the agent pipeline.

Adding a new template:
  1. Create the TSX component in remotion-renderer/src/templates/<id>/
  2. Register the <Composition> in remotion-renderer/src/Root.tsx
  3. Add an entry to remotion-renderer/src/templates/registry.json
  → Python agents pick it up automatically — no Python changes needed.
"""
import json
import os
import logging
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

# Path to the JSON registry relative to this file
_REGISTRY_PATH = os.path.join(
    os.path.dirname(__file__),       # backend/agents/
    "..", "..",                       # project root
    "remotion-renderer", "src", "templates", "registry.json",
)
_REGISTRY_PATH = os.path.normpath(_REGISTRY_PATH)


@lru_cache(maxsize=1)
def _load_raw_registry() -> list[dict]:
    """Load and cache the JSON registry. Returns the templates array."""
    try:
        with open(_REGISTRY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        templates = data.get("templates", [])
        logger.info(f"[TemplateRegistry] Loaded {len(templates)} templates from {_REGISTRY_PATH}")
        return templates
    except FileNotFoundError:
        logger.warning(f"[TemplateRegistry] registry.json not found at {_REGISTRY_PATH}")
        return []
    except json.JSONDecodeError as e:
        logger.error(f"[TemplateRegistry] JSON parse error: {e}")
        return []


def get_registry_templates(include_planned: bool = False) -> list[dict]:
    """
    Return renderable templates from registry.json as catalog-compatible dicts.

    By default only returns status='active' templates so agents don't plan for
    compositions that don't have a TSX implementation yet. Pass
    include_planned=True to see everything (useful for the Video Studio UI).
    """
    raw = _load_raw_registry()
    result = []
    for t in raw:
        status = t.get("status", "active")
        if status == "deprecated":
            continue
        if status == "planned" and not include_planned:
            continue
        result.append(_normalize(t))
    return result


def get_registry_template_by_id(template_id: str) -> Optional[dict]:
    """Look up a single template by id. Returns None if not found."""
    for t in get_registry_templates():
        if t["id"] == template_id:
            return t
    return None


def invalidate_cache():
    """Force reload on next access (call after registry.json is updated at runtime)."""
    _load_raw_registry.cache_clear()


# ── Internal ────────────────────────────────────────────────────────────────────

def _normalize(raw: dict) -> dict:
    """Convert registry.json entry → catalog-compatible dict consumed by agents."""
    required_props = [p["key"] for p in raw.get("props", {}).get("required", [])]
    optional_props = [p["key"] for p in raw.get("props", {}).get("optional", [])]
    assets = raw.get("assets", [])

    dur = raw.get("duration", {})
    return {
        "id": raw["id"],
        "name": raw["name"],
        "description": raw["description"],
        "category": raw.get("category", "custom"),
        "composition_id": raw.get("composition_id", "PavilionReel"),
        "duration_seconds_default": dur.get("default_seconds", 6),
        "duration_frames_default": dur.get("default_frames", 180),
        "duration_min_seconds": dur.get("min_seconds"),
        "duration_max_seconds": dur.get("max_seconds"),
        "required_props": required_props,
        "optional_props": optional_props,
        "props_detail": raw.get("props", {}),
        "assets": [
            {
                "slot": a["slot"],
                "type": a["type"],
                "description": a.get("description", ""),
                "required": a.get("required", False),
                "aspect_ratio": a.get("aspect_ratio"),
                "search_hint": a.get("search_hint"),
            }
            for a in assets
        ],
        "suitable_for": raw.get("suitable_for", []),
        "tags": raw.get("tags", []),
        "clips": raw.get("clips", []),
        "source": raw.get("source", "builtin"),
        "status": raw.get("status", "active"),
        "file": raw.get("file"),
        "exported_component": raw.get("exported_component"),
    }
