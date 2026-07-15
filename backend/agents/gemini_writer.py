"""
Gemini article writer — Google AI Studio path (API key only, NO GCP/Vertex).

Restores the pre-migration article generator: the article voice the owner approved
was produced by Gemini (gemini-2.5-flash) via the AI Studio SDK. This path is kept
free of any Google Cloud / Vertex dependency — it needs only GEMINI_API_KEY.

The ``google.generativeai`` import is LAZY (inside the call) so merely importing this
module never requires the SDK to be installed; the provider router
(``agents.article_llm``) only reaches here when ARTICLE_LLM_PROVIDER=gemini.
"""
import logging
import os

logger = logging.getLogger(__name__)

# Overridable via env; the model the approved article voice came from.
GEMINI_ARTICLE_MODEL = os.environ.get("GEMINI_ARTICLE_MODEL", "gemini-2.5-flash")


def _model_name(model=None) -> str:
    m = model or GEMINI_ARTICLE_MODEL
    for prefix in ("gemini/", "vertex_ai/"):
        if m.startswith(prefix):
            m = m[len(prefix):]
    return m


def generate_text(prompt: str, *, json_mode: bool = False,
                  temperature: float | None = None, model: str | None = None,
                  return_usage: bool = False):
    """Text completion via Gemini AI Studio. Fails LOUD if GEMINI_API_KEY is unset.

    temperature=None preserves Gemini's own default (matches the pre-migration path
    that produced the approved voice); pass a value to override.

    return_usage=False -> str (unchanged).
    return_usage=True  -> (text, {provider, model, input_tokens, output_tokens}).
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set — cannot generate via Gemini. "
            "Provide the key, or set ARTICLE_LLM_PROVIDER=claude."
        )

    import google.generativeai as genai  # lazy: only when Gemini is actually used

    genai.configure(api_key=api_key)
    mname = _model_name(model)
    gmodel = genai.GenerativeModel(mname)

    cfg: dict = {}
    if json_mode:
        cfg["response_mime_type"] = "application/json"
    if temperature is not None:
        cfg["temperature"] = temperature

    logger.info("[gemini_writer] generating via %s (temp=%s)", mname, temperature)
    resp = gmodel.generate_content(prompt, generation_config=cfg or None)
    text = resp.text.strip() if resp and resp.text else ""

    if return_usage:
        um = getattr(resp, "usage_metadata", None)
        usage = {
            "provider": "gemini",
            "model": mname,
            "input_tokens": int(getattr(um, "prompt_token_count", 0) or 0),
            "output_tokens": int(getattr(um, "candidates_token_count", 0) or 0),
        }
        return text, usage
    return text
