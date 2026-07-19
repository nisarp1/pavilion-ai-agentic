"""
Central LLM client.

Historically wrapped Gemini (Vertex AI REST + google-generativeai SDK). Now a thin
compatibility shim that delegates to ``agents.claude_client`` so the ~10 callers that
import this module keep working unchanged after the Gemini → Claude migration.

Public API preserved for callers:
    get_model_name()            -> str
    generate_text(...)          -> str
    generate_with_parts(...)    -> str   (text + image; vision)
    make_image_part(...)        -> dict
    generate_grounded(...)      -> str   (web-grounded; flag-gated via claude_client)
"""
import logging

from . import claude_client

logger = logging.getLogger(__name__)

# Default max_tokens preserved from the historical Claude layer default.
_DEFAULT_MAX_TOKENS = 4000


def get_model_name() -> str:
    """Return the active model name (now the Claude default)."""
    return claude_client.DEFAULT_MODEL


def generate_text(prompt: str, *, json_mode: bool = False, temperature: float | None = None, **_ignored) -> str:
    """Text completion. Gemini-only kwargs (json_mode/temperature/top_p/...) are accepted
    for signature compatibility but ignored — Claude's messages API rejects them."""
    logger.debug("[LLM] generate_text via Claude (model=%s)", claude_client.DEFAULT_MODEL)
    return claude_client.complete(prompt, max_tokens=_DEFAULT_MAX_TOKENS)


def make_image_part(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """Build a normalized image part for generate_with_parts()."""
    return {"bytes": image_bytes, "media_type": mime_type}


def generate_with_parts(parts: list, *, json_mode: bool = False, temperature: float | None = None, **_ignored) -> str:
    """Multimodal completion (text + image). Splits `parts` into the text prompt and the
    first image part, then delegates to claude_client.complete_vision().

    Accepts parts as strings (text) or dicts. Supported image dict shapes:
      - {"bytes": <raw>, "media_type": <mime>}            (make_image_part)
      - {"inlineData": {"data": <b64>, "mimeType": ...}}  (legacy REST shape)
    """
    import base64

    text_chunks: list[str] = []
    image: dict | None = None

    for p in parts:
        if isinstance(p, str):
            text_chunks.append(p)
        elif "text" in p:
            text_chunks.append(p["text"])
        elif "bytes" in p:
            if image is None:
                image = {"bytes": p["bytes"], "media_type": p.get("media_type", "image/jpeg")}
        elif "inlineData" in p:
            if image is None:
                image = {
                    "bytes": base64.b64decode(p["inlineData"]["data"]),
                    "media_type": p["inlineData"].get("mimeType", "image/jpeg"),
                }

    text = "\n".join(text_chunks)

    if image is None:
        # No image present — fall back to plain text completion.
        return claude_client.complete(text, max_tokens=_DEFAULT_MAX_TOKENS)

    logger.debug("[LLM] generate_with_parts (vision) via Claude (model=%s)", claude_client.DEFAULT_MODEL)
    return claude_client.complete_vision(
        text, image["bytes"], media_type=image["media_type"], max_tokens=_DEFAULT_MAX_TOKENS
    )


def generate_grounded(prompt: str) -> str:
    """Web-grounded completion. Delegates to claude_client.complete_grounded(),
    which uses Claude's web_search tool when ENABLE_WEB_GROUNDING is set and
    otherwise falls back to a plain completion (zero search cost)."""
    return claude_client.complete_grounded(prompt)


def generate_text_grounded(prompt: str, *, allowed_domains=None, max_uses=3, **_ignored) -> str:
    """Web-grounded text generation for article enrichment (credible recent sources)."""
    return claude_client.complete_grounded(prompt, max_tokens=_DEFAULT_MAX_TOKENS, allowed_domains=allowed_domains, max_uses=max_uses)
