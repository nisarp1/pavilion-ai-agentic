"""
Scene Templates Catalog — Registry of available Remotion compositions.

Each template entry describes:
  - id: unique key used in the pipeline
  - name: human-readable name
  - description: what the scene looks like
  - duration_seconds: default duration
  - required_props: list of prop keys that MUST be filled
  - optional_props: list of prop keys that have sensible defaults
  - assets: list of asset slots that need images/videos
  - suitable_for: list of content types this template works well for

This catalog is passed as context to the Scene Planner agent so it can
intelligently pick and sequence templates.

NOTE: This file now also supports dynamic templates from the Style Library DB.
Use get_all_templates() to get catalog + library templates combined.
"""

SCENE_TEMPLATES = [
    {
        "id": "hero_headline",
        "name": "Hero Headline (Scene 1)",
        "description": (
            "Full-screen hero image with a dramatic gradient overlay. "
            "A large Malayalam headline animates word-by-word from the bottom. "
            "Top chrome bar with brand logo and LIVE badge is visible. "
            "Best for opening scenes, breaking news, and dramatic reveals."
        ),
        "duration_seconds_default": 6,
        "duration_frames_default": 180,
        "required_props": ["scene1Headline", "heroSrc"],
        "optional_props": [
            "bgColor", "scene1HeadlineColor", "scene1HeadlineFontSize",
            "scene1HeadlineFont", "brandName", "accent", "logoSrc"
        ],
        "assets": [
            {
                "slot": "heroSrc",
                "type": "image",
                "description": "Hero background image — wide shot of player, stadium, or event",
                "required": True,
            }
        ],
        "suitable_for": ["opening", "breaking_news", "dramatic_reveal", "match_update"],
        "clips": [
            {"id": "scene1-hero", "label": "Hero Image", "scene": 1, "track": 2, "color": "#0ea5e9"},
            {"id": "scene1-headline", "label": "Scene 1 Headline", "scene": 1, "track": 3, "color": "#38bdf8"},
        ],
    },
    {
        "id": "player_card",
        "name": "Player Card (Scene 2)",
        "description": (
            "Blurred hero background with a teal glass-card overlay. "
            "Shows player name, portrait image, and a stats grid (up to 6 stats). "
            "A secondary headline animates at the bottom. "
            "Best for player profiles, performance stats, and comparison scenes."
        ),
        "duration_seconds_default": 8,
        "duration_frames_default": 240,
        "required_props": ["scene2Headline", "playerName", "playerImage", "stats"],
        "optional_props": [
            "heroSrc", "bgColor", "cardColor", "cardAccent",
            "scene2HeadlineColor", "scene2HeadlineFontSize", "scene2HeadlineFont"
        ],
        "assets": [
            {
                "slot": "playerImage",
                "type": "image",
                "description": "Player portrait/cutout image — cropped, facing camera",
                "required": True,
            },
            {
                "slot": "heroSrc",
                "type": "image",
                "description": "Blurred background image — reuse the hero image or stadium shot",
                "required": False,
            }
        ],
        "suitable_for": ["player_profile", "stats_display", "performance_recap", "transfer_news"],
        "clips": [
            {"id": "scene2-bg", "label": "Background", "scene": 2, "track": 4, "color": "#10b981"},
            {"id": "scene2-card", "label": "Player Card", "scene": 2, "track": 5, "color": "#34d399"},
            {"id": "scene2-headline", "label": "Scene 2 Headline", "scene": 2, "track": 6, "color": "#6ee7b7"},
        ],
    },
    # ── NEW TEMPLATES (Sprint 1 — Style Library) ─────────────────────────────
    {
        "id": "scoreboard",
        "name": "Scoreboard",
        "description": (
            "Live match scoreboard display. Dark background with two team columns "
            "flanking a central score display. Team logos/flags at top, team names below, "
            "large animated score numbers in the center with a gold accent divider. "
            "Match status badge (LIVE / FT / HT) pulses at top. "
            "Optional match time or event info at bottom. "
            "Best for live scores, match results, and head-to-head matchups."
        ),
        "duration_seconds_default": 5,
        "duration_frames_default": 150,
        "required_props": [
            "team1Name", "team2Name", "team1Score", "team2Score", "matchStatus"
        ],
        "optional_props": [
            "team1LogoSrc", "team2LogoSrc", "matchTime", "matchEvent",
            "bgColor", "cardColor", "cardAccent", "accent",
            "heroSrc",
        ],
        "assets": [
            {
                "slot": "team1LogoSrc",
                "type": "image",
                "description": "Team 1 logo or flag — square, transparent background preferred",
                "required": False,
            },
            {
                "slot": "team2LogoSrc",
                "type": "image",
                "description": "Team 2 logo or flag — square, transparent background preferred",
                "required": False,
            },
            {
                "slot": "heroSrc",
                "type": "image",
                "description": "Optional stadium/match background image (blurred)",
                "required": False,
            },
        ],
        "suitable_for": ["live_score", "match_result", "head_to_head", "fixture"],
        "clips": [
            {"id": "scoreboard-bg", "label": "Background", "track": 2, "color": "#8b5cf6"},
            {"id": "scoreboard-card", "label": "Score Card", "track": 3, "color": "#a78bfa"},
            {"id": "scoreboard-status", "label": "Match Status", "track": 4, "color": "#c4b5fd"},
        ],
    },
    {
        "id": "stat_comparison",
        "name": "Stat Comparison",
        "description": (
            "Side-by-side player or team comparison with animated stat bars. "
            "Two columns with player/team images at top, names below, "
            "and horizontal stat bars that animate outward from center. "
            "Each stat row shows label, bar visualization, and numeric value. "
            "Colors differentiate the two sides (teal vs gold). "
            "Best for player comparisons, team matchups, and performance analysis."
        ),
        "duration_seconds_default": 7,
        "duration_frames_default": 210,
        "required_props": [
            "leftName", "rightName", "comparisonStats",
        ],
        "optional_props": [
            "leftImageSrc", "rightImageSrc", "comparisonTitle",
            "leftColor", "rightColor", "bgColor", "heroSrc",
        ],
        "assets": [
            {
                "slot": "leftImageSrc",
                "type": "image",
                "description": "Left player/team portrait — cropped headshot",
                "required": False,
            },
            {
                "slot": "rightImageSrc",
                "type": "image",
                "description": "Right player/team portrait — cropped headshot",
                "required": False,
            },
        ],
        "suitable_for": ["player_comparison", "team_comparison", "head_to_head", "performance_analysis"],
        "clips": [
            {"id": "comparison-bg", "label": "Background", "track": 2, "color": "#f59e0b"},
            {"id": "comparison-left", "label": "Left Column", "track": 3, "color": "#fbbf24"},
            {"id": "comparison-right", "label": "Right Column", "track": 4, "color": "#fcd34d"},
            {"id": "comparison-bars", "label": "Stat Bars", "track": 5, "color": "#fde68a"},
        ],
    },
    {
        "id": "quote_card",
        "name": "Quote Card",
        "description": (
            "Full-screen dramatic quote display with attribution. "
            "Dark gradient background, large opening quotation mark as accent, "
            "the quote text animates in word-by-word in Malayalam, "
            "followed by the speaker name and title/role fading in below. "
            "Optional speaker portrait in a circular frame. "
            "Best for expert opinions, player quotes, and coach statements."
        ),
        "duration_seconds_default": 6,
        "duration_frames_default": 180,
        "required_props": ["quoteText", "speakerName"],
        "optional_props": [
            "speakerTitle", "speakerImageSrc", "bgColor", "accent",
            "quoteFont", "quoteFontSize", "heroSrc",
        ],
        "assets": [
            {
                "slot": "speakerImageSrc",
                "type": "image",
                "description": "Speaker portrait — circular crop, facing camera",
                "required": False,
            },
            {
                "slot": "heroSrc",
                "type": "image",
                "description": "Optional background image (heavily blurred/darkened)",
                "required": False,
            },
        ],
        "suitable_for": ["quote", "expert_opinion", "player_statement", "coach_comment", "pundit_take"],
        "clips": [
            {"id": "quote-bg", "label": "Background", "track": 2, "color": "#ec4899"},
            {"id": "quote-text", "label": "Quote Text", "track": 3, "color": "#f472b6"},
            {"id": "quote-attribution", "label": "Attribution", "track": 4, "color": "#f9a8d4"},
        ],
    },
    {
        "id": "ticker_headline",
        "name": "Ticker Headline",
        "description": (
            "Breaking news ticker/banner scene. Full-screen dark background "
            "with a bold 'BREAKING' or category tag animating in from left, "
            "followed by a large headline sliding in from the right. "
            "A thin accent-colored bar separates tag from headline. "
            "Optional sub-headline or timestamp below. "
            "Creates urgency and is best for breaking news and flash updates."
        ),
        "duration_seconds_default": 4,
        "duration_frames_default": 120,
        "required_props": ["tickerTag", "tickerHeadline"],
        "optional_props": [
            "tickerSubHeadline", "tickerTimestamp", "bgColor", "accent",
            "heroSrc",
        ],
        "assets": [
            {
                "slot": "heroSrc",
                "type": "image",
                "description": "Optional background image for context (will be darkened)",
                "required": False,
            },
        ],
        "suitable_for": ["breaking_news", "flash_update", "transfer_alert", "injury_update", "result_flash"],
        "clips": [
            {"id": "ticker-bg", "label": "Background", "track": 2, "color": "#ef4444"},
            {"id": "ticker-tag", "label": "Breaking Tag", "track": 3, "color": "#f87171"},
            {"id": "ticker-headline", "label": "Headline", "track": 4, "color": "#fca5a5"},
        ],
    },
]

