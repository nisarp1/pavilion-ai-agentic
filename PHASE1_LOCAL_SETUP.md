# Phase 1: Local Setup on Your Mac

## ⚠️ Important
The gcloud commands need to be run **on your Mac in Terminal** (not through Claude automation) because they require interactive authentication.

---

## Step 1: Open Terminal on Your Mac

```bash
# Navigate to the repo
cd /Applications/MAMP/htdocs/pavilion-ai-agentic

# Activate the virtual environment
source gcp_setup_env/bin/activate

# Authenticate with Google Cloud
gcloud auth login
```

This will open your browser for authentication. Complete the login process.

---

## Step 2: Run the WIF Setup Script

After authentication completes, run:

```bash
bash setup-wif-github-fixed.sh
```

**Important**: Copy the output! You'll see something like:

```
============================================================
✅ GitHub Secrets Setup
============================================================

Add these 3 secrets to GitHub repository:
https://github.com/nisarp1/pavilion-ai-agentic/settings/secrets/actions

1. GOOGLE_PROJECT_ID
   Value: pavilion-ai-agentic

2. WIF_PROVIDER
   Value: projects/608132621768/locations/us-central1/workloadIdentityPools/github-pool/providers/github-provider

3. WIF_SERVICE_ACCOUNT
   Value: pavilion-agentic@pavilion-ai-agentic.iam.gserviceaccount.com

============================================================
```

---

## Step 3: If WIF_PROVIDER Shows PROJECT_NUMBER as Text

If you see `projects/PROJECT_NUMBER/...` instead of an actual number, do this:

```bash
# Get your project number
gcloud projects list --filter="projectId:pavilion-ai-agentic" --format="value(projectNumber)"
```

This will output your project number. Replace `PROJECT_NUMBER` in the WIF_PROVIDER value with this number.

**Example**:
- If project number is `608132621768`
- And WIF_PROVIDER shows: `projects/PROJECT_NUMBER/locations/us-central1/workloadIdentityPools/github-pool/providers/github-provider`
- Then the correct value is: `projects/608132621768/locations/us-central1/workloadIdentityPools/github-pool/providers/github-provider`

---

## Step 4: Add Secrets to GitHub

Once you have all 3 values, go to:

```
https://github.com/nisarp1/pavilion-ai-agentic/settings/secrets/actions
```

Click **"New repository secret"** for each:

### Secret 1: GOOGLE_PROJECT_ID
```
Name:  GOOGLE_PROJECT_ID
Value: pavilion-ai-agentic
```

### Secret 2: WIF_PROVIDER
```
Name:  WIF_PROVIDER
Value: projects/[YOUR-PROJECT-NUMBER]/locations/us-central1/workloadIdentityPools/github-pool/providers/github-provider
```

### Secret 3: WIF_SERVICE_ACCOUNT
```
Name:  WIF_SERVICE_ACCOUNT
Value: pavilion-agentic@pavilion-ai-agentic.iam.gserviceaccount.com
```

---

## Step 5: Verify Secrets Were Added

Go to: https://github.com/nisarp1/pavilion-ai-agentic/settings/secrets/actions

You should see all 3 secrets listed (values are hidden for security).

---

## ✅ When Complete

Once all 3 secrets are added, **come back and tell Claude**, then we'll proceed to Phase 2 (Database Setup).

---

## Troubleshooting

### "gcloud: command not found"
Install Google Cloud SDK:
```bash
brew install --cask google-cloud-sdk
```

### "Authentication failed"
Try:
```bash
gcloud auth application-default login
gcloud config set account office@milieumedia.in
gcloud config set project pavilion-ai-agentic
```

### "Permission denied"
Make sure your account has the correct permissions in the GCP project.

---

**Next**: Tell me when all 3 secrets are added to GitHub, then we'll do Phase 2! 🚀

