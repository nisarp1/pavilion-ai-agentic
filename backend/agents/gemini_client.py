"""
Central Gemini client.

Primary:  Vertex AI REST API (VERTEX_PROJECT configured) — no free-tier quota.
Fallback: google-generativeai AI Studio SDK (GEMINI_API_KEY).

No dependency on google-genai package — uses google.auth + requests only.
"""
import base64
import logging
import os
import time

import requests as _requests

logger = logging.getLogger(__name__)

_vertex_creds_cache: dict = {'data': None, 'expires_at': 0.0}


def get_model_name() -> str:
    """Return plain model name (strips gemini/ or vertex_ai/ prefix)."""
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
    for prefix in ("gemini/", "vertex_ai/"):
        if model.startswith(prefix):
            model = model[len(prefix):]
    return model


def _vertex_bearer() -> tuple[str, str]:
    """Return (bearer_token, project_id), refreshing credentials when near expiry."""
    import google.auth
    import google.auth.transport.requests

    cache = _vertex_creds_cache
    now = time.time()
    if cache['data'] is None or now >= cache['expires_at'] - 60:
        creds, detected_project = google.auth.default(
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        req = google.auth.transport.requests.Request()
        creds.refresh(req)
        expiry = getattr(creds, 'expiry', None)
        cache['data'] = (creds, detected_project)
        cache['expires_at'] = expiry.timestamp() if expiry else (now + 3600)

    creds, project = cache['data']
    return creds.token, project


def _vertex_post(
    parts: list,
    *,
    json_mode: bool = False,
    temperature: float | None = None,
    use_search: bool = False,
) -> str:
    """POST to Vertex AI generateContent endpoint. `parts` is a list of REST part dicts."""
    project = os.environ.get("VERTEX_PROJECT") or os.environ.get("VERTEXAI_PROJECT", "")
    location = os.environ.get("VERTEX_LOCATION") or os.environ.get("VERTEXAI_LOCATION", "us-central1")
    model = get_model_name()

    token, detected_project = _vertex_bearer()
    project = project or detected_project

    endpoint = (
        f"https://{location}-aiplatform.googleapis.com/v1"
        f"/projects/{project}/locations/{location}"
        f"/publishers/google/models/{model}:generateContent"
    )

    body: dict = {"contents": [{"role": "user", "parts": parts}]}

    gen_cfg: dict = {}
    if json_mode:
        gen_cfg["responseMimeType"] = "application/json"
    if temperature is not None:
        gen_cfg["temperature"] = temperature
    if gen_cfg:
        body["generationConfig"] = gen_cfg

    if use_search:
        body["tools"] = [{"googleSearch": {}}]

    resp = _requests.post(
        endpoint,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=body,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


def _ai_studio_generate(prompt: str, *, json_mode: bool = False, temperature: float | None = None) -> str:
    """Fallback text generation via google-generativeai AI Studio SDK."""
    import google.generativeai as genai  # noqa: deprecated but available

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("Neither VERTEX_PROJECT nor GEMINI_API_KEY is set.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(get_model_name())

    cfg: dict = {}
    if json_mode:
        cfg["response_mime_type"] = "application/json"
    if temperature is not None:
        cfg["temperature"] = temperature

    response = model.generate_content(prompt, generation_config=cfg or None)
    return response.text.strip() if response and response.text else ""


# ── Public API ──────────────────────────────────────────────────────────────────

def generate_text(prompt: str, *, json_mode: bool = False, temperature: float | None = None) -> str:
    """Call Gemini with a text prompt. Returns the response text."""
    vertex_project = os.environ.get("VERTEX_PROJECT") or os.environ.get("VERTEXAI_PROJECT", "")
    if vertex_project:
        logger.debug("[Gemini] Using Vertex AI REST — project=%s", vertex_project)
        return _vertex_post([{"text": prompt}], json_mode=json_mode, temperature=temperature)
    logger.debug("[Gemini] Using AI Studio SDK (fallback)")
    return _ai_studio_generate(prompt, json_mode=json_mode, temperature=temperature)


def generate_with_parts(parts: list, *, json_mode: bool = False, temperature: float | None = None) -> str:
    """
    Call Gemini with mixed content (text + images).
    `parts` may be strings or dicts with keys 'text' or 'inlineData'.
    Strings are converted to {"text": ...} automatically.
    """
    normalised = [{"text": p} if isinstance(p, str) else p for p in parts]
    vertex_project = os.environ.get("VERTEX_PROJECT") or os.environ.get("VERTEXAI_PROJECT", "")
    if vertex_project:
        return _vertex_post(normalised, json_mode=json_mode, temperature=temperature)
    # AI Studio fallback: text-only (extract text parts)
    text_only = " ".join(p["text"] for p in normalised if "text" in p)
    return _ai_studio_generate(text_only, json_mode=json_mode, temperature=temperature)


def make_image_part(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """Build an inlineData part dict for generate_with_parts()."""
    return {"inlineData": {"mimeType": mime_type, "data": base64.b64encode(image_bytes).decode()}}


def generate_grounded(prompt: str) -> str:
    """Call Gemini with Google Search Grounding (Vertex AI only; text-only fallback otherwise)."""
    vertex_project = os.environ.get("VERTEX_PROJECT") or os.environ.get("VERTEXAI_PROJECT", "")
    if vertex_project:
        return _vertex_post([{"text": prompt}], use_search=True)
    return _ai_studio_generate(prompt)
