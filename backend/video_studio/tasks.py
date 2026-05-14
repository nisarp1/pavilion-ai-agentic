import io
import json
import logging
import os
import zipfile
from urllib.parse import urlparse

import requests
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=60,
             soft_time_limit=1800, time_limit=1860)  # 30 min soft + 31 min hard
def render_video_task(self, job_id: str):
    """Trigger Cloud Run Remotion renderer and persist the resulting GCS video URL."""
    from .models import VideoJob
    from .cloud_run import trigger_render

    try:
        job = VideoJob.objects.get(id=job_id)

        # Guard: skip if a previous retry already completed the job
        if job.status == VideoJob.STATUS_DONE and job.output_url:
            logger.info(f"[VideoJob {job_id}] Already done — skipping duplicate render")
            return {'job_id': job_id, 'video_url': job.output_url}

        job.status = VideoJob.STATUS_RENDERING
        job.save(update_fields=['status', 'updated_at'])

        output_blob = f"videos/render_{job_id}.mp4"

        # Merge audio URL into props so the renderer can embed it
        props = dict(job.props)
        django_url = os.environ.get('DJANGO_INTERNAL_URL', 'http://django:8000').rstrip('/')

        def _abs_url(url: str) -> str:
            """Convert relative /media/ paths to absolute internal Django URLs."""
            if url and url.startswith('/'):
                return f"{django_url}{url}"
            return url

        if job.audio_url:
            audio_url = _abs_url(job.audio_url)
            if audio_url != job.audio_url:
                logger.info(f"[VideoJob {job_id}] Rewrote audioSrc: {job.audio_url} → {audio_url}")
            props['audioSrc'] = audio_url

        # Rewrite relative URLs inside timeline (PavilionAIVideo composition)
        timeline = props.get('timeline')
        if isinstance(timeline, dict):
            for audio_el in timeline.get('audio', []):
                if isinstance(audio_el, dict) and audio_el.get('audioUrl'):
                    audio_el['audioUrl'] = _abs_url(audio_el['audioUrl'])
            for img_el in timeline.get('elements', []):
                if isinstance(img_el, dict) and img_el.get('imageUrl'):
                    url = img_el['imageUrl']
                    # Strip data URIs — Remotion's prefetch routes them through
                    # the static bundle server which 404s. Fall back to gradient.
                    if url.startswith('data:'):
                        logger.info(f"[VideoJob {job_id}] Stripped data URI imageUrl (using gradient fallback)")
                        img_el['imageUrl'] = ''
                    else:
                        img_el['imageUrl'] = _abs_url(url)

        # Rewrite top-level image props so the renderer can fetch them
        for top_key in ('logoSrc', 'heroSrc', 'playerImage'):
            val = props.get(top_key, '')
            if val and val.startswith('/'):
                props[top_key] = _abs_url(val)
                logger.info(f"[VideoJob {job_id}] Rewrote {top_key}: {val} → {props[top_key]}")

        # Extract compositionId stored by the pipeline (pops it so it's not
        # passed as a Remotion prop — the renderer treats it separately)
        composition_id = props.pop('_compositionId', None) or 'PavilionReel'
        logger.info(f"[VideoJob {job_id}] compositionId={composition_id}")

        # ── Try Cloud Run renderer; fallback to manifest JSON if not configured ─
        try:
            result = trigger_render(props, job_id, output_blob, composition_id=composition_id)
        except ValueError as cfg_err:
            # Cloud Run not configured — upload props as a manifest JSON to GCS
            logger.warning(f"[VideoJob {job_id}] Cloud Run not configured: {cfg_err}. Uploading manifest fallback.")
            from .cloud_run import upload_plan_as_manifest
            result = upload_plan_as_manifest(props, job_id, output_blob)
            if not result:
                raise RuntimeError(
                    "CLOUD_RUN_RENDERER_URL is not set and GCS_BUCKET_NAME is also missing. "
                    "Configure at least one of these in your .env to get a video URL."
                )

        video_url = result.get('videoUrl') or result.get('gcsUrl', '')
        if not video_url:
            raise ValueError(f"Renderer returned no video URL: {result}")

        job.status = VideoJob.STATUS_DONE
        job.output_url = video_url
        job.save(update_fields=['status', 'output_url', 'updated_at'])
        logger.info(f"[VideoJob {job_id}] Render complete: {video_url}")

        # ── Backfill video URL to Article ───────────────────────────────────
        if job.article_id:
            try:
                from cms.models import Article
                Article.objects.filter(pk=job.article_id).update(
                    reel_video_url=video_url,
                    video_url=video_url,
                    reel_generation_status='approved',
                    video_status='completed',
                )
                logger.info(f"[VideoJob {job_id}] Backfilled Article {job.article_id} with video URL")
            except Exception as backfill_err:
                logger.warning(f"[VideoJob {job_id}] Article backfill failed (non-fatal): {backfill_err}")

        return {'job_id': job_id, 'video_url': video_url}

    except Exception as exc:
        logger.error(f"[VideoJob {job_id}] render_video_task failed: {exc}", exc_info=True)
        _mark_failed(job_id, str(exc))
        raise self.retry(exc=exc)