# Build a lookup for easy access
TEMPLATE_BY_ID = {t["id"]: t for t in SCENE_TEMPLATES}


def get_catalog_text():
    """Return a human-readable catalog string for injecting into agent prompts."""
    lines = ["=== AVAILABLE SCENE TEMPLATES ===\n"]
    for t in SCENE_TEMPLATES:
        lines.append(f"Template ID: {t['id']}")
        lines.append(f"  Name: {t['name']}")
        lines.append(f"  Description: {t['description']}")
        lines.append(f"  Default Duration: {t['duration_seconds_default']}s ({t['duration_frames_default']} frames @ 30fps)")
        lines.append(f"  Required Props: {', '.join(t['required_props'])}")
        lines.append(f"  Asset Slots: {', '.join(a['slot'] for a in t['assets'])}")
        lines.append(f"  Best For: {', '.join(t['suitable_for'])}")
        lines.append("")
    return "\n".join(lines)


def get_full_catalog_text():
    """
    Return catalog text that includes both hardcoded templates AND
    library templates from the database.
    """
    all_templates = get_all_templates()
    lines = ["=== AVAILABLE SCENE TEMPLATES ===\n"]
    for t in all_templates:
        lines.append(f"Template ID: {t['id']}")
        lines.append(f"  Name: {t['name']}")
        lines.append(f"  Description: {t['description']}")
        dur_s = t.get('duration_seconds_default', round(t.get('duration_frames_default', 180) / 30, 1))
        dur_f = t.get('duration_frames_default', 180)
        lines.append(f"  Default Duration: {dur_s}s ({dur_f} frames @ 30fps)")
        lines.append(f"  Required Props: {', '.join(t.get('required_props', []))}")
        lines.append(f"  Asset Slots: {', '.join(a['slot'] for a in t.get('assets', []))}")
        lines.append(f"  Best For: {', '.join(t.get('suitable_for', []))}")
        source = t.get('source', 'builtin')
        if source == 'library':
            lines.append(f"  Source: Style Library (DB)")
        lines.append("")
    return "\n".join(lines)


