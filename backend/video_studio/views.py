import logging

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from tenants.permissions import HasReadAccessToTenant

from .models import VideoJob
from .serializers import (
    VideoFallbackRequestSerializer,
    VideoJobSerializer,
    VideoRenderRequestSerializer,
)

logger = logging.getLogger(__name__)


class VideoJobViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read jobs via list/retrieve.
    Trigger new jobs via the custom render / export-fallback actions.
    """
    serializer_class = VideoJobSerializer
    permission_classes = [IsAuthenticated, HasReadAccessToTenant]

    def get_queryset(self):
        return VideoJob.objects.filter(tenant=self.request.tenant)

    # ── Track A: Cloud Render ─────────────────────────────────────────────────

    @action(detail=False, methods=['post'], url_path='render')
    def render(self, request):
        """Dispatch a Remotion Cloud Run render job and return immediately."""
        ser = VideoRenderRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        from .tasks import render_video_task

        job = VideoJob.objects.create(
            tenant=request.tenant,
            created_by=request.user,
            job_type=VideoJob.TYPE_RENDER,
            props=data['props'],
            audio_url=data.get('audio_url', ''),
            article_id=data.get('article_id'),
        )
        task = render_video_task.delay(str(job.id))
        job.celery_task_id = task.id
        job.save(update_fields=['celery_task_id'])

        logger.info(f"VideoJob {job.id} queued (render) by {request.user}")
        return Response(VideoJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)

    # ── Track B: Fallback ZIP ─────────────────────────────────────────────────

    @action(detail=False, methods=['post'], url_path='export-fallback')
    def export_fallback(self, request):
        """Build and upload an AEP + assets ZIP to GCS."""
        ser = VideoFallbackRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        from .tasks import export_fallback_task

        job = VideoJob.objects.create(
            tenant=request.tenant,
            created_by=request.user,
            job_type=VideoJob.TYPE_FALLBACK,
            props=data['props'],
            audio_url=data.get('audio_url', ''),
            asset_urls=data.get('asset_urls', []),
            article_id=data.get('article_id'),
        )
        task = export_fallback_task.delay(str(job.id))
        job.celery_task_id = task.id
        job.save(update_fields=['celery_task_id'])

        logger.info(f"VideoJob {job.id} queued (fallback) by {request.user}")
        return Response(VideoJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)
