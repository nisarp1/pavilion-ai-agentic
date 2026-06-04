"""
Fact-check agent — uses Gemini Flash Lite to assess tweet credibility.
"""
import json
import logging

logger = logging.getLogger(__name__)

PROMPT_TEMPLATE = """You are a sports journalism fact-checker. Assess the credibility of the following tweet.

Handle: @{handle}
Credibility Tier: {tier} (1=Top Sources, 2=Journalists, 3=Aggregators)
Tweet text: {tweet_text}

Respond ONLY with a valid JSON object (no markdown, no explanation):
{{
  "verdict": "CONFIRMED" | "UNCONFIRMED" | "CONTRADICTED",
  "confidence": <integer 0-100>,
  "reasoning": "<one or two sentences explaining your assessment>",
  "sources_mentioned": ["<any named sources or accounts referenced in the tweet>"]
}}

Rules:
- CONFIRMED: claim is backed by an official source, verified account, or well-known outlet referenced in the tweet
- UNCONFIRMED: single unverified claim, rumour, or no corroboration evident
- CONTRADICTED: tweet explicitly contradicts known official information
- Tier 1 accounts start with a confidence floor of 60; Tier 3 accounts start at 30
"""


def fact_check_tweet(article) -> dict:
    """
    Assess tweet credibility for the given article.

    Args:
        article: Article instance (uses title as tweet text, source_handle as handle)

    Returns:
        dict with keys: verdict, confidence, reasoning
    """
    try:
        from agents.gemini_client import generate_text as _gemini_text

        handle = getattr(article, 'source_handle', '') or 'unknown'
        tweet_text = article.title or ''

        # Derive tier from source_handle by looking up SocialMediaHandle if possible
        tier = 2
        try:
            from cms.models import SocialMediaHandle
            clean_handle = handle.lstrip('@')
            smh = SocialMediaHandle.objects.filter(x_handle__iexact=clean_handle).first()
            if smh:
                tier = smh.credibility_tier
        except Exception:
            pass

        prompt = PROMPT_TEMPLATE.format(
            handle=handle,
            tier=tier,
            tweet_text=tweet_text,
        )

        raw = _gemini_text(prompt)

        if not raw:
            raise ValueError("Empty response from Gemini")

        # Extract JSON from response
        cleaned = raw.replace('```json', '').replace('```', '').strip()
        start = cleaned.find('{')
        end = cleaned.rfind('}')
        if start == -1 or end == -1:
            raise ValueError(f"No JSON object found in response: {cleaned[:200]}")

        data = json.loads(cleaned[start:end + 1])

        verdict = data.get('verdict', 'UNCONFIRMED')
        if verdict not in ('CONFIRMED', 'UNCONFIRMED', 'CONTRADICTED'):
            verdict = 'UNCONFIRMED'

        return {
            'verdict': verdict,
            'confidence': int(data.get('confidence', 0)),
            'reasoning': data.get('reasoning', ''),
            'sources_mentioned': data.get('sources_mentioned', []),
        }

    except Exception as exc:
        logger.warning(f"fact_check_tweet failed for article {getattr(article, 'id', '?')}: {exc}")
        return {
            'verdict': 'UNCONFIRMED',
            'confidence': 0,
            'reasoning': f'Fact-check unavailable: {exc}',
            'sources_mentioned': [],
        }
