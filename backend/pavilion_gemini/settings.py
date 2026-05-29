"""
Django settings for pavilion_gemini project.
"""
import os
from pathlib import Path
from datetime import timedelta
import environ

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Environment variables
env = environ.Env(
    DEBUG=(bool, False)
)
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

# SECURITY WARNING: keep the secret key used in production secret!
_secret_key_default = 'django-insecure-change-me-in-production'
SECRET_KEY = env('SECRET_KEY', default=_secret_key_default)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env('DEBUG', default=False)

# Environment (development, staging, production)
ENVIRONMENT = env('ENVIRONMENT', default='development')

if ENVIRONMENT == 'production' and SECRET_KEY == _secret_key_default:
    raise RuntimeError("SECRET_KEY must be set to a secure value in production.")

# ALLOWED_HOSTS: always use explicit list — never wildcard in production
_default_allowed_hosts = ['localhost', '127.0.0.1', '.railway.app', '.up.railway.app', '.run.app']
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=_default_allowed_hosts)

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party apps
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_extensions',
    
    # Local apps
    'tenants',
    'cms',
    'rss_fetcher',
    'workers',
    'video_studio',
    'agents',
    'style_library',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'tenants.middleware.TenantMiddleware',
    'pavilion_gemini.media_middleware.MediaCacheMiddleware',
    'pavilion_gemini.spa_middleware.SPAFallbackMiddleware',  # SPA routing - must be last
]

ROOT_URLCONF = 'pavilion_gemini.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'templates')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'pavilion_gemini.wsgi.application'

# Database
# Use SQLite for development if PostgreSQL is not available
import dj_database_url

# Database
# Production: Cloud SQL via Unix socket (Cloud Run --add-cloudsql-instances, no VPC needed)
# Development: DATABASE_URL env var or SQLite fallback
if ENVIRONMENT == 'production':
    db_instance = env('CLOUD_SQL_INSTANCE', default='')   # project:region:instance
    db_user     = env('DB_USER',     default='pavilion_app')
    db_password = env('DB_PASSWORD', default='')
    db_name     = env('DB_NAME',     default='pavilion_newsai')

    if db_instance:
        # Cloud Run injects a Unix socket at /cloudsql/<instance> automatically
        DATABASES = {
            'default': {
                'ENGINE':   'django.db.backends.postgresql',
                'HOST':     f'/cloudsql/{db_instance}',
                'NAME':     db_name,
                'USER':     db_user,
                'PASSWORD': db_password,
                'CONN_MAX_AGE': 600,
            }
        }
    else:
        # Fallback for manual DATABASE_URL (local testing against prod DB)
        DATABASES = {
            'default': dj_database_url.config(
                default=env('DATABASE_URL', default='sqlite:///' + str(BASE_DIR / 'db.sqlite3')),
                conn_max_age=600,
                conn_health_checks=True,
            )
        }
else:
    # Development: DATABASE_URL or SQLite
    DATABASES = {
        'default': dj_database_url.config(
            default=env('DATABASE_URL', default='sqlite:///' + str(BASE_DIR / 'db.sqlite3')),
            conn_max_age=600,
            conn_health_checks=True,
        )
    }

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Subdirectory deployment
FORCE_SCRIPT_NAME = env('FORCE_SCRIPT_NAME', default=None)

# Static files (CSS, JavaScript, Images)
if FORCE_SCRIPT_NAME:
    STATIC_URL = f"{FORCE_SCRIPT_NAME}/static/"
    MEDIA_URL = f"{FORCE_SCRIPT_NAME}/media/"
else:
    STATIC_URL = '/static/'
    MEDIA_URL = '/media/'

STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
# In production, serve the React bundle from / so Vite's /assets/ paths resolve.
# In dev, keep /static/ so runserver doesn't reject MEDIA_URL being inside STATIC_URL.
if ENVIRONMENT != 'development':
    STATIC_URL = '/'

# Include React build output so collectstatic picks it up even with --clear
_frontend_dist = os.path.join(BASE_DIR.parent, 'frontend', 'dist')
STATICFILES_DIRS = [_frontend_dist] if os.path.isdir(_frontend_dist) else []

# Whitenoise storage for serving static files in production
# Whitenoise storage (Use non-manifest version to avoid 500 errors if files are missing)
# STATICFILES_STORAGE = 'whitenoise.storage.CompressedStaticFilesStorage'
STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'
WHITENOISE_USE_FINDERS = True
WHITENOISE_AUTOREFRESH = True

def _whitenoise_no_cache_index(headers, path, url):
    if path.endswith('index.html'):
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        headers['Pragma'] = 'no-cache'

WHITENOISE_ADD_HEADERS_FUNCTION = _whitenoise_no_cache_index

# CSRF trusted origins
CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=[
    'https://newsai.pavilionend.in',
    'http://localhost:3001',
    'http://localhost:8000',
]) + [
    'https://' + host
    for host in ALLOWED_HOSTS
    if host not in ('*', 'localhost', '127.0.0.1') and not host.startswith('.')
]

