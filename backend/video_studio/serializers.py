from rest_framework import serializers
from .models import VideoJob


class VideoJobPickerSerializer(serializers.ModelSerializer):
    """Lightweight serializer for picker dropdowns — omits large props/clips fields."""
    title = serializers.SerializerMethodField()
    article_id = serializers.PrimaryKeyRelatedField(source='article', read_only=True)

    class Meta:
        model = VideoJob
        fields = ['id', 'title', 'status', 'article_id', 'created_at']
        read_only_fields = fields

    def get_title(self, obj):
        props = obj.props or {}
        # 1. Explicit title injected at job creation
        t = props.get('title')
        if t:
            return t
        # 2. PavilionReel manual-editor headline
        t = props.get('scene1Headline')
        if t:
            return t
        # 3. Title buried in timeline metadata
        t = (props.get('timeline') or {}).get('title')
        if t:
            return t
        # 4. Fall back to linked article title
        if obj.article_id and obj.article:
            return obj.article.title
        return f"Video {str(obj.id)[:8]}"


class VideoJobSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()
    video_format = serializers.SerializerMethodField()
    article_id = serializers.PrimaryKeyRelatedField(source='article', read_only=True)

    class Meta:
        model = VideoJob
        fields = [
            'id', 'job_type', 'status', 'props', 'clips', 'audio_url', 'asset_urls',
            'output_url', 'error_message', 'created_by_name', 'created_at', 'updated_at',
            'title', 'video_format', 'article_id',
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else None

    def get_title(self, obj):
        props = obj.props or {}
        t = props.get('title') or props.get('scene1Headline') or (props.get('timeline') or {}).get('title')
        if t:
            return t
        if obj.article_id and obj.article:
            return obj.article.title
        return f"Video {str(obj.id)[:8]}"

    def get_video_format(self, obj):
        """Extract video format from props."""
        props = obj.props or {}
        return props.get('videoFormat') or props.get('video_format') or 'reel'



class VideoRenderRequestSerializer(serializers.Serializer):
    """Payload for POST /api/video/jobs/render/"""
    props = serializers.DictField(
        child=serializers.JSONField(),
        help_text="PavilionReelProps object matching the Remotion composition schema",
    )
    clips = serializers.ListField(
        child=serializers.JSONField(),
        required=False,
        default=list,
        help_text="Timeline clips for the video",
    )
    # CharField (not URLField) so relative paths like /media/... are accepted.
    # The view resolves relative paths to absolute using request.build_absolute_uri.
    audio_url = serializers.CharField(
        required=False, allow_blank=True, default='',
        help_text="Voiceover audio URL. Relative /media/... paths are resolved automatically.",
    )
    article_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_props(self, value):
        # Only enforce that props is a non-empty dict.
        # Old-template key checks removed — AI-generated reels use dynamic prop keys.
        if not isinstance(value, dict) or not value:
            raise serializers.ValidationError("props must be a non-empty object.")
        return value


class VideoFallbackRequestSerializer(serializers.Serializer):
    """Payload for POST /api/video/jobs/export-fallback/"""
    props = serializers.DictField(child=serializers.JSONField())
    clips = serializers.ListField(child=serializers.JSONField(), required=False, default=list)
    # CharField so relative /media/... paths pass validation
    audio_url = serializers.CharField(
        required=False, allow_blank=True, default='',
        help_text="Voiceover audio URL — relative /media/... paths are resolved automatically.",
    )
    asset_urls = serializers.ListField(
        child=serializers.CharField(),   # CharField, not URLField, same reason
        required=False,
        default=list,
        help_text="Additional image/video clip URLs to bundle",
    )
    article_id = serializers.IntegerField(required=False, allow_null=True)
