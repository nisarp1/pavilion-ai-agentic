"""
Article LLM provider router — the single seam that chooses which model writes the article.

Selection comes from the ARTICLE_LLM_PROVIDER env (default 'claude', so behaviour is
unchanged until a Gemini key is validated) and can be overridden per call:

    gemini  -> agents.gemini_writer  (AI Studio key-only; the approved article voice, ~20-60x cheaper)
    claude  -> agents.claude_client  (premium tier / fallback)

Imports are lazy so selecting one provider never pulls in the other's SDK.
"""
import logging
import os

logger = logging.getLogger(__name__)

DEFAULT_PROVIDER = os.environ.get("ARTICLE_LLM_PROVIDER", "claude").strip().lower()


def generate(prompt: str, *, provider: str | None = None, temperature: float | None = None,
             max_tokens: int = 4000, model: str | None = None, json_mode: bool = False) -> str:
    """Generate article text with the selected provider."""
    p = (provider or DEFAULT_PROVIDER).strip().lower()

    if p == "gemini":
        from . import gemini_writer
        logger.info("[article_llm] provider=gemini model=%s", model or gemini_writer.GEMINI_ARTICLE_MODEL)
        return gemini_writer.generate_text(
            prompt, json_mode=json_mode, temperature=temperature, model=model,
        )

    from . import claude_client
    logger.info("[article_llm] provider=claude model=%s", model or claude_client.DEFAULT_MODEL)
    return claude_client.complete(prompt, max_tokens=max_tokens, model=model)
