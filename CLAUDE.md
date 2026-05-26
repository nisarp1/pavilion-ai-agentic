# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Pavilion AI is a multi-tenant AI-powered newsroom platform. Editors manage articles and media; an agentic pipeline (Gemini + CrewAI) generates short-form video reels from articles with Malayalam TTS voiceover; Remotion renders the final MP4s.

## Deployment Layers

There are three independent layers. **Changes only move between layers via explicit git operations — nothing is automatic except a push to `main`.**

| Layer | Branch | Directory (on VM) | URL | Who uses it |
|---|---|---|---|---|
| **Live production** | `main` | Cloud Run only | `newsai.pavilionend.in` | Public / clients |
| **Staff production** | `team-production-beta` | `/home/nisar/pavilion-ai-agentic` | `http://35.226.18.168:3001` | Internal newsroom team |
| **Dev build** | `dev` | `/home/nisar/pavilion-ai-agentic-dev` | Cloudflare tunnel on port 3002 | Developers only |

### Promotion workflow
```
dev (build + test) → approved → merge to team-production-beta → staff get it
team-production-beta (stable) → approved → merge to main → Cloud Build deploys to Cloud Run
```

### Key rule
- Edit files in `/home/nisar/pavilion-ai-agentic-dev` → affects dev layer only
- Edit files in `/home/nisar/pavilion-ai-agentic` → affects staff layer only
- Push to `main` → triggers Cloud Build → deploys to live production

---

## Development Commands

### Staff production stack (`/home/nisar/pavilion-ai-agentic`)
```bash
docker compose -f docker-compose.dev.yml up -d          # Start all services
docker compose -f docker-compose.dev.yml logs -f         # Tail all logs
docker compose -f docker-compose.dev.yml down            # Stop all
docker compose -f docker-compose.dev.yml exec django python backend/manage.py migrate
docker compose -f docker-compose.dev.yml exec django python backend/manage.py shell
```

### Dev build stack (`/home/nisar/pavilion-ai-agentic-dev`)
```bash
docker compose -f docker-compose.build.yml up -d         # Start all services
docker compose -f docker-compose.build.yml logs -f        # Tail all logs
docker compose -f docker-compose.build.yml down           # Stop all
docker compose -f docker-compose.build.yml exec django python backend/manage.py migrate
docker compose -f docker-compose.build.yml exec django python backend/manage.py shell

# Start the Cloudflare dev tunnel (URL changes each run — share new URL with testers)
cloudflared tunnel --url http://localhost:3002 --no-autoupdate &
```

### Full Stack (Docker — legacy alias, staff stack only)
```bash
docker-compose -f docker-compose.dev.yml up -d          # Start all services
docker-compose -f docker-compose.dev.yml logs -f         # Tail all logs
docker-compose -f docker-compose.dev.yml down            # Stop all
docker-compose -f docker-compose.dev.yml exec django python manage.py migrate
docker-compose -f docker-compose.dev.yml exec django python manage.py createsuperuser
docker-compose -f docker-compose.dev.yml exec django python manage.py shell
```

**After changing `backend/requirements.txt`** always rebuild with `--no-cache` (Docker caches the pip layer):
```bash
docker build --no-cache -t pavilion-ai-agentic-celery -f docker/Dockerfile.dev .
docker build --no-cache -t pavilion-ai-agentic-django  -f docker/Dockerfile.dev .
```

### Backend (Django)
```bash
cd backend
python manage.py runserver 0.0.0.0:8000
python manage.py migrate
python manage.py test                               # All tests
python manage.py test cms.tests.test_models         # Single test module

# Celery (separate terminals) — MUST include -Q flag so social/pipeline tasks are consumed
celery -A pavilion_gemini worker --loglevel=info -Q default,social,pipeline,celery
celery -A pavilion_gemini beat --loglevel=info --scheduler celery.beat.PersistentScheduler
celery -A pavilion_gemini flower --port=5555
```

