# Quick Start Deployment Checklist (Option B - Separate Services)

## ✅ What's Already Done (Implementation Complete)

### Backend
- ✅ RBAC permission classes (admin, editor, viewer roles)
- ✅ Google OAuth endpoint (`/api/auth/google/callback/`)
- ✅ Branding endpoints (`/api/tenants/branding/`, `/api/tenants/lookup/`, `/api/tenants/me_config/`)
- ✅ Cloud Run deployment workflow (deploy-cloud-run.yml)
- ✅ Docker configuration with Cloud SQL Connector
- ✅ Database migrations and health checks

### Frontend
- ✅ Google OAuth login component
- ✅ Branding system (Redux + CSS variables)
- ✅ Multi-tenant domain detection
- ✅ Separate Cloud Run deployment (deploy-frontend-cloudrun.yml)
- ✅ SPA routing with 'serve' package

### Documentation
- ✅ Complete deployment guide (DEPLOYMENT_GUIDE.md)
- ✅ Troubleshooting guide
- ✅ Cost estimation
- ✅ Scaling configuration

---

## 🚀 What You Need to Do (7 Steps, ~2 hours total)

### Step 1: Google OAuth Setup (15 min) ⏰
```
Location: GCP Console > APIs & Services > Credentials
✓ Create OAuth 2.0 Web Application credentials
✓ Add redirect URIs (see DEPLOYMENT_GUIDE.md Phase 1)
✓ Save Client ID → Add to GitHub Secret: VITE_GOOGLE_CLIENT_ID
✓ Save Client Secret → Add to GitHub Secret: GOOGLE_OAUTH_CLIENT_SECRET
```

**Time Required:** 15 minutes

---

### Step 2: GitHub Secrets (10 min) ⏰
```bash
gh secret set GOOGLE_PROJECT_ID --body "your-project-id"
gh secret set VITE_GOOGLE_CLIENT_ID --body "your-client-id"
gh secret set GOOGLE_OAUTH_CLIENT_SECRET --body "your-client-secret"
gh secret set DJANGO_SECRET_KEY --body "$(openssl rand -base64 50)"
gh secret set DB_PASSWORD --body "your-secure-password"
gh secret set WIF_PROVIDER --body "your-wif-provider"
gh secret set WIF_SERVICE_ACCOUNT --body "your-service-account"
```

**Time Required:** 10 minutes

---

### Step 3: Create Cloud SQL Database (10 min) ⏰
```bash
gcloud sql instances create pavilion-db-prod \
  --database-version POSTGRES_15 \
  --tier db-f1-micro \
  --region us-central1 \
  --no-backup

gcloud sql databases create pavilion_agentic \
  --instance pavilion-db-prod

gcloud sql users set-password postgres \
  --instance pavilion-db-prod \
  --password your-secure-password
```

**Time Required:** 10 minutes

---

### Step 4: Deploy Backend (20 min) ⏰
```bash
# Trigger deployment (automatic on push)
git push origin main

# Monitor deployment
gcloud run services logs read pavilion-api-prod --limit 100 --region us-central1

# Verify it's running
curl https://pavilion-api-prod-<hash>-uc.a.run.app/health/
# Should return: 200 OK
```

**Time Required:** 15-20 minutes (includes build + startup time)

---

### Step 5: Deploy Frontend (15 min) ⏰
```bash
# Trigger deployment (automatic on push to frontend/)
# Or manually:
gh workflow run deploy-frontend-cloudrun.yml

# Monitor deployment
gcloud run services logs read pavilion-frontend-prod --limit 100 --region us-central1

# Verify it's running
curl https://pavilion-frontend-prod-<hash>-uc.a.run.app/
# Should return: HTML (index.html)
```

**Time Required:** 10-15 minutes (includes build + startup time)

---

### Step 6: Configure Domains (20 min) ⏰
```bash
# Option A: Use Cloud Run default domains (fast, for testing)
# No DNS needed, use: pavilion-api-prod-<hash>-uc.a.run.app

# Option B: Custom domain (recommended for production)
gcloud run domain-mappings create \
  --service=pavilion-frontend-prod \
  --domain=app.example.com \
  --region=us-central1

# Get DNS records and add to your domain registrar
# See DEPLOYMENT_GUIDE.md Phase 5 for details
```

**Time Required:** 5-20 minutes (depends on DNS propagation)

---

### Step 7: Create First Tenant & Test (20 min) ⏰
```bash
# Access Django admin
https://pavilion-api-prod-<hash>-uc.a.run.app/admin/
# Login: admin / (create via manage.py createsuperuser)

# Create tenant:
Name: Acme Corp
Slug: acme
Subdomain: acme
Branding: Add colors, logo URL, etc.

# Test multi-tenant routing:
https://acme.app.example.com/ → Should show Acme branding
https://app.example.com/ → Tenant selector page
```

