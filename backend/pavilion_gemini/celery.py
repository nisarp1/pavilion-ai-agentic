"""
Celery configuration for pavilion_gemini project.
"""
import os
from celery import Celery

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pavilion_gemini.settings')

app = Celery('pavilion_gemini')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
# Wrap in try-except to handle missing broker or other startup issues
try:
    app.autodiscover_tasks()
except Exception as e:
    # If autodiscover fails (e.g., no broker configured), continue
    # This is acceptable for WSGI deployments where Celery tasks are not needed
    import warnings
    warnings.warn(f"Celery autodiscover failed: {e}. Tasks will not be available.")

@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')

