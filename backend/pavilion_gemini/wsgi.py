"""
WSGI config for pavilion_gemini project.
"""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pavilion_gemini.settings')

application = get_wsgi_application()

