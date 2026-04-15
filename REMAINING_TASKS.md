# Remaining Tasks - Quick Checklist

## ✅ Already Done (from git clone)

- [x] Repository cloned locally
- [x] Setup scripts included in repo
- [x] Docker files configured
- [x] GitHub Actions workflow defined
- [x] Django backend ready
- [x] React frontend ready
- [x] `.env` file created
- [x] GCP project exists: `pavilion-ai-agentic`

---

## ⏳ REMAINING WORK (4 Phases)

### 🟡 PHASE 1: Workload Identity Setup (30 min) 
**Status**: NOT STARTED

- [ ] Run WIF setup script
  ```bash
  cd /Applications/MAMP/htdocs/pavilion-ai-agentic
  source gcp_setup_env/bin/activate
  bash setup-wif-github.sh
  ```
  
- [ ] Copy 3 secrets from output:
  - [ ] `GOOGLE_PROJECT_ID`
  - [ ] `WIF_PROVIDER`
  - [ ] `WIF_SERVICE_ACCOUNT`

- [ ] Add secrets to GitHub
  - [ ] Go to: https://github.com/nisarp1/pavilion-ai-agentic/settings/secrets/actions
  - [ ] Create 3 new repository secrets

---

### 🟡 PHASE 2: Cloud SQL Setup (45 min)
**Status**: NOT STARTED

- [ ] Create Cloud SQL Instance
  ```bash
  source gcp_setup_env/bin/activate
  gcloud sql instances create pavilion-db-dev \
      --database-version=POSTGRES_15 \
      --tier=db-f1-micro \
      --storage-type=HDD \
      --storage-auto-increase \
      --region=us-central1
  ```

- [ ] Create database user `pavilion_app`
  ```bash
  gcloud sql users create pavilion_app \
      --instance=pavilion-db-dev \
      --password=[SECURE-PASSWORD]
  ```

- [ ] Create database `pavilion_agentic`
  ```bash
  gcloud sql databases create pavilion_agentic \
      --instance=pavilion-db-dev
  ```

- [ ] Update `.env` with database password
  ```
  CLOUD_SQL_PASSWORD=[password-from-above]
  ```

---

### 🟡 PHASE 3: Deploy & Test (10 min)
**Status**: NOT STARTED

- [ ] Push code to trigger GitHub Actions
  ```bash
  git commit --allow-empty -m "Deploy: CloudRun initial deployment"
  git push origin main
  ```

- [ ] Monitor workflow at: https://github.com/nisarp1/pavilion-ai-agentic/actions

- [ ] Verify deployment succeeded

---

### 🟢 PHASE 4: Optional Hardening (20 min)
**Status**: OPTIONAL

- [ ] Update deprecated GitHub Actions (v1 → v2)
- [ ] Configure auto-scaling in Cloud Run
- [ ] Set up monitoring & alerts
- [ ] Configure custom domain
- [ ] Enable SSL/TLS

---

## 📊 Summary

| Item | Status | Time | Blocking |
|------|--------|------|----------|
| Phase 1: WIF Setup | ❌ TODO | 30 min | ✅ YES |
| Phase 2: Cloud SQL | ❌ TODO | 45 min | ✅ YES |
| Phase 3: Deploy Test | ❌ TODO | 10 min | ✅ YES |
| Phase 4: Hardening | ❌ TODO | 20 min | ❌ NO |

**Total Time to Working Deployment**: ~1.5 hours

---

## GCP Resources Status

**Currently Created**:
- ✅ GCP Project: `pavilion-ai-agentic`
- ✅ Service Account (empty for now)
- ✅ APIs enabled

**Not Yet Created**:
- ❌ Workload Identity Pool
- ❌ OIDC Provider
- ❌ Service Account with roles
- ❌ Cloud SQL Instance
- ❌ Database & User
- ❌ Cloud Run Service
- ❌ Artifact Registry entries

---

## GitHub Status

**Secrets Setup**:
- ❌ `GOOGLE_PROJECT_ID` - NOT SET
- ❌ `WIF_PROVIDER` - NOT SET
- ❌ `WIF_SERVICE_ACCOUNT` - NOT SET

**Workflow**:
- 🔴 Currently FAILING (no auth)
- Will PASS once Phase 1 complete

---

## 🚀 Start Here

**Step 1**: Open terminal
```bash
cd /Applications/MAMP/htdocs/pavilion-ai-agentic
source gcp_setup_env/bin/activate
bash setup-wif-github.sh
```

**Step 2**: Copy the 3 secrets from output

**Step 3**: Add them to GitHub at the secrets URL

**Step 4**: Come back and do Phase 2 (Cloud SQL)

---

**Estimated completion**: End of today 🎉

