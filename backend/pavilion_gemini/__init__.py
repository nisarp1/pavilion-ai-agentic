# Import the Celery app so shared_task decorators bind to the correct app
# (and therefore use the configured REDIS broker, not Celery's AMQP default).
# Importing the app does NOT connect to the broker — the connection is lazy.
from .celery import app as celery_app

__all__ = ('celery_app',)

