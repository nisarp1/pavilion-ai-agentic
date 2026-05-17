#!/usr/bin/env bash
# =============================================================================
# Pavilion AI — GCP Infrastructure Setup (run ONCE)
# =============================================================================
# Usage: bash deploy/setup_infra.sh
# Prereqs:
#   - gcloud auth login && gcloud auth application-default login
#   - gcloud config set project pavilion-ai-agentic-v2
# =============================================================================
set -euo pipefail

PROJECT="pavilion-ai-agentic-v2"
REGION="asia-south1"
VPC_NETWORK="default"
VPC_CONNECTOR="pavilion-vpc-connector"
VPC_CONNECTOR_RANGE="10.8.0.0/28"
SQL_INSTANCE="pavilion-newsai-db"
SQL_TIER="db-g1-small"          # ~$25/mo — upgrade to db-n1-standard-2 later
REDIS_INSTANCE="pavilion-newsai-redis"
REDIS_SIZE=1                    # GB
GCS_BUCKET="pavilion-newsai-media"
ARTIFACT_REPO="pavilion-images"
SA_NAME="pavilion-cloudrun"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

# ── Pretty print helpers ──────────────────────────────────────────────────────
step() { echo; echo "▶ $1"; }
ok()   { echo "  ✓ $1"; }

step "Setting active project"
gcloud config set project "$PROJECT"

# ── Enable required APIs ──────────────────────────────────────────────────────
step "Enabling GCP APIs (takes ~2 minutes first run)"
gcloud services enable \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  vpcaccess.googleapis.com \
  servicenetworking.googleapis.com \
  --project="$PROJECT"
ok "APIs enabled"

# ── Artifact Registry ─────────────────────────────────────────────────────────
step "Creating Artifact Registry repository"
gcloud artifacts repositories create "$ARTIFACT_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Pavilion AI Docker images" \
  --project="$PROJECT" 2>/dev/null || ok "Already exists"

# ── Service Account ───────────────────────────────────────────────────────────
step "Creating Cloud Run service account"
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Pavilion Cloud Run SA" \
  --project="$PROJECT" 2>/dev/null || ok "Already exists"

for ROLE in \
  roles/cloudsql.client \
  roles/storage.objectAdmin \
  roles/secretmanager.secretAccessor \
  roles/run.invoker \
  roles/logging.logWriter \
  roles/monitoring.metricWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" --quiet
done
ok "Service account configured"

# Allow Cloud Build SA to deploy Cloud Run and use the app SA
CLOUDBUILD_SA="${PROJECT}@cloudbuild.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/run.admin" --quiet
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project="$PROJECT" --quiet
ok "Cloud Build permissions set"

# ── Serverless VPC Connector ──────────────────────────────────────────────────
step "Creating Serverless VPC connector (needed for Memorystore access)"
gcloud compute networks vpc-access connectors create "$VPC_CONNECTOR" \
  --region="$REGION" \
  --network="$VPC_NETWORK" \
  --range="$VPC_CONNECTOR_RANGE" \
  --project="$PROJECT" 2>/dev/null || ok "Already exists"

# ── Cloud SQL (PostgreSQL 15) ─────────────────────────────────────────────────
step "Creating Cloud SQL instance (PostgreSQL 15) — this takes 3-5 minutes"
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=POSTGRES_15 \
  --tier="$SQL_TIER" \
  --region="$REGION" \
  --storage-type=SSD \
  --storage-size=20GB \
  --storage-auto-increase \
  --backup-start-time=02:00 \
  --enable-point-in-time-recovery \
  --no-assign-ip \
  --network="projects/${PROJECT}/global/networks/${VPC_NETWORK}" \
  --project="$PROJECT" 2>/dev/null || ok "Already exists"

# Create database
gcloud sql databases create pavilion_newsai \
  --instance="$SQL_INSTANCE" \
  --project="$PROJECT" 2>/dev/null || ok "DB already exists"

# Create app user (password will be set and stored in Secret Manager next)
DB_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
gcloud sql users create pavilion_app \
  --instance="$SQL_INSTANCE" \
  --password="$DB_PASSWORD" \
  --project="$PROJECT" 2>/dev/null || {
    ok "User exists — resetting password"
    gcloud sql users set-password pavilion_app \
      --instance="$SQL_INSTANCE" \
      --password="$DB_PASSWORD" \
      --project="$PROJECT"
  }

