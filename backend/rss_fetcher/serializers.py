"""
Serializers for RSS Fetcher API.
"""
from rest_framework import serializers
from .models import RSSFeed


class RSSFeedSerializer(serializers.ModelSerializer):
    """RSS Feed serializer."""
    articles_count = serializers.SerializerMethodField()
    
    class Meta:
        model = RSSFeed
        fields = [
            'id', 'name', 'url', 'is_active',
            'last_fetched_at', 'fetch_interval',
            'articles_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'last_fetched_at']
    
    def get_articles_count(self, obj):
        from cms.models import Article
        return Article.objects.filter(source_feed=obj.url).count()

