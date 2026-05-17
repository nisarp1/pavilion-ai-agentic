#!/usr/bin/env bash
# =============================================================================
# Pavilion AI — Map newsai.pavilionend.in to Cloud Run
# Run AFTER first successful deploy (pavilion-web service must exist)
# =============================================================================
set -euo pipefail

PROJECT="pavilion-ai-agentic-v2"
REGION="asia-south1"
SERVICE="pavilion-web"
DOMAIN="newsai.pavilionend.in"

echo "=== Mapping ${DOMAIN} → Cloud Run service: ${SERVICE} ==="

# Request domain mapping
gcloud beta run domain-mappings create \
  --service="$SERVICE" \
  --domain="$DOMAIN" \
  --region="$REGION" \
  --project="$PROJECT"

echo
echo "Domain mapping created. Get the DNS records to add:"
gcloud beta run domain-mappings describe \
  --domain="$DOMAIN" \
  --region="$REGION" \
  --project="$PROJECT"

echo
echo "════════════════════════════════════════════════════════════════"
echo " ACTION REQUIRED — add this DNS record at your domain registrar:"
echo
echo "  Type : CNAME"
echo "  Name : newsai"
echo "  Value: ghs.googlehosted.com"
echo
echo " (or use the AAAA/A records shown above if CNAME is not supported)"
echo
echo " SSL certificate is provisioned automatically after DNS propagates."
echo " This takes 15-30 minutes after DNS update."
echo "════════════════════════════════════════════════════════════════"
