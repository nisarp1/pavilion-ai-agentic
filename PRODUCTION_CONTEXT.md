# Pavilion AI — Production Context & Architecture

> **Last updated:** 2026-05-19
> **Purpose:** Complete picture of the dev VM, production infrastructure, and how to make changes safely to the live site.

---

## 1. Where We Are Right Now

| Thing | Detail |
|---|---|
| **This machine** | GCP VM — `pavilion-dev` (Ubuntu 22.04 LTS, `europe-west1`) |
| **User** | `nisar` |
| **Project directory** | `/home/nisar/pavilion-ai-agentic/` |
| **GCP project** | `pavilion-ai-agentic-v2` |
| **GCP account (CLI)** | `pavilion-agentic@pavilion-ai-agentic-v2.iam.gserviceaccount.com` |

This VM is the **development workstation**. All code editing, git operations, and `gcloud` commands happen here. There is no separate "localhost" — the dev VM _is_ the local environment.

---

## 2. Live Production Site

| Property | Value |
|---|---|
| **URL** | https://newsai.pavilionend.in |
| **Hosting** | Google Cloud Run (`asia-south1` — Mumbai) |
| **GCP project** | `pavilion-ai-agentic-v2` |
| **Docker image** | `asia-south1-docker.pkg.dev/pavilion-ai-agentic-v2/pavilion-images/pavilion-app:latest` |

### Cloud Run Services

| Service name | Region | URL | Purpose |
|---|---|---|---|
| `pavilion-web` | asia-south1 | https://pavilion-web-1061824260916.asia-south1.run.app | Django REST API + React SPA |
| `pavilion-worker` | asia-south1 | https://pavilion-worker-1061824260916.asia-south1.run.app | Celery async worker |
| `pavilion-beat` | asia-south1 | https://pavilion-beat-1061824260916.asia-south1.run.app | Celery periodic scheduler |
| `pavilion-api` | us-central1 | https://pavilion-api-1061824260916.us-central1.run.app | (legacy / auxiliary) |
| `pavilion-frontend` | us-central1 | https://pavilion-frontend-1061824260916.us-central1.run.app | (legacy / auxiliary) |

All three primary services (`web`, `worker`, `beat`) share **one Docker image**. The `PAVILION_MODE=web|worker|beat` env var controls which process runs inside the container.

---

## 3. Project Structure (on this VM)

```
/home/nisar/pavilion-ai-agentic/    ← main repo (edit here)
├── backend/                        ← Django app (Python 3.11)
│   ├── pavilion_gemini/            ← Django project settings
│   ├── cms/                        ← Articles, Media, WebStories
│   ├── tenants/                    ← Multi-tenancy
│   ├── agents/                     ← AI video pipeline (CrewAI + Gemini)
│   ├── video_studio/               ← VideoJob model + render dispatch
│   ├── rss_fetcher/                ← RSS + Google Trends Celery tasks
│   ├── workers/                    ← Publish scheduler Celery tasks
│   └── style_library/              ← Remotion style templates
├── frontend/                       ← React 18 + Vite + Redux
│   └── src/
│       ├── components/             ← UI components (VideoStudio, etc.)
│       ├── services/api.js         ← Axios client (injects JWT + X-Tenant-ID)
│       └── store/                  ← Redux Toolkit slices
├── remotion-renderer/              ← Standalone Express + Remotion render service
├── docker/
│   ├── Dockerfile.cloudrun         ← Production multi-stage build
│   ├── Dockerfile.dev              ← Dev Docker build
│   └── entrypoint.sh               ← Runs migrate + collectstatic on web start
├── deploy/                         ← One-time infra scripts
├── cloudbuild.yaml                 ← CI/CD pipeline (Cloud Build)
├── docker-compose.dev.yml          ← Local dev stack
├── CLAUDE.md                       ← Claude Code guidance
├── DEPLOYMENT.md                   ← Full deployment reference
└── PRODUCTION_CONTEXT.md           ← This file
```

Other directories in `/home/nisar/` are separate (unrelated) projects.

---

## 4. How the Production Build Works

```
Code on this VM
    │
    ├── git push origin develop    ← SAFE — no deploy triggered
    │
    └── git push origin main       ← TRIGGERS Cloud Build CI/CD
            │
            ▼
    Cloud Build (cloudbuild.yaml)
    ├── Step 0: docker auth to Artifact Registry
    ├── Step 1: docker build (Dockerfile.cloudrun, ~8 min)
    │   ├── Stage 1: npm build → React SPA baked into image
    │   └── Stage 2: pip install → Django + Python deps
    ├── Step 2: docker push :SHA + :latest to Artifact Registry
    └── Step 3: gcloud run deploy (parallel)
        ├── pavilion-web   (PAVILION_MODE=web)
        ├── pavilion-worker (PAVILION_MODE=worker)
        └── pavilion-beat   (PAVILION_MODE=beat)
```

