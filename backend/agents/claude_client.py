import json
import os

import anthropic

# Single shared client — reads ANTHROPIC_API_KEY from the environment.
# The SDK auto-retries 429/5xx with exponential backoff, so no manual retry loop.
_client = anthropic.Anthropic()

# Model is overridable via env without code changes; per-call override also supported.
DEFAULT_MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-4-8")


def complete(prompt, *, system=None, max_tokens=4000, model=None) -> str:
    """Canonical text completion. Returns the concatenated text blocks."""
    resp = _client.messages.create(
        model=model or DEFAULT_MODEL,
        max_tokens=max_tokens,
        system=system or anthropic.NOT_GIVEN,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(b.text for b in resp.content if b.type == "text")


def complete_json(prompt, *, system=None, max_tokens=4000, model=None) -> dict:
    """Like complete(), but parses the response as JSON.

    Robust replacement for the brittle ``\\{.*\\}`` regex: try a direct parse
    first, then fall back to the outermost {...} span.
    """
    text = complete(prompt, system=system, max_tokens=max_tokens, model=model)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


def complete_vision(prompt, image_bytes, media_type="image/png", *,
                    max_tokens=2000, model=None) -> str:
    """Vision completion (screenshot / visual-trends path) via base64 image block."""
    import base64
    data = base64.standard_b64encode(image_bytes).decode()
    resp = _client.messages.create(
        model=model or DEFAULT_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64",
             "media_type": media_type, "data": data}},
            {"type": "text", "text": prompt},
        ]}],
    )
    return "".join(b.text for b in resp.content if b.type == "text")


def generate_social_post(tweet_text: str, tweet_url: str, handle: str, category: str) -> dict:
    prompt = f"""You are a senior social media manager for PavilionEnd, a Malayalam sports news portal.

A tweet just came in from @{handle} (category: {category}):
"{tweet_text}"
Source: {tweet_url}

Your job:
1. Detect the event type: transfer_news | match_result | breaking | player_quote | milestone | general
2. Write a punchy Malayalam caption (sports fan voice, 2-3 sentences, emojis encouraged)
3. Write a short punchy English headline (max 8 words, impactful)
4. Suggest 5 relevant hashtags (mix of Malayalam transliterated + English)
5. Decide the best visual format: single_card | breaking_banner | quote_card | stat_card | custom
6. Write a creative brief for the Canva design (2-3 sentences describing exactly what the visual should look like — colors, mood, layout, text placement). Be specific and creative. Do NOT say "use template X". Describe the visual as a senior art director would.
7. Write a ready-to-paste Cowork prompt that instructs Claude to open Canva MCP and create this exact post from scratch or by customizing the best available template.

Respond in this exact JSON format:
{{
  "event_type": "...",
  "malayalam_caption": "...",
  "english_headline": "...",
  "hashtags": ["...", "...", "...", "...", "..."],
  "visual_format": "...",
  "creative_brief": "...",
  "cowork_prompt": "..."
}}

The cowork_prompt must be self-contained, include the tweet context, the Malayalam caption, the creative brief, and instruct Claude to: search Canva for suitable templates, pick or build the best one, customize it fully, and return the editable Canva link. It should sound like a briefing from a creative director to a designer."""

    return complete_json(prompt, max_tokens=1500)
