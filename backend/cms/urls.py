"""
CMS API URLs.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
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
]

