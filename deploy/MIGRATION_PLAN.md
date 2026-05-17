# Pavilion AI — GCP Migration Plan
# Target: newsai.pavilionend.in
# Estimated time: 45–60 minutes end-to-end

---

## Before you start — gather these

Have all of the following open/ready before running a single command:

| Item | Where to find it |
|---|---|
| Gemini API key | console.cloud.google.com → APIs → Credentials |
| ElevenLabs API key | elevenlabs.io → Profile → API Keys |
| Google Service Account JSON | The `.json` key file you use locally (in `.gcp-secrets/`) |
| Google Custom Search API key | console.cloud.google.com → APIs → Credentials |
| Google Custom Search Engine ID | cse.google.com → Your engine → Setup |
| Google OAuth Client ID | console.cloud.google.com → APIs → OAuth 2.0 Client IDs |
| Access to pavilionend.in DNS panel | Wherever you registered the domain |
| Terminal logged into GCP | `gcloud auth login && gcloud auth application-default login` |

---

## Phase 1 — Provision Infrastructure (~15 min, mostly waiting)

```bash
cd /home/nisar/pavilion-ai-agentic
bash deploy/setup_infra.sh
```

**What this does:**
- Enables GCP APIs (run, sql, storage, secretmanager, cloudbuild, artifactregistry)
- Creates Artifact Registry repo (`pavilion-images`)
- Creates service account `pavilion-cloudrun` with correct IAM roles
- Creates Cloud SQL PostgreSQL 15 instance `pavilion-newsai-db` (db-f1-micro, $7.50/mo)
- Creates database `pavilion_newsai` + user `pavilion_app` with generated password
- Creates GCS bucket `pavilion-newsai-media` (public read for media files)
- Creates all Secret Manager secret stubs (with REPLACE_ME values)
- Creates Cloud Build trigger (will need GitHub connection — see Phase 2)

**After it finishes:** Note the Cloud SQL instance name printed at the end:
`pavilion-ai-agentic-v2:asia-south1:pavilion-newsai-db`

---

## Phase 2 — Set Up Upstash Redis (free, 5 min)

1. Go to **https://upstash.com** → Sign up / Log in
2. Click **Create Database**
   - Name: `pavilion-newsai`
   - Region: **ap-south-1** (Mumbai — closest to your users)
   - Type: Regional (free tier)
3. Click the database → copy the **Redis URL** (starts with `rediss://`)
   - It looks like: `rediss://:<token>@<endpoint>.upstash.io:6380`
4. Keep this URL — you'll paste it in Phase 3

---

## Phase 3 — Fill API Keys into Secret Manager (~5 min)

Edit `deploy/fill_secrets.sh` and paste your actual values:

```bash
nano deploy/fill_secrets.sh   # or use any editor
```

Fill in:
- `UPSTASH_REDIS_URL` — the `rediss://...` URL from Phase 2
- `GEMINI_API_KEY`
- `GOOGLE_CREDENTIALS_JSON` — flatten your SA JSON to one line:
  ```bash
  cat .gcp-secrets/service-account-key.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)))"
  ```
- `ELEVENLABS_API_KEY`
- `GOOGLE_CUSTOM_SEARCH_API_KEY`
- `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`
- `GOOGLE_OAUTH_CLIENT_ID`

Then run:
```bash
bash deploy/fill_secrets.sh
```

---

## Phase 4 — Connect GitHub to Cloud Build (~3 min)

1. Open: https://console.cloud.google.com/cloud-build/triggers?project=pavilion-ai-agentic-v2
2. Click **Connect Repository**
3. Select **GitHub (Cloud Build GitHub App)**
4. Authenticate → select `nisarp1/pavilion-ai-agentic`
5. Confirm the trigger `pavilion-main-deploy` appears with branch pattern `^main$`

---

## Phase 5 — First Deploy (~12 min build + deploy)

```bash
git push origin main
```

Watch the build at:
https://console.cloud.google.com/cloud-build/builds?project=pavilion-ai-agentic-v2

Build stages:
- `build` — Docker multi-stage build (~8 min)
- `push-sha` — push to Artifact Registry (~1 min)
- `deploy-web`, `deploy-worker`, `deploy-beat` — parallel Cloud Run deploys (~3 min)

**When it finishes:** Three Cloud Run services appear at:
https://console.cloud.google.com/run?project=pavilion-ai-agentic-v2

---

