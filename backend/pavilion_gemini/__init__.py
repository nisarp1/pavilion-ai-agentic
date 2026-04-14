# This will make sure the app is always imported when
# Django starts so that shared_task will use this app.
#
# However, Celery initialization can hang in WSGI environments (gunicorn)
# where there's no message broker. We try to import but don't fail if it doesn't work.

import sys

# Check if we're running in a WSGI context (gunicorn)
_is_wsgi = any(x in str(sys.argv) for x in ['gunicorn', 'wsgi', 'runserver'])

if _is_wsgi:
    # For WSGI, skip Celery import to avoid startup hangs
    __all__ = ()
else:
    # For management commands or Celery workers, try to import celery
    try:
        from .celery import app as celery_app
        __all__ = ('celery_app',)
    except Exception as e:
        # If celery import fails (e.g., no broker configured),
        # continue anyway - celery is optional
        __all__ = ()

