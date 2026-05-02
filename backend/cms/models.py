"""
CMS models for article management.
"""
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from django.db.models.signals import post_save
from django.dispatch import receiver
from slugify import slugify
import os
from .utils import process_image_to_webp
from .models_poster import PosterTemplate
from tenants.models import Tenant


def generate_unique_slug(instance, value, slug_field='slug'):
    """
    Generate a slug unique for the given model instance.

    Uses the model's slug max_length to make sure the generated slug fits,
    and appends an incrementing numeric suffix to resolve collisions.
    """
    if not value:
        value = str(timezone.now().timestamp())

    base_slug = slugify(value)
    if not base_slug:
        base_slug = str(timezone.now().timestamp())

    slug_field_obj = instance._meta.get_field(slug_field)
    max_length = getattr(slug_field_obj, 'max_length', 255) or 255

    slug = base_slug[:max_length]
    ModelClass = instance.__class__
    queryset = ModelClass.objects.all()
    if instance.pk:
        queryset = queryset.exclude(pk=instance.pk)

    unique_slug = slug
    counter = 2
    while queryset.filter(**{slug_field: unique_slug}).exists():
        suffix = f"-{counter}"
        trimmed_slug = base_slug[: max_length - len(suffix)]
        unique_slug = f"{trimmed_slug}{suffix}"
        counter += 1

    return unique_slug


class Category(models.Model):
    """Category model for organizing articles with subcategories."""
    
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='categories', null=True, blank=True)
    description = models.TextField(blank=True)
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        help_text="Parent category for subcategories"
    )
    order = models.IntegerField(default=0, help_text="Display order")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name_plural = "Categories"
        ordering = ['order', 'name']
        indexes = [
            models.Index(fields=['parent', 'is_active']),
            models.Index(fields=['slug']),
        ]
    
    def __str__(self):
        if self.parent:
            return f"{self.parent.name} > {self.name}"
        return self.name
    
    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = generate_unique_slug(self, self.name)
        super().save(*args, **kwargs)
    
    def get_full_path(self):
        """Get full category path including parent."""
        if self.parent:
            return f"{self.parent.get_full_path()} > {self.name}"
        return self.name
    
    @property
    def is_parent(self):
        """Check if category has children."""
        return self.children.exists()


class Media(models.Model):
    """Media model for storing uploaded images and files."""
    
    title = models.CharField(max_length=255, blank=True)
    file = models.ImageField(upload_to='media/')
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='media', null=True, blank=True)
    alt_text = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='uploaded_media'
    )
    file_size = models.IntegerField(help_text="File size in bytes", default=0)
    mime_type = models.CharField(max_length=100, default='image/jpeg')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name_plural = "Media"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['uploaded_by']),
        ]
    
    def __str__(self):
        return self.title or self.file.name
    
    def save(self, *args, **kwargs):
        # Convert image to WebP if it's not already
        if self.file and not self.file.name.lower().endswith('.webp'):
            try:
                new_name, new_content = process_image_to_webp(self.file)
                if new_name and new_content:
                    self.file.save(new_name, new_content, save=False)
            except Exception as e:
                pass

        if not self.title and self.file:
            self.title = self.file.name
        super().save(*args, **kwargs)


