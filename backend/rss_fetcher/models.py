"""
RSS Fetcher models for managing RSS feeds.
"""
from django.db import models
from django.utils import timezone
from tenants.models import Tenant


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

