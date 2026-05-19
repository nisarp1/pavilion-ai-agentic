# Pavilion AI — Newsroom Platform

An AI-powered multi-tenant newsroom platform. Editors manage articles and media; an agentic pipeline (Gemini + CrewAI) generates short-form video reels from articles with Malayalam TTS voiceover; Remotion renders the final MP4s.

**Live site:** https://newsai.pavilionend.in
**GCP project:** `pavilion-ai-agentic-v2`

---

## Tech Stack

- **Backend:** Django REST Framework (Python 3.11)
- **Frontend:** React 18 + Vite + Redux Toolkit
- **Database:** Cloud SQL PostgreSQL 15
- **Task queue:** Celery + Redis (Upstash)
- **LLM:** Google Gemini (`gemini-2.5-flash-lite` by default)
- **Video rendering:** Remotion + Chromium (Express service)
- **Hosting:** Google Cloud Run (`asia-south1`)
- **CI/CD:** Cloud Build (triggers on push to `main`)
- **Secrets:** GCP Secret Manager

---

## Local Development

```bash
# Start all services (Django + Celery + Redis + Postgres)
docker-compose -f docker-compose.dev.yml up -d

# Apply migrations
docker-compose -f docker-compose.dev.yml exec django python manage.py migrate

# Tail logs
docker-compose -f docker-compose.dev.yml logs -f
```

Local URLs:
- Django API: http://localhost:8000
- Frontend (Vite): http://localhost:3001
- Remotion renderer: http://localhost:3003
- Celery Flower: http://localhost:5555

Copy `.env.example` to `.env` and fill in your values before first run.

---

## Deploying to Production

```bash
# Day-to-day development — safe to push, no deploy triggered
git checkout develop
git push origin develop

# Release to production — triggers Cloud Build (~11 min)
git checkout main
git merge develop
git push origin main
git checkout develop
```

Full deployment reference: [DEPLOYMENT.md](DEPLOYMENT.md)

---

## Project Structure

```
backend/            Django project (pavilion_gemini settings)
  cms/              Articles, Media, WebStories, Categories
  tenants/          Multi-tenancy (X-Tenant-ID header, roles)
  agents/           AI video pipeline (CrewAI + Gemini + TTS)
  video_studio/     VideoJob model + render dispatch
  rss_fetcher/      RSS ingestion + Google Trends (Celery)
  workers/          Publish scheduler (Celery)
  style_library/    Remotion style templates
frontend/           React 18 + Vite SPA
remotion-renderer/  Standalone Express + Remotion render service
docker/             Dockerfiles + entrypoint
deploy/             One-time infra scripts
cloudbuild.yaml     CI/CD pipeline definition
```

---

## Architecture Notes

- One Docker image (`pavilion-app`) is shared by the `web`, `worker`, and `beat` Cloud Run services. `PAVILION_MODE=web|worker|beat` controls which process runs.
- The React bundle is compiled at Docker build time and served as static files by Django. There is no separate frontend service in production.
- All secrets are in GCP Secret Manager — never in code or env files.
- API prefix: `/api/`. Auth: JWT (24h access, 7d refresh). Multi-tenancy via `X-Tenant-ID` header.
