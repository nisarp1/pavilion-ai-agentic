#!/bin/bash
set -e

# PAVILION_MODE controls what this container runs:
#   web    (default) — gunicorn Django app
#   worker           — Celery task worker
#   beat             — Celery beat scheduler
MODE="${PAVILION_MODE:-web}"

cd /app/backend || exit 1

echo "=== Pavilion AI — mode: ${MODE} ==="
echo "Python: $(python --version) | PORT: ${PORT:-8080}"

# Small delay to let Cloud SQL Auth Proxy (or Cloud Run connection) settle
sleep 5

if [ "$MODE" = "web" ]; then
    echo "Running migrations..."
    python manage.py migrate --noinput

    echo "Collecting static files..."
    python manage.py collectstatic --noinput --clear 2>/dev/null || true

    echo "Starting gunicorn..."
    exec gunicorn \
        --workers=4 \
        --worker-class=sync \
        --bind="0.0.0.0:${PORT:-8080}" \
        --timeout=120 \
        --keep-alive=5 \
        --access-logfile=- \
        --error-logfile=- \
        --log-level=info \
        pavilion_gemini.wsgi:application

elif [ "$MODE" = "worker" ]; then
    echo "Starting Celery worker (via celery_runner)..."
    exec python3 /app/docker/celery_runner.py \
        celery -A pavilion_gemini worker \
        --loglevel=info \
        --concurrency=4 \
        -Q default,social,pipeline,celery

elif [ "$MODE" = "beat" ]; then
    echo "Starting Celery beat (via celery_runner)..."
    exec python3 /app/docker/celery_runner.py \
        celery -A pavilion_gemini beat \
        --loglevel=info \
        --scheduler celery.beat.PersistentScheduler

else
    echo "ERROR: Unknown PAVILION_MODE='${MODE}'. Expected: web | worker | beat"
    exit 1
fi
