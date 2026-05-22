"""
Social Studio Prompt Interpreter

Takes a user's free-text prompt (instruction + optional content) and returns
structured parameters for the social post pipeline:
  - content_type_hint  → which Canva template type to use
  - vibe_override      → tone instruction for the Malayalam localizer
  - plain_text         → the actual subject matter / content to generate from

The Gemini call is tried first; keyword fallback is used if Gemini fails.
"""
import json
import logging
import os
import re

logger = logging.getLogger(__name__)

# Maps interpreter post_type → CanvaTemplate.content_type
_TYPE_MAP = {
    'breaking':       'ticker',
    'fact_check':     'fact_check',
    'quote':          'quote_card',
    'predicted_xi':   'predicted_xi',
    'playing_xi':     'playing_xi',
    'stat_comparison':'stat_comparison',
    'match_result':   'match_result',
    'general':        'hero_headline',
}

# Default tone per post type
_VIBE_MAP = {
    'breaking':       'urgent',
    'fact_check':     'factual',
    'quote':          'analytical',
    'predicted_xi':   'excited',
    'playing_xi':     'excited',
    'stat_comparison':'analytical',
    'match_result':   'dramatic',
    'general':        'energetic',
}

_GEMINI_SYSTEM = """You are a social media content intent classifier for a sports news platform.

Given a user's prompt (which may be a content creation instruction, raw news text, or both),
extract the following as a strict JSON object with no markdown fences:

{
  "post_type": "<one of: breaking | fact_check | quote | predicted_xi | playing_xi | stat_comparison | match_result | general>",
  "vibe": "<one of: urgent | celebratory | factual | emotional | analytical | aggressive | excited | dramatic>",
  "content": "<the actual subject matter — what the post is ABOUT, stripped of instruction words>"
}

Post type definitions:
- breaking      : urgent announcement — player dropped, selected, injured, confirmed
- fact_check    : verifying or debunking a claim / statement
- quote         : a SINGLE person's notable spoken statement or quote. Use ONLY when ONE speaker is quoted.
- predicted_xi  : pre-match predicted lineup (before toss)
- playing_xi    : official playing eleven (announced after toss)
- stat_comparison: head-to-head player stats, rankings, comparisons — OR quotes/statements from TWO OR MORE different people. If the prompt contains quotes attributed to 2+ different speakers, always use stat_comparison, not quote.
- match_result  : reporting a completed match result
- general       : everything else — milestones, transfers, profiles, general sports news

IMPORTANT: If you see quotes from multiple different people (e.g. "Player A said … Player B said …"), always return stat_comparison, never quote.

Output ONLY valid JSON, nothing else."""


def interpret_prompt(prompt_text: str) -> dict:
    """
    Parse a user's natural language prompt into structured pipeline parameters.

    Returns:
        content_type_hint  (str)  — maps to CanvaTemplate.content_type
        vibe_override      (str)  — tone for the Malayalam localizer
        plain_text         (str)  — content to pass to the crew
        post_type          (str)  — human-readable type label
        inferred           (bool) — True if Gemini was used
    """
    try:
        return _gemini_interpret(prompt_text)
    except Exception as exc:
        logger.warning('[PromptInterpreter] Gemini parse failed (%s), using keyword fallback', exc)
        return _keyword_interpret(prompt_text)


def _gemini_interpret(prompt_text: str) -> dict:
    import google.generativeai as genai

    api_key = os.environ.get('GEMINI_API_KEY', '')
    if not api_key:
        raise ValueError('GEMINI_API_KEY not set')

    genai.configure(api_key=api_key)
    model_name = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash-lite')
    model = genai.GenerativeModel(model_name)

    response = model.generate_content(
        f"{_GEMINI_SYSTEM}\n\nUser prompt:\n{prompt_text[:2000]}"
    )
    raw = response.text.strip()
    raw = re.sub(r'^```[a-zA-Z]*\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw.strip())

    parsed = json.loads(raw)
    post_type = parsed.get('post_type', 'general')
    vibe = parsed.get('vibe', 'energetic')
    content = parsed.get('content') or prompt_text

    logger.info(
        '[PromptInterpreter] Gemini → post_type=%r vibe=%r content=%r',
        post_type, vibe, content[:80],
    )

    return {
        'post_type':          post_type,
        'content_type_hint':  _TYPE_MAP.get(post_type, 'hero_headline'),
        'vibe_override':      vibe,
        'plain_text':         prompt_text,
        'inferred':           True,
    }


def _keyword_interpret(prompt_text: str) -> dict:
    import re as _re
    lower = prompt_text.lower()

    # Multi-speaker detection: 3+ “Speaker: quote” patterns → Three Players Quote.
    # Must run before the generic quote check.
    _speaker_count = len(_re.findall(r'[a-z].{2,60}?:\s*[“”]', prompt_text))
    _open_quotes   = prompt_text.count('”') + prompt_text.count('”')

    if any(k in lower for k in ['fact check', 'fact-check', 'factcheck', 'debunk', 'verify', 'claim', 'myth', 'hoax']):
        post_type = 'fact_check'
    elif any(k in lower for k in ['breaking', 'just in', 'urgent', 'alert', 'confirmed']):
        post_type = 'breaking'
    elif _speaker_count >= 3 or _open_quotes >= 3:
        # Three or more quoted speakers → Three Players Quote (stat_comparison)
        post_type = 'stat_comparison'
    elif any(k in lower for k in ['”', '”', 'quote', 'said', 'statement', 'stated']):
        post_type = 'quote'
    elif any(k in lower for k in ['predicted xi', 'predicted 11', 'predicted eleven', 'expected xi', 'expected lineup']):
        post_type = 'predicted_xi'
    elif any(k in lower for k in ['playing xi', 'playing 11', 'toss', 'lineup', 'final xi', 'playing eleven']):
        post_type = 'playing_xi'
    elif any(k in lower for k in ['vs ', ' vs ', 'comparison', 'head to head', 'stats compare']):
        post_type = 'stat_comparison'
    elif any(k in lower for k in ['won', 'lost', 'beat', 'defeated', 'result', 'victory', 'match result']):
        post_type = 'match_result'
    else:
        post_type = 'general'

    logger.info('[PromptInterpreter] Keyword → post_type=%r', post_type)

    return {
        'post_type':          post_type,
        'content_type_hint':  _TYPE_MAP.get(post_type, 'hero_headline'),
        'vibe_override':      _VIBE_MAP.get(post_type, 'energetic'),
        'plain_text':         prompt_text,
        'inferred':           False,
    }
