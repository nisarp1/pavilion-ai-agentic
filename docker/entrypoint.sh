#!/bin/bash
set -e

echo "Starting Django application..."

# Wait for database to be ready (with timeout)
echo "Waiting for database to be ready..."
for i in {1..30}; do
    if python manage.py dbshell < /dev/null 2>/dev/null; then
        echo "✓ Database is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "✗ Database did not become ready in time"
        exit 1
    fi
    echo "Attempt $i/30 - Waiting for database..."
    sleep 2
done

# Run migrations
echo "Running database migrations..."
python manage.py migrate --noinput || {
    echo "✗ Migrations failed"
    exit 1
}

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
