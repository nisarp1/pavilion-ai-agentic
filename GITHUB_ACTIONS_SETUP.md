# GitHub Actions Setup Guide for CloudRun Deployment

## Problem
Your GitHub Actions deployment to Cloud Run is failing with authentication error:
```
No authentication found for gcloud, authenticate with `google-github-actions/auth`.
```

This happens because the required GitHub Secrets are not configured in your repository.

---

## Solution: Set Up Workload Identity Federation (Recommended - Keyless Auth)

### Why Workload Identity Federation?
- ✅ **No JSON keys** to manage or rotate
- ✅ **Secure** - GitHub can't access your GCP credentials
- ✅ **Automatic** - GitHub Actions automatically exchanges its token for a GCP token
- ✅ **Scalable** - Works across multiple repositories

---

## Step 1: Open GCP Console

Go to: https://console.cloud.google.com

Make sure you're in project: **pavilion-ai-agentic**

---

## Step 2: Create Workload Identity Pool

1. Navigate to: **Security** → **Workload Identity Federation** (or search for "Workload Identity")
2. Click **Create Pool**
3. Fill in:
   - **Pool ID**: `github-pool`
   - **Display name**: `GitHub Actions Pool`
   - **Location**: `us-central1`
4. Click **Create**

---

## Step 3: Create OIDC Provider

1. Click on the pool you just created (`github-pool`)
2. Click **Create Provider**
3. Select **OpenID Connect (OIDC)** and click **Create**
4. Fill in:
   - **Provider ID**: `github-provider`
   - **Issuer (URI)**: `https://token.actions.githubusercontent.com`
   - **Audiences**: `pavilion-ai-agentic` (your project ID)
5. Click **Create**

---

## Step 4: Configure Attribute Mapping

1. Click on the provider you just created
2. Click **Edit**
3. Set **Attribute Mapping**:
   ```
   google.subject=assertion.sub
   assertion.aud=assertion.aud
   ```
4. Set **Attribute Condition**:
   ```
   assertion.aud == 'pavilion-ai-agentic'
   ```
5. Click **Save**

---

## Step 5: Create Service Account

1. Go to: **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Fill in:
   - **Service account name**: `pavilion-agentic`
   - **Service account ID**: `pavilion-agentic`
   - **Description**: `Pavilion Agentic CD/CI for GitHub Actions`
4. Click **Create and Continue**
5. Grant roles:
   - `Cloud Run Admin`
   - `Artifact Registry Administrator`
   - `Cloud SQL Admin`
   - `Storage Admin`
6. Click **Continue** then **Done**

---

## Step 6: Link GitHub to Service Account

1. Click on the service account you created (`pavilion-agentic`)
2. Click the **Permissions** tab
3. Click **Grant Access**
4. Add principal:
   ```
   principalSet://iam.googleapis.com/projects/PROJECT_ID/locations/us-central1/workloadIdentityPools/github-pool/attribute.repository/nisarp1/pavilion-ai-agentic
   ```
   Replace `PROJECT_ID` with your actual project ID (you can find it in the URL)
5. Grant role: `Workload Identity User`
6. Click **Save**

---

## Step 7: Get WIF Provider Resource Name

1. Go to: **Workload Identity Federation** → **github-pool** → **github-provider**
2. Copy the **Resource name** (format: `projects/PROJECT_ID/locations/us-central1/workloadIdentityPools/github-pool/providers/github-provider`)

---

## Step 8: Add GitHub Secrets

1. Go to: https://github.com/nisarp1/pavilion-ai-agentic/settings/secrets/actions
2. Click **New repository secret**
3. Create these 3 secrets:

### Secret 1: `GOOGLE_PROJECT_ID`
- **Value**: `pavilion-ai-agentic`

### Secret 2: `WIF_PROVIDER`
- **Value**: `projects/[YOUR-PROJECT-ID]/locations/us-central1/workloadIdentityPools/github-pool/providers/github-provider`

