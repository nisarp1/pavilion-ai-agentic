"""
RSS Fetcher API URLs.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RSSFeedViewSet

router = DefaultRouter()
router.register(r'feeds', RSSFeedViewSet, basename='rssfeed')

urlpatterns = [
    path('', include(router.urls)),
]

