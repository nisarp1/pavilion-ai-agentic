# 🚀 Quick Fix Guide - CloudRun Deployment

## TL;DR
Your GitHub Actions deployment is failing because GitHub can't authenticate with GCP. You need to add 3 secrets to GitHub.

---

## What to Do Right Now (20 minutes)

### Step 1️⃣: Open GCP Console
```
https://console.cloud.google.com
Project: pavilion-ai-agentic
```

### Step 2️⃣: Create Workload Identity Setup
Use the **gcloud CLI** on your machine (recommended):

```bash
# On your Mac in terminal, run these commands:
gcloud auth login
gcloud config set project pavilion-ai-agentic

# Copy and paste this entire script:
PROJECT_ID="pavilion-ai-agentic"
POOL_ID="github-pool"
PROVIDER_ID="github-provider"
SERVICE_ACCOUNT="pavilion-agentic"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"

# 1. Create Workload Identity Pool
gcloud iam workload-identity-pools create $POOL_ID \
    --project=$PROJECT_ID \
    --location=us-central1 \
    --display-name="GitHub Actions Pool" 2>/dev/null || echo "Pool exists"

# 2. Create OIDC Provider
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_ID \
    --project=$PROJECT_ID \
    --location=us-central1 \
    --workload-identity-pool=$POOL_ID \
    --display-name="GitHub Provider" \
    --attribute-mapping="google.subject=assertion.sub,assertion.aud=assertion.aud" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-condition="assertion.aud == '$PROJECT_ID'" 2>/dev/null || echo "Provider exists"

# 3. Create service account
gcloud iam service-accounts create $SERVICE_ACCOUNT \
    --project=$PROJECT_ID \
    --display-name="Pavilion Agentic CI/CD" 2>/dev/null || echo "Service account exists"

# 4. Grant necessary roles
for role in roles/run.admin roles/artifactregistry.admin roles/cloudsql.admin roles/storage.admin; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="$role" \
        --quiet 2>/dev/null || true
done

# 5. Link GitHub to service account
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT_EMAIL \
    --project=$PROJECT_ID \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/projects/$PROJECT_ID/locations/us-central1/workloadIdentityPools/$POOL_ID/attribute.repository/nisarp1/pavilion-ai-agentic" \
    --quiet 2>/dev/null || true

# 6. Get the WIF Provider resource name
WIF_PROVIDER=$(gcloud iam workload-identity-pools providers describe $PROVIDER_ID \
    --project=$PROJECT_ID \
    --location=us-central1 \
    --workload-identity-pool=$POOL_ID \
    --format="value(name)")

echo ""
echo "✅ Setup complete! Add these secrets to GitHub:"
echo ""
echo "1. GOOGLE_PROJECT_ID"
echo "   Value: $PROJECT_ID"
echo ""
echo "2. WIF_PROVIDER"
echo "   Value: $WIF_PROVIDER"
echo ""
echo "3. WIF_SERVICE_ACCOUNT"
echo "   Value: $SERVICE_ACCOUNT_EMAIL"
```

### Step 3️⃣: Add Secrets to GitHub

Go to:
```
https://github.com/nisarp1/pavilion-ai-agentic/settings/secrets/actions
```

Click **New repository secret** and add:

| Secret Name | Value |
|---|---|
| `GOOGLE_PROJECT_ID` | `pavilion-ai-agentic` |
| `WIF_PROVIDER` | `projects/XXXXX/locations/us-central1/workloadIdentityPools/github-pool/providers/github-provider` |
| `WIF_SERVICE_ACCOUNT` | `pavilion-agentic@pavilion-ai-agentic.iam.gserviceaccount.com` |

(Use values from the gcloud script output above)

### Step 4️⃣: Test It
```bash
cd /Applications/MAMP/htdocs/pavilion-ai-agentic
git commit --allow-empty -m "Test CloudRun deployment"
git push origin main
```

Then check:
```
https://github.com/nisarp1/pavilion-ai-agentic/actions
```

Should see ✅ on "Deploy to Cloud Run"

---

## If Something Goes Wrong

### Error: "gcloud: command not found"
```bash
# Install or update gcloud
brew install --cask google-cloud-sdk
```

### Error: "Project not found"
```bash
# List your projects
gcloud projects list

# Make sure project ID is correct
gcloud config set project pavilion-ai-agentic
```

### Error: "Already exists"
That's fine! The script handles it. Just continue.

### GitHub secret still not working?
- Check the values have **no extra spaces**
- Re-push a test commit
- Check the Actions tab for detailed error logs

---

## Optional: Fix Deprecated Actions

Update `.github/workflows/deploy-cloud-run.yml`:

Change:
```yaml
google-github-actions/setup-gcloud@v1
google-github-actions/auth@v1
```

To:
```yaml
google-github-actions/setup-gcloud@v2
google-github-actions/auth@v2
```

---

## Full Documentation

For detailed info, see:
- 📖 `GITHUB_ACTIONS_SETUP.md` - Complete step-by-step guide
- 📊 `CLOUDRUN_DEBUG_SUMMARY.md` - Overview & status
- 🚀 `DEPLOYMENT_READY.md` - Full deployment guide

---

## Status

| Task | Status |
|------|--------|
| Clone repo | ✅ Done |
| GCP setup | ✅ Done |
| GitHub secrets | ⏳ **DO THIS NOW** |
| Test deployment | ⏳ Next |
| Database setup | ⏸️ Later |
| Production ready | ⏸️ Later |

---

**Estimated time to fix**: 20-30 minutes ⏱️

Go! 🚀

