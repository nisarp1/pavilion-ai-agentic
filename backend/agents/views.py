"""
Pipeline API Views
Provides endpoints for triggering and polling the multi-agent reel pipeline.

Endpoints:
  POST /api/pipeline/generate/          — queue a reel pipeline run
  GET  /api/pipeline/status/{article_id}/ — poll pipeline status + plan summary
"""
import logging
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

logger = logging.getLogger(__name__)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_reel(request):
    """
    Queue the multi-agent reel pipeline for an article.

    Body (JSON):
      article_id    (int, required)
      video_format  (str)  "reel" | "short" | "long"   default: "reel"
      reference_url (str)  override source URL
      text_prompt   (str)  override with free text
      include_avatar (bool) default: false

    Returns 202 immediately; pipeline runs in Celery.
    """
    from cms.models import Article
    from agents.tasks import run_reel_pipeline_task

    article_id = request.data.get("article_id")
    if not article_id:
        return Response({"error": "article_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        article = Article.objects.get(pk=article_id, tenant=request.tenant)
    except Article.DoesNotExist:
        return Response({"error": "Article not found"}, status=status.HTTP_404_NOT_FOUND)

    # Prevent duplicate runs
    if article.reel_generation_status in ("queued", "running"):
        return Response(
            {
                "error": f"Pipeline already {article.reel_generation_status} for this article",
                "reel_generation_status": article.reel_generation_status,
            },
            status=status.HTTP_409_CONFLICT,
        )

    options = {
        "video_format":    request.data.get("video_format", "reel"),
        "include_avatar":  bool(request.data.get("include_avatar", False)),
        "reference_url":   request.data.get("reference_url", ""),
        "text_prompt":     request.data.get("text_prompt", ""),
        "style_context":   request.data.get("style_context"),
        "style_reference_url": request.data.get("style_reference_url", ""),
    }

    # Mark as queued immediately
    article.reel_generation_status = "queued"
    article.video_status = "generating_script"
    article.reel_pipeline_log = []
    article.save(update_fields=["reel_generation_status", "video_status", "reel_pipeline_log"])

    # Dispatch to Celery
    task = run_reel_pipeline_task.delay(article_id=article.id, options=options)

    logger.info(f"[PipelineAPI] Queued pipeline for Article {article_id}, task={task.id}")

    return Response(
        {
            "status": "queued",
            "article_id": article_id,
            "task_id": task.id,
            "reel_generation_status": "queued",
            "message": "Reel pipeline started. Poll /api/pipeline/status/{article_id}/ for progress.",
        },
        status=status.HTTP_202_ACCEPTED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def pipeline_status(request, article_id):
    """
    Poll current reel pipeline status for an article.
    Returns plan summary, audio URL, video URL, and per-agent log.
    """
    from cms.models import Article

    try:
        article = Article.objects.get(pk=article_id, tenant=request.tenant)
    except Article.DoesNotExist:
        return Response({"error": "Article not found"}, status=status.HTTP_404_NOT_FOUND)

    plan = article.video_production_plan or {}
    scenes = plan.get("scenes", [])
    voiceover = plan.get("voiceover", {})

    return Response(
        {
            "article_id":              article_id,
            "reel_generation_status":  article.reel_generation_status,
            "reel_video_url":          article.reel_video_url or article.video_url or "",
            "reel_audio_url":          article.reel_audio_url or article.video_audio_url or "",
            "pipeline_log":            article.reel_pipeline_log or [],
            "plan_summary": {
                "title":          plan.get("metadata", {}).get("title", article.title),
                "scene_count":    len(scenes),
                "total_frames":   plan.get("metadata", {}).get("total_frames", 0),
                "duration_s":     plan.get("metadata", {}).get("duration_seconds", 0),
                "audio_duration": voiceover.get("actual_duration_s", 0),
                "voice_used":     voiceover.get("voice_used", ""),
                "quality_score":  plan.get("quality_score"),
                "producer_approved": plan.get("producer_approved", False),
                "assets_needed":  len(plan.get("assets_needed", [])),
                "assets_filled":  sum(
                    1 for a in plan.get("assets_needed", [])
                    if a.get("url") and not a["url"].startswith("{{ASSET")
                ),
            },
            "has_production_plan":     bool(plan),
        }
    )
