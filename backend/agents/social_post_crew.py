"""
SocialPostCrew — 3-agent CrewAI pipeline for generating Canva-ready social posts.

Flow:
  1. SportsJournalist  — extracts facts from source content, writes English copy
                         fitted to the template's exact slot schema
  2. MalayalamLocalizer — translates all text slots into authentic Malayalam,
                          respects per-slot word-count limits, honours vibe override
  3. ArtDirector       — validates lengths, picks Accent_Color, emits final strict JSON

The selected CanvaTemplate is serialised into a human-readable "slot brief" that is
injected verbatim into every agent's task prompt.  Agents generate content ONLY for
the declared slots — no more, no less.
"""
import os
import json
import re
import logging

# Prevent LiteLLM from fetching model cost data from GitHub at import time.
# Without this, `from crewai import ...` can block for up to 5 s (or indefinitely
# when the Cloud Run VPC drops packets to raw.githubusercontent.com).
os.environ.setdefault('LITELLM_LOCAL_MODEL_COST_MAP', 'True')

from crewai import Agent, Task, Crew, Process

logger = logging.getLogger(__name__)

# Slots that the agent should NOT generate for predicted_xi templates.
# Section_Title is a fixed design element set in Canva — not editorial copy.
_PREDICTED_XI_SKIP_SLOTS = {'Section_Title'}

# Per-slot format hints injected into the journalist prompt for predicted_xi.
_PREDICTED_XI_FORMAT_HINTS = """
PREDICTED XI FORMAT RULES (apply strictly):

Match_Header — 2 lines separated by \\n (no translation needed):
  Line 1: match label and venue in UPPER CASE  e.g. "1ST T20I, CANBERRA"
  Line 2: date in UPPER CASE                   e.g. "OCT 29, 2025"

Match_Teams — 2 lines separated by \\n (no translation needed):
  Line 1: first team name in UPPER CASE        e.g. "AUSTRALIA"
  Line 2: "VS " + second team in UPPER CASE    e.g. "VS INDIA"

Squad_List — 11 starting players, ONE per line, joined with \\n:
  Transliterate player names into Malayalam script.
  Append (C) after the captain. Append (WK) after the wicket-keeper.
  Example: "മിച്ചൽ മാർഷ് (C)\\nട്രാവിസ് ഹെഡ്\\nജോഷ് ഫിലിപ്പ് (WK)\\n..."

Substitutes_List — bench/substitute players on ONE line, comma-separated:
  Transliterate names into Malayalam script.
  Example: "ജോഷ് ഇൻഗ്ലിസ്, സെവിയർ കൂണി, ആരോൺ ഹാർഡി"

Team_Logo_Left / Team_Logo_Right — English image search query (3-5 words) for the team logo.
  Example: "Australia cricket team logo"
"""

# Generic fallback schema used when no CanvaTemplate is available.
_GENERIC_SLOTS = {
    'text': [
        {'key': 'Headline',     'canva_name': 'Headline',     'max_words': 10},
        {'key': 'Subheadline',  'canva_name': 'Subheadline',  'max_words': 20},
        {'key': 'Stat_1',       'canva_name': 'Stat_1',       'max_words': 5},
        {'key': 'Stat_2',       'canva_name': 'Stat_2',       'max_words': 5},
        {'key': 'Caption',      'canva_name': 'Caption',      'max_words': 50},
    ],
    'image': [
        {'key': 'Background_Image', 'canva_name': 'Background_Image', 'needs_cutout': False},
        {'key': 'Player_Cutout',    'canva_name': 'Player_Cutout',    'needs_cutout': True},
    ],
    'color': [
        {'key': 'Accent_Color', 'canva_name': 'Accent_Color'},
    ],
}


def _normalise_squad_list(value) -> str:
    """
    Always return a newline-separated player list regardless of how the LLM
    formatted it (list, comma-separated string, literal-\\n string, etc.)
    """
    import re as _re
    if isinstance(value, list):
        players = [str(p) for p in value]
    else:
        raw = str(value)
        # Replace literal backslash-n that LLMs write instead of real newlines
        raw = raw.replace('\\n', '\n')
        # Split on newlines, semicolons, or commas — whichever was used
        players = _re.split(r'[\n;,]+', raw)
    players = [p.strip().strip('"\'') for p in players]
    players = [p for p in players if p]
    return '\n'.join(players)


