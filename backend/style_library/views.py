"""
Style Library API Views

Endpoints:
  GET/POST   /api/style-library/templates/          → List / create templates
  GET/PATCH  /api/style-library/templates/{id}/      → Template detail / update
  POST       /api/style-library/analyze/             → Analyze a reference reel
  GET        /api/style-library/analyses/            → List past analyses
  GET        /api/style-library/analyses/{id}/       → Analysis detail
  GET/POST   /api/style-library/presets/             → List / create presets
  GET/PATCH  /api/style-library/presets/{id}/        → Preset detail / update
  POST       /api/style-library/presets/{id}/apply/  → Apply preset to production
  GET        /api/style-library/catalog/             → Full template catalog (JSON)
"""
import logging
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from style_library.models import StyleTemplate, StyleDNA, StylePreset
from style_library.serializers import (
    StyleTemplateListSerializer, StyleTemplateDetailSerializer, StyleTemplateCreateSerializer,
    StyleDNAListSerializer, StyleDNADetailSerializer,
    StylePresetListSerializer, StylePresetDetailSerializer,
    AnalyzeReelRequestSerializer, ApplyPresetRequestSerializer,
)

logger = logging.getLogger(__name__)


# ── Template Endpoints ────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def template_list(request):
    """List all templates or create a new one."""
    if request.method == "GET":
        qs = StyleTemplate.objects.filter(is_active=True)
        source_type = request.query_params.get("source_type")
        if source_type:
            qs = qs.filter(source_type=source_type)
        suitable_for = request.query_params.get("suitable_for")
        if suitable_for:
            qs = qs.filter(suitable_for__contains=[suitable_for])
        serializer = StyleTemplateListSerializer(qs, many=True)
        return Response(serializer.data)

    # POST — create new template
    serializer = StyleTemplateCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    template = serializer.save()
    return Response(
        StyleTemplateDetailSerializer(template).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def template_detail(request, pk):
    """Get, update, or soft-delete a template."""
    try:
        template = StyleTemplate.objects.get(pk=pk)
    except StyleTemplate.DoesNotExist:
        return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        serializer = StyleTemplateDetailSerializer(template)
        return Response(serializer.data)

    if request.method == "PATCH":
        serializer = StyleTemplateCreateSerializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(StyleTemplateDetailSerializer(template).data)

    if request.method == "DELETE":
        template.is_active = False
        template.save(update_fields=["is_active"])
        return Response({"status": "deactivated"}, status=status.HTTP_200_OK)


# ── Analyze Endpoint ──────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def analyze_reel(request):
    """
    Analyze a reference reel and extract its Style DNA.
    Optionally auto-matches to existing templates.

    Body:
      video_url     (str, required)
      name          (str, optional)
      mode          (str) "keyframes" | "video"
      max_keyframes (int) default 12
      auto_match    (bool) default true
    """
    req = AnalyzeReelRequestSerializer(data=request.data)
    req.is_valid(raise_exception=True)
    data = req.validated_data

    video_url = data["video_url"]
    mode = data["mode"]
    max_keyframes = data["max_keyframes"]
    auto_match = data["auto_match"]

    logger.info(f"[StyleLibrary] Analyzing reel: {video_url} (mode={mode})")

    # Run the Style Analyzer Agent
    from agents.style_analyzer import StyleAnalyzerAgent, StyleMatcher

    analyzer = StyleAnalyzerAgent()
    style_dna = analyzer.analyze(
        video_url=video_url,
        mode=mode,
        max_keyframes=max_keyframes,
    )

    # Check for analysis errors
    if style_dna.get("source", {}).get("error"):
        return Response(
            {"error": style_dna["source"]["error"], "style_dna": style_dna},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    # Save to DB
    name = data.get("name") or f"Analysis of {video_url[:60]}"
    meta = style_dna.get("_meta", {})
    compatibility = style_dna.get("brand_compatibility", {})

    analysis = StyleDNA.objects.create(
        name=name,
        source_url=video_url,
        analysis_json=style_dna,
        color_palette=style_dna.get("scenes", [{}])[0].get("color_palette", {}) if style_dna.get("scenes") else {},
        animation_patterns=style_dna.get("animation_patterns", []),
        scene_count=style_dna.get("source", {}).get("total_scenes_detected", len(style_dna.get("scenes", []))),
        layout_types=[s.get("layout_type", "") for s in style_dna.get("scenes", [])],
        analyzed_by_model=meta.get("model_used", ""),
        analysis_duration_seconds=meta.get("analysis_duration_seconds", 0),
        brand_compatibility_score=compatibility.get("compatibility_score", 0),
        adaptations_needed=compatibility.get("adaptations_needed", []),
    )

    response_data = {
        "analysis_id": str(analysis.id),
        "style_dna": style_dna,
        "scene_count": analysis.scene_count,
        "brand_compatibility_score": analysis.brand_compatibility_score,
    }

    # Auto-match to templates
    if auto_match:
        matcher = StyleMatcher()
        match_result = matcher.match(style_dna)
        response_data["template_matching"] = match_result

    return Response(response_data, status=status.HTTP_201_CREATED)


# ── Analysis Endpoints ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analysis_list(request):
    """List all Style DNA analyses."""
    qs = StyleDNA.objects.all()
    serializer = StyleDNAListSerializer(qs, many=True)
    return Response(serializer.data)


@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
def analysis_detail(request, pk):
    """Get or delete a Style DNA analysis."""
    try:
        analysis = StyleDNA.objects.get(pk=pk)
    except StyleDNA.DoesNotExist:
        return Response({"error": "Analysis not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        analysis.delete()
        return Response({"status": "deleted"}, status=status.HTTP_200_OK)

    serializer = StyleDNADetailSerializer(analysis)
    return Response(serializer.data)


# ── Preset Endpoints ──────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def preset_list(request):
    """List or create style presets."""
    if request.method == "GET":
        qs = StylePreset.objects.filter(is_active=True)
        serializer = StylePresetListSerializer(qs, many=True)
        return Response(serializer.data)

    serializer = StylePresetDetailSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    preset = serializer.save()
    return Response(
        StylePresetDetailSerializer(preset).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def preset_detail(request, pk):
    """Get, update, or soft-delete a preset."""
    try:
        preset = StylePreset.objects.get(pk=pk)
    except StylePreset.DoesNotExist:
        return Response({"error": "Preset not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        serializer = StylePresetDetailSerializer(preset)
        return Response(serializer.data)

    if request.method == "PATCH":
        serializer = StylePresetDetailSerializer(preset, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(StylePresetDetailSerializer(preset).data)

    if request.method == "DELETE":
        preset.is_active = False
        preset.save(update_fields=["is_active"])
        return Response({"status": "deactivated"}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def apply_preset(request, pk):
    """
    Apply a preset to a new reel production.
    This injects the preset's template sequence and style overrides
    into the VideoProductionPipeline.
    """
    try:
        preset = StylePreset.objects.get(pk=pk, is_active=True)
    except StylePreset.DoesNotExist:
        return Response({"error": "Preset not found"}, status=status.HTTP_404_NOT_FOUND)

    req = ApplyPresetRequestSerializer(data=request.data)
    req.is_valid(raise_exception=True)
    data = req.validated_data

    # Increment usage
    preset.increment_usage()

    # Build the style context for the pipeline
    style_context = {
        "preset_id": str(preset.id),
        "preset_name": preset.name,
        "template_sequence": preset.template_sequence,
        "brand_colors": preset.brand_colors,
        "animation_speed_multiplier": preset.animation_speed_multiplier,
        "typography_overrides": preset.typography_overrides,
    }

    return Response({
        "status": "ready",
        "preset_applied": preset.name,
        "style_context": style_context,
        "message": (
            "Style context prepared. Pass this as 'style_context' to the "
            "/api/pipeline/generate/ endpoint to use this preset."
        ),
    })


# ── Catalog Endpoint ──────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def full_catalog(request):
    """
    Return the complete template catalog (hardcoded + library) as JSON.
    Used by the frontend for template browsing and selection.
    """
    from agents.scene_templates_catalog import get_all_templates

    templates = get_all_templates()
    return Response({
        "count": len(templates),
        "templates": templates,
    })
