#!/usr/bin/env bash
# One-shot local deploy script — builds the image and deploys to Cloud Run.
# Normally triggered via GitHub Actions (deploy-remotion.yml).
# Prerequisites: gcloud CLI authenticated with sufficient permissions, Docker running.
#
# Usage: bash deploy.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-pavilion-ai-agentic-v2}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-pavilion-remotion-renderer}"
GCS_BUCKET="${GCS_BUCKET_NAME:-pavilion-media}"
REGISTRY="us-central1-docker.pkg.dev"
REPOSITORY="pavilion-agentic-app"
IMAGE="${REGISTRY}/${PROJECT_ID}/${REPOSITORY}/${SERVICE}"

echo "==> Configuring Docker for Artifact Registry..."
gcloud auth configure-docker "${REGISTRY}"

echo "==> Building Docker image: ${IMAGE}:latest"
docker build -t "${IMAGE}:latest" .

echo "==> Pushing to Artifact Registry..."
docker push "${IMAGE}:latest"

echo "==> Deploying to Cloud Run (${REGION})..."
gcloud run deploy "${SERVICE}" \
  --image="${IMAGE}:latest" \
  --region="${REGION}" \
  --platform=managed \
  --memory=4Gi \
  --cpu=4 \
  --timeout=600 \
  --concurrency=1 \
  --max-instances=10 \
  --no-allow-unauthenticated \
  --set-env-vars="GCS_BUCKET_NAME=${GCS_BUCKET}" \
  --service-account="pavilion-agentic@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}"

SERVICE_URL=$(gcloud run services describe "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)")

echo ""
echo "✓ Deployed: ${SERVICE_URL}"
echo ""
echo "Set in backend/.env:"
echo "  CLOUD_RUN_RENDERER_URL=${SERVICE_URL}"
echo ""
echo "Grant invoker access to the backend service account if needed:"
echo "  gcloud run services add-iam-policy-binding ${SERVICE} \\"
echo "    --region=${REGION} \\"
echo "    --member=serviceAccount:pavilion-agentic@${PROJECT_ID}.iam.gserviceaccount.com \\"
echo "    --role=roles/run.invoker"
