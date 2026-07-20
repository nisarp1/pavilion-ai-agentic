import json
import os

import anthropic

# The SDK auto-retries 429/5xx with exponential backoff. We cap BOTH the per-request
# wall-clock (timeout) and the retry count so a hung/slow upstream can never wedge a
# Celery worker indefinitely — the generation task must fail fast and be marked failed
# rather than sit in "generating" forever. Overridable via env for tuning.
_LLM_TIMEOUT = float(os.environ.get("LLM_REQUEST_TIMEOUT", "90"))   # seconds per request
_LLM_MAX_RETRIES = int(os.environ.get("LLM_MAX_RETRIES", "2"))

# Client is built LAZILY, not at import. This deployment can run entirely without an
# ANTHROPIC_API_KEY (article generation uses Gemini via ARTICLE_LLM_PROVIDER=gemini).
# Removing the key must NOT crash boot — modules import claude_client freely. Instead,
# any actual Claude call with no key configured fails LOUD and immediately, so there is
# zero possibility of silent Claude spend / credit leakage: no key ⇒ no request ⇒ no cost.
_client = None


def _get_client():
    global _client
    if _client is None:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError(
                "Claude is disabled on this deployment (ANTHROPIC_API_KEY is not set). "
                "Article generation uses Gemini (ARTICLE_LLM_PROVIDER=gemini). A caller "
                "attempted a Claude API call — route it through Gemini or set a key."
            )
        _client = anthropic.Anthropic(timeout=_LLM_TIMEOUT, max_retries=_LLM_MAX_RETRIES)
    return _client

# Model is overridable via env without code changes; per-call override also supported.
DEFAULT_MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-4-8")

# Web-search grounding is billed per search — off by default. When disabled,
# complete_grounded() behaves exactly like complete() (zero search cost).
WEB_GROUNDING = os.environ.get("ENABLE_WEB_GROUNDING", "false").lower() == "true"

# Credible news domains for web-search grounding (article enrichment).
CREDIBLE_NEWS_DOMAINS = [
    "espncricinfo.com", "cricbuzz.com", "bbc.com", "bbc.co.uk", "reuters.com",
    "apnews.com", "thehindu.com", "sportstar.thehindu.com", "indianexpress.com",
    "hindustantimes.com", "ndtv.com", "theguardian.com", "icc-cricket.com",
    "olympics.com", "timesofindia.indiatimes.com",
]


def complete(prompt, *, system=None, max_tokens=4000, model=None) -> str:
    """Canonical text completion. Returns the concatenated text blocks.

    Fails loud on truncation: if the model stops because it hit max_tokens the
    output is a partial (often mid-word) response. Silently returning it is how
    articles used to get saved cut off mid-sentence — so we raise instead, letting
    the caller retry with a larger budget or mark the article failed.
    """
    resp = _get_client().messages.create(
        model=model or DEFAULT_MODEL,
        max_tokens=max_tokens,
        system=system or anthropic.NOT_GIVEN,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in resp.content if b.type == "text")
    if resp.stop_reason == "max_tokens":
        raise RuntimeError(
            f"LLM output truncated at max_tokens={max_tokens} "
            f"(model={model or DEFAULT_MODEL}, got {len(text)} chars)"
        )
    return text


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
    resp = _get_client().messages.create(
        model=model or DEFAULT_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64",
             "media_type": media_type, "data": data}},
            {"type": "text", "text": prompt},
        ]}],
    )
    return "".join(b.text for b in resp.content if b.type == "text")


def complete_grounded(prompt, *, system=None, max_tokens=4000, model=None, allowed_domains=None, max_uses=None) -> str:
    """Web-grounded completion (replaces Gemini Google-Search grounding).

    Flag-gated: when ENABLE_WEB_GROUNDING is off, this is just complete() — no
    web_search tool is attached, so there is zero search cost. When enabled, it
    uses Claude's server-side web_search tool and resumes across pause_turn until
    the server-side search loop finishes.
    """
    if not WEB_GROUNDING:
        return complete(prompt, system=system, max_tokens=max_tokens, model=model)

    mdl = model or DEFAULT_MODEL
    sys = system or anthropic.NOT_GIVEN
    _ws = {"type": "web_search_20260209", "name": "web_search"}
    if max_uses:
        _ws["max_uses"] = max_uses
    if allowed_domains:
        _ws["allowed_domains"] = allowed_domains
    tools = [_ws]
    msgs = [{"role": "user", "content": prompt}]

    resp = _get_client().messages.create(
        model=mdl, max_tokens=max_tokens, system=sys, messages=msgs, tools=tools,
    )
    # The server-side search loop may pause; resume by re-sending the assistant
    # turn (no extra "continue" message — the API detects the trailing tool block).
    guard = 0
    while resp.stop_reason == "pause_turn" and guard < 5:
        guard += 1
        msgs = [
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": resp.content},
        ]
        resp = _get_client().messages.create(
            model=mdl, max_tokens=max_tokens, system=sys, messages=msgs, tools=tools,
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
