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
    resize_media_view,
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
]

