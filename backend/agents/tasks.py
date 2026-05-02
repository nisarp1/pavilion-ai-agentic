"""
Celery task wrapper for the VideoProductionPipeline.
Runs the full multi-agent pipeline asynchronously and writes back to Article.
"""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=1, default_retry_delay=60, time_limit=600)
def run_reel_pipeline_task(self, article_id: int, options: dict = None):
    """
    Asynchronously run the full reel generation pipeline for an article.

    Steps:
      1. Load article from DB
      2. Run VideoProductionPipeline.run()
      3. Generate TTS audio (TTSAgent)
      4. Save VideoProductionPlan + audio_url back to Article
      5. Update article reel_generation_status

    options keys:
      video_format    (str)  "reel" | "short" | "long"
      include_avatar  (bool)
      reference_url   (str)  override — if not provided, uses article.source_url
      text_prompt     (str)  override — free text prompt
    """
    from cms.models import Article
    from agents.video_pipeline import VideoProductionPipeline
    from agents.tts_agent import generate_reel_audio

    options = options or {}
    video_format = options.get("video_format", "reel")
    include_avatar = options.get("include_avatar", False)

    try:
        # ── Load Article ──────────────────────────────────────────────────────
        article = Article.objects.get(pk=article_id)
        article.reel_generation_status = "running"
        article.reel_pipeline_log = []
        article.save(update_fields=["reel_generation_status", "reel_pipeline_log"])

        def _log(stage: str, msg: str, **kw):
            entry = {"stage": stage, "message": msg, **kw}
            logger.info(f"[ReelPipeline] Article {article_id} | {stage}: {msg}")
            article.reel_pipeline_log = list(article.reel_pipeline_log or []) + [entry]
            article.save(update_fields=["reel_pipeline_log"])

        # ── Determine input ───────────────────────────────────────────────────
        reference_url = options.get("reference_url") or article.source_url or None
        text_prompt   = options.get("text_prompt") or None
        article_data  = None

        if not reference_url and not text_prompt:
            # Fall back to article body
            article_data = {
                "title":   article.title,
                "summary": article.summary,
                "content": article.body,
            }

        _log("context", f"Input source: {'url' if reference_url else 'text' if text_prompt else 'article'}")

        # ── Run Pipeline ──────────────────────────────────────────────────────
        _log("pipeline", "Starting VideoProductionPipeline...")
        pipeline = VideoProductionPipeline()
        plan = pipeline.run(
            reference_url=reference_url,
            text_prompt=text_prompt,
            article_data=article_data,
            video_format=video_format,
            include_avatar=include_avatar,
            style_context=options.get("style_context"),
            style_reference_url=options.get("style_reference_url"),
        )
        _log("pipeline", f"Pipeline complete — {len(plan.get('scenes', []))} scenes, "
                         f"quality_score={plan.get('quality_score', 'N/A')}")

        # ── Generate TTS Audio ────────────────────────────────────────────────
        voiceover_script = plan.get("voiceover", {}).get("script_plain", "")
        audio_result = {}
        if voiceover_script:
            _log("tts", "Generating Malayalam TTS audio (Chirp3 HD)...")
            try:
                audio_result = generate_reel_audio(
                    script=voiceover_script,
                    article_id=str(article_id),
                )
                # Inject audio into plan
                plan["voiceover"]["audio_url"]           = audio_result.get("audio_url", "")
                plan["voiceover"]["word_timings"]        = audio_result.get("word_timings", [])
                plan["voiceover"]["actual_duration_s"]   = audio_result.get("duration_seconds", 0)
                plan["voiceover"]["voice_used"]          = audio_result.get("voice_used", "")
                _log("tts", f"Audio ready: {audio_result.get('duration_seconds', 0)}s → {audio_result.get('audio_url', '')}")
            except Exception as tts_err:
                _log("tts", f"TTS failed (non-fatal): {tts_err}")
        else:
            _log("tts", "No voiceover script generated — skipping TTS")

        # ── Persist to Article ────────────────────────────────────────────────
        article.video_production_plan    = plan
        article.reel_generation_status   = "review"   # needs producer approval
        article.reel_audio_url           = audio_result.get("audio_url", "")
        article.video_audio_url          = audio_result.get("audio_url", "")  # legacy compat
        article.instagram_reel_script    = voiceover_script
        article.video_script             = voiceover_script
        article.video_status             = "completed"

        update_fields = [
            "video_production_plan",
            "reel_generation_status",
            "reel_audio_url",
            "video_audio_url",
            "instagram_reel_script",
            "video_script",
            "video_status",
            "reel_pipeline_log",
        ]

        article.save(update_fields=update_fields)
        _log("done", "Pipeline saved to Article — status: review")

        return {
            "status": "success",
            "article_id": article_id,
            "scenes": len(plan.get("scenes", [])),
            "audio_url": audio_result.get("audio_url", ""),
            "quality_score": plan.get("quality_score"),
        }

    except Article.DoesNotExist:
        logger.error(f"[ReelPipeline] Article {article_id} not found")
        return {"status": "error", "message": "Article not found"}

    except Exception as exc:
        logger.error(f"[ReelPipeline] Article {article_id} pipeline failed: {exc}", exc_info=True)
        try:
            Article.objects.filter(pk=article_id).update(
                reel_generation_status="failed",
                video_status="failed",
                video_error=str(exc)[:1000],
            )
        except Exception:
            pass
        raise self.retry(exc=exc)


@shared_task(bind=True)
def backfill_reel_video_url(self, video_job_id: str):
    """
    Called after a VideoJob render completes.
    Writes output_url back to the linked Article's reel_video_url field.
    """
    from video_studio.models import VideoJob
    from cms.models import Article

    try:
        job = VideoJob.objects.select_related("article").get(pk=video_job_id)
        if job.article_id and job.output_url:
            Article.objects.filter(pk=job.article_id).update(
                reel_video_url=job.output_url,
                reel_generation_status="approved",
                video_url=job.output_url,    # legacy field
                video_status="completed",
            )
            logger.info(f"[backfill] Article {job.article_id} → reel_video_url={job.output_url}")
    except VideoJob.DoesNotExist:
        logger.warning(f"[backfill] VideoJob {video_job_id} not found")
    except Exception as exc:
        logger.error(f"[backfill] Failed: {exc}", exc_info=True)
