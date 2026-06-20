"""
CMS API URLs.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .rss_proxy import rss_proxy
from .generate_post import generate_post_view
from .views import (
    FeedCategoryListView,
    FeedCategoryDetailView,
    FeedCategoryReorderView,
    FeedHandleListCreateView,
    FeedHandleDetailView,
    FeedHandleReorderView,
    FeedHandleListView,
    FeedHandleDeleteView,
    ArticleViewSet,
    CanvaTemplateViewSet,
    CategoryViewSet,
    MediaViewSet,
    WebStoryViewSet,
    SocialStudioGenerateView,
    SocialStudioExtractImageView,
    SocialStudioSaveEditsView,
    resize_media_view,
    FeedsListView,
    FeedArticlesView,
    FeedAddHandleView,
    FeedRemoveView,
    FeedPollView,
    FeedsRefreshView,
    TwitterHealthCheckView,
    CoworkGenerateView,
    CoworkCompleteView,
    BreakingQueueView,
    BreakingQueueUrgencyView,
    SystemStatusView,
)

router = DefaultRouter()
router.register(r'articles',        ArticleViewSet,        basename='article')
router.register(r'categories',      CategoryViewSet,       basename='category')
router.register(r'media',           MediaViewSet,          basename='media')
router.register(r'webstories',      WebStoryViewSet,       basename='webstory')
router.register(r'canva-templates', CanvaTemplateViewSet,  basename='canva-template')

urlpatterns = [
    path('', include(router.urls)),
    path('resize/', resize_media_view, name='media-resize'),
    path('social-studio/generate/', SocialStudioGenerateView.as_view(), name='social-studio-generate'),
    path('social-studio/extract-image-context/', SocialStudioExtractImageView.as_view(), name='social-studio-extract-image'),
    path('social-studio/save-edits/', SocialStudioSaveEditsView.as_view(), name='social-studio-save-edits'),
    # RSSHub proxy — no auth required, no CORS issues
    path('feeds/rss/', rss_proxy, name='feeds-rss-proxy'),
    # FeedCategory CRUD
    path('feed-categories/', FeedCategoryListView.as_view(), name='feed-categories-list'),
    path('feed-categories/reorder/', FeedCategoryReorderView.as_view(), name='feed-categories-reorder'),
    path('feed-categories/<int:pk>/', FeedCategoryDetailView.as_view(), name='feed-categories-detail'),
    # FeedHandle CRUD v2 (with category_obj + position)
    path('feeds/handles/', FeedHandleListCreateView.as_view(), name='feeds-handles-list'),
    path('feeds/handles/reorder/', FeedHandleReorderView.as_view(), name='feeds-handles-reorder'),
    path('feeds/handles/<str:handle>/', FeedHandleDetailView.as_view(), name='feeds-handles-detail'),
    # Legacy FeedHandle endpoints (kept for backward compat)
    path('feeds/handles-legacy/', FeedHandleListView.as_view(), name='feeds-handles-list-legacy'),
    path('feeds/handles-legacy/<str:handle>/', FeedHandleDeleteView.as_view(), name='feeds-handles-delete-legacy'),
    # Feeds (Social Handle Monitor)
    path('feeds/', FeedsListView.as_view(), name='feeds-list'),
    path('feeds/add/', FeedAddHandleView.as_view(), name='feeds-add'),
    path('feeds/refresh/', FeedsRefreshView.as_view(), name='feeds-refresh'),
    path('feeds/<str:x_handle>/articles/', FeedArticlesView.as_view(), name='feeds-articles'),
    path('feeds/<str:x_handle>/remove/', FeedRemoveView.as_view(), name='feeds-remove'),
    path('feeds/<str:x_handle>/poll/', FeedPollView.as_view(), name='feeds-poll'),
    # System utilities
    path('system/check-twitter-health/', TwitterHealthCheckView.as_view(), name='system-twitter-health'),
    # Cowork (Week 3)
    path('cowork/generate/', CoworkGenerateView.as_view(), name='cowork-generate'),
    path('cowork/complete/', CoworkCompleteView.as_view(), name='cowork-complete'),
    # Breaking Queue
    path('breaking-queue/', BreakingQueueView.as_view(), name='breaking-queue'),
    path('breaking-queue/<int:pk>/urgency/', BreakingQueueUrgencyView.as_view(), name='breaking-queue-urgency'),
    # System status
    path('system-status/', SystemStatusView.as_view(), name='system-status'),
    # AI post generation
    path('generate-post/', generate_post_view, name='generate-post'),
]

