"""
Serializers for CMS API.
"""
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Article, Category, Media, WebStory, WebStorySlide
from workers.tasks import generate_article_task


class MediaPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """Primary key field that returns the ID when serializing."""

    def to_representation(self, value):
        if not value:
            return None
        if hasattr(value, 'pk'):
            return value.pk
        # PKOnlyObject from DRF stores the pk on attribute "pk" but not "id"
        if hasattr(value, 'id'):
            return value.id
        return value


class UserSerializer(serializers.ModelSerializer):
    """User serializer."""
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id']


class CategorySerializer(serializers.ModelSerializer):
    """Category serializer with nested children."""
    children = serializers.SerializerMethodField()
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)
    article_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Category
        fields = [
            'id', 'name', 'slug', 'description', 'parent', 'parent_name',
            'order', 'is_active', 'children', 'article_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']
    
    def validate_parent(self, value):
        """Validate parent category."""
        if value and value.id == getattr(self.instance, 'id', None):
            raise serializers.ValidationError("A category cannot be its own parent.")
        return value
    
    def get_children(self, obj):
        """Get child categories."""
        children = obj.children.filter(is_active=True).order_by('order', 'name')
        return CategorySerializer(children, many=True).data
    
    def get_article_count(self, obj):
        """Get count of articles in this category."""
        return obj.articles.count()


class CategoryListSerializer(serializers.ModelSerializer):
    """Lightweight category serializer for lists."""
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    children_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Category
        fields = [
            'id', 'name', 'slug', 'parent', 'parent_name',
            'order', 'is_active', 'children_count'
        ]
    
    def get_children_count(self, obj):
        """Get count of child categories."""
        return obj.children.filter(is_active=True).count()


class ArticleSerializer(serializers.ModelSerializer):
    """Article serializer."""
    author_name = serializers.CharField(source='author.username', read_only=True)
    editor_name = serializers.CharField(source='editor.username', read_only=True)
    featured_image_url = serializers.SerializerMethodField()
    og_image_url = serializers.SerializerMethodField()
    audio_url = serializers.SerializerMethodField()
    reel_audio_url = serializers.SerializerMethodField()
    poster_url = serializers.SerializerMethodField()
    categories = CategoryListSerializer(many=True, read_only=True)
    category_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Category.objects.filter(is_active=True),
        source='categories',
        write_only=True,
        required=False
    )
    featured_media_id = serializers.IntegerField(source='featured_media.id', read_only=True)
    featured_media_id_write = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    
    class Meta:
        model = Article
        fields = [
            'id', 'title', 'slug', 'summary', 'body', 'status', 'category',
            'categories', 'category_ids',
            'author', 'author_name', 'editor', 'editor_name',
            'featured_image', 'featured_image_url', 'featured_media_id', 'featured_media_id_write',
            'audio', 'audio_url',
            'instagram_reel_script', 'instagram_reel_audio', 'reel_audio_url',
            'video_script', 'video_url', 'video_audio_url', 'video_status', 'video_error', 'video_format',
            'social_media_poster_text', 'social_media_caption', 'generated_poster', 'poster_url',
            'meta_title', 'meta_description',
            'og_title', 'og_description', 'og_image', 'og_image_url',
            'source_url', 'source_feed', 'trend_data',
            'newsroomx_dna', 'newsroomx_status', 'newsroomx_video_url', 'newsroomx_error',
            'created_at', 'updated_at', 'published_at',
            'generation_started_at', 'generation_completed_at',
        ]
        read_only_fields = [
            'id', 'slug', 'created_at', 'updated_at',
            'generation_started_at', 'generation_completed_at',
            'video_error', 'newsroomx_status', 'newsroomx_error', 'newsroomx_video_url',
        ]
    
    def create(self, validated_data):
        # Handle featured_media_id - set featured_image from Media model
        featured_media_id = validated_data.pop('featured_media_id_write', None)
        
        if featured_media_id is not None:
            try:
                media = Media.objects.get(id=featured_media_id)
                validated_data['featured_image'] = media.file
                validated_data['featured_media'] = media
            except Media.DoesNotExist:
                pass
                
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # Handle featured_media_id - set featured_image from Media model
        featured_media_id = validated_data.pop('featured_media_id_write', None)
        if featured_media_id is not None:
            try:
                media = Media.objects.get(id=featured_media_id)
                instance.featured_image = media.file
                instance.featured_media = media # Save to FK
            except Media.DoesNotExist:
                pass
        
        return super().update(instance, validated_data)
    
    def get_featured_image_url(self, obj):
        if obj.featured_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.featured_image.url)
            return obj.featured_image.url
        return None
    
    def get_og_image_url(self, obj):
        if obj.og_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.og_image.url)
            return obj.og_image.url
        return None
    
    def get_audio_url(self, obj):
        if obj.audio:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.audio.url)
            return obj.audio.url
        return None

    def get_reel_audio_url(self, obj):
        if obj.instagram_reel_audio:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.instagram_reel_audio.url)
            return obj.instagram_reel_audio.url
        return None

    def get_poster_url(self, obj):
        if obj.generated_poster:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.generated_poster.url)
            return obj.generated_poster.url
        return None


class ArticleListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for article lists."""
    author_name = serializers.CharField(source='author.username', read_only=True)
    featured_image_url = serializers.SerializerMethodField()
    categories = CategoryListSerializer(many=True, read_only=True)
    
    class Meta:
        model = Article
        fields = [
            'id', 'title', 'slug', 'summary', 'status', 'category',
            'categories',
            'author_name', 'created_at', 'updated_at', 'published_at',
            'source_url', 'featured_image_url', 'trend_data',
        ]
    
    def get_featured_image_url(self, obj):
        if obj.featured_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.featured_image.url)
            return obj.featured_image.url
        return None


class ArticleGenerateSerializer(serializers.Serializer):
    """Serializer for triggering article generation."""
    article_id = serializers.IntegerField()
    
    def validate_article_id(self, value):
        try:
            article = Article.objects.get(id=value)
            if article.status != 'fetched':
                raise serializers.ValidationError(
                    "Article must be in 'fetched' status to generate."
                )
            return value
        except Article.DoesNotExist:
            raise serializers.ValidationError("Article not found.")
    
    def save(self):
        article_id = self.validated_data['article_id']
        # Trigger Celery task
        task = generate_article_task.delay(article_id)
        return {'task_id': task.id, 'article_id': article_id}


class MediaSerializer(serializers.ModelSerializer):
    """Media serializer for media library."""
    url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.CharField(source='uploaded_by.username', read_only=True)
    
    class Meta:
        model = Media
        fields = [
            'id', 'title', 'file', 'url', 'alt_text', 'description',
            'uploaded_by', 'uploaded_by_name', 'file_size', 'mime_type',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'file_size', 'mime_type', 'created_at', 'updated_at']
    
    def get_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def create(self, validated_data):
        validated_data['uploaded_by'] = self.context['request'].user
        return super().create(validated_data)


class WebStorySlideSerializer(serializers.ModelSerializer):
    """Serializer for individual web story slides."""

    image_url = serializers.SerializerMethodField()
    media_id = MediaPrimaryKeyRelatedField(
        source='media',
        queryset=Media.objects.all(),
        allow_null=True,
        required=False
    )

    class Meta:
        model = WebStorySlide
        fields = [
            'id', 'order', 'caption',
            'media_id', 'external_image_url',
            'image_url'
        ]
        read_only_fields = ['id', 'image_url']

    def get_image_url(self, obj):
        request = self.context.get('request')
        return obj.resolved_image_url(request=request)


class WebStorySerializer(serializers.ModelSerializer):
    """Detailed serializer for web stories with nested slides."""

    cover_image_url = serializers.SerializerMethodField()
    cover_media_id = MediaPrimaryKeyRelatedField(
        source='cover_media',
        queryset=Media.objects.all(),
        allow_null=True,
        required=False
    )
    slides = WebStorySlideSerializer(many=True, required=False)
    author_name = serializers.CharField(source='author.username', read_only=True)
    editor_name = serializers.CharField(source='editor.username', read_only=True)

    class Meta:
        model = WebStory
        fields = [
            'id', 'title', 'slug', 'summary', 'status',
            'cover_image', 'cover_image_url', 'cover_media_id', 'cover_external_url',
            'author', 'author_name', 'editor', 'editor_name',
            'published_at', 'scheduled_for',
            'created_at', 'updated_at',
            'slides',
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at', 'published_at']

    def create(self, validated_data):
        slides_data = validated_data.pop('slides', [])
        story = super().create(validated_data)
        self._save_slides(story, slides_data)
        return story

    def update(self, instance, validated_data):
        slides_data = validated_data.pop('slides', None)
        story = super().update(instance, validated_data)

        if slides_data is not None:
            instance.slides.all().delete()
            self._save_slides(instance, slides_data)

        return story

    def _save_slides(self, story, slides_data):
        request = self.context.get('request')
        for index, slide_data in enumerate(slides_data):
            media = slide_data.get('media')
            WebStorySlide.objects.create(
                story=story,
                order=slide_data.get('order', index),
                caption=slide_data.get('caption', ''),
                media=media,
                external_image_url=slide_data.get('external_image_url', '')
            )

        # Refresh story to include newly created slides in response
        story.refresh_from_db()

    def get_cover_image_url(self, obj):
        request = self.context.get('request')
        return obj.cover_url(request=request)


class WebStoryListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing web stories."""

    cover_image_url = serializers.SerializerMethodField()
    slide_count = serializers.SerializerMethodField()

    class Meta:
        model = WebStory
        fields = [
            'id', 'title', 'status', 'summary',
            'cover_image_url', 'published_at', 'updated_at',
            'slide_count'
        ]

    def get_cover_image_url(self, obj):
        request = self.context.get('request')
        return obj.cover_url(request=request)

    def get_slide_count(self, obj):
        return obj.slides.count()