# Trust the X-Forwarded-Proto header for SSL (Required for Railway)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# HTTPS / security headers (active when not in DEBUG mode)
if not DEBUG:
    SECURE_HSTS_SECONDS = 31536000          # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/minute',
        'user': '300/minute',
        'auth': '10/minute',       # applied per-view on login/register/pw-reset
    },
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'EXCEPTION_HANDLER': 'pavilion_gemini.exceptions.pavilion_exception_handler',
}

# JWT Settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=24),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}

# CORS Settings
# CORS Settings
# Ensure we handle comma-separated list correctly and filter invalid origins
raw_cors_origins = env.list('CORS_ALLOWED_ORIGINS', default=[])
CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in raw_cors_origins
    if origin.strip() and (origin.startswith('http://') or origin.startswith('https://'))
]

# Allow all Cloud Run, Vercel and Railway deployments (Preview & Production)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://pavilion-frontend-.*\.a\.run\.app$",  # Cloud Run frontend services
    r"^https://.*\.vercel\.app$",  # Vercel deployments
    r"^https://.*\.up\.railway\.app$",  # Railway deployments
    r"^http://localhost:5173$",  # Local frontend dev (Vite)
    r"^http://localhost:3000$",  # Local frontend dev (alternative port)
]

# Add defaults if empty (for local dev)
if not CORS_ALLOWED_ORIGINS and DEBUG:
    CORS_ALLOWED_ORIGINS = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    ]

CORS_ALLOW_CREDENTIALS = True

# Celery Configuration
# Supports both redis:// (local/Memorystore) and rediss:// (Upstash TLS)
_redis_url = env('REDIS_URL', default='redis://localhost:6379/0')
CELERY_BROKER_URL = _redis_url
CELERY_RESULT_BACKEND = _redis_url
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
# Required for Upstash TLS (rediss://) — ignored for plain redis://
CELERY_BROKER_USE_SSL = {'ssl_cert_reqs': 'none'} if _redis_url.startswith('rediss://') else None
CELERY_REDIS_BACKEND_USE_SSL = {'ssl_cert_reqs': 'none'} if _redis_url.startswith('rediss://') else None

# Task routing — keep heavy pipeline tasks off the default queue so
# RSS/publish tasks aren't blocked behind 10-minute video/social jobs.
CELERY_TASK_ROUTES = {
    'agents.tasks.run_reel_pipeline_task':       {'queue': 'pipeline'},
    'agents.tasks.backfill_reel_video_url':      {'queue': 'pipeline'},
    'video_studio.tasks.render_video_task':      {'queue': 'pipeline'},
    'video_studio.tasks.check_render_status':    {'queue': 'pipeline'},
    'agents.social_tasks.*':                     {'queue': 'social'},
    'rss_fetcher.tasks.*':                       {'queue': 'default'},
    'workers.tasks.*':                           {'queue': 'default'},
}
CELERY_TASK_DEFAULT_QUEUE = 'default'

# Celery Beat Schedule
# Fetch interval in minutes (default: 5 minutes for more frequent updates)
RSS_FETCH_INTERVAL_MINUTES = env.int('RSS_FETCH_INTERVAL_MINUTES', default=5)

CELERY_BEAT_SCHEDULE = {
    'fetch-rss-feeds': {
        'task': 'rss_fetcher.tasks.fetch_rss_feeds',
        'schedule': timedelta(minutes=RSS_FETCH_INTERVAL_MINUTES),
    },
    'fetch-trends-sports': {
        'task': 'rss_fetcher.tasks.fetch_google_trends_sports',
        'schedule': timedelta(hours=1),
    },
    'enhance-with-google-trends': {
        'task': 'rss_fetcher.tasks.enhance_articles_with_google_trends',
        'schedule': timedelta(hours=1),
    },
    'publish-scheduled-articles': {
        'task': 'workers.tasks.publish_scheduled_articles',
        'schedule': timedelta(minutes=1),
    },
    'refresh-agentic-trends': {
        'task': 'workers.tasks.run_agentic_trends_celery',
        'schedule': timedelta(hours=1),
    },
}

# Django cache backend
# Upstash free tier is single-DB, so broker and cache share the same URL —
# key prefixes prevent collisions. On Memorystore, REDIS_CACHE_URL uses DB 1.
_redis_cache_url = env('REDIS_CACHE_URL', default='redis://localhost:6379/1')
_cache_options = {}
if _redis_cache_url.startswith('rediss://'):
    _cache_options = {'ssl_cert_reqs': None}   # Upstash self-signed cert

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': _redis_cache_url,
        'OPTIONS': _cache_options,
    }
}

# Agentic Trends configuration
TRENDS_CACHE_TTL = 3600  # seconds (1 hr) — matches beat schedule
TRENDS_MAX_TOPICS = 15
TRENDS_SPORTS = ['cricket', 'football', 'kabaddi', 'tennis', 'hockey', 'badminton']

# AWS S3 Settings (Optional)
AWS_ACCESS_KEY_ID = env('AWS_ACCESS_KEY_ID', default='')
AWS_SECRET_ACCESS_KEY = env('AWS_SECRET_ACCESS_KEY', default='')
AWS_STORAGE_BUCKET_NAME = env('AWS_STORAGE_BUCKET_NAME', default='')
AWS_S3_REGION_NAME = env('AWS_S3_REGION_NAME', default='us-east-1')

