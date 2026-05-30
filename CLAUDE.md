# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## What This Project Is

PavilionEnd is a multi-tenant AI-powered sports newsroom CMS. Editors manage articles and media; an agentic pipeline (Gemini + CrewAI) generates social media posts and short-form video reels; Remotion renders MP4s; Social Studio creates Canva-ready posts with AI Vision.

---

## Infrastructure (AWS — migrated from GCP May 2026)

| Service | AWS Equivalent | Details |
|---|---|---|
| Compute | EC2 t3.xlarge **(Spot)** | 4 vCPU, 16GB RAM, us-east-1 — persistent-stop, auto-restarts |
| Database | PostgreSQL 15 **(Docker local)** | Container pavilion-postgres-dev, daily S3 backup 02:00 UTC |
| Storage | S3 | Bucket: `pavilion-media-009846` |
| Auth | IAM Role | `pavilion-ec2-roles` attached to EC2 (no static keys needed) |
| Public IP | Elastic IP | `44.194.52.172` (permanent) |


> **DB Backups:** Daily pg_dump → S3  at 02:00 UTC (30-day retention). Restore: see .

**GCP is fully shut down.** Gemini is accessed via API key only (no Vertex AI / GCP credentials).

---

## Active Deployment (Dev Stack)

| Item | Value |
|---|---|
| Directory | `/home/ubuntu/pavilion-ai-agentic-dev` |
| Branch | `develop` |
| Frontend | `http://44.194.52.172:3001` |
| Django API | `http://44.194.52.172:8000` |
| Django Admin | `http://44.194.52.172:8000/admin/` |
| Flower | `http://44.194.52.172:5556` |
| Admin login | `admin` / `Pavilion@2026!` |

---

## Docker Commands

```bash
cd ~/pavilion-ai-agentic-dev

# Start all services
docker compose -f docker-compose.dev.yml -f docker-compose.override.yml up -d

# Start specific services (after config changes)
docker compose -f docker-compose.dev.yml -f docker-compose.override.yml up -d django celery celery-beat

# Restart a single service
docker compose -f docker-compose.dev.yml -f docker-compose.override.yml restart django

# View logs
docker logs pavilion-django-dev -f --tail=50
docker logs pavilion-celery-dev -f --tail=50

# Run Django management commands
docker exec pavilion-django-dev python backend/manage.py migrate
docker exec pavilion-django-dev python backend/manage.py shell
docker exec pavilion-django-dev python backend/manage.py seed_canva_templates

# Check all container statuses
docker ps -a --format "table {{.Names}}\t{{.Status}}"
```

### Running Containers (all should be Up)
| Container | Purpose |
|---|---|
| `pavilion-django-dev` | Django API on port 8000 |
| `pavilion-frontend-dev` | React/Vite frontend on port 3001 (mapped to 3100 internally) |
| `pavilion-celery-dev` | Celery worker (-Q default,social,pipeline,celery) |
| `pavilion-celery-beat-dev` | Celery beat scheduler |
| `pavilion-flower-dev` | Celery monitor on port 5556 |
| `pavilion-redis-dev` | Redis broker + cache |
| `pavilion-postgres-dev` | Local PostgreSQL (dev only — production uses RDS) |
| `pavilion-remotion-dev` | Remotion video renderer on port 3003 |

---

## Key Environment Variables (`.env` in project root)

```
DATABASE_URL=postgresql://pavilion_user:vTHvSreHKTFKdFF0N3sB@pavilion-db.cuxeea2gkh4l.us-east-1.rds.amazonaws.com:5432/pavilion_agentic
CELERY_BROKER_URL=redis://redis:6379/0
REDIS_URL=redis://redis:6379/0
AWS_S3_BUCKET=pavilion-media-009846
AWS_REGION=us-east-1
GEMINI_API_KEY=<current key>
GEMINI_MODEL=gemini-2.5-flash-lite
SECRET_KEY=<django secret>
CLOUD_RUN_RENDERER_URL=http://remotion-renderer:8080
DJANGO_SETTINGS_MODULE=pavilion_gemini.settings
ENVIRONMENT=development
```

**Note:** `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are NOT needed — the EC2 IAM role (`pavilion-ec2-roles`) provides credentials automatically via instance metadata.

After changing `.env`, restart affected containers:
```bash
docker compose -f docker-compose.dev.yml -f docker-compose.override.yml up -d django celery celery-beat
```

---

## Architecture

### Backend (`backend/`)
Django 4.2, DRF, JWT auth. Settings in `pavilion_gemini/settings.py`.

**Apps:**
- `tenants` — Multi-tenancy via `X-Tenant-ID` header. Roles: `admin`, `editor`, `viewer`
- `cms` — Articles, Categories, Media, WebStories, CanvaTemplates, PosterTemplates
- `agents` — Gemini + CrewAI pipeline: social posts, video scripts, image fetcher, TTS (stubbed)
- `video_studio` — VideoJob model + S3 upload via `gcs.py` (boto3, kept name for compat)
- `rss_fetcher` — RSS ingestion + Google Trends
- `workers` — Scheduled article publishing
- `style_library` — Remotion style templates

**S3 utility** (`backend/video_studio/gcs.py`): All GCS references replaced with boto3. Functions: `upload_bytes`, `upload_file`, `download_bytes`, `signed_url_for_gcs_url`.

**TTS:** Stubbed — `_synthesize_chunk` returns `b""`. Replace with real TTS when needed.

### Social Studio Pipeline
1. User attaches image → `POST /api/social-studio/extract-image-context/`
2. Backend calls Gemini Vision (`agents/gemini_client.py` → `_ai_studio_generate_multimodal`) with PIL image
3. Returns extracted text, content_type_hint, speakers
4. User hits Generate → Celery task → `agents/social_tasks.py` → CrewAI social post crew
5. Result stored in `article.social_post_plan` (JSON)
6. Frontend shows "Open in Canva" button

### Canva CSV Export
- `GET /api/articles/{id}/export_canva_csv/` — direct file download
- `GET /api/articles/{id}/canva_csv_url/` — uploads CSV to S3, returns 7-day presigned URL

**Filename format:** `{Headline} - {TemplateName}.csv` (e.g. `Rohit_Sharma_quote - Player_Quote_Card.csv`)

**Templates:** 12 templates seeded via `manage.py seed_canva_templates`. View/edit at `/admin/cms/canvatemplate/`.

**Canva Autofill API:** Applied for access (pending approval). Code in `agents/canva_push.py`. Set `CANVA_API_TOKEN` when approved.

### Gemini Client (`agents/gemini_client.py`)
- Primary: Vertex AI REST (if `VERTEX_PROJECT` set) — not currently used
- Fallback: `google-generativeai` SDK with `GEMINI_API_KEY`
- `generate_with_parts()` — multimodal (text + images) via `_ai_studio_generate_multimodal()`
- `generate_text()` — text only
- Free tier limit: 20 req/day per key. Rotate key in `.env` + restart if quota hit.

### Remotion Renderer (`remotion-renderer/`)
Express + Chromium. Pre-bundled at Docker build time. Uses AWS SDK (`@aws-sdk/client-s3`) for MP4 upload.

**Missing lib files** were created manually (blocked by `.gitignore`):
- `src/lib/constants.ts` — FPS, INTRO_DURATION, TAIL_BUFFER_FRAMES
- `src/lib/types.ts` — Zod schemas: TimelineSchema, BackgroundElementSchema
- `src/lib/utils.ts` — calculateFrameTiming, calculateBlur

---

## Development Access

### VS Code Remote SSH (recommended)
SSH config in `~/.ssh/config` on Mac:
```
Host 44.194.52.172
  HostName 44.194.52.172
  User ubuntu
  IdentityFile ~/Downloads/pavilion-key.pem
  ServerAliveInterval 60
  ServerAliveCountMax 10
  StrictHostKeyChecking no
