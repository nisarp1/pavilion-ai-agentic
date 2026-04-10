#!/bin/bash

# Setup script for PavilionEnd backend

echo "Setting up PavilionEnd backend..."

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << EOF
# Django Settings
SECRET_KEY=$(python3 -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())')
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DB_NAME=pavilion_gemini
DB_USER=pavilion_user
DB_PASSWORD=pavilion_password
DB_HOST=localhost
DB_PORT=5432

# Redis (Celery)
REDIS_URL=redis://localhost:6379/0

# AWS S3 (Optional - leave empty for local storage)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_STORAGE_BUCKET_NAME=
AWS_S3_REGION_NAME=us-east-1

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# JWT
JWT_SECRET_KEY=$(python3 -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())')
JWT_ALGORITHM=HS256
JWT_EXPIRATION_DELTA=86400

# RSS Feeds (comma-separated)
RSS_FEEDS=https://feeds.feedburner.com/oreilly/radar,https://www.smashingmagazine.com/feed/
EOF
    echo ".env file created!"
fi

# Wait for database to be ready
echo "Waiting for database..."
sleep 5

# Run migrations
echo "Running migrations..."
python manage.py migrate

# Create superuser if needed
echo ""
echo "Would you like to create a superuser? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    python manage.py createsuperuser
fi

echo ""
echo "Setup complete!"
echo ""
echo "To start the development server:"
echo "  source venv/bin/activate"
echo "  python manage.py runserver"
echo ""
echo "To start Celery worker (in separate terminal):"
echo "  source venv/bin/activate"
echo "  celery -A pavilion_gemini worker --loglevel=info"
echo ""
echo "To start Celery beat (in separate terminal):"
echo "  source venv/bin/activate"
echo "  celery -A pavilion_gemini beat --loglevel=info"
echo ""

