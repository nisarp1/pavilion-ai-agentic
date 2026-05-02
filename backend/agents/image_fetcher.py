"""
ImageFetcherAgent — Phase 2
Resolves {{ASSET:xxx}} placeholders with real image URLs.

Strategy (in order of priority):
  1. YouTube thumbnail (already in context) → used for any 'hero' type slot
  2. Google Custom Search API (image search)
  3. Unsplash Source (free, no key needed) — sports fallback
  4. Leave placeholder if all fail — never block the pipeline

Requires env vars:
  GOOGLE_CUSTOM_SEARCH_API_KEY  — Google Cloud API key with CSE enabled
  GOOGLE_CUSTOM_SEARCH_ENGINE_ID — Custom Search Engine ID (cx)

If those are missing, falls back to Unsplash Source URLs silently.
"""
import os
import logging
import requests
from typing import Optional
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)

_GOOGLE_CSE_KEY = os.environ.get("GOOGLE_CUSTOM_SEARCH_API_KEY", "")
_GOOGLE_CSE_CX  = os.environ.get("GOOGLE_CUSTOM_SEARCH_ENGINE_ID", "")

# Unsplash Source fallback (no key needed, returns a random relevant image)
_UNSPLASH_BASE = "https://source.unsplash.com/800x800/?{query}"

# Connect timeout and read timeout
_TIMEOUT = (5, 15)


class ImageFetcherAgent:
    """
    Fetches real image URLs for each asset_needed slot in the VideoProductionPlan.

    Usage:
        agent = ImageFetcherAgent()
        resolved = agent.resolve_all(
            assets_needed=plan["assets_needed"],
            thumbnail_url="https://...",   # from YouTube context
            topic="Messi goal record",
        )
        # resolved = { "hero_image_1": "https://...", "player_image_1": "https://...", ... }
    """

    def resolve_all(
        self,
        assets_needed: list,
        thumbnail_url: str = "",
        topic: str = "",
    ) -> dict:
        """
        Resolve all assets. Returns dict of {asset_id: url}.
        Never raises — always returns best-effort results.
        """
        resolved: dict[str, str] = {}

        for asset in assets_needed:
            asset_id   = asset.get("id", "")
            asset_type = asset.get("type", "image")
            description = asset.get("description", "")
            search_query = asset.get("fallback_search_query", "") or description or topic

            if asset_type != "image":
                continue  # skip audio/video slots for now

            url = self._resolve_one(
                asset_id=asset_id,
                description=description,
                search_query=search_query,
                thumbnail_url=thumbnail_url,
                topic=topic,
            )

            if url:
                resolved[asset_id] = url
                logger.info(f"[ImageFetcher] {asset_id} → {url[:80]}")
            else:
                logger.warning(f"[ImageFetcher] Could not resolve asset: {asset_id}")

        return resolved

    # ── Internal ──────────────────────────────────────────────────────────────

    def _resolve_one(
        self,
        asset_id: str,
        description: str,
        search_query: str,
        thumbnail_url: str,
        topic: str,
    ) -> Optional[str]:
        """Try all strategies in order. Return first successful URL."""

        # Strategy 1: Use thumbnail for any "hero" or "background" type slot
        if thumbnail_url and self._is_hero_slot(asset_id, description):
            if self._url_accessible(thumbnail_url):
                logger.info(f"[ImageFetcher] Using thumbnail for {asset_id}")
                return thumbnail_url

        # Strategy 2: Google Custom Search Image API
        if _GOOGLE_CSE_KEY and _GOOGLE_CSE_CX:
            url = self._google_image_search(search_query or topic)
            if url:
                return url

        # Strategy 3: Unsplash Source (no key needed)
        url = self._unsplash_fallback(search_query or topic)
        if url:
            return url

        # Strategy 4: Use thumbnail as absolute last resort for any slot
        if thumbnail_url and self._url_accessible(thumbnail_url):
            return thumbnail_url

        return None

    def _is_hero_slot(self, asset_id: str, description: str) -> bool:
        """Determine if this asset slot is a hero/background image type."""
        combined = (asset_id + " " + description).lower()
        return any(k in combined for k in ["hero", "background", "bg", "stadium", "wide"])

    def _google_image_search(self, query: str, num: int = 5) -> Optional[str]:
        """
        Search Google Custom Search API for images.
        Returns URL of best result or None.
        """
        if not query:
            return None
        try:
            params = {
                "key":        _GOOGLE_CSE_KEY,
                "cx":         _GOOGLE_CSE_CX,
                "q":          query,
                "searchType": "image",
                "num":        num,
                "imgType":    "photo",
                "imgSize":    "large",
                "safe":       "active",
                "fileType":   "jpg|png|webp",
            }
            resp = requests.get(
                "https://www.googleapis.com/customsearch/v1",
                params=params,
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            items = resp.json().get("items", [])
            for item in items:
                img_url = item.get("link", "")
                if img_url and self._url_accessible(img_url):
                    return img_url
        except Exception as e:
            logger.warning(f"[ImageFetcher] Google CSE failed for '{query}': {e}")
        return None

    def _unsplash_fallback(self, query: str) -> Optional[str]:
        """
        Use Unsplash Source for a free fallback sports image.
        Returns a URL string (may redirect but is always accessible).
        """
        if not query:
            query = "sports"
        # Clean query — take first 3 words to keep it broad
        short_query = " ".join(query.split()[:3])
        url = _UNSPLASH_BASE.format(query=quote_plus(short_query))
        # Unsplash Source always returns 200 (redirect), so just return it
        return url

    def _url_accessible(self, url: str, timeout: int = 5) -> bool:
        """Check if a URL returns HTTP 200 with a HEAD request."""
        if not url or not url.startswith("http"):
            return False
        try:
            resp = requests.head(url, timeout=timeout, allow_redirects=True)
            return resp.status_code < 400
        except Exception:
            return False


# ── Apply resolved assets back into the plan ─────────────────────────────────

def inject_assets_into_plan(plan: dict, resolved: dict) -> dict:
    """
    Replace {{ASSET:xxx}} placeholders in plan.props and plan.scenes[].props
    with actual URLs from the resolved dict.

    Also updates plan.assets_needed[].url and status.
    Returns the mutated plan.
    """
    def _replace(val: str) -> str:
        """Replace {{ASSET:id}} → real URL, or return original."""
        if not isinstance(val, str):
            return val
        if val.startswith("{{ASSET:") and val.endswith("}}"):
            asset_id = val[8:-2]  # strip {{ASSET: and }}
            return resolved.get(asset_id, val)
        return val

    # 1. Replace in flat props
    props = plan.get("props", {})
    for key, val in props.items():
        props[key] = _replace(val)

    # 2. Replace in modular_props (same ref but keep compat)
    plan["modular_props"] = props

    # 3. Replace in scenes[].props
    for scene in plan.get("scenes", []):
        scene_props = scene.get("props", {})
        for key, val in scene_props.items():
            scene_props[key] = _replace(val)

    # 4. Update assets_needed status
    for asset in plan.get("assets_needed", []):
        asset_id = asset.get("id", "")
        if asset_id in resolved:
            asset["url"]    = resolved[asset_id]
            asset["status"] = "resolved"

    return plan
