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
  echo "  ✓ $name updated"
}

echo "=== Filling Pavilion AI secrets in Secret Manager ==="
echo "Project: $PROJECT"
echo

# ── Paste your keys below ─────────────────────────────────────────────────────

GEMINI_API_KEY="PASTE_YOUR_GEMINI_API_KEY_HERE"

# Full service account JSON (the content of your .json key file, all on one line)
# Tip: cat your-key.json | tr -d '\n' to flatten it
GOOGLE_CREDENTIALS_JSON="PASTE_YOUR_FULL_SA_JSON_HERE"

ELEVENLABS_API_KEY="PASTE_YOUR_ELEVENLABS_KEY_HERE"

GOOGLE_CUSTOM_SEARCH_API_KEY="PASTE_YOUR_CUSTOM_SEARCH_KEY_HERE"
GOOGLE_CUSTOM_SEARCH_ENGINE_ID="PASTE_YOUR_SEARCH_ENGINE_ID_HERE"

# From Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs
GOOGLE_OAUTH_CLIENT_ID="PASTE_YOUR_GOOGLE_OAUTH_CLIENT_ID_HERE"

# ─────────────────────────────────────────────────────────────────────────────

# Validate none are still placeholder
for VAR_NAME in GEMINI_API_KEY GOOGLE_CREDENTIALS_JSON ELEVENLABS_API_KEY \
                GOOGLE_CUSTOM_SEARCH_API_KEY GOOGLE_CUSTOM_SEARCH_ENGINE_ID \
                GOOGLE_OAUTH_CLIENT_ID; do
  val="${!VAR_NAME}"
  if [[ "$val" == "PASTE_"* || "$val" == "REPLACE_ME" ]]; then
    echo "ERROR: $VAR_NAME is still a placeholder. Edit this file first."
    exit 1
  fi
done

update_secret "pavilion-gemini-api-key"           "$GEMINI_API_KEY"
update_secret "pavilion-google-credentials-json"  "$GOOGLE_CREDENTIALS_JSON"
update_secret "pavilion-elevenlabs-api-key"        "$ELEVENLABS_API_KEY"
update_secret "pavilion-custom-search-api-key"     "$GOOGLE_CUSTOM_SEARCH_API_KEY"
update_secret "pavilion-custom-search-engine-id"   "$GOOGLE_CUSTOM_SEARCH_ENGINE_ID"
update_secret "pavilion-google-oauth-client-id"    "$GOOGLE_OAUTH_CLIENT_ID"

echo
echo "All secrets updated. Next: git push origin main to trigger a deploy."