@receiver(post_save, sender=Media)
def update_media_metadata(sender, instance, created, **kwargs):
    """Update file_size and mime_type after file is saved."""
    if instance.file:
        try:
            # Get file path
            file_path = instance.file.path if hasattr(instance.file, 'path') else None
            
            # Get file size
            if file_path and os.path.exists(file_path):
                file_size = os.path.getsize(file_path)
                if file_size > 0:
                    instance.file_size = file_size
            elif hasattr(instance.file, 'size'):
                instance.file_size = instance.file.size
            
            # Get MIME type from file extension
            import mimetypes
            file_name = instance.file.name if hasattr(instance.file, 'name') else str(instance.file)
            mime_type, _ = mimetypes.guess_type(file_name)
            if mime_type:
                instance.mime_type = mime_type
            elif file_name.lower().endswith(('.jpg', '.jpeg')):
                instance.mime_type = 'image/jpeg'
            elif file_name.lower().endswith('.png'):
                instance.mime_type = 'image/png'
            elif file_name.lower().endswith('.gif'):
                instance.mime_type = 'image/gif'
            elif file_name.lower().endswith('.webp'):
                instance.mime_type = 'image/webp'
            
            # Save again to update metadata (but don't trigger signal again)
            Media.objects.filter(pk=instance.pk).update(
                file_size=instance.file_size,
                mime_type=instance.mime_type
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Error updating media metadata: {e}")


# Signal handler will be defined after Article class
def generate_audio_on_publish(sender, instance, created, **kwargs):
    """
    Generate audio for article when it's published.
    Only generates audio if:
    - Article status is 'published'
    - Article has body content
    - Audio doesn't already exist
    """
    # Only process if article is published
    if instance.status != 'published':
        return
    
    # Check if status changed to 'published' or if it's a new published article
    status_changed_to_published = False
    
    if created:
        # New article created with 'published' status
        status_changed_to_published = True
    elif hasattr(instance, '_status_changed') and instance._status_changed:
        # Status changed - check if it changed TO published
        if hasattr(instance, '_old_status'):
            status_changed_to_published = (instance._old_status != 'published')
    else:
        # Fallback: check if audio doesn't exist (article was published without audio)
        status_changed_to_published = not instance.audio
    
    # Generate audio if status changed to published and article has content
    if status_changed_to_published and instance.body and instance.body.strip():
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            from workers.tasks import generate_audio_for_article
            
            logger.info(f"Article {instance.id} published - generating audio with Chirp voice")
            # Generate audio synchronously (can be made async later if needed)
            generate_audio_for_article(instance, voice_name='chirp')
        except ImportError as e:
            logger.warning(f"Could not import audio generation function: {e}")
        except Exception as e:
            logger.error(f"Error generating audio for published article {instance.id}: {e}", exc_info=True)


class Article(models.Model):
    """Article model for CMS."""
    
    STATUS_CHOICES = [
        ('fetched', 'Fetched'),      # Article fetched from RSS
        ('draft', 'Draft'),          # Article generated and ready for editing
        ('published', 'Published'),  # Article published
        ('archived', 'Archived'),    # Article archived
    ]
    
    CATEGORY_CHOICES = [
        ('reliable_sources', 'Reliable Sources'),
        ('trends', 'Trends'),
        ('subscriptions', 'Subscriptions'),
        ('video_project', 'Video Project'),
    ]
    
    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='articles', null=True, blank=True)
    summary = models.TextField(blank=True)
    body = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='fetched')
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='reliable_sources')
    
    # Categories (many-to-many)
    categories = models.ManyToManyField(Category, blank=True, related_name='articles')
    
    # Source information
    source_url = models.URLField(blank=True, max_length=1000)
    source_feed = models.CharField(max_length=255, blank=True)
    
    # Trend data (JSON field for storing Google Trends data)
    trend_data = models.JSONField(default=dict, blank=True)
    
    # Authors
    author = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='authored_articles'
    )
    editor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='edited_articles'
    )
    
    # Images
    featured_image = models.ImageField(
        upload_to='articles/featured/',
        null=True,
        blank=True
    )
    featured_media = models.ForeignKey(
        'Media',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='featured_in_articles',
        help_text="Link to Media library item"
    )
    featured_image_cutout = models.ImageField(
        upload_to='articles/cutouts/',
        null=True,
        blank=True,
        help_text="Background-removed version of the featured image"
    )
    
    # Audio
    audio = models.FileField(
        upload_to='articles/audio/',
        null=True,
        blank=True,
        help_text='Generated audio version of the article'
    )

    # Instagram Reel
    instagram_reel_script = models.TextField(blank=True, help_text="Script for Instagram Reel")
    instagram_reel_audio = models.FileField(
        upload_to='articles/reels/',
        null=True,
        blank=True,
        help_text='Generated audio for Instagram Reel'
    )
    
    # Video Generation Pipeline
    video_script = models.TextField(blank=True, help_text="Script for the generated sports video")
    video_url = models.URLField(max_length=500, blank=True, null=True, help_text="Public URL of the generated D-ID video (Vercel Blob)")
    video_audio_url = models.URLField(max_length=500, blank=True, null=True, help_text="Public URL of the narration audio (Vercel Blob)")
    video_status = models.CharField(
        max_length=20,
        default='idle',
        choices=[
            ('idle', 'Idle'),
            ('generating_script', 'Generating Script'),
            ('generating_video', 'Generating Video'),
            ('completed', 'Completed'),
            ('failed', 'Failed')
        ],
        help_text="Status of the video generation pipeline"
    )
    video_error = models.TextField(blank=True, help_text="Error message if the video generation failed")
    video_format = models.CharField(max_length=20, default='portrait', choices=[('portrait', 'Portrait'), ('landscape', 'Landscape')])
    
    # AI Video Production Plan (full pipeline output as JSON)
    video_production_plan = models.JSONField(
        default=dict,
        blank=True,
        help_text="Complete AI-generated VideoProductionPlan JSON — includes scenes, clips, props, voiceover, assets"
    )

    # ── Phase 0+1: New reel pipeline tracking ────────────────────────────────
    reel_generation_status = models.CharField(
        max_length=20,
        default='idle',
        choices=[
            ('idle',     'Idle'),
            ('queued',   'Queued'),
            ('running',  'Running'),
            ('review',   'Needs Review'),
            ('approved', 'Approved'),
            ('failed',   'Failed'),
        ],
        help_text="Status of the new multi-agent reel pipeline"
    )
    reel_video_url = models.URLField(
        max_length=2000, blank=True, default='',
        help_text="Final rendered MP4 GCS URL written back by render task"
    )
    reel_audio_url = models.URLField(
        max_length=2000, blank=True, default='',
        help_text="TTS-generated Malayalam voiceover GCS URL"
    )
    reel_pipeline_log = models.JSONField(
        default=list,
        blank=True,
        help_text="Per-agent execution log from the reel pipeline"
    )
    
    # Social Media Content
    social_media_poster_text = models.TextField(blank=True, help_text="Short, punchy text for social media poster")
    social_media_caption = models.TextField(blank=True, help_text="Engaging caption for social media post")
    
    # Structured data for advanced poster generation (Gemini JSON output)
    poster_context = models.JSONField(default=dict, blank=True, help_text="JSON structure with poster details (text, stats, branding)")
    
    generated_poster = models.ImageField(
        upload_to='articles/posters/',
        null=True,
        blank=True
    )
    
    # SEO/OG Data
    meta_title = models.CharField(max_length=255, blank=True)
    meta_description = models.TextField(blank=True)
    og_title = models.CharField(max_length=255, blank=True)
    og_description = models.TextField(blank=True)
    og_image = models.ImageField(
        upload_to='articles/og/',
        null=True,
        blank=True
    )
    
    # NewsroomX Programmatic Pipeline (A_B_C Sequence)
    # Step A: Audio (Google Chirp 3), Step B: Avatar (D-ID), Step C: Composition (Creatomate)
    newsroomx_dna = models.JSONField(default=dict, blank=True, help_text="Stored JSON DNA for the programmatic pipeline orchestration")
    newsroomx_video_url = models.URLField(max_length=1000, blank=True, null=True, help_text="Public URL of the final NewsroomX composition")
    newsroomx_status = models.CharField(
        max_length=25,
        default='idle',
        choices=[
            ('idle', 'Idle'),
            ('step_a_audio', 'Wait for Step A (Audio)'),
            ('step_b_avatar', 'Wait for Step B (Avatar)'),
            ('step_c_composition', 'Wait for Step C (Composition)'),
            ('completed', 'Completed'),
            ('failed', 'Failed')
        ]
    )
    newsroomx_error = models.TextField(blank=True, help_text="Error message if the NewsroomX pipeline failed")
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True)
    publish_at = models.DateTimeField(null=True, blank=True, help_text="Schedule future publishing at this datetime")
    generation_started_at = models.DateTimeField(null=True, blank=True)
    generation_completed_at = models.DateTimeField(null=True, blank=True)

    # Celery task tracking
    celery_task_id = models.CharField(max_length=255, blank=True, default='', help_text="Celery task ID for the active background task")
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', '-created_at']),
            models.Index(fields=['category', '-created_at']),
            models.Index(fields=['slug']),
        ]
    
    def __str__(self):
        return self.title
    
    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = generate_unique_slug(self, self.title)

        # Convert featured_image to WebP if it's not already
        if self.featured_image and not self.featured_image.name.lower().endswith('.webp'):
            try:
                new_name, new_content = process_image_to_webp(self.featured_image)
                if new_name and new_content:
                    self.featured_image.save(new_name, new_content, save=False)
            except Exception as e:
                pass
        
        # Ensure published_at is set when status is published, but don't overwrite user input
        if self.status == 'published' and not self.published_at:
            self.published_at = timezone.now()
        
        # Track status change for audio generation
        if self.pk:
            try:
                old_instance = Article.objects.get(pk=self.pk)
                self._status_changed = (old_instance.status != self.status)
                self._old_status = old_instance.status
            except Article.DoesNotExist:
                self._status_changed = False
        else:
            self._status_changed = False
        
        super().save(*args, **kwargs)
    
    def publish(self):
        """Publish the article."""
        self.status = 'published'
        self.published_at = timezone.now()
        self.save()