def _is_predicted_xi(template) -> bool:
    return template is not None and getattr(template, 'content_type', '') == 'predicted_xi'


def _build_slot_brief(template) -> str:
    """
    Serialise a CanvaTemplate's slot schema into a human-readable block
    that is injected into every agent task prompt.
    """
    if template is None:
        slots = _GENERIC_SLOTS
        header = (
            "TEMPLATE: Generic (no Canva template selected)\n"
            "LAYOUT: Standard social post with headline, stats, player image, caption.\n"
        )
    else:
        slots = template.slots if template.slots else _GENERIC_SLOTS
        header = (
            f'TEMPLATE: "{template.name}" ({template.get_content_type_display()})\n'
            f"LAYOUT: {template.description or 'Visual layout not described.'}\n"
        )

    is_xi = _is_predicted_xi(template)
    skip  = _PREDICTED_XI_SKIP_SLOTS if is_xi else set()

    text_slots  = [s for s in slots.get('text',  []) if s['key'] not in skip]
    image_slots = slots.get('image', [])
    color_slots = slots.get('color', [])

    lines = [header]

    lines.append(
        "⚠️  GROUNDING RULE: Generate ALL content EXCLUSIVELY from the topic and facts "
        "provided in the task description above. The Canva element names shown after → "
        "are graphic-design identifiers only — they are NOT content examples and must "
        "NEVER be copied or paraphrased into your output. If the source content is "
        "insufficient, say so with a placeholder rather than inventing content."
    )

    if is_xi:
        lines.append(_PREDICTED_XI_FORMAT_HINTS)

    lines.append(
        "TEXT SLOTS — You MUST fill every slot listed below. "
        "Values will be in Malayalam after translation:"
    )
    for s in text_slots:
        limit = f"  (≤{s['max_words']} words)" if s.get('max_words') else ""
        hint  = f"\n      ↳ {s['hint']}" if s.get('hint') else ""
        lines.append(
            f'  • {s["key"]:25s}→  Canva element: "{s["canva_name"]}"{limit}{hint}'
        )

    if image_slots:
        lines.append(
            "\nIMAGE SLOTS — Provide an English image search query for each "
            "(3-5 words, specific to the news event):"
        )
        for s in image_slots:
            cutout_note = "  [BACKGROUND REMOVAL REQUIRED]" if s.get('needs_cutout') else ""
            lines.append(
                f'  • {s["key"]:25s}→  Canva element: "{s["canva_name"]}"{cutout_note}'
            )

    if color_slots:
        lines.append("\nCOLOR SLOTS — Provide a hex colour code for each:")
        for s in color_slots:
            lines.append(
                f'  • {s["key"]:25s}→  Canva element: "{s["canva_name"]}"'
            )

    return "\n".join(lines)


def _all_slot_keys(template) -> list:
    """Return all slot key strings for the given template (or generic fallback)."""
    slots = (template.slots if (template and template.slots) else _GENERIC_SLOTS)
    skip  = _PREDICTED_XI_SKIP_SLOTS if _is_predicted_xi(template) else set()
    result = []
    for category in ('text', 'image', 'color'):
        result.extend(s['key'] for s in slots.get(category, []) if s['key'] not in skip)
    return result


