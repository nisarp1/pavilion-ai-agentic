# Pavilion AI — Deployment Guide

**Live site:** https://newsai.pavilionend.in
**GCP project:** `pavilion-ai-agentic-v2`
**Region:** `asia-south1` (Mumbai)
**Last updated:** 2026-05-18

---

## Current Infrastructure

| Service | Cloud Run name | Purpose |
|---|---|---|
| Web (Django + React SPA) | `pavilion-web` | REST API + frontend |
| Celery worker | `pavilion-worker` | Async tasks (video, RSS, TTS) |
| Celery beat | `pavilion-beat` | Periodic task scheduler |
| Remotion renderer | `pavilion-renderer` | MP4 rendering (min=0, internal) |
| PostgreSQL 15 | `pavilion-newsai-db` | Primary database (db-f1-micro) |
| Redis | Upstash (external) | Celery broker + cache |
| GCS bucket | `pavilion-newsai-media` | Media files + rendered MP4s |
| Artifact Registry | `pavilion-images` | Docker images |
| Service account | `pavilion-cloudrun@pavilion-ai-agentic-v2.iam.gserviceaccount.com` | IAM identity for all services |

All secrets (API keys, DB credentials) are stored in **Secret Manager** — never in code or env files.

---

## Branch Strategy (critical — read this first)

```
develop  →  day-to-day development (phase 2, 3, …)
main     →  live production (auto-deploys on every push)
```

- **All code changes go on `develop`.** Push freely — it does not trigger any deploy.
- **`main` is protected.** Only merge into it when a phase is ready to go live.
- Cloud Build trigger watches `main` only. A `git push origin main` = a live deploy.

### Start a development session

```bash
git checkout develop
git pull origin develop
# … make changes, commit, push …
git push origin develop   # safe — no deploy triggered
```

### Release a new version to live

```bash
git checkout main
git merge develop
git push origin main      # triggers Cloud Build → deploys to newsai.pavilionend.in
git checkout develop      # go back to dev immediately
```

---

## CI/CD Pipeline

**Trigger:** Push to `main` → Cloud Build (`cloudbuild.yaml` at repo root)

**Build steps:**
1. `build` — Docker multi-stage build (~8 min). Bakes React bundle into the image.
2. `push-sha` / `push-latest` — push to Artifact Registry.
3. `deploy-web`, `deploy-worker`, `deploy-beat` — parallel Cloud Run deploys (~3 min).

One Docker image is shared by web, worker, and beat. `PAVILION_MODE=web|worker|beat` (set per-service) controls which process runs. The entrypoint (`docker/entrypoint.sh`) runs `migrate` + `collectstatic` on every `web` deploy automatically.

**Watch a build:**
```
https://console.cloud.google.com/cloud-build/builds?project=pavilion-ai-agentic-v2
```

**Renderer deploy (manual — only when renderer code changes):**
```bash
gcloud builds submit --config remotion-renderer/cloudbuild.yaml . --project=pavilion-ai-agentic-v2
```

---

## Renderer Status (as of 2026-05-18)

The Remotion renderer (`pavilion-renderer`) has **not yet been deployed** to Cloud Run.

**This is safe** — the backend has a graceful fallback: if `CLOUD_RUN_RENDERER_URL` is not a real URL, video jobs upload a manifest JSON to GCS instead of crashing. Everything else (articles, RSS, web stories, social, captions) works normally.

**To deploy the renderer when ready** (run from the project root, requires `gcloud auth login`):
```bash
gcloud builds submit --config remotion-renderer/cloudbuild.yaml . --project=pavilion-ai-agentic-v2
```
Then get its URL:
```bash
gcloud run services describe pavilion-renderer \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2 \
  --format="value(status.url)"
```
Update `cloudbuild.yaml` line 22 with the real URL and push `main` → renderer wires up automatically.

**Renderer compositions (what it can render):**
- `PavilionAIVideo` — primary pipeline (timeline-driven, Malayalam TTS, word captions)
- `PavilionReel` — legacy modular multi-scene sports reel
- `CaptionedVideo` — TikTok-style captioned video overlay

---

## Before Going Live — One Remaining Blocker

These must be fixed before the first real push to `main`:

### Google OAuth Client ID

When ready to enable Google login, edit `cloudbuild.yaml` line 19:
```yaml
_VITE_GOOGLE_CLIENT_ID: 'your-real-oauth-client-id.apps.googleusercontent.com'
```
(Find it at: GCP Console → APIs & Services → OAuth 2.0 Client IDs)

This bakes into the React bundle at build time. After changing it, push `main` → full rebuild + redeploy.

---

## Smoke Test Checklist (run after every live deploy)

