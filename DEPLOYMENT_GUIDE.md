# Pavilion AI - Deployment Guide (Option B: Separate Services)

## Overview

This guide covers deploying Pavilion AI as **two separate Cloud Run services**:
- **Backend API** (pavilion-api-prod, pavilion-api-staging, pavilion-api-dev)
- **Frontend SPA** (pavilion-frontend-prod, pavilion-frontend-staging, pavilion-frontend-dev)

**Benefits of this approach:**
- Independent scaling for frontend and backend
- Separate resource allocation (frontend: 512Mi, backend: 2Gi)
- Better performance isolation (video traffic won't impact API)
- CDN-ready for frontend assets
- Recommended for 60-70 clients × 70 articles + 20-30 videos/day

---

## Prerequisites

1. **Google Cloud Project** with:
   - Cloud Run API enabled
   - Cloud SQL enabled
   - Container Registry enabled
   - Service account with appropriate roles

2. **GitHub Repository** with:
   - GitHub Secrets configured
   - Workload Identity Federation set up

3. **Google OAuth Credentials** from GCP Console:
   - Client ID (for frontend)
   - Client Secret (for backend)

4. **Domain Setup**:
   - Main domain: `app.example.com`
   - Subdomains: `*.app.example.com` (wildcard)
   - Custom domains: DNS CNAMEs to Cloud Run

---

## Phase 1: Google OAuth Setup (15 minutes)

### Step 1: Create OAuth 2.0 Credentials

```bash
# In GCP Console:
# 1. Go to APIs & Services → Credentials
# 2. Create OAuth 2.0 Client ID (Web Application)
# 3. Add Authorized Redirect URIs:
#    - https://app.example.com/auth/google/callback
#    - https://staging.app.example.com/auth/google/callback (staging)
#    - https://dev.app.example.com/auth/google/callback (dev)
#    - http://localhost:5173/auth/google/callback (local dev)
#    - http://localhost:3000/auth/google/callback (local dev)
```

### Step 2: Save Credentials

```bash
# Frontend: Client ID
# Add to GitHub Secrets as: VITE_GOOGLE_CLIENT_ID

# Backend: Client Secret
# Store in GCP Secret Manager:
gcloud secrets create google-oauth-client-secret \
  --replication-policy="automatic" \
  --data-file=- <<< "your-client-secret-here"

# Also add to GitHub Secrets as: GOOGLE_OAUTH_CLIENT_SECRET
```

---

## Phase 2: GitHub Secrets Configuration (10 minutes)

Add these secrets to your GitHub repository:

### GCP & Deployment
```
GOOGLE_PROJECT_ID          # Your GCP project ID
WIF_PROVIDER               # Workload Identity Provider URI
WIF_SERVICE_ACCOUNT        # Service account email
```

### Frontend
```
VITE_GOOGLE_CLIENT_ID      # Google OAuth Client ID
```

### Backend Secrets
```
GOOGLE_OAUTH_CLIENT_SECRET # Google OAuth Client Secret
DJANGO_SECRET_KEY          # Django secret key (generate new one)
DB_PASSWORD                # Cloud SQL password
```

### Example GitHub Secret Setup
```bash
gh secret set GOOGLE_PROJECT_ID --body "your-project-id"
gh secret set VITE_GOOGLE_CLIENT_ID --body "your-client-id.apps.googleusercontent.com"
gh secret set GOOGLE_OAUTH_CLIENT_SECRET --body "your-client-secret"
gh secret set DJANGO_SECRET_KEY --body "$(openssl rand -base64 50)"
gh secret set DB_PASSWORD --body "your-secure-password"
```

---

## Phase 3: Backend Deployment (First Deployment Only)

### Step 1: Create Cloud SQL Database

```bash
# Create PostgreSQL instance
gcloud sql instances create pavilion-db-prod \
  --database-version POSTGRES_15 \
  --tier db-f1-micro \
  --region us-central1 \
  --no-backup \
  --availability-type ZONAL

# Create database
gcloud sql databases create pavilion_agentic \
  --instance pavilion-db-prod

# Set root password
gcloud sql users set-password postgres \
  --instance pavilion-db-prod \
  --password your-secure-password
```

### Step 2: Run Database Migrations

The deployment workflow automatically runs migrations via the entrypoint script.

**Manual migration (if needed):**
```bash
# In Cloud Run service shell:
python manage.py migrate
python manage.py collectstatic --noinput
```

### Step 3: Create Superuser (One-time)

```bash
# Use Django management command
python manage.py createsuperuser
# Username: admin
# Email: your-email@example.com
# Password: secure-password
```

### Step 4: Trigger Backend Deployment

```bash
# Backend deploys automatically on push to main/staging/develop
git push origin main

# Or manually trigger:
gh workflow run deploy-cloud-run.yml
```

**Verify deployment:**
```bash
# Check service
gcloud run services describe pavilion-api-prod --region us-central1

# Test health endpoint
curl https://pavilion-api-prod-xxx-uc.a.run.app/health/
# Should return: 200 OK
```

---

## Phase 4: Frontend Deployment (After Backend is Running)

### Step 1: Update Backend URL in Frontend Workflow

The workflow automatically uses the correct API URL:
- Production: `https://pavilion-api-prod-xxx-uc.a.run.app/api`
- Staging: `https://pavilion-api-staging-xxx-uc.a.run.app/api`
- Development: `https://pavilion-api-dev-xxx-uc.a.run.app/api`

### Step 2: Trigger Frontend Deployment

```bash
# Frontend deploys automatically on push to main/staging/develop
# Changes to frontend/ trigger the workflow
git push origin main

# Or manually trigger:
gh workflow run deploy-frontend-cloudrun.yml
```

**Verify deployment:**
```bash
# Check service
gcloud run services describe pavilion-frontend-prod --region us-central1

# Test frontend
curl https://pavilion-frontend-prod-xxx-uc.a.run.app/
# Should return HTML
```

---

## Phase 5: Domain Configuration (20 minutes)

### Step 1: Configure Primary Domain

```bash
# Add custom domain to backend service
gcloud run domain-mappings create \
  --service=pavilion-api-prod \
  --domain=api.example.com \
  --region=us-central1

# Add custom domain to frontend service
gcloud run domain-mappings create \
  --service=pavilion-frontend-prod \
  --domain=app.example.com \
  --region=us-central1
```

### Step 2: Update DNS Records

```bash
# Get verification records from Cloud Run
gcloud run domain-mappings describe app.example.com

# Add DNS records:
app.example.com          A      <IP from gcloud>
staging.app.example.com  A      <IP from gcloud>
dev.app.example.com      A      <IP from gcloud>

# For wildcard subdomains:
*.app.example.com        A      <frontend IP>

# For custom tenant domains (per tenant):
customer1.com            CNAME  pavilion-frontend-prod-xxx.a.run.app
customer2.com            CNAME  pavilion-frontend-prod-xxx.a.run.app
```

### Step 3: Configure SSL Certificates

```bash
# Cloud Run provides free managed SSL certificates
# Just ensure DNS is set up correctly

# Verify SSL
curl -I https://app.example.com/
# Should show 200 OK with SSL certificate
```

---

## Phase 6: Tenant Configuration

### Step 1: Create First Tenant

```bash
# Access Django admin
https://api.example.com/admin/
# Login with superuser credentials

# Create tenant:
# Name: Acme Corp
# Slug: acme
# Subdomain: acme
# Custom Domain: (optional)

# Set branding:
{
  "logo_url": "https://cdn.example.com/acme-logo.png",
  "favicon_url": "https://cdn.example.com/acme-favicon.ico",
  "primary_color": "#1f2937",
  "secondary_color": "#10b981",
  "accent_color": "#3b82f6",
  "company_name": "Acme Corp",
  "header_bg_color": "#ffffff",
  "header_text_color": "#1f2937"
}
```

### Step 2: Test Multi-Tenant Routing

```bash
# Main domain with tenant selection
https://app.example.com
# User selects tenant → accesses via tenant

# Subdomain routing
https://acme.app.example.com
# Automatically detects tenant from subdomain

# Custom domain
https://acme.com
# Automatically detects tenant from custom domain
```

---

## Phase 7: GitHub Actions Workflows

### Backend Workflow (deploy-cloud-run.yml)

**Triggers:**
- Push to main → Deploy to production
- Push to staging → Deploy to staging
- Push to develop → Deploy to development

**Steps:**
1. Checkout code
2. Setup Google Cloud SDK
3. Authenticate via Workload Identity Federation
4. Build Docker image with frontend build args
5. Push to Artifact Registry
6. Deploy to Cloud Run
7. Run database migrations

### Frontend Workflow (deploy-frontend-cloudrun.yml)

**Triggers:**
- Push to frontend/ OR any branch
- Manual trigger via `gh workflow run`

**Steps:**
1. Checkout code
2. Setup Google Cloud SDK
3. Authenticate via Workload Identity Federation
4. Build Docker image for frontend
5. Push to Artifact Registry
6. Deploy to Cloud Run
7. Verify deployment

---

## Monitoring & Logs

### View Deployment Status

```bash
# Backend
gcloud run services describe pavilion-api-prod --region us-central1

# Frontend
gcloud run services describe pavilion-frontend-prod --region us-central1
```

### View Logs

```bash
# Backend logs
gcloud run services logs read pavilion-api-prod --limit 100 --region us-central1

# Frontend logs
gcloud run services logs read pavilion-frontend-prod --limit 100 --region us-central1

# Real-time logs
gcloud alpha run services logs read pavilion-api-prod --region us-central1 --follow
```

### Monitor Performance

```bash
# View metrics in Cloud Console
gcloud run services describe pavilion-api-prod --show-executions

# Check error rates
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=pavilion-api-prod" --limit 50
```

---

## Troubleshooting

### Frontend Returns 404

**Issue:** Frontend loads but routes return 404

**Solution:**
```bash
# Verify frontend deployment has index.html
gcloud run services describe pavilion-frontend-prod --region us-central1

# Check 'serve' is working:
curl https://pavilion-frontend-prod-xxx-uc.a.run.app/login
# Should serve index.html (200), not 404
```

### CORS Errors

**Issue:** Frontend can't reach backend API

**Solution:**
```bash
# Check CORS configuration
curl -H "Origin: https://pavilion-frontend-prod-xxx-uc.a.run.app" \
     -H "Access-Control-Request-Method: GET" \
     https://pavilion-api-prod-xxx-uc.a.run.app/api/articles/

# Should include: Access-Control-Allow-Origin header

# If missing, verify CORS_ALLOWED_ORIGIN_REGEXES in settings.py
```

### Google OAuth Callback 401

**Issue:** "Invalid token" after Google login

**Solution:**
```bash
# Verify Google Client Secret is set:
gcloud secrets versions access latest --secret=google-oauth-client-secret

# Update deployment to use the secret
# Edit deploy-cloud-run.yml to include secret mounting
```

### Database Connection Errors

**Issue:** "Connection refused" or "Invalid connection option"

**Solution:**
```bash
# Verify Cloud SQL Connector is installed
pip list | grep cloud-sql-python-connector

# Check database credentials
gcloud sql instances describe pavilion-db-prod

# Test connection
gcloud sql connect pavilion-db-prod --user=postgres
```

---

## Scaling Configuration

### Backend Auto-Scaling

```bash
gcloud run services update pavilion-api-prod \
  --min-instances 1 \
  --max-instances 100 \
  --memory 2Gi \
  --cpu 1 \
  --region us-central1
```

### Frontend Auto-Scaling

```bash
gcloud run services update pavilion-frontend-prod \
  --min-instances 1 \
  --max-instances 50 \
  --memory 512Mi \
  --cpu 1 \
  --region us-central1
```

---

## Cost Estimation

For 60-70 clients with 70 articles + 20-30 videos per day:

| Service | CPU | Memory | Requests/Day | Estimated Cost |
|---------|-----|--------|--------------|-----------------|
| Backend API | 1 vCPU | 2 GB | ~10K | $15-25/mo |
| Frontend | 1 vCPU | 512MB | ~50K | $20-30/mo |
| Cloud SQL | f1-micro | 614MB | - | $5-10/mo |
| **Total** | - | - | - | **$40-65/mo** |

---

## Backup & Recovery

### Automated Backups

Cloud Run automatically versions deployments. To rollback:

```bash
# Get previous revisions
gcloud run revisions list --service=pavilion-api-prod --region=us-central1

# Route traffic to previous revision
gcloud run services update-traffic pavilion-api-prod \
  --to-revisions REVISION_NAME=100
```

### Database Backups

```bash
# Create manual backup
gcloud sql backups create \
  --instance=pavilion-db-prod

# List backups
gcloud sql backups list --instance=pavilion-db-prod

# Restore from backup (if needed)
gcloud sql backups restore BACKUP_ID \
  --backup-instance=pavilion-db-prod
```

---

## Next Steps

1. ✅ **Phase 1:** Set up Google OAuth in GCP Console
2. ✅ **Phase 2:** Configure GitHub Secrets
3. ✅ **Phase 3:** Deploy backend to Cloud Run
4. ✅ **Phase 4:** Deploy frontend to Cloud Run
5. ✅ **Phase 5:** Configure custom domains
6. ✅ **Phase 6:** Create tenants and test multi-tenancy
7. ✅ **Phase 7:** Monitor and optimize

---

## Support Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Django Deployment Guide](https://docs.djangoproject.com/en/4.2/howto/deployment/)
- [React Router Documentation](https://reactrouter.com)