### Frontend
```bash
cd frontend
npm run dev       # Vite dev server on port 3001
npm run build     # Production bundle to dist/
```

### Remotion Renderer
```bash
cd remotion-renderer
npm run bundle    # Pre-bundle (done at Docker build time)
npm run dev       # Express render API on port 8080
```

## Architecture

### Services

**Staff production stack** (container suffix `-dev`, network `pavilion-ai-agentic_pavilion-network`):

| Service | Host Port | Purpose |
|---|---|---|
| `django` | 8000 | REST API + SPA static files |
| `frontend` | 3001 | Vite dev server |
| `remotion-renderer` | 3003→8080 | Video render API |
| `celery` | — | Async task worker |
| `celery-beat` | — | Periodic task scheduler |
| `postgres` | 5432 | DB: `pavilion_agentic_local` |
| `redis` | 6379 | Celery broker (DB 0) + cache (DB 1) |

**Dev build stack** (container suffix `-build`, network `pavilion-ai-agentic-dev_pavilion-build-network`, dir `/home/nisar/pavilion-ai-agentic-dev`):

| Service | Host Port | Purpose |
|---|---|---|
| `django` | 8001 | REST API |
| `frontend` | 3002 | Vite dev server |
| `remotion-renderer` | 3004→8080 | Video render API (reuses `-dev` image) |
| `celery` | — | Async task worker |
| `celery-beat` | — | Periodic task scheduler |
| `postgres` | 5433 | DB: `pavilion_agentic_build` |
| `redis` | 6380 | Celery broker + cache |
| `flower` | 5556 | Celery monitoring UI |

The two stacks share no network, no database, and no Docker volume. Edits in one directory cannot affect the other.

**Cloud Run production:** `docker/Dockerfile.cloudrun` builds a single image (React → Django static files). Django's `SPAFallbackMiddleware` serves `index.html` for non-API routes. The remotion-renderer is a separate Cloud Run service.

### Backend (`backend/`)
Django project: `pavilion_gemini/`. Single `settings.py` driven by env vars.

**Apps:**
- `tenants` — Multi-tenancy: `Tenant` + `TenantUser` models. Resolved via `X-Tenant-ID` header → subdomain → first active. Roles: `admin`, `editor`, `viewer`, `viewer-only`. `Tenant.api_keys` stores per-tenant third-party keys in a JSONField.
- `cms` — Core content: `Article`, `Category`, `Media`, `WebStory`, `PosterTemplate`
- `rss_fetcher` — RSS ingestion + Google Trends integration (Celery tasks every 5 min)
- `workers` — Article publish scheduling + agentic trends (Celery tasks)
- `agents` — Multi-agent video production pipeline (see below)
- `video_studio` — `VideoJob` model; dispatches render jobs to the remotion-renderer
- `style_library` — `StyleTemplate` model for reusable Remotion scene templates

**API prefix:** All REST endpoints under `/api/`. Auth via JWT (`djangorestframework-simplejwt`): access token 24h, refresh 7 days. The `X-Tenant-ID` header is required for most authenticated endpoints.

### Agentic Video Pipeline
Flow: `POST /api/pipeline/generate/` → Celery task → CrewAI agents → `VideoProductionPlan` JSON → TTS audio (Google Cloud TTS, Chirp3 HD, Malayalam `ml-IN`) → GCS upload → article status `review` → producer triggers `POST /api/video/render/` → `VideoJob` → remotion-renderer HTTP call → MP4 → GCS.

Key files:
- `backend/agents/video_pipeline.py` — `VideoProductionPipeline` orchestrator (Context Analyzer → Script Writer → Scene Planner)
- `backend/agents/tts_agent.py` — TTS generation
- `backend/agents/image_fetcher.py` — Google Custom Search image injection
- `backend/video_studio/tasks.py` — `render_video_task` Celery task