- [ ] `https://newsai.pavilionend.in` loads the React SPA
- [ ] `https://newsai.pavilionend.in/api/` returns `{"message": "Pavilion Gemini API"}`
- [ ] `https://newsai.pavilionend.in/health/` returns `{"status": "healthy"}`
- [ ] Login with superuser credentials works
- [ ] Google OAuth login works
- [ ] Create a test article → save successfully
- [ ] RSS fetch runs (check Celery worker logs)
- [ ] Trigger video generation on one article → audio URL appears
- [ ] Trigger a Cloud Run render → VideoJob completes → MP4 in GCS

---

## Secrets Management

All secrets live in **Secret Manager** under project `pavilion-ai-agentic-v2`.

| Secret name | What it holds |
|---|---|
| `pavilion-secret-key` | Django SECRET_KEY |
| `pavilion-db-user` | Cloud SQL username |
| `pavilion-db-password` | Cloud SQL password |
| `pavilion-db-name` | Database name |
| `pavilion-redis-url` | Upstash Redis URL (Celery broker) |
| `pavilion-redis-cache-url` | Upstash Redis URL (Django cache) |
| `pavilion-gemini-api-key` | Google Gemini API key |
| `pavilion-google-credentials-json` | GCP service account JSON (one line) |
| `pavilion-elevenlabs-api-key` | ElevenLabs TTS key |
| `pavilion-custom-search-api-key` | Google Custom Search API key |
| `pavilion-custom-search-engine-id` | Google Custom Search Engine ID |
| `pavilion-google-oauth-client-id` | Google OAuth client ID |

**To update a secret:**
```bash
echo -n "new-value" | gcloud secrets versions add SECRET_NAME \
  --data-file=- \
  --project=pavilion-ai-agentic-v2
```

---

## First-Time Superuser Creation

Run this once after the first live deploy:
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

---

## Domain Setup (newsai.pavilionend.in)

Run once:
```bash
bash deploy/setup_domain.sh
```

Then add to your DNS panel (pavilionend.in):

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | newsai | ghs.googlehosted.com | 300 |

Check SSL status (takes 15-30 min after DNS):
```bash
gcloud beta run domain-mappings describe \
  --domain=newsai.pavilionend.in \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2
```
Wait until `certificateStatus: ACTIVE`.

---

## Rollback

If a live deploy breaks something:
```bash
# Roll web back to the previous revision
gcloud run services update-traffic pavilion-web \
  --to-revisions=PREVIOUS=100 \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2

# Same for worker or beat if needed
gcloud run services update-traffic pavilion-worker \
  --to-revisions=PREVIOUS=100 \
  --region=asia-south1 \
  --project=pavilion-ai-agentic-v2
```

To find revision names:
```bash
gcloud run revisions list --service=pavilion-web --region=asia-south1 --project=pavilion-ai-agentic-v2
```

---

## Viewing Logs

```bash
# Web service logs (last 50 lines)
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="pavilion-web"' \
  --limit=50 --project=pavilion-ai-agentic-v2 --format="value(textPayload)"

# Worker logs
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="pavilion-worker"' \
  --limit=50 --project=pavilion-ai-agentic-v2 --format="value(textPayload)"
```

Or use the GCP Console:
```
https://console.cloud.google.com/run?project=pavilion-ai-agentic-v2
```

---

## Local Development

```bash
# Start all services via Docker
docker-compose -f docker-compose.dev.yml up -d

# Apply DB migrations
docker-compose -f docker-compose.dev.yml exec django python manage.py migrate

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Open Django shell
docker-compose -f docker-compose.dev.yml exec django python manage.py shell
```

Local URLs:
- Django API: http://localhost:8000
- Frontend (Vite dev): http://localhost:3001
- Remotion renderer: http://localhost:3003
- Celery Flower: http://localhost:5555

---

## Cost Reference

| Service | Monthly cost |
|---|---|
| Cloud SQL db-f1-micro | ~$7.50 |
| Upstash Redis (free tier) | $0 |
| Cloud Run × 3 (min=1 each) | ~$20 |
| Cloud Run renderer (min=0) | ~$1-5 (on-demand) |
| GCS + egress | ~$3 |
| Cloud Build (~15 builds/mo) | ~$5 |
| **Total** | **~$36-40/mo** |

Scale-up triggers:
- Upstash >10K cmds/day → upgrade to Pay-As-You-Go (~$5-15/mo)
- Cloud SQL CPU >70% consistently → db-g1-small (+$17.50/mo)
- Worker backlog growing → Cloud Run auto-scales automatically

---

## Infrastructure Scripts

| Script | Purpose | When to run |
|---|---|---|
| `deploy/setup_infra.sh` | Provision all GCP infrastructure from scratch | One-time, first setup only |
| `deploy/fill_secrets.sh` | Populate Secret Manager with real API keys | One-time after setup_infra.sh |
| `deploy/setup_domain.sh` | Map newsai.pavilionend.in to Cloud Run | One-time domain setup |
| `remotion-renderer/cloudbuild.yaml` | Build and deploy the Remotion renderer | Manual, when renderer code changes |
