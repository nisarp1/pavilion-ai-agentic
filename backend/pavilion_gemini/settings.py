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
SECRET_KEY = env('SECRET_KEY', default='django-insecure-change-me-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env('DEBUG', default=True)

# Environment (development, staging, production)
ENVIRONMENT = env('ENVIRONMENT', default='development')

# Allow all Railway domains + configured hosts + Cloud Run
_default_allowed_hosts = ['localhost', '127.0.0.1', '.railway.app', '.up.railway.app', '.run.app']
if os.environ.get('RAILWAY_ENVIRONMENT') or os.environ.get('DATABASE_URL') or os.environ.get('CLOUD_SQL_INSTANCE'):
    ALLOWED_HOSTS = ['*']
else:
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
    'corsheaders',
    'django_extensions',
    
    # Local apps
    'tenants',
    'cms',
    'rss_fetcher',
    'workers',
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
        'DIRS': [],
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
# Cloud SQL with unix socket via cloud-sql-python-connector
if ENVIRONMENT == 'production':
    # Get database credentials from environment
    db_instance = env('CLOUD_SQL_INSTANCE', default='')
    db_user = env('DB_USER', default='pavilion_app')
    db_password = env('DB_PASSWORD', default='')
    db_name = env('DB_NAME', default='pavilion_agentic')

    if db_instance:
        try:
            from cloud_sql_python_connector import Connector

            # Using Cloud SQL Connector for unix socket support
            connector = Connector()

            def getconn():
                return connector.connect(
                    db_instance,
                    "postgresql",
                    user=db_user,
                    password=db_password,
                    db=db_name
                )

            DATABASES = {
                'default': {
                    'ENGINE': 'django.db.backends.postgresql',
                    'CREATOR': getconn,
                }
            }
        except ImportError:
            # Fall back to DATABASE_URL if cloud-sql-python-connector not installed
            DATABASES = {
                'default': dj_database_url.config(
                    default=env('DATABASE_URL', default='sqlite:///' + str(BASE_DIR / 'db.sqlite3')),
                    conn_max_age=600,
                    conn_health_checks=True,
                )
            }
    else:
        # Fallback to DATABASE_URL if available
        DATABASES = {
            'default': dj_database_url.config(
                default=env('DATABASE_URL', default='sqlite:///' + str(BASE_DIR / 'db.sqlite3')),
                conn_max_age=600,
                conn_health_checks=True,
            )
        }
else:
    # Development: Use DATABASE_URL or sqlite
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

# Whitenoise storage for serving static files in production
# Whitenoise storage (Use non-manifest version to avoid 500 errors if files are missing)
# STATICFILES_STORAGE = 'whitenoise.storage.CompressedStaticFilesStorage'
STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'
WHITENOISE_USE_FINDERS = True
WHITENOISE_AUTOREFRESH = True

# CSRF Settings (Required for Railway/Vercel)
CSRF_TRUSTED_ORIGINS = [
    'https://' + host for host in ALLOWED_HOSTS if host not in ['*', 'localhost', '127.0.0.1']
]
# Fallback for wildcard
if '*' in ALLOWED_HOSTS:
    CSRF_TRUSTED_ORIGINS += ['https://*.railway.app', 'https://*.vercel.app', 'https://pavilion-ai-production.up.railway.app']

# Trust the X-Forwarded-Proto header for SSL (Required for Railway)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
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
CELERY_BROKER_URL = env('REDIS_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = env('REDIS_URL', default='redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# Celery Beat Schedule
# Fetch interval in minutes (default: 5 minutes for more frequent updates)
RSS_FETCH_INTERVAL_MINUTES = env.int('RSS_FETCH_INTERVAL_MINUTES', default=5)

CELERY_BEAT_SCHEDULE = {
    'fetch-rss-feeds': {
        'task': 'rss_fetcher.tasks.fetch_rss_feeds',
        'schedule': timedelta(minutes=RSS_FETCH_INTERVAL_MINUTES),  # Configurable interval
    },
    'fetch-trends-sports': {
        'task': 'rss_fetcher.tasks.fetch_google_trends_sports',
        'schedule': timedelta(hours=1),  # Fetch trends every hour (gets last 1 hour articles)
    },
    'enhance-with-google-trends': {
        'task': 'rss_fetcher.tasks.enhance_articles_with_google_trends',
        'schedule': timedelta(hours=1),  # Enhance articles every hour with Google Trends data
    },
}

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

# Google Gemini AI
GEMINI_API_KEY = env('GEMINI_API_KEY', default='')
GEMINI_MODEL = env('GEMINI_MODEL', default='gemini-2.5-flash')

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

