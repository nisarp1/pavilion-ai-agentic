"""
Style Library Django Admin configuration.
"""
from django.contrib import admin
from style_library.models import StyleTemplate, StyleDNA, StylePreset


@admin.register(StyleTemplate)
class StyleTemplateAdmin(admin.ModelAdmin):
    list_display = [
        "name", "template_id", "source_type", "is_verified", "is_active",
        "duration_seconds_default", "created_at",
    ]
    list_filter = ["source_type", "is_verified", "is_active", "suitable_for"]
    search_fields = ["name", "template_id", "description"]
    readonly_fields = ["id", "created_at", "updated_at"]
    fieldsets = [
        ("Identity", {
            "fields": ["id", "name", "template_id", "source_type", "source_reference_url"],
        }),
        ("Component", {
            "fields": ["jsx_component", "description"],
            "classes": ["collapse"],
        }),
        ("Catalog Metadata", {
            "fields": [
                "required_props", "optional_props", "asset_slots",
                "suitable_for", "clips_definition", "duration_frames_default",
                "animation_presets",
            ],
        }),
        ("Preview", {
            "fields": ["thumbnail_url", "preview_video_url"],
        }),
        ("Status", {
            "fields": ["is_verified", "is_active", "render_test_log"],
        }),
        ("Style DNA", {
            "fields": ["style_dna_snapshot"],
            "classes": ["collapse"],
        }),
        ("Timestamps", {
            "fields": ["created_at", "updated_at"],
        }),
    ]


@admin.register(StyleDNA)
class StyleDNAAdmin(admin.ModelAdmin):
    list_display = [
        "name", "source_url", "scene_count",
        "brand_compatibility_score", "analyzed_by_model",
        "analysis_duration_seconds", "created_at",
    ]
    list_filter = ["analyzed_by_model"]
    search_fields = ["name", "source_url"]
    readonly_fields = ["id", "created_at"]
    filter_horizontal = ["templates"]


@admin.register(StylePreset)
class StylePresetAdmin(admin.ModelAdmin):
    list_display = [
        "name", "times_used", "animation_speed_multiplier",
        "is_active", "created_at",
    ]
    list_filter = ["is_active"]
    search_fields = ["name", "description"]
    readonly_fields = ["id", "created_at", "updated_at", "times_used"]
