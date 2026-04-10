"""
Django admin configuration for RSS Fetcher.
"""
from django.contrib import admin
from .models import RSSFeed


@admin.register(RSSFeed)
class RSSFeedAdmin(admin.ModelAdmin):
    list_display = ['name', 'url', 'is_active', 'last_fetched_at', 'fetch_interval']
    list_filter = ['is_active', 'last_fetched_at']
    search_fields = ['name', 'url']
    readonly_fields = ['created_at', 'updated_at', 'last_fetched_at']

