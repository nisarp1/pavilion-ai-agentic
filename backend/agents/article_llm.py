"""
Article LLM provider router — the single seam that chooses which model writes the article.

Selection comes from the ARTICLE_LLM_PROVIDER env (default 'claude', so behaviour is
unchanged until a Gemini key is validated) and can be overridden per call:

    gemini  -> agents.gemini_writer  (AI Studio key-only; the approved article voice, ~20-60x cheaper)
    bedrock -> AWS Bedrock Converse   (Gemma / open models via the VM IAM role — NO API key, no idle cost)
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

    if p == "bedrock":
        # Open models (Gemma, Llama, ...) via AWS Bedrock — authenticated by the VM's
        # IAM role, so there is NO API key to manage or leak. Serverless: billed only
        # per invoke, zero idle cost (no endpoint is ever provisioned here).
        import boto3
        model_id = model or os.environ.get("BEDROCK_ARTICLE_MODEL", "google.gemma-3-27b-it")
        region = os.environ.get("BEDROCK_REGION", "us-east-1")
        infcfg: dict = {"maxTokens": max_tokens}
        if temperature is not None:
            infcfg["temperature"] = temperature
        logger.info("[article_llm] provider=bedrock model=%s region=%s", model_id, region)
        rt = boto3.client("bedrock-runtime", region_name=region)
        resp = rt.converse(
            modelId=model_id,
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig=infcfg,
        )
        return "".join(b.get("text", "") for b in resp["output"]["message"]["content"])

    from . import claude_client
    logger.info("[article_llm] provider=claude model=%s", model or claude_client.DEFAULT_MODEL)
    return claude_client.complete(prompt, max_tokens=max_tokens, model=model)
