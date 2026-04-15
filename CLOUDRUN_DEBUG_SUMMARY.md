# CloudRun Deployment Debug Summary

## Current Status
- **Error**: GitHub Actions deployment failing at "Deploy to Cloud Run" step
- **Root Cause**: Missing Google Cloud authentication secrets in GitHub
- **Severity**: 🔴 Blocking - prevents all deployments

---

## What's Broken

### GitHub Actions Workflow Issues

1. **Authentication Failure** ❌
   - Workflow file: `.github/workflows/deploy-cloud-run.yml`
   - Missing GitHub secrets:
     - `GOOGLE_PROJECT_ID`
     - `WIF_PROVIDER`
     - `WIF_SERVICE_ACCOUNT`
   - Solution: See `GITHUB_ACTIONS_SETUP.md`

2. **Deprecated Node.js Actions** ⚠️
   - `actions/checkout@v4` 
   - `google-github-actions/auth@v1`
   - `google-github-actions/setup-gcloud@v1`
   - Will be forced to Node.js 24 by June 2026
   - Fix: Update to latest versions

3. **Cloud SQL Storage Type** ❌
   - Invalid value: `PD_HDD` (deprecated)
   - Valid options: `HDD`, `SSD`, `HYPERDISK_BALANCED`
   - Affects: `setup-gcp-complete.py`

---

## Setup Progress

### ✅ Completed
- [x] Cloned `pavilion-ai-agentic` repository locally
- [x] Verified GCP project exists: `pavilion-ai-agentic`
- [x] Installed required Python libraries (google-cloud-iam, etc.)
- [x] Generated `.env` file with GCP configuration
- [x] Created service account: `pavilion-agentic@pavilion-ai-agentic.iam.gserviceaccount.com`
- [x] Docker image paths fixed (recent commits show this is resolved)
- [x] Created `GITHUB_ACTIONS_SETUP.md` guide

### ⏳ In Progress (Manual Steps Needed)
- [ ] Set up Workload Identity Federation in GCP Console
- [ ] Create GitHub Secrets in repository settings
- [ ] Test deployment with new secrets

### ⏸️ Not Started
- [ ] Fix deprecated GitHub Actions
- [ ] Set up Cloud SQL instance
- [ ] Create database and users
- [ ] Run database migrations
- [ ] Health check validation

---

## What You Need to Do Now

### Priority 1: Add GitHub Secrets (15 minutes)
Follow the steps in `GITHUB_ACTIONS_SETUP.md`:
1. Create Workload Identity Pool & Provider in GCP
2. Link GitHub repo to service account
3. Add 3 secrets to GitHub repository
4. Test with a push

### Priority 2: Fix Deprecated Actions (5 minutes)
Update `.github/workflows/deploy-cloud-run.yml`:

Current:
```yaml
uses: actions/checkout@v4
uses: google-github-actions/setup-gcloud@v1
uses: google-github-actions/auth@v1
```

Update to:
```yaml
uses: actions/checkout@v4  # Latest
uses: google-github-actions/setup-gcloud@v2
uses: google-github-actions/auth@v2
```

### Priority 3: Fix Cloud SQL Creation (Optional)
The setup script has an invalid storage type. If you need to recreate Cloud SQL:

Replace `--storage-type=PD_HDD` with `--storage-type=HDD` in setup scripts.

---

## Key Files

| File | Purpose | Status |
|------|---------|--------|
| `.github/workflows/deploy-cloud-run.yml` | GitHub Actions workflow | ⚠️ Needs secrets & updates |
| `docker/Dockerfile.cloudrun` | Cloud Run Docker image | ✅ Ready |
| `backend/requirements-minimal.txt` | Production dependencies | ✅ Ready |
| `.env` | GCP configuration | ✅ Generated |
| `GITHUB_ACTIONS_SETUP.md` | Setup guide | ✅ Created |

---

## Architecture

```
┌─────────────┐
│   GitHub    │
│   (Code)    │
└──────┬──────┘
       │ Push
       │ ↓
┌──────────────────────────────────────┐
│  GitHub Actions Workflow             │
│  (Authenticate → Build → Push → Deploy)
└──────┬───────────────────────────────┘
       │ Workload Identity Federation
       │ ↓
┌──────────────────────────────────────┐
│    GCP (pavilion-ai-agentic)         │
│  ├─ Artifact Registry (Docker image) │
│  ├─ Cloud Run (Service)              │
│  ├─ Cloud SQL (Database)             │
│  └─ Cloud Storage (Media)            │
└──────────────────────────────────────┘
```

---

## Testing Checklist

Once secrets are added:

```bash
# 1. Verify secrets are in GitHub
# Go to: https://github.com/nisarp1/pavilion-ai-agentic/settings/secrets/actions

# 2. Trigger deployment
git commit --allow-empty -m "Test CloudRun with WIF"
git push origin main

# 3. Check workflow status
# Go to: https://github.com/nisarp1/pavilion-ai-agentic/actions

# 4. If successful, you should see:
# ✓ Checkout code
# ✓ Authenticate to Google Cloud
# ✓ Configure Docker
# ✓ Build Docker image
# ✓ Push Docker image
# ✓ Deploy to Cloud Run
# ✓ Health check passed
```

---

## Common Issues & Solutions

### "No authentication found"
- Missing GitHub secrets
- **Fix**: Follow `GITHUB_ACTIONS_SETUP.md`

### "Invalid storage type PD_HDD"
- Cloud SQL creation failure
- **Fix**: Use `HDD`, `SSD`, or `HYPERDISK_BALANCED`

### "Health check failed"
- Service not responding at `/api/health/`
- **Fix**: Check service logs in Cloud Run console

### "Database migration failed"
- Cloud SQL not set up or unreachable
- **Fix**: Ensure Cloud SQL instance exists and has proper network config

---

## Next Steps (Phased Approach)

### Phase 1: Authentication ✅ Documentation Done
**Goal**: Enable GitHub Actions to deploy
- Set up Workload Identity Federation
- Add GitHub Secrets
- Test with empty commit

### Phase 2: Database Setup (After Phase 1)
**Goal**: Create Cloud SQL database for persistence
- Create Cloud SQL instance
- Create database: `pavilion_agentic`
- Create user: `pavilion_app` with password
- Store password in Secret Manager

### Phase 3: Application Deployment (After Phase 2)
**Goal**: Run full deployment pipeline
- Push code to main/staging branch
- GitHub Actions builds & pushes Docker image
- Cloud Run deploys service
- Migrations run automatically
- Health checks pass

### Phase 4: Production Hardening (After Phase 3)
**Goal**: Production-ready deployment
- Configure auto-scaling
- Set up monitoring & alerts
- Configure custom domain
- Set up CI/CD triggers for branches
- Document runbook

---

## Questions?

- **GitHub Actions issue**: See `GITHUB_ACTIONS_SETUP.md`
- **Deployment details**: See `DEPLOYMENT_READY.md`
- **Local development**: See `docker-compose.dev.yml`
- **Production setup**: See `PRODUCTION_SETUP.md`

---

**Status**: 🔧 Debugging CloudRun Authentication | Phase 1 of 4 | ~60% Complete

