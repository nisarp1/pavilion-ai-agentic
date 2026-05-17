#!/usr/bin/env bash
# =============================================================================
# Pavilion AI — Fill Secret Manager with your actual API keys
# Run this once after setup_infra.sh
# =============================================================================
set -euo pipefail

PROJECT="pavilion-ai-agentic-v2"

update_secret() {
  local name="$1" value="$2"
  printf '%s' "$value" | gcloud secrets versions add "$name" \
    --data-file=- \
    --project="$PROJECT"
  echo "  ✓ $name"
}

echo "=== Filling Pavilion AI secrets in Secret Manager ==="
echo

# ── Upstash Redis ─────────────────────────────────────────────────────────────
# 1. Go to https://upstash.com → Create Database → Region: ap-south-1 (Mumbai)
# 2. Copy the "Redis URL" (starts with rediss://)
# 3. Paste it below — same URL for both (different DB indexes don't exist in Upstash free tier)
UPSTASH_REDIS_URL="PASTE_UPSTASH_REDIS_URL_HERE"       # rediss://:<token>@<host>:6380

# ── API Keys ──────────────────────────────────────────────────────────────────
GEMINI_API_KEY="PASTE_YOUR_GEMINI_API_KEY_HERE"

# Service account JSON — flatten with: cat your-key.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)))"
GOOGLE_CREDENTIALS_JSON="PASTE_SINGLE_LINE_SA_JSON_HERE"

ELEVENLABS_API_KEY="PASTE_YOUR_ELEVENLABS_KEY_HERE"
GOOGLE_CUSTOM_SEARCH_API_KEY="PASTE_YOUR_CUSTOM_SEARCH_KEY_HERE"
GOOGLE_CUSTOM_SEARCH_ENGINE_ID="PASTE_YOUR_SEARCH_ENGINE_ID_HERE"

# From Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs
GOOGLE_OAUTH_CLIENT_ID="PASTE_YOUR_GOOGLE_OAUTH_CLIENT_ID_HERE"

# ── Validate none are still placeholder ──────────────────────────────────────
for VAR in UPSTASH_REDIS_URL GEMINI_API_KEY GOOGLE_CREDENTIALS_JSON \
           ELEVENLABS_API_KEY GOOGLE_CUSTOM_SEARCH_API_KEY \
           GOOGLE_CUSTOM_SEARCH_ENGINE_ID GOOGLE_OAUTH_CLIENT_ID; do
  val="${!VAR}"
  if [[ "$val" == "PASTE_"* || "$val" == "REPLACE_ME"* ]]; then
    echo "ERROR: $VAR is still a placeholder. Edit this file before running."
    exit 1
  fi
done

# ── Upload to Secret Manager ──────────────────────────────────────────────────
update_secret "pavilion-redis-url"               "$UPSTASH_REDIS_URL"
update_secret "pavilion-redis-cache-url"         "$UPSTASH_REDIS_URL"
update_secret "pavilion-gemini-api-key"          "$GEMINI_API_KEY"
update_secret "pavilion-google-credentials-json" "$GOOGLE_CREDENTIALS_JSON"
update_secret "pavilion-elevenlabs-api-key"       "$ELEVENLABS_API_KEY"
update_secret "pavilion-custom-search-api-key"    "$GOOGLE_CUSTOM_SEARCH_API_KEY"
update_secret "pavilion-custom-search-engine-id"  "$GOOGLE_CUSTOM_SEARCH_ENGINE_ID"
update_secret "pavilion-google-oauth-client-id"   "$GOOGLE_OAUTH_CLIENT_ID"

echo
echo "All secrets updated."
echo "Next:  git push origin main  (triggers Cloud Build deploy)"