class SocialPostCrew:
    """
    3-agent CrewAI pipeline.

    Usage:
        crew = SocialPostCrew()
        plan = crew.run_pipeline(
            source_context = analyze_context(...),
            vibe_override  = "celebratory",
            template       = CanvaTemplate.objects.get(pk=1),  # or None
        )
        # plan keys == template's slot keys + _template_pk / _template_name / _canva_template_id
    """

    def __init__(self):
        model_name = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash-lite')
        if not model_name.startswith('gemini/') and not model_name.startswith('vertex_ai/'):
            # Use vertex_ai/ prefix when Vertex AI is configured (Cloud Run production);
            # fall back to gemini/ prefix (AI Studio) only if no VERTEX_PROJECT is set.
            vertex_project = os.environ.get('VERTEX_PROJECT') or os.environ.get('VERTEXAI_PROJECT', '')
            prefix = 'vertex_ai/' if vertex_project else 'gemini/'
            model_name = f'{prefix}{model_name}'
        self.llm_model = model_name

    # ── Agents ────────────────────────────────────────────────────────────────

    def _journalist_agent(self) -> Agent:
        return Agent(
            role='Sports Journalist & Fact Extractor',
            goal=(
                'Parse the provided sports news content and produce English copy '
                'that fills EXACTLY the text slot schema provided. '
                'Also generate an English image-search query for each image slot.'
            ),
            backstory=(
                'You are a seasoned sports journalist covering cricket, football, '
                'and athletics for a Kerala news brand. You identify the single most '
                'compelling fact in a story, extract clean stats, and know exactly '
                'what 3-5 word search query will surface the best player action photo.'
            ),
            verbose=True,
            allow_delegation=False,
            llm=self.llm_model,
        )

    def _localizer_agent(self) -> Agent:
        return Agent(
            role='Malayalam Sports Localizer',
            goal=(
                'Rewrite every TEXT slot value as a native Malayalam sports journalist '
                'would write it for social media — NOT a word-for-word English translation. '
                'Numbers and stats remain unchanged. '
                'Honour the vibe_override tone instruction if one is provided. '
                'Honour the max_words limit for each slot.'
            ),
            backstory=(
                "You are the lead Malayalam copy editor at Pavilion, Kerala's premier "
                "sports news brand. You write the way Kerala fans actually talk about sports — "
                "WhatsApp forwards, Instagram reels, passionate cricket arguments. "
                "You NEVER translate English phrase-by-phrase. "
                "Bad: 'കോഹ്ലി ടീമിൽ നിന്ന് പുറത്ത്.' "
                "Good: 'കിംഗ് ഇല്ലാതെ ഇംഗ്ലണ്ട് ടൂർ — BCCI ഞെട്ടിച്ചു!' "
                "Bad: 'ഇത് ഒരു വലിയ വാർത്ത ആണ്.' "
                "Good: 'ഗില്ലിന്റെ 120* — MCG-യിൽ ഓസ്ട്രേലിയ ലജ്ജിച്ചു!' "
                "Rules: short punchy sentences, hook in the first 5 words, "
                "specific names and stats always included, never generic openers. "
                "For fact-check verdicts, always start with 'വസ്തുതാ പരിശോധന: '. "
                "For quotes, keep first-person voice — never paraphrase into third person."
            ),
            verbose=True,
            allow_delegation=False,
            llm=self.llm_model,
        )

    def _art_director_agent(self) -> Agent:
        return Agent(
            role='Art Director',
            goal=(
                'Assemble the final output JSON. '
                'Validate that every TEXT slot respects its max_words limit — truncate if needed. '
                'Pick an Accent_Color hex that suits the sport/team context. '
                'Output ONLY a single valid JSON object with no markdown fences.'
            ),
            backstory=(
                'You are the visual brand guardian for Pavilion. You know that cricket '
                'posts use blue/gold, football uses green/white, and athlete spotlights '
                'use orange/black. You always output strict JSON with exactly the keys '
                'required — no extra keys, no missing keys.'
            ),
            verbose=True,
            allow_delegation=False,
            llm=self.llm_model,
        )

    # ── Pipeline ──────────────────────────────────────────────────────────────

    def run_pipeline(
        self,
        source_context: dict,
        vibe_override: str = '',
        template=None,           # CanvaTemplate instance or None (generic mode)
        post_type: str = '',     # 'quote' triggers full-quote preservation rules
        feedback_examples: list = None,  # [{slot, original, correction}] from SocialPostFeedback
    ) -> dict:
        """
        Run the 3-agent sequential pipeline.

        Args:
            source_context:  Output of analyze_context() — must have keys:
                             topic, raw_content, facts (list of str), thumbnail_url
            vibe_override:   Optional tone instruction, e.g. "aggressive", "celebratory"
            template:        CanvaTemplate model instance, or None for generic mode
            post_type:       Detected post type (e.g. 'quote', 'quote_card', 'fact_check').
                             When 'quote' / 'quote_card', full-quote preservation rules apply.
            feedback_examples: Recent human corrections for self-learning injection.

        Returns:
            dict with keys matching template slot keys + _template_pk, _template_name,
            _canva_template_id
        """
        topic       = source_context.get('topic', '')
        raw_content = (source_context.get('raw_content') or '')[:3000]
        facts_list  = source_context.get('facts') or []
        facts_block = '\n'.join(f'- {f}' for f in facts_list[:15]) if facts_list else raw_content[:800]

        slot_brief   = _build_slot_brief(template)
        # social_media_caption is always generated — it's the caption for actually posting
        # this graphic to Instagram/Facebook/Twitter. It is NOT a Canva template slot.
        expected_keys = _all_slot_keys(template) + ['social_media_caption']
        vibe_block   = f'\n\nVIBE / TONE INSTRUCTION: {vibe_override}' if vibe_override else ''

        is_quote = post_type in ('quote', 'quote_card')

        # ── Quote-specific instruction overrides ──────────────────────────────
        quote_journalist_block = ''
        quote_localizer_block  = ''
        quote_art_block        = ''
        if is_quote:
            quote_journalist_block = (
                "\n\n⚠️  QUOTE POST RULES (highest priority — override other instructions):\n"
                "1. Identify the SINGLE most powerful quote in the source content.\n"
                "2. Extract it VERBATIM and COMPLETELY — do NOT truncate, summarise, or paraphrase.\n"
                "   If the quote runs long, include every word. A quote is not a headline.\n"
                "3. Identify the speaker's full name and their role/context.\n"
                "4. For the 'social_media_caption_EN', structure it as:\n"
                "   • Line 1: The FULL quote in English, inside \" \" marks.\n"
                "     — [Speaker name, Role]\n"
                "   • 1-2 sentences of context that make the quote land harder.\n"
                "   • Engagement question + hashtags.\n"
                "5. For any slot named Quote, Quote_Text, Statement, or similar — "
                "use the full verbatim quote. max_words does NOT apply to quote content."
            )
            quote_localizer_block = (
                "\n\n⚠️  QUOTE POST RULES — LOCALISATION (highest priority):\n"
                "1. For every quote slot (Quote, Quote_Text, Statement, or similar):\n"
                "   • Localise the FULL quote into authentic, flowing Malayalam.\n"
                "   • You may re-phrase for natural Malayalam flow but you MUST preserve "
                "the complete meaning, emotion, and all specific details from the original.\n"
                "   • Do NOT shorten the quote to fit max_words. Quotes are EXEMPT from "
                "word-count limits — length accuracy matters more than brevity.\n"
                "   • Keep the speaker's name and any team/club/score references intact.\n"
                "2. For 'social_media_caption', structure it as:\n"
                "   • Open with the FULL localised quote inside Malayalam quotation marks "
                "(\" \") — this is the centrepiece, never cut it short.\n"
                "   • Follow with: — [Speaker name in Malayalam/English as fits naturally]\n"
                "   • 1-2 sentences of punchy context in Kerala sports-fan voice.\n"
                "   • End with an engagement question + hashtags (mix Malayalam + English).\n"
                "   Example structure:\n"
                '   "ഞാൻ ഈ ടീമിനുവേണ്ടി സർവ്വസ്വവും കൊടുക്കും, ആ വാഗ്ദാനം '
                'ഇന്നും നിലനിൽക്കുന്നു."\n'
                "   — Virat Kohli\n"
                "   ഈ വാക്കുകൾ ഇന്ത്യൻ ക്രിക്കറ്റ് ആരാധകർ ഒരിക്കലും "
                "മറക്കില്ല. നിങ്ങൾക്ക് എന്ത് തോന്നുന്നു? "
                "#ViratKohli #TeamIndia"
            )
            quote_art_block = (
                "\n\n⚠️  QUOTE POST RULES — ART DIRECTION:\n"
                "Quote slots (Quote, Quote_Text, Statement, or similar) are EXEMPT from "
                "max_words limits. Do NOT truncate them under any circumstances. "
                "For all other slots, apply word limits as normal."
            )

        # Build feedback block from past human corrections
        feedback_block = ''
        if feedback_examples:
            lines = [
                '\n\nPAST CORRECTIONS FROM THE SOCIAL MEDIA MANAGER — study these carefully '
                'and apply the same style improvements to your output:\n',
            ]
            for i, ex in enumerate(feedback_examples[:8], 1):
                slot   = ex.get('slot', '?')
                orig   = (ex.get('original') or '').strip()
                corr   = (ex.get('correction') or '').strip()
                if orig and corr and orig != corr:
                    lines.append(
                        f'[{i}] Slot "{slot}"\n'
                        f'    AI wrote:       {orig[:200]}\n'
                        f'    Editor changed: {corr[:200]}'
                    )
            if len(lines) > 1:
                feedback_block = '\n'.join(lines)

        logger.info(
            '[SocialPostCrew] Starting pipeline | topic=%r | template=%s | vibe=%r',
            topic[:60], getattr(template, 'name', 'Generic'), vibe_override,
        )

        journalist  = self._journalist_agent()
        localizer   = self._localizer_agent()
        art_director = self._art_director_agent()

        # ── Task 1: English fact extraction ──────────────────────────────────
        journalist_task = Task(
            description=(
                f"You are given the following sports news content.\n\n"
                f"TOPIC: {topic}\n\n"
                f"KEY FACTS:\n{facts_block}\n\n"
                f"RAW CONTENT:\n{raw_content}"
                f"{vibe_block}\n\n"
                "---\n"
                f"{slot_brief}\n\n"
                "---\n"
                "Your job:\n"
                "1. Fill every TEXT slot listed above with concise ENGLISH copy that fits "
                "the template layout described.\n"
                "2. For every IMAGE slot, write a 3-5 word English search query that will "
                "return a great photo for that slot.\n"
                "3. For every COLOR slot, leave the value as an empty string — the Art "
                "Director will handle colours.\n"
                "4. Generate 'social_media_caption_EN' — a READY-TO-POST English caption for "
                "Instagram/Facebook/X. This is the MOST IMPORTANT output; readers will see it "
                "before the graphic. Rules:\n"
                "   • MUST reference at least one specific name, score, or stat from the article.\n"
                "   • Sentence 1: the hook — the single most surprising/exciting fact.\n"
                "   • Sentence 2-3: brief context that makes the hook land.\n"
                "   • End with ONE fan engagement question + 3-5 tight hashtags.\n"
                "   • Tone: how a passionate Kerala cricket fan would post, NOT a press release.\n"
                "   • DO NOT start with generic phrases like 'Big news!' or 'Check this out!'.\n\n"
                f"{quote_journalist_block}\n\n"
                "Output a JSON object whose keys are EXACTLY the slot keys listed above "
                "(text slots suffixed with _EN, image and color slots as-is) PLUS "
                "'social_media_caption_EN'.\n"
                "Example text slot: \"Headline_EN\": \"Kohli smashes century\"\n"
                "Example image slot: \"Background_Image\": \"cricket stadium crowd night\"\n"
                "Example caption: \"social_media_caption_EN\": \"Kohli OUT of the England T20 squad "
                "— BCCI rests him ahead of the World Cup campaign. With Bumrah also rested, "
                "this is a full-scale rebuild. Who leads the attack now? "
                "#ViratKohli #TeamIndia #T20WorldCup\"\n"
                "No markdown fences. Output only the JSON object."
            ),
            expected_output=(
                "A valid JSON object containing _EN-suffixed keys for every text slot, "
                "plus raw-key entries for every image and color slot."
            ),
            agent=journalist,
        )

        # ── Task 2: Malayalam localisation ───────────────────────────────────
        localizer_task = Task(
            description=(
                "The journalist has produced English copy for each slot. "
                "Your job is to rewrite every TEXT slot into authentic, punchy Malayalam.\n\n"
                f"{slot_brief}\n\n"
                "Rules:\n"
                "- TEXT slots: rewrite (NOT word-for-word translate) from _EN value into Malayalam. "
                "Use the slot key WITHOUT _EN suffix.\n"
                "- Stat values (numbers, scores) stay unchanged inside the Malayalam string.\n"
                "- Respect the max_words limit for each slot; truncate if needed.\n"
                f"- Apply tone: {vibe_override or 'default energetic sports tone'}.\n"
                "- IMAGE and COLOR slot values: copy them unchanged from the journalist output.\n\n"
                "For 'social_media_caption' specifically:\n"
                "- Rewrite it as a NATIVE Malayalam sports page post — the kind Kerala fans "
                "share on WhatsApp and Instagram. Read the English, throw it away, then write "
                "the Malayalam from scratch using the same facts.\n"
                "- Keep all player names, team names, and numbers from the English version.\n"
                "- End with the same engagement question and hashtags (mix Malayalam + English tags).\n\n"
                f"{quote_localizer_block}\n\n"
                f"{feedback_block}\n\n"
                "Output a JSON object with EXACTLY these keys (no _EN suffix on text slots): "
                f"{json.dumps(expected_keys)}\n"
                "No markdown fences. Output only the JSON object."
            ),
            expected_output=(
                "A valid JSON object with all slot keys in their final form, "
                "text values in Malayalam, image values as English queries, "
                "color values empty or as provided."
            ),
            agent=localizer,
        )

        # ── Task 3: Art direction + final assembly ────────────────────────────
        art_task = Task(
            description=(
                "Assemble the final output from the localizer's JSON.\n\n"
                f"{slot_brief}\n\n"
                "Your jobs:\n"
                "1. Validate every TEXT slot against its max_words limit. Truncate at word "
                "boundary if exceeded.\n"
                "2. For every COLOR slot, choose a hex colour that fits the sport and team "
                "context (use team_colors from the template description if mentioned, "
                "otherwise choose an appropriate colour).\n"
                "3. Confirm every IMAGE slot has a non-empty English search query.\n"
                "4. Output a SINGLE strict JSON object — no markdown fences, no extra keys.\n\n"
                f"{quote_art_block}\n\n"
                f"Required keys exactly: {json.dumps(expected_keys)}\n\n"
                "Example:\n"
                '{"Headline": "കോലി സെഞ്ച്വറി", "Stat_1": "ഓട്ടം: 142", '
                '"Background_Image": "cricket stadium crowd", "Accent_Color": "#FF6B00"}'
            ),
            expected_output=(
                f"A single valid JSON object with exactly these keys: {expected_keys}. "
                "Text values in Malayalam, image values as English search queries, "
                "color values as hex strings."
            ),
            agent=art_director,
        )

        crew = Crew(
            agents=[journalist, localizer, art_director],
            tasks=[journalist_task, localizer_task, art_task],
            process=Process.sequential,
        )

        result     = crew.kickoff()
        raw_output = str(result).strip()

        # ── Post-processing ───────────────────────────────────────────────────
        # Strip markdown fences the LLM may have added
        raw_output = re.sub(r'^```[a-zA-Z]*\s*', '', raw_output)
        raw_output = re.sub(r'\s*```$', '', raw_output.strip())

        # Extract the first {...} block
        match = re.search(r'\{.*\}', raw_output, re.DOTALL)
        if not match:
            logger.error('[SocialPostCrew] No JSON block in output: %s', raw_output[:500])
            raise ValueError(f'SocialPostCrew: no JSON block in crew output. Preview: {raw_output[:300]}')

        try:
            plan = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            logger.error('[SocialPostCrew] JSON parse error: %s | raw: %s', exc, raw_output[:500])
            raise ValueError(f'SocialPostCrew: JSON parse failed — {exc}') from exc

        # Remove any stray _EN suffixed keys the LLM may have kept
        plan = {k.rstrip('_EN') if k.endswith('_EN') else k: v for k, v in plan.items()}

        # Normalise predicted_xi multi-line slots regardless of how the LLM formatted them.
        if _is_predicted_xi(template):
            plan['Squad_List'] = _normalise_squad_list(plan.get('Squad_List', ''))

            for key in ('Match_Header', 'Match_Teams'):
                if isinstance(plan.get(key), str):
                    plan[key] = plan[key].replace('\\n', '\n')

            subs = plan.get('Substitutes_List', '')
            if isinstance(subs, list):
                plan['Substitutes_List'] = ', '.join(str(p).strip() for p in subs if str(p).strip())

        _slots = (template.slots if (template and template.slots) else _GENERIC_SLOTS)
        _skip  = _PREDICTED_XI_SKIP_SLOTS if _is_predicted_xi(template) else set()

        # Ensure all required keys are present; fill missing ones with safe defaults.
        # Skipped slots (e.g. Section_Title) are kept empty — they're fixed in Canva.
        for s in _slots.get('text', []):
            if s['key'] in _skip:
                plan[s['key']] = ''
            else:
                plan.setdefault(s['key'], '')
        for s in _slots.get('image', []):
            plan.setdefault(s['key'], topic[:50])
        for s in _slots.get('color', []):
            plan.setdefault(s['key'], '#FF6B00')

        # Attach template metadata for downstream use (CSV export, status endpoint)
        plan['_template_pk']       = template.pk if template else None
        plan['_template_name']     = template.name if template else 'Generic'
        plan['_canva_template_id'] = template.canva_template_id if template else ''

        logger.info(
            '[SocialPostCrew] Pipeline complete | template=%s | keys=%s',
            plan['_template_name'], [k for k in plan if not k.startswith('_')],
        )
        return plan
