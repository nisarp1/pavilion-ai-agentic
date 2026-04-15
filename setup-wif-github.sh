#!/bin/bash

# Configuration
PROJECT_ID="pavilion-ai-agentic"
POOL_ID="github-pool"
POOL_DISPLAY_NAME="GitHub Actions Pool"
PROVIDER_ID="github-provider"
SERVICE_ACCOUNT="pavilion-agentic"
REPO_OWNER="nisarp1"
REPO_NAME="pavilion-ai-agentic"
REGION="us-central1"

echo "Setting up Workload Identity Federation for GitHub Actions..."
echo "Project: $PROJECT_ID"
echo "Repository: $REPO_OWNER/$REPO_NAME"
echo ""

# Step 1: Create Workload Identity Pool
echo "[1/5] Creating Workload Identity Pool..."
gcloud iam workload-identity-pools create $POOL_ID \
    --project=$PROJECT_ID \
    --location=$REGION \
    --display-name=$POOL_DISPLAY_NAME \
    --disabled=false 2>&1 | grep -v "already exists" || true

# Step 2: Create Workload Identity Provider for GitHub
echo "[2/5] Creating GitHub provider..."
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_ID \
    --project=$PROJECT_ID \
    --location=$REGION \
    --workload-identity-pool=$POOL_ID \
    --display-name="GitHub Provider" \
    --attribute-mapping="google.subject=assertion.sub,assertion.aud=assertion.aud" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-condition="assertion.aud == '$PROJECT_ID'" \
    --disabled=false 2>&1 | grep -v "already exists" || true

# Step 3: Get the Workload Identity Provider resource name
echo "[3/5] Getting provider resource name..."
WIF_PROVIDER=$(gcloud iam workload-identity-pools providers describe $PROVIDER_ID \
    --project=$PROJECT_ID \
    --location=$REGION \
    --workload-identity-pool=$POOL_ID \
    --format="value(name)")

echo "WIF Provider: $WIF_PROVIDER"

# Step 4: Create service account (if not exists)
echo "[4/5] Setting up service account..."
gcloud iam service-accounts create $SERVICE_ACCOUNT \
    --project=$PROJECT_ID \
    --display-name="Pavilion Agentic Service Account" 2>&1 | grep -v "already exists" || true

SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant IAM roles
echo "[5/5] Granting IAM roles..."
ROLES=(
    "roles/run.admin"
    "roles/artifactregistry.admin"
    "roles/cloudsql.admin"
    "roles/storage.admin"
    "roles/cloudkms.admin"
    "roles/aiplatform.admin"
    "roles/iam.securityAdmin"
)

for ROLE in "${ROLES[@]}"; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="$ROLE" \
        --quiet 2>&1 | grep -v "already exists" || true
done

# Set up Workload Identity binding
echo "Setting up Workload Identity binding..."
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT_EMAIL \
    --project=$PROJECT_ID \
    --role="roles/iam.workloadIdentityUser" \
    --principal="principalSet://iam.googleapis.com/projects/$PROJECT_ID/locations/$REGION/workloadIdentityPools/$POOL_ID/attribute.repository/$REPO_OWNER/$REPO_NAME" \
    --quiet 2>&1 | grep -v "already exists" || true

# Output GitHub Secrets
echo ""
echo "============================================================"
echo "GitHub Secrets Setup"
echo "============================================================"
echo ""
echo "Add these 3 secrets to GitHub repository:"
echo "https://github.com/$REPO_OWNER/$REPO_NAME/settings/secrets/actions"
echo ""
echo "1. GOOGLE_PROJECT_ID"
echo "   Value: $PROJECT_ID"
echo ""
echo "2. WIF_PROVIDER"
echo "   Value: $WIF_PROVIDER"
echo ""
echo "3. WIF_SERVICE_ACCOUNT"
echo "   Value: $SERVICE_ACCOUNT_EMAIL"
echo ""
echo "============================================================"
