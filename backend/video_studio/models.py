import uuid
from django.db import models
from django.contrib.auth.models import User
from tenants.models import Tenant


class VideoJob(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_RENDERING = 'rendering'
    STATUS_UPLOADING = 'uploading'
    STATUS_DONE = 'done'
    STATUS_FAILED = 'failed'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_RENDERING, 'Rendering'),
        (STATUS_UPLOADING, 'Uploading'),
        (STATUS_DONE, 'Done'),
        (STATUS_FAILED, 'Failed'),
    ]

    TYPE_RENDER = 'render'
    TYPE_FALLBACK = 'fallback'

    TYPE_CHOICES = [
        (TYPE_RENDER, 'Cloud Render (GCP)'),
        (TYPE_FALLBACK, 'Fallback Export (AEP ZIP)'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='video_jobs')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='video_jobs')
    article = models.ForeignKey(
        'cms.Article', on_delete=models.SET_NULL, null=True, blank=True, related_name='video_jobs'
    )
    job_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    # The PavilionReelProps payload (and any extensions)
    props = models.JSONField(default=dict)
    # ElevenLabs / TTS audio voiceover URL
    audio_url = models.URLField(blank=True, max_length=2048)
    # Extra asset URLs to bundle in fallback ZIP
    asset_urls = models.JSONField(default=list)
    # GCS URL of the final output (mp4 for render, zip for fallback)
    output_url = models.URLField(blank=True, max_length=2048)
    error_message = models.TextField(blank=True)
    celery_task_id = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'created_at']),
        ]

    def __str__(self):
        return f"VideoJob({self.job_type}, {self.status}, {self.id})"
