"""
Central Gemini client factory.

Automatically uses Vertex AI when VERTEX_PROJECT is set (recommended for production),
falling back to the AI Studio API key for local dev.

Usage:
    from agents.gemini_client import get_client, get_model_name, generate_text

    text = generate_text("Your prompt here")
    text = generate_text("Return JSON", json_mode=True)
"""
import os
import logging

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# Module-level cached client to avoid re-initialising on every call
_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client
    if _client is not None:
        return _client

    project = os.environ.get("VERTEX_PROJECT") or os.environ.get("VERTEXAI_PROJECT", "")
    location = os.environ.get("VERTEX_LOCATION") or os.environ.get("VERTEXAI_LOCATION", "us-central1")

    if project:
        logger.info(f"[Gemini] Using Vertex AI — project={project} location={location}")
        _client = genai.Client(vertexai=True, project=project, location=location)
    else:
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            raise RuntimeError("Neither VERTEX_PROJECT nor GEMINI_API_KEY is configured.")
        logger.info("[Gemini] Using AI Studio API key")
        _client = genai.Client(api_key=api_key)

    return _client


def get_model_name() -> str:
    """Return the plain model name (strip gemini/ or vertex_ai/ prefix)."""
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
    for prefix in ("gemini/", "vertex_ai/"):
        if model.startswith(prefix):
            model = model[len(prefix):]
    return model


def generate_text(prompt: str, *, json_mode: bool = False, temperature: float | None = None) -> str:
    """
    Call Gemini and return the raw text response.
    Raises on API errors (caller is responsible for handling 429 etc).
    """
    client = get_client()
    model = get_model_name()

    config_kwargs: dict = {}
    if json_mode:
        config_kwargs["response_mime_type"] = "application/json"
    if temperature is not None:
        config_kwargs["temperature"] = temperature

    config = types.GenerateContentConfig(**config_kwargs) if config_kwargs else None

    kwargs: dict = {"model": model, "contents": prompt}
    if config:
        kwargs["config"] = config

    response = client.models.generate_content(**kwargs)
    return response.text.strip() if response and response.text else ""


def generate_with_parts(parts: list, *, json_mode: bool = False, temperature: float | None = None) -> str:
    """
    Call Gemini with a mixed-content list (text + inline bytes).
    `parts` is a list of strings or `google.genai.types.Part` objects.
    """
    client = get_client()
    model = get_model_name()

    config_kwargs: dict = {}
    if json_mode:
        config_kwargs["response_mime_type"] = "application/json"
    if temperature is not None:
        config_kwargs["temperature"] = temperature

    config = types.GenerateContentConfig(**config_kwargs) if config_kwargs else None

    kwargs: dict = {"model": model, "contents": parts}
    if config:
        kwargs["config"] = config

    response = client.models.generate_content(**kwargs)
    return response.text.strip() if response and response.text else ""