def get_all_templates():
    """
    Return all templates: hardcoded catalog + active library templates from DB.
    Library templates override catalog entries with the same template_id.
    """
    templates = list(SCENE_TEMPLATES)
    template_ids = {t["id"] for t in templates}

    try:
        from style_library.models import StyleTemplate
        for tpl in StyleTemplate.objects.filter(is_active=True, is_verified=True):
            entry = tpl.to_catalog_entry()
            if entry["id"] in template_ids:
                # Library template overrides catalog — replace
                templates = [t for t in templates if t["id"] != entry["id"]]
            template_ids.add(entry["id"])
            templates.append(entry)
    except Exception:
        # DB not available or app not installed yet — just use hardcoded
        pass

    return templates


def get_all_templates_by_id():
    """Return {template_id: template_dict} combining catalog + library."""
    return {t["id"]: t for t in get_all_templates()}


def get_format_specs():
    """Return video format specifications."""
    return {
        "reel": {
            "label": "Instagram/YouTube Reel",
            "resolution": {"w": 1080, "h": 1920},
            "max_duration_seconds": 90,
            "typical_duration_seconds": 60,
            "orientation": "portrait",
        },
        "short": {
            "label": "YouTube Short / Short Video",
            "resolution": {"w": 1080, "h": 1920},
            "max_duration_seconds": 240,
            "typical_duration_seconds": 180,
            "orientation": "portrait",
        },
        "long": {
            "label": "YouTube Long-form Video",
            "resolution": {"w": 1920, "h": 1080},
            "max_duration_seconds": 1800,
            "typical_duration_seconds": 600,
            "orientation": "landscape",
        },
    }
