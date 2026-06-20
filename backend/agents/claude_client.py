import anthropic
import os

client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))


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

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}]
    )

    import json, re
    text = message.content[0].text
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        return json.loads(match.group())
    raise ValueError("No JSON in response")