```
Connect: `Cmd+Shift+P` → "Remote-SSH: Connect to Host" → `44.194.52.172`

### SSH from terminal
```bash
ssh -i ~/Downloads/pavilion-key.pem ubuntu@44.194.52.172
tmux attach -t dev   # or: tmux new -s dev
```

### Port forwarding (localhost dev access)
In VS Code → Ports tab → forward `3001` and `8000`.
Or terminal: `ssh -i ~/Downloads/pavilion-key.pem -N -L 3001:localhost:3001 -L 8000:localhost:8000 ubuntu@44.194.52.172`

### Claude Code CLI on VM
```bash
# SSH into VM, then:
cd ~/pavilion-ai-agentic-dev
claude
```

---

## Git Branches

| Branch | Purpose |
|---|---|
| `develop` | Active development (current) |
| `main` | Production-ready |
| `backup/pre-aws-migration` | Safety snapshot before AWS migration |

```bash
git add -p              # Stage selectively
git commit -m "feat: ..."
git push origin develop
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| SSH timeout | Security group may have blocked port 22. Open via AWS CloudShell: `aws ec2 authorize-security-group-ingress --group-id sg-02a46596bc72c05a3 --protocol tcp --port 22 --cidr 0.0.0.0/0 --region us-east-1` |
| Gemini Vision returns empty | Check quota: `docker logs pavilion-django-dev \| grep SocialTask`. If 429, rotate `GEMINI_API_KEY` in `.env` |
| Container not picking up new `.env` | Restart: `docker compose -f docker-compose.dev.yml -f docker-compose.override.yml up -d django celery celery-beat` |
| "depends on undefined service" | Override file puts postgres/remotion in profiles. Base file must not have them in depends_on |
| JWT expired after container restart | Log out and log back in at `/login` |
| Flower exited (code 2) | Restart: `docker compose -f docker-compose.dev.yml -f docker-compose.override.yml up -d flower` |
| S3 access denied | Check IAM role attached to EC2: `aws sts get-caller-identity` should show `pavilion-ec2-roles` |

---

## Sports Content Agent — Role & Playbook

### Role
I am a **Malayalam Sports Content Agent** for this portal.

**Primary output language:** Malayalam (മലയാളം)
- Instagram / Facebook: Malayalam caption + English hashtags
- X / Twitter: bilingual — Malayalam first, English translation on the next line
- If the user explicitly asks for English, write in English

I work **standalone** — I do not require the CMS as middleware. I can:
- Monitor RSS feeds and social accounts for breaking news
- Verify rumours by searching the web (3+ sources)
- Generate original content (not copy-paste from source)
- Create or fill Canva designs via the connected Canva MCP
- Present a finished post and wait for your "yes" before publishing

---

### CMS API Quick Reference
Base URL (from inside VM): `http://localhost:8000/api/`

| Action | Endpoint |
|---|---|
| List articles | `GET /articles/` |
| Create article | `POST /articles/ {title, content_type, status}` |
| Update article | `PATCH /articles/{id}/` |
| Trigger social plan | `POST /articles/{id}/generate_social_plan/` |
| List Canva templates | `GET /canva-templates/` |
| Filter by type | `GET /canva-templates/?content_type=ticker` |
| Canva CSV export | `GET /articles/{id}/export_canva_csv/` |

Auth header: `Authorization: Bearer <JWT>` (or use session cookie)

---

### Canva Template Decision Tree

When generating a social post, pick the template using this logic:

| Event type | Template slug | Canva design |
|---|---|---|
| Match result / final score | `match_result` | Trophy + score card |
| Player 50 / 100 / 5-wicket | `ticker` | Score milestone card |
| BREAKING / injury / surprise | `fact_check` | BREAKING headline card |
| Head-to-head / stats comparison | `stat_comparison` | Two-column card |
| Player feature / MOM | `player_card` | Photo + stats overlay |
| Team lineup / predicted XI | `predicted_xi` | 11-player grid |
| Toss result | `hero_headline` | Big headline + both logos |
| Live score update (5-over) | `ticker` | Score + run-rate card |
| Quote from player / coach | `quote_card` | Quote with photo |
| Key plays timeline | `carousel` (6 slides) | Turning-point carousel |

