"""
Style Library Models — Persistent storage for reusable scene templates,
style analysis (Style DNA), and curated style presets.

These models power the "Style Analyzer → Template Generator → Mix & Match"
workflow described in the implementation plan.
"""
import uuid
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


# ── Pavilion Brand Constraints (authoritative source of truth) ──────────────

PAVILION_BRAND = {
    "allowed_fonts": ["Anek Malayalam", "Manrope"],
    "color_palette": {
        "primary_bg":   "#000000",
        "card_bg":      "#1f7a6e",
        "accent_gold":  "#e8b73b",
        "accent_red":   "#FF2D2D",
        "text_primary": "#ffffff",
    },
    "required_elements": ["top_chrome_bar", "brand_logo"],
    "language": "ml-IN",
    "animation_speed_range": {"min_ms": 200, "max_ms": 800},
    "banned_patterns": ["vertical_text", "comic_sans", "rainbow_gradient"],
}


class StyleTemplate(models.Model):
    """
    A reusable Remotion scene template stored in the library.
    Each template contains JSX source code that can be dynamically loaded
    into the Remotion composition system.
    """

    SOURCE_TYPE_CHOICES = [
        ("manual",       "Manually Created"),
        ("ai_generated", "AI Generated"),
        ("ai_extracted", "Extracted from Reference"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200, help_text="Human-readable template name")
    template_id = models.SlugField(
        max_length=100, unique=True,
        help_text="Unique slug used in the pipeline, e.g. 'scoreboard_v1'"
    )

    # ── Source provenance ─────────────────────────────────────────────────────
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPE_CHOICES, default="manual")
    source_reference_url = models.URLField(blank=True, default="")

    # ── Remotion JSX Component ────────────────────────────────────────────────
    jsx_component = models.TextField(
        help_text="Full JSX source code for the Remotion Scene component"
    )

    # ── Catalog Metadata (mirrors scene_templates_catalog.py format) ──────────
    description = models.TextField(
        help_text="What this scene looks like visually — fed to AI agents for matching"
    )
    required_props = models.JSONField(
        default=list, blank=True,
        help_text="List of prop keys that MUST be filled"
    )
    optional_props = models.JSONField(
        default=list, blank=True,
        help_text="List of prop keys with sensible defaults"
    )
    asset_slots = models.JSONField(
        default=list, blank=True,
        help_text="List of asset slot dicts {slot, type, description, required}"
    )
    suitable_for = models.JSONField(
        default=list, blank=True,
        help_text="Content types this template works well for, e.g. ['opening', 'stats']"
    )
    clips_definition = models.JSONField(
        default=list, blank=True,
        help_text="Clip definitions for timeline, same format as scene_templates_catalog clips"
    )

    # ── Timing ────────────────────────────────────────────────────────────────
    duration_frames_default = models.IntegerField(
        default=180,
        validators=[MinValueValidator(30), MaxValueValidator(1800)],
        help_text="Default duration in frames at 30fps"
    )

    # ── Animation metadata ────────────────────────────────────────────────────
    animation_presets = models.JSONField(
        default=list, blank=True,
        help_text="Animation patterns used by this template"
    )

    # ── Style DNA snapshot (from the analysis that produced this) ─────────────
    style_dna_snapshot = models.JSONField(
        default=dict, blank=True,
        help_text="Style DNA scene data that inspired this template"
    )

    # ── Preview assets ────────────────────────────────────────────────────────
    thumbnail_url = models.URLField(blank=True, default="")
    preview_video_url = models.URLField(blank=True, default="")

    # ── Status & QA ───────────────────────────────────────────────────────────
    is_verified = models.BooleanField(
        default=False,
        help_text="True if this template passed a headless Remotion render test"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="False = hidden from catalog but not deleted"
    )
    render_test_log = models.TextField(
        blank=True, default="",
        help_text="Output from the last render validation attempt"
    )

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Scene Template"
        verbose_name_plural = "Scene Templates"

    def __str__(self):
        status = "✅" if self.is_verified else "⚠️"
        return f"{status} {self.name} [{self.template_id}]"

    @property
    def duration_seconds_default(self):
        return round(self.duration_frames_default / 30, 1)

    def to_catalog_entry(self):
        """Convert to the dict format used by scene_templates_catalog.py."""
        return {
            "id": self.template_id,
            "name": self.name,
            "description": self.description,
            "duration_seconds_default": self.duration_seconds_default,
            "duration_frames_default": self.duration_frames_default,
            "required_props": self.required_props,
            "optional_props": self.optional_props,
            "assets": self.asset_slots,
            "suitable_for": self.suitable_for,
            "clips": self.clips_definition,
            "source": "library",
        }


