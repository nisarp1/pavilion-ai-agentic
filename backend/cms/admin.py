"""
Django admin configuration for CMS.
"""
from django.contrib import admin
from .models import Article, Category, Media, WebStory, WebStorySlide, PosterTemplate, SocialMediaHandle, FactCheck

@admin.register(PosterTemplate)
class PosterTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name']


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = [
        'title', 'status', 'author', 'editor',
        'created_at', 'updated_at', 'published_at'
    ]
    list_filter = ['status', 'created_at', 'published_at']
    search_fields = ['title', 'slug', 'summary', 'body']
    readonly_fields = [
        'created_at', 'updated_at', 'generation_started_at',
        'generation_completed_at'
    ]
    prepopulated_fields = {'slug': ('title',)}
    
    fieldsets = (
        ('Content', {
            'fields': ('title', 'slug', 'summary', 'body', 'status')
        }),
        ('Media', {
            'fields': ('featured_image', 'og_image')
        }),
        ('Social Media', {
            'fields': (
                'instagram_reel_script', 'instagram_reel_audio',
                'social_media_poster_text', 'social_media_caption'
            )
        }),
        ('SEO/OG', {
            'fields': (
                'meta_title', 'meta_description',
                'og_title', 'og_description'
            )
        }),
        ('Source', {
            'fields': ('source_url', 'source_feed')
        }),
        ('Authorship', {
            'fields': ('author', 'editor')
        }),
        ('Timestamps', {
            'fields': (
                'created_at', 'updated_at', 'published_at',
                'generation_started_at', 'generation_completed_at'
            )
        }),
    )


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'parent', 'order', 'is_active', 'article_count', 'created_at']
    list_filter = ['is_active', 'parent', 'created_at']
    search_fields = ['name', 'slug', 'description']
    readonly_fields = ['created_at', 'updated_at', 'article_count']
    prepopulated_fields = {'slug': ('name',)}
    list_editable = ['order', 'is_active']
    
    fieldsets = (
        ('Category Information', {
            'fields': ('name', 'slug', 'description', 'parent', 'order', 'is_active')
        }),
        ('Statistics', {
            'fields': ('article_count',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )
    
    def article_count(self, obj):
        """Display article count."""
        return obj.articles.count()
    article_count.short_description = 'Articles'


@admin.register(Media)
class MediaAdmin(admin.ModelAdmin):
    list_display = ['title', 'file', 'uploaded_by', 'file_size', 'mime_type', 'created_at']
    list_filter = ['mime_type', 'created_at', 'uploaded_by']
    search_fields = ['title', 'alt_text', 'description', 'file']
    readonly_fields = ['file_size', 'mime_type', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Media Information', {
            'fields': ('title', 'file', 'alt_text', 'description')
        }),
        ('Metadata', {
            'fields': ('uploaded_by', 'file_size', 'mime_type')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )
    
    def save_model(self, request, obj, form, change):
        if not change:  # New object
            obj.uploaded_by = request.user
        super().save_model(request, obj, form, change)


class WebStorySlideInline(admin.TabularInline):
    model = WebStorySlide
    extra = 0
    fields = ('order', 'caption', 'media', 'external_image_url')
    ordering = ('order',)


@admin.register(WebStory)
class WebStoryAdmin(admin.ModelAdmin):
    list_display = ['title', 'status', 'published_at', 'author', 'updated_at']
    list_filter = ['status', 'published_at', 'created_at']
    search_fields = ['title', 'slug', 'summary']
    readonly_fields = ['created_at', 'updated_at', 'published_at']
    inlines = [WebStorySlideInline]
    prepopulated_fields = {'slug': ('title',)}

    fieldsets = (
        ('Story Details', {
            'fields': ('title', 'slug', 'summary', 'status')
        }),
        ('Cover', {
            'fields': ('cover_media', 'cover_image', 'cover_external_url')
        }),
        ('Scheduling', {
            'fields': ('published_at', 'scheduled_for')
        }),
        ('Authorship', {
            'fields': ('author', 'editor')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(WebStorySlide)
class WebStorySlideAdmin(admin.ModelAdmin):
    list_display = ['story', 'order', 'caption', 'media', 'created_at']
    list_filter = ['story']
    search_fields = ['story__title', 'caption']
    ordering = ['story', 'order']



@admin.register(SocialMediaHandle)
class SocialMediaHandleAdmin(admin.ModelAdmin):
    list_display = ['name', 'x_handle', 'credibility_tier', 'category', 'is_active', 'last_polled_at']
    list_filter = ['credibility_tier', 'category', 'is_active']
    search_fields = ['name', 'x_handle']
    list_editable = ['is_active']


@admin.register(FactCheck)
class FactCheckAdmin(admin.ModelAdmin):
    list_display = ['article', 'verdict', 'confidence', 'checked_at']
    list_filter = ['verdict']
    readonly_fields = ['checked_at', 'gemini_reasoning', 'sources']


from .models_canva import CanvaTemplate

@admin.register(CanvaTemplate)
class CanvaTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'content_type', 'canva_template_id', 'tenant', 'is_active']
    list_filter = ['content_type', 'is_active', 'tenant']
    search_fields = ['name', 'canva_template_id']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Basic Info', {
            'fields': ('name', 'tenant', 'content_type', 'is_active', 'description')
        }),
        ('Canva Config', {
            'fields': ('canva_template_id', 'slots', 'team_colors')
        }),
        ('Integrations', {
            'fields': ('google_sheet_id',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )
