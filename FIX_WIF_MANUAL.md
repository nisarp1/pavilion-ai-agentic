# Manual Workload Identity Federation Setup (GCP Console)

Due to organization policies, we need to create the WIF pool and provider through the GCP Console UI.

---

## Step 1: Go to GCP Console

Open: https://console.cloud.google.com/

Make sure you're in project: **pavilion-ai-agentic**

---

## Step 2: Create Workload Identity Pool

1. Go to: **IAM & Admin** → **Workload Identity Federation**
   (Or search "Workload Identity Federation" in the search bar)

2. Click **Create Pool**

3. Fill in:
   - **Pool ID**: `github`
   - **Display name**: `GitHub Actions`
   - **Location**: `global` (or `us-central1`)

4. Click **Create**

---

## Step 3: Create OIDC Provider

1. In the pool you just created, click **Add Provider**

2. Select **OpenID Connect (OIDC)** and click **Create**

3. Fill in:
   - **Provider ID**: `github`
   - **Issuer (URI)**: `https://token.actions.githubusercontent.com`
   - **Audiences**: Leave empty (or put `sts.googleapis.com`)

4. Under **Attribute Mapping**, click **Add Mapping**:
   - **Google Cloud attribute**: `google.subject`
   - **OIDC assertion claim path**: `assertion.sub`
   
5. Add another mapping:
   - **Google Cloud attribute**: `assertion.aud`
   - **OIDC assertion claim path**: `assertion.aud`

6. Click **Create**

---

## Step 4: Grant Service Account Permissions

1. Go to: **IAM & Admin** → **Service Accounts**

2. Click on: `pavilion-agentic@pavilion-ai-agentic.iam.gserviceaccount.com`

3. Go to **Permissions** tab

4. Click **Grant Access**

5. Add new principal:
   ```
   projects/608132621768/locations/global/workloadIdentityPools/github/attribute.repository/nisarp1/pavilion-ai-agentic
   ```
   (Replace `global` with `us-central1` if you used that in Step 2)

6. Select role: **Workload Identity User**

7. Click **Save**

---

## Step 5: Get Your WIF_PROVIDER Value

Go back to: **Workload Identity Federation** → **github** → **github** (provider)

Copy the **Resource name** (top right)

It should look like:
```
projects/608132621768/locations/global/workloadIdentityPools/github/providers/github
```

Or with `us-central1`:
```
projects/608132621768/locations/us-central1/workloadIdentityPools/github/providers/github
```

---

## Step 6: Update GitHub Secret

1. Go to: https://github.com/nisarp1/pavilion-ai-agentic/settings/secrets/actions

2. Edit `WIF_PROVIDER` secret

3. Replace value with the resource name from Step 5

4. Click **Update secret**

---

## Step 7: Re-push to Trigger Deployment

```bash
cd /Applications/MAMP/htdocs/pavilion-ai-agentic
git commit --allow-empty -m "Deploy: WIF provider created in console"
git push origin main
```

---

## Expected Result

✅ GitHub Actions workflow should now:
- Authenticate with GCP using Workload Identity
- Build Docker image
- Push to Artifact Registry
- Deploy to Cloud Run
- Run migrations
- Pass health check

---

## Troubleshooting

If still failing, check:

1. **Attribute path is correct**
   - `assertion.sub` and `assertion.aud` (not `assertion_sub`)

2. **Principal format is correct**
   - Uses correct project number (608132621768)
   - Uses correct location (global or us-central1)

3. **Role is "Workload Identity User"**
   - Not "Workload Identity Pool User"

4. **WIF_PROVIDER secret exactly matches the resource name**
   - No extra spaces or characters

---

**Follow these manual steps, then tell me when the WIF_PROVIDER secret is updated!** 🚀

