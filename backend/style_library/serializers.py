"""
Style Library API — Serializers for StyleTemplate, StyleDNA, StylePreset.
"""
from rest_framework import serializers
from style_library.models import StyleTemplate, StyleDNA, StylePreset


class StyleTemplateListSerializer(serializers.ModelSerializer):
    """Compact serializer for template list views."""
    duration_seconds = serializers.ReadOnlyField(source="duration_seconds_default")

    class Meta:
        model = StyleTemplate
        fields = [
            "id", "name", "template_id", "description", "source_type",
            "suitable_for", "duration_frames_default", "duration_seconds",
            "required_props", "is_verified", "is_active",
            "thumbnail_url", "preview_video_url",
            "created_at", "updated_at",
        ]


class StyleTemplateDetailSerializer(serializers.ModelSerializer):
    """Full serializer including JSX source and all metadata."""
    duration_seconds = serializers.ReadOnlyField(source="duration_seconds_default")
    catalog_entry = serializers.SerializerMethodField()

    class Meta:
        model = StyleTemplate
        fields = "__all__"

    def get_catalog_entry(self, obj):
        return obj.to_catalog_entry()


class StyleTemplateCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating templates."""

    class Meta:
        model = StyleTemplate
        fields = [
            "name", "template_id", "source_type", "source_reference_url",
            "jsx_component", "description",
            "required_props", "optional_props", "asset_slots",
            "suitable_for", "clips_definition",
            "duration_frames_default", "animation_presets",
            "style_dna_snapshot",
            "thumbnail_url", "preview_video_url",
            "is_verified", "is_active",
        ]


class StyleDNAListSerializer(serializers.ModelSerializer):
    """Compact serializer for Style DNA list views."""
    template_count = serializers.SerializerMethodField()

    class Meta:
        model = StyleDNA
        fields = [
            "id", "name", "source_url",
            "scene_count", "layout_types", "color_palette",
            "brand_compatibility_score", "analyzed_by_model",
            "analysis_duration_seconds", "template_count",
            "created_at",
        ]

    def get_template_count(self, obj):
        return obj.templates.count()


class StyleDNADetailSerializer(serializers.ModelSerializer):
    """Full serializer including the complete analysis JSON."""
    templates = StyleTemplateListSerializer(many=True, read_only=True)

    class Meta:
        model = StyleDNA
        fields = "__all__"


class StylePresetListSerializer(serializers.ModelSerializer):
    """Compact serializer for preset list views."""
    template_count = serializers.SerializerMethodField()

    class Meta:
        model = StylePreset
        fields = [
            "id", "name", "description",
            "brand_colors", "animation_speed_multiplier",
            "times_used", "thumbnail_url",
            "is_active", "template_count",
            "created_at", "updated_at",
        ]

    def get_template_count(self, obj):
        return len(obj.template_sequence or [])


class StylePresetDetailSerializer(serializers.ModelSerializer):
    """Full serializer including template sequence."""

    class Meta:
        model = StylePreset
        fields = "__all__"


class AnalyzeReelRequestSerializer(serializers.Serializer):
    """Serializer for the analyze-reel endpoint."""
    video_url = serializers.URLField(required=True)
    name = serializers.CharField(
        required=False, default="",
        help_text="Optional name for this analysis. Auto-generated if empty."
    )
    mode = serializers.ChoiceField(
        choices=["keyframes", "video"],
        default="keyframes",
        help_text="'keyframes' is cheaper (~$0.05), 'video' is richer (~$0.30)"
    )
    max_keyframes = serializers.IntegerField(
        required=False, default=12, min_value=3, max_value=20,
    )
    auto_match = serializers.BooleanField(
        required=False, default=True,
        help_text="If true, automatically match Style DNA to existing templates"
    )


class ApplyPresetRequestSerializer(serializers.Serializer):
    """Serializer for applying a preset to a new reel production."""
    article_id = serializers.IntegerField(required=False)
    text_prompt = serializers.CharField(required=False, default="")
    reference_url = serializers.URLField(required=False, default="")
    video_format = serializers.ChoiceField(
        choices=["reel", "short", "long"],
        default="reel",
    )
