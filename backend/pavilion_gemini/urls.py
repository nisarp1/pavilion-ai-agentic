"""
URL configuration for pavilion_gemini project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

def api_root(request):
    """Root endpoint that provides API information."""
    return JsonResponse({
        'message': 'Pavilion Gemini API',
        'version': '1.0',
        'endpoints': {
            'admin': '/admin/',
            'authentication': {
                'login': '/api/auth/login/',
                'refresh': '/api/auth/refresh/',
                'verify': '/api/auth/verify/',
            },
            'articles': '/api/articles/',
            'rss_feeds': '/api/rss/feeds/',
        },
        'documentation': 'Access /admin/ for Django admin panel'
    })

from django.http import HttpResponse

@csrf_exempt
def health_check(request):
    """Health check endpoint for load balancers and monitoring."""
    # Return plain text 200 OK - minimal response to avoid any parsing issues
    return HttpResponse('OK', status=200, content_type='text/plain')

from rss_fetcher.views import debug_media_view
from tenants.views import GoogleOAuthCallbackView

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('', api_root, name='api_root'),
    path('debug-media/', debug_media_view),
    path('admin/', admin.site.urls),
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/verify/', TokenVerifyView.as_view(), name='token_verify'),
    path('api/auth/google/callback/', GoogleOAuthCallbackView.as_view(), name='google_oauth_callback'),
    path('api/', include('cms.urls')),
    path('api/rss/', include('rss_fetcher.urls')),
    path('api/tenants/', include('tenants.urls')),
]

from django.views.static import serve
from django.urls import re_path

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
else:
    # Force serve media files in production (for Railway without S3)
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    ]