@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def export_fallback_task(self, job_id: str):
    """
    Build a ZIP containing:
      audio/narration.<ext>      — ElevenLabs / TTS audio
      assets/asset_NN.<ext>      — any extra asset URLs
      assets/heroSrc.<ext>       — hero image if a full URL was supplied
      assets/playerImage.<ext>   — player image if a full URL was supplied
      template/pavilion_reel_template.aep  — base AEP template from GCS
      data/props.json            — the full props payload for the AE scripter
    Then upload the ZIP to GCS and store the public URL.
    """
    from .models import VideoJob
    from .gcs import upload_bytes, download_bytes

    try:
        job = VideoJob.objects.get(id=job_id)
        job.status = VideoJob.STATUS_RENDERING
        job.save(update_fields=['status', 'updated_at'])

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:

            # 1. ElevenLabs / voiceover audio
            if job.audio_url:
                logger.info(f"[VideoJob {job_id}] Downloading audio: {job.audio_url}")
                r = _fetch(job.audio_url)
                ext = _ext(job.audio_url, r.headers.get('content-type', ''))
                zf.writestr(f"audio/narration{ext}", r.content)

            # 2. Extra asset URLs
            for i, url in enumerate(job.asset_urls or []):
                try:
                    r = _fetch(url)
                    ext = _ext(url, r.headers.get('content-type', ''))
                    zf.writestr(f"assets/asset_{i:02d}{ext}", r.content)
                except Exception as e:
                    logger.warning(f"[VideoJob {job_id}] Skipping asset {url}: {e}")

            # 3. Hero / player images from props (only if they are full URLs)
            props = job.props or {}
            for prop_key in ('heroSrc', 'playerImage'):
                val = props.get(prop_key, '')
                if val.startswith('http'):
                    try:
                        r = _fetch(val)
                        ext = _ext(val, r.headers.get('content-type', ''))
                        zf.writestr(f"assets/{prop_key}{ext}", r.content)
                    except Exception as e:
                        logger.warning(f"[VideoJob {job_id}] Skipping {prop_key}: {e}")

            # 4. AEP template from GCS
            aep_path = os.environ.get('AEP_TEMPLATE_GCS_PATH', '')
            if aep_path:
                try:
                    aep_bytes = download_bytes(aep_path)
                    zf.writestr('template/pavilion_reel_template.aep', aep_bytes)
                except Exception as e:
                    logger.warning(f"[VideoJob {job_id}] AEP fetch failed: {e}")

            # 5. JSON props for After Effects scripter
            zf.writestr('data/props.json', json.dumps(props, ensure_ascii=False, indent=2))

        zip_bytes = buf.getvalue()
        output_blob = f"fallback-exports/export_{job_id}.zip"
        job.status = VideoJob.STATUS_UPLOADING
        job.save(update_fields=['status', 'updated_at'])

        zip_url = upload_bytes(zip_bytes, output_blob, content_type='application/zip')

        job.status = VideoJob.STATUS_DONE
        job.output_url = zip_url
        job.save(update_fields=['status', 'output_url', 'updated_at'])
        logger.info(f"[VideoJob {job_id}] Fallback export done: {zip_url}")
        return {'job_id': job_id, 'zip_url': zip_url}

    except Exception as exc:
        logger.error(f"[VideoJob {job_id}] export_fallback_task failed: {exc}", exc_info=True)
        _mark_failed(job_id, str(exc))
        raise self.retry(exc=exc)


# ── helpers ────────────────────────────────────────────────────────────────────

def _fetch(url: str, timeout: int = 60) -> requests.Response:
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r


def _ext(url: str, content_type: str) -> str:
    """Infer file extension from URL path, falling back to Content-Type."""
    _, ext = os.path.splitext(urlparse(url).path)
    if ext:
        return ext
    return {
        'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav',
        'audio/ogg': '.ogg', 'audio/aac': '.aac',
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
        'video/mp4': '.mp4',
    }.get(content_type.split(';')[0].strip(), '.bin')


def _mark_failed(job_id: str, message: str):
    try:
        from .models import VideoJob
        VideoJob.objects.filter(id=job_id).update(
            status=VideoJob.STATUS_FAILED,
            error_message=message,
        )
    except Exception:
        pass
