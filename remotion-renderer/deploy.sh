#!/usr/bin/env bash
# One-shot deploy script — builds the image locally and deploys to Cloud Run.
# Prerequisites: gcloud CLI authenticated, Docker running, Artifact Registry enabled.
#
# Usage: bash deploy.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-your-gcp-project-id}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${CLOUD_RUN_SERVICE:-pavilion-remotion-renderer}"
GCS_BUCKET="${GCS_BUCKET_NAME:-your-gcs-bucket}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE}:latest"

echo "==> Building Docker image: ${IMAGE}"
docker build -t "${IMAGE}" .

echo "==> Pushing to GCR..."
docker push "${IMAGE}"

echo "==> Deploying to Cloud Run (${REGION})..."
gcloud run deploy "${SERVICE}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --memory=4Gi \
  --cpu=4 \
  --timeout=600 \
  --concurrency=1 \
  --max-instances=10 \
  --no-allow-unauthenticated \
  --set-env-vars="GCS_BUCKET_NAME=${GCS_BUCKET}" \
  --project="${PROJECT_ID}"

SERVICE_URL=$(gcloud run services describe "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)")

echo ""
echo "✓ Deployed: ${SERVICE_URL}"
echo ""
echo "Add to your .env:"
echo "  CLOUD_RUN_RENDERER_URL=${SERVICE_URL}"
echo ""
echo "Grant your Django service-account invoker access:"
echo "  gcloud run services add-iam-policy-binding ${SERVICE} \\"
echo "    --region=${REGION} \\"
echo "    --member=serviceAccount:<your-sa>@${PROJECT_ID}.iam.gserviceaccount.com \\"
echo "    --role=roles/run.invoker"