LLM: `google-generativeai` (Gemini). Default model: `gemini-2.5-flash-lite` (override via `GEMINI_MODEL` env var).

### Frontend (`frontend/src/`)
React 18 + Vite + Redux Toolkit. Axios client (`services/api.js`) injects `Authorization: Bearer` and `X-Tenant-ID` from localStorage on every request.

**Routing:** Protected routes under `/` (Dashboard shell). Key routes: `/articles`, `/webstories`, `/video-studio`, `/rss-feeds`, `/settings`, `/onboarding`.

**Video Studio** (`components/VideoStudio/`): `?article=ID` URL param switches between list and editor mode. Uses `@remotion/player` for in-browser preview and calls the backend render API for final export.

**Dev proxy:** `vite.config.js` proxies `/api` and `/media` to `http://pavilion-django-dev:8000` (Docker hostname). Override with `VITE_API_PROXY_TARGET`.

### Remotion Renderer (`remotion-renderer/`)
Standalone Express service. The Remotion bundle is pre-built into the Docker image at build time (`npm run bundle`). At runtime, `server.js` handles `POST /render` requests, spawns Chromium via `@remotion/renderer`, and uploads the output MP4 to GCS.

**Compositions** (`src/Root.tsx`):
- `PavilionReel` (1080×1920, 30fps) — modular multi-scene; duration computed from scene `start_frame + duration_frames`
- `CaptionedVideo` (1080×1920, 30fps) — TikTok-style captioned video

**Scene types** (`src/scenes/`): `Scene1`, `Scene2`, `QuoteCard`, `Scoreboard`, `StatComparison`, `TickerHeadline`

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Django secret key |
| `DATABASE_URL` | PostgreSQL connection string (dev) |
| `REDIS_URL` | Celery broker |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_MODEL` | LLM model (default: `gemini-2.5-flash-lite`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service account JSON |
| `GCS_BUCKET_NAME` | GCS bucket for rendered MP4s |
| `CLOUD_RUN_RENDERER_URL` | URL of the remotion-renderer Cloud Run service |
| `GOOGLE_CUSTOM_SEARCH_API_KEY` + `_ENGINE_ID` | Image fetcher agent |
| `VITE_API_BASE_URL` | Frontend API base URL |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |

Copy `.env.example` to `.env` in the repo root and `backend/.env` before first run.

**Note on local env vars:** `docker-compose.dev.yml` does NOT set `GEMINI_API_KEY`, `VERTEX_PROJECT`, or `GEMINI_MODEL`. These are loaded automatically from `backend/.env` by `environ.Env.read_env()` in `settings.py` at Django/Celery startup.

## Local Dev Troubleshooting

Commands below use the `-dev` suffix (staff stack). For the dev build stack swap every `-dev` → `-build` and use `docker-compose.build.yml`.

| Symptom | Likely cause | Fix |
|---|---|---|
| Social Studio returns 500 / proxy error | Django container is down | `docker start pavilion-django-dev` |
| Social post stuck on "queued" forever | Celery missing `-Q social` flag | Check `docker inspect pavilion-celery-dev --format '{{json .Config.Cmd}}'`; recreate with full `-Q default,social,pipeline,celery` |
| `No module named 'crewai'` in Celery logs | Stale Docker image (pre-crewai commit) | `docker exec pavilion-celery-dev pip install "crewai>=1.14.4" "litellm>=1.40.0"` (temp), then rebuild with `--no-cache` |
| "Given token not valid for any token type" in UI | JWT tokens expired (>7 days since last login) | Clear localStorage in browser devtools, log in again |
| Dev tunnel URL stopped working | cloudflared process died | `cloudflared tunnel --url http://localhost:3002 --no-autoupdate &` — note the URL changes on each restart |
| Dev build stack container name conflict | Old containers not removed | `docker ps -a --filter name=build \| xargs docker rm -f` then `docker compose -f docker-compose.build.yml up -d` |
