#!/bin/bash
# Week 0 Setup Script for Pavilion-AI Agentic CMS
# This script automates the GCP project setup and infrastructure creation
# Run this after creating a GitHub repo and GCP account

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="pavilion-ai-agentic"
REGION="us-central1"
ZONE="us-central1-a"
SERVICE_ACCOUNT_NAME="pavilion-agentic"
DB_INSTANCE="pavilion-db-dev"
DB_NAME="pavilion_agentic"
DB_USER="pavilion_user"
BUCKET_MEDIA="pavilion-ai-media-dev"
BUCKET_STATIC="pavilion-ai-static-dev"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Pavilion-AI Agentic CMS - Week 0 Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Check Prerequisites
echo -e "${YELLOW}[Step 1/10] Checking prerequisites...${NC}"
command -v gcloud >/dev/null 2>&1 || { echo -e "${RED}gcloud CLI is required but not installed.${NC}" >&2; exit 1; }
command -v gsutil >/dev/null 2>&1 || { echo -e "${RED}gsutil is required but not installed.${NC}" >&2; exit 1; }

echo -e "${GREEN}✓ Prerequisites met${NC}"
echo ""

# Step 2: Create/Select GCP Project
echo -e "${YELLOW}[Step 2/10] Setting up GCP project...${NC}"
PROJECT_ID=""
if [ -z "$PROJECT_ID" ]; then
    echo "Creating new project: $PROJECT_NAME"
    gcloud projects create $PROJECT_NAME --name="Pavilion AI Agentic CMS" --set-as-default
    PROJECT_ID=$PROJECT_NAME
else
    gcloud config set project $PROJECT_ID
fi

echo -e "${GREEN}✓ Project set: $PROJECT_ID${NC}"
echo ""

# Step 3: Enable Required APIs
echo -e "${YELLOW}[Step 3/10] Enabling required APIs...${NC}"
echo "This may take a few minutes..."

APIs=(
    "aiplatform.googleapis.com"
    "generativeai.googleapis.com"
    "sqladmin.googleapis.com"
    "storage.googleapis.com"
    "run.googleapis.com"
    "cloudtasks.googleapis.com"
    "logging.googleapis.com"
    "cloudtrace.googleapis.com"
    "secretmanager.googleapis.com"
    "artifactregistry.googleapis.com"
    "container.googleapis.com"
)

for api in "${APIs[@]}"; do
    gcloud services enable $api --project=$PROJECT_ID 2>/dev/null || true
done

echo -e "${GREEN}✓ APIs enabled${NC}"
echo ""

# Step 4: Create Service Account
echo -e "${YELLOW}[Step 4/10] Creating service account...${NC}"

SA_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Check if service account already exists
if gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID >/dev/null 2>&1; then
    echo "Service account already exists: $SA_EMAIL"
else
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --display-name="Pavilion Agentic CMS Service Account" \
        --project=$PROJECT_ID
    echo -e "${GREEN}✓ Service account created: $SA_EMAIL${NC}"
fi

# Step 5: Grant IAM Roles
echo -e "${YELLOW}[Step 5/10] Granting IAM roles...${NC}"

ROLES=(
    "roles/aiplatform.user"
    "roles/aiplatform.admin"
    "roles/cloudsql.client"
    "roles/cloudsql.admin"
    "roles/storage.objectAdmin"
    "roles/cloudtasks.enqueuer"
    "roles/secretmanager.secretAccessor"
    "roles/secretmanager.admin"
    "roles/logging.logWriter"
    "roles/cloudtrace.agent"
)

for role in "${ROLES[@]}"; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="$role" \
        --condition=None \
        --quiet 2>/dev/null || true
done

echo -e "${GREEN}✓ IAM roles granted${NC}"
echo ""

# Step 6: Create Service Account Key
echo -e "${YELLOW}[Step 6/10] Creating service account key...${NC}"

mkdir -p .gcp-secrets
gcloud iam service-accounts keys create .gcp-secrets/service-account-key.json \
    --iam-account=$SA_EMAIL \
    --project=$PROJECT_ID

echo -e "${GREEN}✓ Service account key created${NC}"
echo -e "${RED}⚠ Keep .gcp-secrets/service-account-key.json SECRET${NC}"
echo ""

# Step 7: Create Cloud SQL Instance
echo -e "${YELLOW}[Step 7/10] Creating Cloud SQL PostgreSQL instance...${NC}"
echo "This will take several minutes..."

if gcloud sql instances describe $DB_INSTANCE --project=$PROJECT_ID >/dev/null 2>&1; then
    echo -e "${YELLOW}Database instance already exists: $DB_INSTANCE${NC}"
else
    gcloud sql instances create $DB_INSTANCE \
        --database-version=POSTGRES_15 \
        --tier=db-f1-micro \
        --region=$REGION \
        --no-backup \
        --storage-type=PD_HDD \
        --project=$PROJECT_ID
    echo -e "${GREEN}✓ Cloud SQL instance created${NC}"
fi

# Get Cloud SQL Connection Name
CONNECTION_NAME=$(gcloud sql instances describe $DB_INSTANCE \
    --format='value(connectionName)' \
    --project=$PROJECT_ID)

