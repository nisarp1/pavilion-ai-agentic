#!/usr/bin/env bash
# =============================================================================
# Pavilion AI — GCP Infrastructure Setup (run ONCE)
# Cost-optimised for beta: ~$35-45/month
#   - Cloud SQL f1-micro  $7.50  (upgrade to g1-small when traffic grows)
#   - Upstash Redis        $0    (free tier; see fill_secrets.sh)
#   - No VPC connector     $0    (not needed — Cloud SQL uses socket, Redis is public)
#   - Cloud Run (3 svcs)  ~$20   (min-instances idle billing)
# =============================================================================
set -euo pipefail

PROJECT="pavilion-ai-agentic-v2"
REGION="asia-south1"
SQL_INSTANCE="pavilion-newsai-db"
SQL_TIER="db-f1-micro"             # $7.50/mo — upgrade to db-g1-small at scale
GCS_BUCKET="pavilion-newsai-media"
ARTIFACT_REPO="pavilion-images"
SA_NAME="pavilion-cloudrun"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

step() { echo; echo "▶ $1"; }
ok()   { echo "  ✓ $1"; }

step "Setting active project"
gcloud config set project "$PROJECT"

# ── Enable required APIs ──────────────────────────────────────────────────────
step "Enabling GCP APIs"
gcloud services enable \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT"
ok "APIs enabled"

# ── Artifact Registry ─────────────────────────────────────────────────────────
step "Creating Artifact Registry repository"
gcloud artifacts repositories create "$ARTIFACT_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Pavilion AI Docker images" \
  --project="$PROJECT" 2>/dev/null || ok "Already exists"

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
ok "Artifact Registry ready"

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

# Allow Cloud Build SA to deploy Cloud Run and impersonate the app SA
CLOUDBUILD_SA="$(gcloud projects describe $PROJECT --format='value(projectNumber)')@cloudbuild.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/run.admin" --quiet
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/artifactregistry.writer" --quiet
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project="$PROJECT" --quiet
ok "Cloud Build permissions set"

# ── Cloud SQL (PostgreSQL 15) ─────────────────────────────────────────────────
step "Creating Cloud SQL instance (db-f1-micro, ~\$7.50/mo) — takes 3-5 min"
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=POSTGRES_15 \
  --tier="$SQL_TIER" \
  --region="$REGION" \
  --storage-type=SSD \
  --storage-size=10GB \
  --storage-auto-increase \
  --backup-start-time=02:00 \
  --project="$PROJECT" 2>/dev/null || ok "Already exists"

gcloud sql databases create pavilion_newsai \
  --instance="$SQL_INSTANCE" \
  --project="$PROJECT" 2>/dev/null || ok "DB already exists"

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
ok "Cloud SQL ready"

# ── GCS Media Bucket ──────────────────────────────────────────────────────────
step "Creating GCS media bucket"
gcloud storage buckets create "gs://${GCS_BUCKET}" \
  --location="$REGION" \
  --uniform-bucket-level-access \
  --project="$PROJECT" 2>/dev/null || ok "Already exists"

# Public read for media files (images, audio, rendered videos)
gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
  --member="allUsers" \
  --role="roles/storage.objectViewer" 2>/dev/null || true
ok "GCS bucket ready"

# ── Secret Manager ────────────────────────────────────────────────────────────
step "Creating Secret Manager secrets"
DJANGO_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")

create_secret() {
  local name="$1" value="$2"
  printf '%s' "$value" | gcloud secrets create "$name" \
    --data-file=- --project="$PROJECT" 2>/dev/null || \
  printf '%s' "$value" | gcloud secrets versions add "$name" \
    --data-file=- --project="$PROJECT"
}

create_secret "pavilion-secret-key"   "$DJANGO_SECRET"
create_secret "pavilion-db-user"      "pavilion_app"
create_secret "pavilion-db-password"  "$DB_PASSWORD"
create_secret "pavilion-db-name"      "pavilion_newsai"

# Redis secrets — filled by fill_secrets.sh after you set up Upstash
create_secret "pavilion-redis-url"        "REPLACE_ME_WITH_UPSTASH_URL"
create_secret "pavilion-redis-cache-url"  "REPLACE_ME_WITH_UPSTASH_URL"

# API key placeholders — filled by fill_secrets.sh
create_secret "pavilion-gemini-api-key"           "REPLACE_ME"
create_secret "pavilion-google-credentials-json"  "REPLACE_ME"
create_secret "pavilion-elevenlabs-api-key"        "REPLACE_ME"
create_secret "pavilion-custom-search-api-key"     "REPLACE_ME"
create_secret "pavilion-custom-search-engine-id"   "REPLACE_ME"
create_secret "pavilion-google-oauth-client-id"    "REPLACE_ME"
ok "Secrets scaffold created"

# ── Cloud Build trigger ───────────────────────────────────────────────────────
step "Creating Cloud Build trigger (push to main)"
gcloud builds triggers create github \
  --name="pavilion-main-deploy" \
  --repo-name="pavilion-ai-agentic" \
  --repo-owner="nisarp1" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --project="$PROJECT" 2>/dev/null || ok "Trigger already exists"

# ── Print summary ─────────────────────────────────────────────────────────────
echo
echo "════════════════════════════════════════════════════════════════"
echo " Infrastructure ready!   Monthly cost estimate: ~\$35-45"
echo "════════════════════════════════════════════════════════════════"
echo " Cloud SQL instance : ${PROJECT}:${REGION}:${SQL_INSTANCE}"
echo " GCS bucket         : gs://${GCS_BUCKET}"
echo " Artifact Registry  : ${REGION}-docker.pkg.dev/${PROJECT}/${ARTIFACT_REPO}"
echo
echo " NEXT STEPS:"
echo " 1. Create a FREE Upstash Redis account at https://upstash.com"
echo "    Copy the 'rediss://...' URL (with TLS)"
echo " 2. Run:  bash deploy/fill_secrets.sh"
echo "    (fill your API keys + Upstash URL)"
echo " 3. Connect GitHub in Cloud Build console:"
echo "    https://console.cloud.google.com/cloud-build/triggers?project=${PROJECT}"
echo " 4. git push origin main  — first deploy starts automatically"
echo " 5. After first deploy, run:  bash deploy/setup_domain.sh"
echo "════════════════════════════════════════════════════════════════"