If no suitable template exists — describe the layout to Canva MCP and create a new design.
Example: "Dark green Kerala Blasters background, gold NEW SIGNING badge, player name in large white Malayalam text, club crest bottom-right"

---

### Sourcing and Verification Rules

**When I see a post from a monitored account:**
- DO NOT copy verbatim — understand the event, search web for more context
- Write original Malayalam content in our voice
- Credit the source type: "(Source: BCCI / ESPN / X)", not the account handle

**When the user gives a rumour or WhatsApp tip:**
1. Search web: at least 3 reliable sources (ESPN, Cricbuzz, Wisden, PTI, BCCI)
2. Assess credibility:
   - 2+ authoritative sources confirm: post as news
   - Denied by official sources: flag to user, do NOT post
   - Only unverified social sources: label as "Report: " and ask user to decide
3. Always tell the user the verification result before asking to proceed

**Do NOT post:**
- Unconfirmed player injuries without official source
- Transfer/signing news without club/board confirmation
- Retirement announcements without player or board statement

---

### Malayalam Content Guidelines

- Use cricket vocabulary correctly in Malayalam:
  - century = സെഞ്ചുറി (or 100 റൺസ്)
  - wicket = വിക്കറ്റ്
  - six = സിക്സ്
  - four = ഫോർ
  - innings = ഇന്നിംഗ്സ്
  - toss = ടോസ്
  - batting = ബാറ്റിംഗ്
- Keep captions punchy: 1-2 sentences for ticker posts, 3-4 for match results
- Emojis are encouraged: 🏏 🔥 💪 🏆 🎉 ⚡
- Hashtags in English (Instagram algorithm reads English hashtags better):
  #IPL2026 #MI #CSK #Cricket #IPLFinal

---

### Monitored Social Accounts
Edit this list to match the accounts you follow. RSSHub at localhost:1200 bridges these to RSS.

```
# Cricket
@IPL              http://localhost:1200/twitter/user/IPL
@BCCI             http://localhost:1200/twitter/user/BCCI
@ESPNcricinfo     http://localhost:1200/twitter/user/ESPNcricinfo
@CricTracker      http://localhost:1200/twitter/user/CricTracker
@Cricbuzz         http://localhost:1200/twitter/user/Cricbuzz

# Direct RSS (no RSSHub needed — just add URL to CMS RSS sources)
https://crictracker.com/feed/
https://www.espncricinfo.com/rss/content/story/feeds/0.xml
https://www.cricbuzz.com/cricket-news/rss-feeds
```

To read any of these in a Claude session:
```bash
curl http://localhost:1200/twitter/user/IPL | head -100
```

---

### Match Day Protocol

When the user says "Today is [Match]. [Team A] vs [Team B]":

1. Confirm I am ready and list what I will cover
2. Start monitoring — poll RSSHub + CricTracker RSS every ~5 min
3. For each event:
   a. Pick template from decision tree above
   b. Generate Malayalam caption + English hashtags
   c. Create/fill Canva design via Canva MCP
   d. Present: caption preview + Canva design link
   e. Wait for "yes" then publish (or give image+caption for manual posting until Phase 4)

Post sequence for a full match day:
  Pre-match: Head-to-head, Key players, Predicted XI
  Live: Toss, milestones (50/100/5wkt), BREAKING events, end-of-innings
  Post-match: Result, MOM, Key plays carousel

---

### RSSHub (Social Account Bridge)
RSSHub runs at http://localhost:1200 — bridges Twitter/X, Instagram, Facebook, YouTube to RSS.

```bash
# Check RSSHub is running
curl http://localhost:1200/

# Latest tweets from @IPL
curl http://localhost:1200/twitter/user/IPL

# Latest from a Facebook page
curl http://localhost:1200/facebook/page/ipl

# Latest from a YouTube channel (replace UCXXXXXX with channel ID)
curl http://localhost:1200/youtube/channel/UCmqvpsOEV4QdyOaHaWuMnzA
```

RSSHub feeds are also added to the CMS RSS sources table so Celery polls them automatically every few minutes.
