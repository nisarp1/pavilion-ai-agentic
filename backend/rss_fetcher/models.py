"""
RSS Fetcher models for managing RSS feeds.
"""
from django.db import models
from django.utils import timezone
from tenants.models import Tenant


class StyleGuide(models.Model):
    """
    Per-tenant editorial style guide (copybook) injected into every article
    generation prompt. Editors update this in natural language; Gemini applies
    the rules verbatim when writing Malayalam articles.

    tenant=None means the global default used when no tenant-specific guide exists.
    """
    tenant = models.OneToOneField(
        Tenant, on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='style_guide',
        help_text='Leave blank for the global default style guide.',
    )
    content = models.TextField(
        help_text='Natural-language rules for Gemini. Markdown formatting is supported.',
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Style Guide'
        verbose_name_plural = 'Style Guides'

    def __str__(self):
        return f'Style Guide — {self.tenant or "Global"}'


class RSSFeed(models.Model):
    """Model for RSS feed sources."""
    
    name = models.CharField(max_length=255)
    url = models.URLField(unique=True)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='rss_feeds', null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_fetched_at = models.DateTimeField(null=True, blank=True)
    fetch_interval = models.IntegerField(
        default=60,
        help_text="Fetch interval in minutes"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return self.name