# Connect signal after Article class is defined
post_save.connect(generate_audio_on_publish, sender=Article)


class WebStory(models.Model):
    """Lightweight web story model with cover image and slides."""

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('scheduled', 'Scheduled'),
        ('published', 'Published'),
    ]

    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='webstories', null=True, blank=True)
    summary = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    cover_image = models.ImageField(
        upload_to='webstories/covers/',
        null=True,
        blank=True
    )
    cover_media = models.ForeignKey(
        Media,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='webstories_cover'
    )
    cover_external_url = models.URLField(blank=True)

    author = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='webstories'
    )
    editor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='edited_webstories'
    )

    published_at = models.DateTimeField(null=True, blank=True)
    scheduled_for = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-published_at', '-created_at']
        indexes = [
            models.Index(fields=['status', '-published_at']),
            models.Index(fields=['slug']),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = generate_unique_slug(self, self.title)
        super().save(*args, **kwargs)

    def publish(self):
        self.status = 'published'
        if not self.published_at:
            self.published_at = timezone.now()
        self.save()

    def cover_url(self, request=None):
        """Resolve the best available cover image URL."""
        if self.cover_media and self.cover_media.file:
            if request:
                return request.build_absolute_uri(self.cover_media.file.url)
            return self.cover_media.file.url
        if self.cover_image:
            if request:
                return request.build_absolute_uri(self.cover_image.url)
            return self.cover_image.url
        if self.cover_external_url:
            return self.cover_external_url
        return None


class WebStorySlide(models.Model):
    """Individual slide belonging to a web story."""

    story = models.ForeignKey(
        WebStory,
        on_delete=models.CASCADE,
        related_name='slides'
    )
    order = models.PositiveIntegerField(default=0)
    caption = models.CharField(max_length=255, blank=True)
    media = models.ForeignKey(
        Media,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='webstory_slides'
    )
    external_image_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'id']
        indexes = [
            models.Index(fields=['story', 'order']),
        ]

    def __str__(self):
        return f"{self.story.title} (Slide {self.order + 1})"

    def resolved_image_url(self, request=None):
        if self.media and self.media.file:
            if request:
                return request.build_absolute_uri(self.media.file.url)
            return self.media.file.url
        if self.external_image_url:
            return self.external_image_url
        return None


class ArticleVersion(models.Model):
    """Snapshot of an article saved before each update for version history."""

    article = models.ForeignKey(Article, on_delete=models.CASCADE, related_name='versions')
    version_number = models.PositiveIntegerField(default=1)
    title = models.CharField(max_length=500, blank=True)
    body = models.TextField(blank=True)
    summary = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['article', '-created_at']),
        ]

    def __str__(self):
        return f"{self.article.title} v{self.version_number}"