### Secret 3: `WIF_SERVICE_ACCOUNT`
- **Value**: `pavilion-agentic@pavilion-ai-agentic.iam.gserviceaccount.com`

---

## Verification

After adding secrets:

1. Push a test commit:
   ```bash
   git commit --allow-empty -m "Test CloudRun deployment with WIF"
   git push origin main
   ```

2. Go to: https://github.com/nisarp1/pavilion-ai-agentic/actions
3. Watch the "Deploy to Cloud Run" workflow
4. It should now authenticate successfully ✅

---

## If Using gcloud CLI Instead

If you prefer to automate this via command line on your machine:

```bash
#!/bin/bash

PROJECT_ID="pavilion-ai-agentic"
POOL_ID="github-pool"
PROVIDER_ID="github-provider"
SERVICE_ACCOUNT="pavilion-agentic"

# 1. Create Workload Identity Pool
gcloud iam workload-identity-pools create $POOL_ID \
    --project=$PROJECT_ID \
    --location=us-central1 \
    --display-name="GitHub Actions Pool"

# 2. Create OIDC Provider
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_ID \
    --project=$PROJECT_ID \
    --location=us-central1 \
    --workload-identity-pool=$POOL_ID \
    --display-name="GitHub Provider" \
    --attribute-mapping="google.subject=assertion.sub,assertion.aud=assertion.aud" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-condition="assertion.aud == '$PROJECT_ID'"

# 3. Create service account
gcloud iam service-accounts create $SERVICE_ACCOUNT \
    --project=$PROJECT_ID \
    --display-name="Pavilion Agentic CD/CI"

SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"

# 4. Grant roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/artifactregistry.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/cloudsql.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/storage.admin"

# 5. Link GitHub repo to service account
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT_EMAIL \
    --project=$PROJECT_ID \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/projects/$(gcloud config get-value project)/locations/us-central1/workloadIdentityPools/github-pool/attribute.repository/nisarp1/pavilion-ai-agentic"

# 6. Get WIF Provider
WIF_PROVIDER=$(gcloud iam workload-identity-pools providers describe $PROVIDER_ID \
    --project=$PROJECT_ID \
    --location=us-central1 \
    --workload-identity-pool=$POOL_ID \
    --format="value(name)")

echo "GitHub Secrets to Add:"
echo "GOOGLE_PROJECT_ID=$PROJECT_ID"
echo "WIF_PROVIDER=$WIF_PROVIDER"
echo "WIF_SERVICE_ACCOUNT=$SERVICE_ACCOUNT_EMAIL"
```

---

## Troubleshooting

### Error: "Resource already exists"
If you get errors that things already exist, you can check the GCP console and use the existing resources.

### Error: "Reauthentication failed"
Run on your local machine:
```bash
gcloud auth login
gcloud config set project pavilion-ai-agentic
```

### Deployment still failing after adding secrets?
1. Verify all 3 secrets are in GitHub
2. Make sure the values are **exact matches** (no extra spaces)
3. Push a new commit to trigger the workflow again
4. Check the GitHub Actions logs for the specific error

---

## Next Steps

Once GitHub Actions is working:

1. **Fix Cloud SQL Storage Type** - The Dockerfile uses invalid storage type
   - Change in `docker/Dockerfile.cloudrun` if needed

2. **Create Cloud SQL Database** - Run in GCP Console:
   ```sql
   gcloud sql instances create pavilion-db-dev \
       --database-version=POSTGRES_15 \
       --tier=db-f1-micro \
       --storage-type=HDD \
       --storage-auto-increase
   ```

3. **Run Migrations** - After deployment, trigger migrations:
   ```bash
   gcloud run jobs create migrate \
       --image=[your-image] \
       --command=python \
       --args="manage.py,migrate"
   ```

---

**Status**: 🔧 Fixing Authentication | Next: Database Setup | Final: Production Deployment