# Get the private IP of the SQL instance
SQL_PRIVATE_IP=$(gcloud sql instances describe "$SQL_INSTANCE" \
  --project="$PROJECT" \
  --format="value(ipAddresses[0].ipAddress)" 2>/dev/null || echo "pending")
ok "Cloud SQL ready — private IP: ${SQL_PRIVATE_IP}"

# ── Memorystore Redis ─────────────────────────────────────────────────────────
step "Creating Memorystore Redis instance — this takes 3-5 minutes"
gcloud redis instances create "$REDIS_INSTANCE" \
  --size="$REDIS_SIZE" \
  --region="$REGION" \
  --network="projects/${PROJECT}/global/networks/${VPC_NETWORK}" \
  --redis-version=redis_7_0 \
  --tier=BASIC \
  --project="$PROJECT" 2>/dev/null || ok "Already exists"

REDIS_IP=$(gcloud redis instances describe "$REDIS_INSTANCE" \
  --region="$REGION" \
  --project="$PROJECT" \
  --format="value(host)" 2>/dev/null || echo "pending")
ok "Redis ready — private IP: ${REDIS_IP}"

# ── GCS Media Bucket ──────────────────────────────────────────────────────────
step "Creating GCS media bucket"
gcloud storage buckets create "gs://${GCS_BUCKET}" \
  --location="$REGION" \
  --uniform-bucket-level-access \
  --project="$PROJECT" 2>/dev/null || ok "Already exists"

# Allow public read for media files (images, audio, video)
gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
  --member="allUsers" \
  --role="roles/storage.objectViewer" 2>/dev/null || true
ok "GCS bucket ready"

# ── Secret Manager — store all secrets ───────────────────────────────────────
step "Creating Secret Manager secrets"
DJANGO_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")

create_secret() {
  local name="$1" value="$2"
  echo "$value" | gcloud secrets create "$name" \
    --data-file=- \
    --project="$PROJECT" 2>/dev/null || \
  echo "$value" | gcloud secrets versions add "$name" \
    --data-file=- \
    --project="$PROJECT"
}

create_secret "pavilion-secret-key"          "$DJANGO_SECRET"
create_secret "pavilion-db-user"             "pavilion_app"
create_secret "pavilion-db-password"         "$DB_PASSWORD"
create_secret "pavilion-db-name"             "pavilion_newsai"
create_secret "pavilion-gemini-api-key"      "REPLACE_ME"
create_secret "pavilion-google-credentials-json" "REPLACE_ME"
create_secret "pavilion-elevenlabs-api-key"  "REPLACE_ME"
create_secret "pavilion-custom-search-api-key"    "REPLACE_ME"
create_secret "pavilion-custom-search-engine-id"  "REPLACE_ME"
create_secret "pavilion-google-oauth-client-id"   "REPLACE_ME"
ok "Secrets created (fill REPLACE_ME values — see deploy/fill_secrets.sh)"

# ── Cloud Build trigger ───────────────────────────────────────────────────────
step "Creating Cloud Build trigger (push to main)"
gcloud builds triggers create github \
  --name="pavilion-main-deploy" \
  --repo-name="pavilion-ai-agentic" \
  --repo-owner="$(gcloud config get-value account | cut -d@ -f1)" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --project="$PROJECT" 2>/dev/null || ok "Trigger already exists"

# ── Print summary ─────────────────────────────────────────────────────────────
echo
echo "════════════════════════════════════════════════════════════════"
echo " Infrastructure setup complete!"
echo "════════════════════════════════════════════════════════════════"
echo " Cloud SQL private IP : ${SQL_PRIVATE_IP}"
echo " Redis private IP     : ${REDIS_IP}"
echo " GCS bucket           : gs://${GCS_BUCKET}"
echo " Artifact Registry    : ${REGION}-docker.pkg.dev/${PROJECT}/${ARTIFACT_REPO}"
echo
echo " NEXT STEPS:"
echo " 1. Run  bash deploy/fill_secrets.sh  to set API keys in Secret Manager"
echo " 2. Update cloudbuild.yaml substitutions:"
echo "      _REDIS_URL       = redis://${REDIS_IP}:6379/0"
echo "      _REDIS_CACHE_URL = redis://${REDIS_IP}:6379/1"
echo " 3. Connect GitHub repo to Cloud Build in the GCP console"
echo " 4. git push origin main  — first deploy triggers automatically"
echo " 5. Run  bash deploy/setup_domain.sh  to map newsai.pavilionend.in"
echo "════════════════════════════════════════════════════════════════"
