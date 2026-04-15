#!/bin/bash
set -e

# Ensure we're in the backend directory
cd /app/backend || exit 1

echo "Starting Django application..."
echo "Working directory: $(pwd)"
echo "Python version: $(python --version)"
echo "Checking environment: DATABASE_URL is $([ -z "$DATABASE_URL" ] && echo "NOT SET" || echo "SET")"

# Small delay to allow Cloud SQL Proxy to fully establish connection
echo "Waiting for cloud resources to be ready..."
sleep 5

# Run migrations
echo "Running database migrations..."
python manage.py migrate --noinput

# Collect static files (if needed)
if [ "$DEBUG" = "False" ]; then
    echo "Collecting static files..."
    python manage.py collectstatic --noinput || true
fi

echo "✓ Application ready, starting gunicorn..."

# Start gunicorn
exec gunicorn \
    --workers=4 \
    --worker-class=sync \
    --bind=0.0.0.0:8080 \
    --timeout=120 \
    --access-logfile=- \
    --error-logfile=- \
    --log-level=info \
    pavilion_gemini.wsgi:application