if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
    STATICFILES_STORAGE = 'storages.backends.s3boto3.S3StaticStorage'

# RSS Feeds
RSS_FEEDS = env.list('RSS_FEEDS', default=[])

# Google Gemini AI (Vertex AI preferred; falls back to AI Studio API key)
GEMINI_API_KEY = env('GEMINI_API_KEY', default='')
GEMINI_MODEL = env('GEMINI_MODEL', default='gemini-2.5-flash-lite')
VERTEX_PROJECT = env('VERTEX_PROJECT', default='') or env('VERTEXAI_PROJECT', default='')
VERTEX_LOCATION = env('VERTEX_LOCATION', default='') or env('VERTEXAI_LOCATION', default='us-central1')

# Google Cloud Text-to-Speech
# Set this to the full path of your service account JSON key file
# Example: GOOGLE_APPLICATION_CREDENTIALS=/Users/username/Downloads/pavilion-tts-key.json
GOOGLE_APPLICATION_CREDENTIALS = env('GOOGLE_APPLICATION_CREDENTIALS', default='')

# Support for raw JSON credentials (for Railway/Vercel)
# Support for raw JSON credentials (for Railway/Vercel)
GOOGLE_CREDENTIALS_JSON = env('GOOGLE_CREDENTIALS_JSON', default='')
if GOOGLE_CREDENTIALS_JSON:
    import json
    import tempfile
    
    # Create a temporary file to store the credentials
    # We use a fixed path in /tmp so it persists across requests in the same instance
    creds_path = os.path.join(tempfile.gettempdir(), 'google-credentials.json')
    with open(creds_path, 'w') as f:
        f.write(GOOGLE_CREDENTIALS_JSON)
    
    GOOGLE_APPLICATION_CREDENTIALS = creds_path
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = creds_path

if GOOGLE_APPLICATION_CREDENTIALS:
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = GOOGLE_APPLICATION_CREDENTIALS

# News API
NEWS_API_KEY = env('NEWS_API_KEY', default='')

# ── Video Studio ──────────────────────────────────────────────────────────────
# S3 bucket used for rendered videos and fallback ZIP exports
AWS_S3_BUCKET = env('AWS_S3_BUCKET', default='')
AWS_REGION = env('AWS_REGION', default='us-east-1')
# Cloud Run / renderer URL (Track A)
CLOUD_RUN_RENDERER_URL = env('CLOUD_RUN_RENDERER_URL', default='')
# S3 path (s3://bucket/path or key) to the base After Effects .aep template (Track B)
AEP_TEMPLATE_GCS_PATH = env('AEP_TEMPLATE_GCS_PATH', default='')

# ── Google Custom Search (Image Fetcher Agent) ────────────────────────────────
# Enable at: https://console.cloud.google.com/apis/library/customsearch.googleapis.com
# Create search engine at: https://cse.google.com
GOOGLE_CUSTOM_SEARCH_API_KEY  = env('GOOGLE_CUSTOM_SEARCH_API_KEY',  default='')
GOOGLE_CUSTOM_SEARCH_ENGINE_ID = env('GOOGLE_CUSTOM_SEARCH_ENGINE_ID', default='')
# ─────────────────────────────────────────────────────────────────────────────


# Google OAuth (used to verify Google ID tokens on login)
GOOGLE_OAUTH_CLIENT_ID = env('GOOGLE_OAUTH_CLIENT_ID', default='')

# Frontend URL (used for invite links, password reset emails)
FRONTEND_URL = env('FRONTEND_URL', default='http://localhost:3001')

# Email Configuration
EMAIL_BACKEND = env('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = env('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = env.int('EMAIL_PORT', default=587)
EMAIL_USE_TLS = env.bool('EMAIL_USE_TLS', default=True)
EMAIL_HOST_USER = env('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', default='noreply@pavilion.local')
ADMIN_EMAIL = env('ADMIN_EMAIL', default='admin@pavilion.local')

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{levelname}] {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '[{levelname}] {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose' if DEBUG else 'simple',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': env('LOG_LEVEL', default='INFO'),
    },
    'loggers': {
        'django': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
        'django.request': {'handlers': ['console'], 'level': 'ERROR', 'propagate': False},
        'cms': {'handlers': ['console'], 'level': 'DEBUG', 'propagate': False},
        'workers': {'handlers': ['console'], 'level': 'DEBUG', 'propagate': False},
        'tenants': {'handlers': ['console'], 'level': 'DEBUG', 'propagate': False},
        'rss_fetcher': {'handlers': ['console'], 'level': 'DEBUG', 'propagate': False},
        'agents':      {'handlers': ['console'], 'level': 'DEBUG', 'propagate': False},
        'video_studio':{'handlers': ['console'], 'level': 'DEBUG', 'propagate': False},
        'style_library':{'handlers': ['console'], 'level': 'DEBUG', 'propagate': False},
    },
}