class StyleDNA(models.Model):
    """
    A complete style analysis of a reference reel.
    Produced by the StyleAnalyzerAgent — stores the full breakdown of
    scenes, animations, colors, and layout patterns.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200, help_text="Descriptive name for this analysis")
    source_url = models.URLField(help_text="Original reel/video URL that was analyzed")

    # ── Full Analysis JSON ────────────────────────────────────────────────────
    analysis_json = models.JSONField(
        default=dict,
        help_text="Complete Style DNA output from the analyzer agent"
    )

    # ── Extracted summaries (for quick filtering/search) ──────────────────────
    color_palette = models.JSONField(default=dict, blank=True)
    animation_patterns = models.JSONField(default=list, blank=True)
    scene_count = models.IntegerField(default=0)
    layout_types = models.JSONField(
        default=list, blank=True,
        help_text="List of layout_type strings detected, e.g. ['hero_fullbleed', 'player_card_stats']"
    )

    # ── Templates generated from this analysis ────────────────────────────────
    templates = models.ManyToManyField(
        StyleTemplate, blank=True, related_name="source_analyses",
        help_text="Templates that were created or matched from this analysis"
    )

    # ── Agent metadata ────────────────────────────────────────────────────────
    analyzed_by_model = models.CharField(
        max_length=100, default="",
        help_text="Which AI model performed the analysis"
    )
    analysis_duration_seconds = models.FloatField(default=0)
    analysis_cost_estimate_usd = models.FloatField(
        default=0,
        help_text="Estimated API cost for this analysis"
    )

    # ── Brand compatibility ───────────────────────────────────────────────────
    brand_compatibility_score = models.FloatField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(1)],
        help_text="0-1 score of how well this style fits Pavilion branding"
    )
    adaptations_needed = models.JSONField(
        default=list, blank=True,
        help_text="List of changes needed to adapt this style to Pavilion brand"
    )

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Style DNA Analysis"
        verbose_name_plural = "Style DNA Analyses"

    def __str__(self):
        return f"StyleDNA: {self.name} ({self.scene_count} scenes)"


class StylePreset(models.Model):
    """
    A curated combination of templates + style overrides for quick reuse.
    Users can save a winning combination and re-apply it to new reels.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")

    # ── Template sequence ─────────────────────────────────────────────────────
    template_sequence = models.JSONField(
        default=list,
        help_text=(
            "Ordered list of template assignments: "
            "[{template_id, duration_frames, props_override, animation_overrides}]"
        )
    )

    # ── Global style overrides ────────────────────────────────────────────────
    brand_colors = models.JSONField(
        default=dict, blank=True,
        help_text="Override colors: {bgColor, cardColor, cardAccent, accent}"
    )
    animation_speed_multiplier = models.FloatField(
        default=1.0,
        validators=[MinValueValidator(0.25), MaxValueValidator(3.0)],
        help_text="Global speed modifier for all animations"
    )
    typography_overrides = models.JSONField(
        default=dict, blank=True,
        help_text="Font family/size overrides"
    )

    # ── Source ────────────────────────────────────────────────────────────────
    source_analysis = models.ForeignKey(
        StyleDNA, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="presets",
        help_text="The Style DNA analysis that inspired this preset"
    )

    # ── Usage tracking ────────────────────────────────────────────────────────
    times_used = models.IntegerField(default=0)

    # ── Preview ───────────────────────────────────────────────────────────────
    thumbnail_url = models.URLField(blank=True, default="")

    # ── Status ────────────────────────────────────────────────────────────────
    is_active = models.BooleanField(default=True)

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-times_used", "-created_at"]
        verbose_name = "Style Preset"
        verbose_name_plural = "Style Presets"

    def __str__(self):
        return f"{self.name} (used {self.times_used}x)"

    def increment_usage(self):
        """Atomically increment the usage counter."""
        StylePreset.objects.filter(pk=self.pk).update(
            times_used=models.F("times_used") + 1
        )