**Key point:** The React frontend is compiled at **Docker build time**, not at runtime. Any frontend `.env` changes (like `VITE_GOOGLE_CLIENT_ID`) require a full rebuild → push to `main`.

---

## 5. Branch Strategy

```
develop  →  day-to-day work (safe to push anytime)
main     →  production (every push = a live deploy)
```

- **Current branch:** `develop`
- Always work on `develop`. Push to `develop` freely — nothing deploys.
- To go live: `git merge develop` into `main`, then `git push origin main`.

---

## 6. How to Make Changes to the Live Site

### Option A — Code change (any backend or frontend file)

```bash
# 1. Make your edits on this VM in /home/nisar/pavilion-ai-agentic/
# 2. Commit on develop
git add <files>
git commit -m "your message"
git push origin develop     # safe, no deploy

# 3. When ready to go live
git checkout main
git merge develop
git push origin main        # triggers Cloud Build → live in ~11 min
git checkout develop        # go back to dev
```

### Option B — Secret / environment variable change

Secrets are in **GCP Secret Manager**, not in the repo. To update one:

```bash
echo -n "new-value" | gcloud secrets versions add SECRET_NAME \
  --data-file=- \
  --project=pavilion-ai-agentic-v2
```

Then redeploy the affected service to pick up the new secret version:

```bash
gcloud run services update pavilion-web \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2
```

### Option C — Emergency hotfix (no full CI/CD wait)

If you need to change something immediately without a full Docker rebuild:

```bash
# Update a single env var on a running Cloud Run service
gcloud run services update pavilion-web \
  --set-env-vars KEY=VALUE \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2
```

Note: env var overrides are reset on the next `git push origin main` deploy.

---

## 7. Watching Logs

```bash
# Live web service logs
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="pavilion-web"' \
  --limit=50 --project=pavilion-ai-agentic-v2 --format="value(textPayload)"

# Worker logs
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="pavilion-worker"' \
  --limit=50 --project=pavilion-ai-agentic-v2 --format="value(textPayload)"

# Watch a running Cloud Build
# https://console.cloud.google.com/cloud-build/builds?project=pavilion-ai-agentic-v2
```

---

## 8. Rollback

```bash
# Roll web back to the previous revision
gcloud run services update-traffic pavilion-web \
  --to-revisions=PREVIOUS=100 \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2

# List available revisions
gcloud run revisions list \
  --service=pavilion-web \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2
```

---

## 9. Infrastructure at a Glance

| Component | What it is |
|---|---|
| **Cloud SQL** | PostgreSQL 15, instance `pavilion-newsai-db` (db-f1-micro, asia-south1) |
| **Redis** | Upstash (external, free tier) — Celery broker (DB 0) + Django cache (DB 1) |
| **GCS bucket** | `pavilion-newsai-media` — media files + rendered MP4s |
| **Artifact Registry** | `asia-south1-docker.pkg.dev/pavilion-ai-agentic-v2/pavilion-images` |
| **Secret Manager** | All API keys, DB creds, Django secret key |
| **Service account** | `pavilion-cloudrun@pavilion-ai-agentic-v2.iam.gserviceaccount.com` |
| **Domain** | `newsai.pavilionend.in` (CNAME → ghs.googlehosted.com) |

---

## 10. Key Secrets in Secret Manager

| Secret name | What it holds |
|---|---|
| `pavilion-secret-key` | Django SECRET_KEY |
| `pavilion-db-user` / `pavilion-db-password` / `pavilion-db-name` | Cloud SQL creds |
| `pavilion-redis-url` | Upstash Redis (Celery broker) |
| `pavilion-redis-cache-url` | Upstash Redis (Django cache) |
| `pavilion-gemini-api-key` | Google Gemini API key |
| `pavilion-google-credentials-json` | GCP service account JSON |
| `pavilion-elevenlabs-api-key` | ElevenLabs TTS |
| `pavilion-custom-search-api-key` + `_engine_id` | Image fetcher |
| `pavilion-google-oauth-client-id` | Google OAuth |

---

## 11. Renderer Status

The Remotion renderer (`pavilion-renderer`) has **not yet been deployed** to Cloud Run. The backend gracefully falls back to saving a manifest JSON to GCS if `CLOUD_RUN_RENDERER_URL` is not a real URL. Everything else works normally.

To deploy when ready:
```bash
gcloud builds submit --config remotion-renderer/cloudbuild.yaml . --project=pavilion-ai-agentic-v2
```