**Time Required:** 10-20 minutes

---

## 📊 Timeline Summary

| Step | Task | Time | Status |
|------|------|------|--------|
| 1 | Google OAuth Setup | 15 min | ⏳ USER ACTION |
| 2 | GitHub Secrets | 10 min | ⏳ USER ACTION |
| 3 | Create Cloud SQL | 10 min | ⏳ USER ACTION |
| 4 | Deploy Backend | 20 min | ⏳ USER ACTION |
| 5 | Deploy Frontend | 15 min | ⏳ USER ACTION |
| 6 | Configure Domains | 20 min | ⏳ USER ACTION |
| 7 | Create Tenant & Test | 20 min | ⏳ USER ACTION |
| **Total** | | **110 min** | |

---

## 🔗 Important URLs After Deployment

```
Backend API:           https://pavilion-api-prod-<hash>-uc.a.run.app
Frontend:              https://pavilion-frontend-prod-<hash>-uc.a.run.app
Django Admin:          https://pavilion-api-prod-<hash>-uc.a.run.app/admin/
Health Check:          https://pavilion-api-prod-<hash>-uc.a.run.app/health/

API Docs (after setup):
- Articles:            /api/articles/
- Categories:          /api/categories/
- RSS Feeds:           /api/rss/feeds/
- Tenants:             /api/tenants/
```

---

## 🧪 Testing Checklist (After Deployment)

- [ ] Can access frontend at deployed URL
- [ ] Can click "Sign in with Google" button
- [ ] Google OAuth redirect works
- [ ] After auth, redirected to dashboard
- [ ] User sees correct tenant branding (colors, logo)
- [ ] Can create/edit articles
- [ ] Can create second tenant in admin
- [ ] Second tenant has different branding
- [ ] Subdomain routing works (`acme.app.example.com`)
- [ ] Cross-tenant isolation verified (User A can't see User B's data)
- [ ] Performance is good (check Cloud Run metrics)

---

## 📞 Common Issues & Quick Fixes

### "Frontend returns 404"
→ Check `serve` is running: `curl https://pavilion-frontend-prod-xxx-uc.a.run.app/login`

### "CORS error when accessing API"
→ Verify backend CORS settings include frontend URL in `CORS_ALLOWED_ORIGIN_REGEXES`

### "Google OAuth says 'Invalid token'"
→ Verify `GOOGLE_OAUTH_CLIENT_SECRET` is correct in GitHub Secrets

### "Database connection refused"
→ Check Cloud SQL instance is running: `gcloud sql instances list`

### "Import error: cloud_sql_python_connector"
→ Verify `requirements.txt` includes `cloud-sql-python-connector>=1.4.0`

---

## 📖 Detailed Documentation

For complete information, see: **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**

Contains:
- Step-by-step instructions for each phase
- Troubleshooting guide
- Monitoring and logging
- Scaling configuration
- Backup and recovery
- Cost estimation

---

## ✨ Features Ready to Use

### Multi-Tenancy
- ✅ Subdomain-based routing (`acme.app.example.com`)
- ✅ Custom domain support (`customer.com`)
- ✅ Auto-tenant detection
- ✅ Per-tenant branding

### Google OAuth
- ✅ One-click Google login
- ✅ Auto-user creation
- ✅ Auto-tenant membership
- ✅ Email verification

### Role-Based Access
- ✅ Admin role (user management, all access)
- ✅ Editor role (content creation)
- ✅ Viewer role (read-only access)
- ✅ API-level permission enforcement

### White-Labeling
- ✅ Per-tenant colors (primary, secondary, accent)
- ✅ Company name and logo
- ✅ Custom fonts
- ✅ Header theming

---

## 🎯 Success Criteria

You'll know the deployment is successful when:

1. **Backend is running**
   ```bash
   curl https://pavilion-api-prod-<hash>-uc.a.run.app/health/
   # Response: 200 OK
   ```

2. **Frontend is running**
   ```bash
   curl https://pavilion-frontend-prod-<hash>-uc.a.run.app/
   # Response: HTML (React app)
   ```

3. **Google OAuth works**
   - Click "Sign in with Google"
   - Authenticate with Google account
   - Redirected to dashboard

4. **Multi-tenancy works**
   - Access via subdomain: `acme.app.example.com`
   - See Acme branding
   - Access via different tenant: see different branding

5. **API isolation works**
   - Create article in Tenant A
   - Switch to Tenant B
   - Can't see Tenant A's articles

---

## 🚀 Ready to Deploy?

Start with **Step 1: Google OAuth Setup** →

Then follow the checklist in order. Each step builds on the previous one.

Good luck! 🎉

