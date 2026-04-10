"""
CMS API URLs.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ArticleViewSet,
    CategoryViewSet,
    MediaViewSet,
    WebStoryViewSet,
    resize_media_view,
)

router = DefaultRouter()
router.register(r'articles', ArticleViewSet, basename='article')
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'media', MediaViewSet, basename='media')
router.register(r'webstories', WebStoryViewSet, basename='webstory')

urlpatterns = [
    path('', include(router.urls)),
    path('resize/', resize_media_view, name='media-resize'),
]