## Phase 6 — Post-Deploy Config (~5 min)

### 6a. Get the web service URL
```bash
gcloud run services describe pavilion-web \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2 \
  --format="value(status.url)"
```
It will be something like: `https://pavilion-web-xxxxxxxxxx-el.a.run.app`

### 6b. Get the renderer URL (deploy renderer first if not done)
```bash
gcloud builds submit --config remotion-renderer/cloudbuild.yaml .
```
Then:
```bash
gcloud run services describe pavilion-renderer \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2 \
  --format="value(status.url)"
```

### 6c. Update cloudbuild.yaml with real URLs
Open `cloudbuild.yaml` and update these two substitutions:
```yaml
_RENDERER_URL: 'https://pavilion-renderer-ACTUAL-URL.a.run.app'
_ALLOWED_HOSTS: 'newsai.pavilionend.in,pavilion-web-ACTUAL-URL.a.run.app'
```
Then push:
```bash
git add cloudbuild.yaml && git commit -m "config: update renderer URL and allowed hosts" && git push
```
Wait for the redeploy (~3 min).

### 6d. Create superuser
```bash
gcloud run jobs create pavilion-createsuperuser \
  --image=asia-south1-docker.pkg.dev/pavilion-ai-agentic-v2/pavilion-images/pavilion-app:latest \
  --region=asia-south1 \
  --set-cloudsql-instances=pavilion-ai-agentic-v2:asia-south1:pavilion-newsai-db \
  --set-env-vars=ENVIRONMENT=production,PAVILION_MODE=web \
  --set-secrets=SECRET_KEY=pavilion-secret-key:latest \
  --set-secrets=DB_USER=pavilion-db-user:latest \
  --set-secrets=DB_PASSWORD=pavilion-db-password:latest \
  --set-secrets=DB_NAME=pavilion-db-name:latest \
  --command="python,manage.py,createsuperuser" \
  --project=pavilion-ai-agentic-v2

gcloud run jobs execute pavilion-createsuperuser \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2
```
Follow the interactive prompts in the Cloud Build logs.

---

## Phase 7 — Map Domain (~5 min + DNS propagation 15-30 min)

```bash
bash deploy/setup_domain.sh
```

Then go to your DNS panel for `pavilionend.in` and add:

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | newsai | ghs.googlehosted.com | 300 |

**Check SSL status** (takes 15-30 min after DNS):
```bash
gcloud beta run domain-mappings describe \
  --domain=newsai.pavilionend.in \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2
```
Wait until `certificateStatus: ACTIVE`.

---

## Phase 8 — Smoke Test Checklist

After `https://newsai.pavilionend.in` is live:

- [ ] Homepage loads (React SPA)
- [ ] `/api/` returns JSON `{"message": "Pavilion Gemini API"}`
- [ ] `/health/` returns `{"status": "healthy"}`
- [ ] Login with your superuser credentials
- [ ] Create a test article
- [ ] Trigger RSS fetch — check articles appear
- [ ] Trigger video generation on one article
- [ ] Confirm audio URL and word captions appear in the article
- [ ] Trigger a Cloud Run render — check VideoJob completes
- [ ] Check GCS bucket has the rendered MP4

---

## Rollback Plan

If anything goes wrong during deploy:
```bash
# Roll back web service to previous revision
gcloud run services update-traffic pavilion-web \
  --to-revisions=PREVIOUS=100 \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2
```

If DB migration fails (unlikely — migrations are additive):
```bash
# Connect to Cloud SQL and inspect
gcloud sql connect pavilion-newsai-db \
  --user=pavilion_app \
  --project=pavilion-ai-agentic-v2
```

---

## Cost Reference (post-migration)

| Service | Monthly cost |
|---|---|
| Cloud SQL db-f1-micro | $7.50 |
| Upstash Redis | $0 (free tier) |
| Cloud Run × 3 (idle, min=1) | ~$20 |
| GCS + egress | ~$3 |
| Cloud Build (~15 builds/mo) | ~$5 |
| **Total** | **~$35-45/mo** |

**Scale-up triggers:**
- Upstash >10K cmds/day → upgrade to Upstash Pay-As-You-Go (~$5-15/mo)
- Cloud SQL CPU >70% → upgrade to db-g1-small (+$17.50/mo)
- Worker backlog growing → Cloud Run auto-scales worker instances

---

*Generated: 2026-05-17 | Branch: main | Commit: e2348e4*
