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
    """Comprehensive health check: DB + Redis connectivity."""
    checks = {}
    overall = 'healthy'

    try:
        from django.db import connection
        connection.ensure_connection()
        checks['database'] = 'ok'
    except Exception as e:
        checks['database'] = f'error: {e}'
        overall = 'degraded'

    try:
        import subprocess
        result = subprocess.run(['redis-cli', 'ping'], capture_output=True, text=True, timeout=3)
        if result.stdout.strip() == 'PONG':
            checks['redis'] = 'ok'
        else:
            checks['redis'] = 'error: no response'
            overall = 'degraded'
    except Exception as e:
        checks['redis'] = f'error: {e}'
        overall = 'degraded'

    http_status = 200 if overall == 'healthy' else 503
    return JsonResponse({'status': overall, 'checks': checks}, status=http_status)

from rss_fetcher.views import debug_media_view
from tenants.views import GoogleOAuthCallbackView, RegisterView, UserProfileView, ChangePasswordView
from tenants.password_reset import PasswordResetRequestView, PasswordResetConfirmView

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('', api_root, name='api_root'),
    path('debug-media/', debug_media_view),
    path('admin/', admin.site.urls),

    # Auth endpoints
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/verify/', TokenVerifyView.as_view(), name='token_verify'),
    path('api/auth/register/', RegisterView.as_view(), name='register'),
    path('api/auth/google/callback/', GoogleOAuthCallbackView.as_view(), name='google_oauth_callback'),
    path('api/auth/profile/', UserProfileView.as_view(), name='user_profile'),
    path('api/auth/change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('api/auth/password-reset/', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('api/auth/password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),

    # App URLs
    path('api/', include('cms.urls')),
    path('api/rss/', include('rss_fetcher.urls')),
    path('api/tenants/', include('tenants.urls')),
    path('api/video/', include('video_studio.urls')),

    # Reel Pipeline API
    path('api/pipeline/', include('agents.urls')),

    # Style Library API
    path('api/style-library/', include('style_library.urls')),
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

