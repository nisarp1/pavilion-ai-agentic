from rest_framework import serializers
from .models import VideoJob


class VideoJobSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = VideoJob
        fields = [
            'id', 'job_type', 'status', 'props', 'audio_url', 'asset_urls',
            'output_url', 'error_message', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else None


class VideoRenderRequestSerializer(serializers.Serializer):
    """Payload for POST /api/video/jobs/render/"""
    props = serializers.DictField(
        child=serializers.JSONField(),
        help_text="PavilionReelProps object matching the Remotion composition schema",
    )
    audio_url = serializers.URLField(
        required=False, allow_blank=True, default='',
        help_text="ElevenLabs / TTS voiceover URL — embedded as audio track during render",
    )
    article_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_props(self, value):
        required = ['scene1Headline', 'scene2Headline', 'playerName', 'heroSrc', 'playerImage', 'stats']
        missing = [f for f in required if f not in value]
        if missing:
            raise serializers.ValidationError(f"Missing required props fields: {missing}")
        stats = value.get('stats', [])
        if not isinstance(stats, list) or not stats:
            raise serializers.ValidationError("props.stats must be a non-empty list")
        return value


class VideoFallbackRequestSerializer(serializers.Serializer):
    """Payload for POST /api/video/jobs/export-fallback/"""
    props = serializers.DictField(child=serializers.JSONField())
    audio_url = serializers.URLField(
        required=False, allow_blank=True, default='',
        help_text="ElevenLabs audio URL to download and include in the ZIP",
    )
    asset_urls = serializers.ListField(
        child=serializers.URLField(),
        required=False,
        default=list,
        help_text="Additional image/video clip URLs to bundle",
    )
    article_id = serializers.IntegerField(required=False, allow_null=True)