echo "Connection Name: $CONNECTION_NAME"
echo ""

# Step 8: Create Database and User
echo -e "${YELLOW}[Step 8/10] Creating database and user...${NC}"

# Create database
gcloud sql databases create $DB_NAME \
    --instance=$DB_INSTANCE \
    --project=$PROJECT_ID 2>/dev/null || echo "Database already exists"

# Generate random password
DB_PASSWORD=$(openssl rand -base64 32)

# Create user
gcloud sql users create $DB_USER \
    --instance=$DB_INSTANCE \
    --password=$DB_PASSWORD \
    --project=$PROJECT_ID 2>/dev/null || echo "User already exists"

# Store password in Secret Manager
echo -n "$DB_PASSWORD" | gcloud secrets create pavilion-db-password \
    --replication-policy="automatic" \
    --data-file=- \
    --project=$PROJECT_ID 2>/dev/null || \
echo -n "$DB_PASSWORD" | gcloud secrets versions add pavilion-db-password \
    --data-file=- \
    --project=$PROJECT_ID

echo -e "${GREEN}✓ Database and user created${NC}"
echo -e "${YELLOW}Password stored in Secret Manager: pavilion-db-password${NC}"
echo ""

# Step 9: Create Cloud Storage Buckets
echo -e "${YELLOW}[Step 9/10] Creating Cloud Storage buckets...${NC}"

# Media bucket
if gsutil ls -b gs://$BUCKET_MEDIA >/dev/null 2>&1; then
    echo "Media bucket already exists: gs://$BUCKET_MEDIA"
else
    gsutil mb -l $REGION gs://$BUCKET_MEDIA
    echo -e "${GREEN}✓ Media bucket created${NC}"
fi

# Static files bucket
if gsutil ls -b gs://$BUCKET_STATIC >/dev/null 2>&1; then
    echo "Static bucket already exists: gs://$BUCKET_STATIC"
else
    gsutil mb -l $REGION gs://$BUCKET_STATIC
    echo -e "${GREEN}✓ Static bucket created${NC}"
fi

# Set CORS on media bucket
cat > /tmp/cors.json << 'EOF'
[
  {
    "origin": ["http://localhost:3000", "http://localhost:8000", "http://127.0.0.1:3000", "http://127.0.0.1:8000"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "responseHeader": ["Content-Type", "x-goog-meta-uploader"],
    "maxAgeSeconds": 3600
  }
]
EOF

gsutil cors set /tmp/cors.json gs://$BUCKET_MEDIA
rm /tmp/cors.json

echo -e "${GREEN}✓ Cloud Storage buckets created with CORS configured${NC}"
echo ""

# Step 10: Create .env file
echo -e "${YELLOW}[Step 10/10] Creating .env configuration...${NC}"

cat > .env << EOF
# Google Cloud Configuration
GOOGLE_PROJECT_ID=$PROJECT_ID
GOOGLE_LOCATION=$REGION
GOOGLE_APPLICATION_CREDENTIALS=.gcp-secrets/service-account-key.json

# Cloud SQL
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}
DATABASE_SOCKET_PATH=/cloudsql/${CONNECTION_NAME}

# Cloud Storage
GCS_BUCKET_MEDIA=$BUCKET_MEDIA
GCS_BUCKET_STATIC=$BUCKET_STATIC

# Django Settings
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1,.run.app

# Vertex AI
VERTEX_AI_MODEL=gemini-2.0-flash-exp
VERTEX_AI_EMBEDDING_MODEL=text-embedding-004

# Optional: API Keys (if still using some external services)
# OPENAI_API_KEY=
# ELEVENLABS_API_KEY=
# D_ID_API_KEY=
EOF

echo -e "${GREEN}✓ .env file created${NC}"
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Week 0 Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Important Information:${NC}"
echo "Project ID:              $PROJECT_ID"
echo "Service Account:         $SA_EMAIL"
echo "Cloud SQL Instance:      $DB_INSTANCE"
echo "Cloud SQL Connection:    $CONNECTION_NAME"
echo "Database Name:           $DB_NAME"
echo "Media Bucket:            gs://$BUCKET_MEDIA"
echo "Static Bucket:           gs://$BUCKET_STATIC"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Update .env with correct DATABASE_URL if needed"
echo "2. Start Cloud SQL Proxy:"
echo "   cloud_sql_proxy -instances=${CONNECTION_NAME}=tcp:5432 &"
echo "3. Run migrations:"
echo "   cd backend && python manage.py migrate"
echo "4. Start development server:"
echo "   python manage.py runserver"
echo ""
echo -e "${RED}⚠ Important Security Notes:${NC}"
echo "- Keep .gcp-secrets/service-account-key.json SECRET"
echo "- Add to .gitignore: .env, .gcp-secrets/"
echo "- Store DB password in .env locally only (not in git)"
echo "- Use Cloud Secret Manager for production secrets"
echo ""
echo -e "${YELLOW}Documentation:${NC}"
echo "See SETUP.md for detailed setup instructions"
echo "See infrastructure/gcp-setup.md for GCP configuration details"
echo ""
