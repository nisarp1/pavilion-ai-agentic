# 🎯 GCP Console Setup - Step-by-Step Guide

**Time Required**: 10 minutes  
**Difficulty**: Very Easy (just clicking and copying)  
**No Coding Required**: Only console clicks

---

## ✅ STEP 1: Enable Secret Manager API

### Navigate to APIs
1. Go to: https://console.cloud.google.com
2. Click **☰ (hamburger menu)** top left
3. Click **APIs & Services**
4. Click **Enable APIs and Services** (blue button at top)

### Search for Secret Manager
5. Search box appears at top → Type: `secret manager`
6. Click **Secret Manager API** from results

### Enable It
7. Click the blue **ENABLE** button
8. Wait 30 seconds for it to load
9. You'll see "API Enabled" ✓

**Status**: ✅ Done! Secret Manager is now enabled

---

## ✅ STEP 2: Create Service Account

### Go to Service Accounts
1. Click **☰ (hamburger menu)** again
2. Click **IAM & Admin**
3. Click **Service Accounts** (left sidebar)

### Create New Service Account
4. Click blue **+ CREATE SERVICE ACCOUNT** button at top
5. A form appears...

### Fill Service Account Details
```
Name: pavilion-app
Description: Pavilion Agentic CMS Production
```
6. Click **CREATE AND CONTINUE**

### Grant Roles (Grant Permissions Page)
You'll see a page with "Grant this service account access to project"

Click **SELECT A ROLE** dropdown and add these 7 roles (click the dropdown 7 times):

```
1. Vertex AI User
2. Cloud SQL Client
3. Cloud SQL Admin
4. Storage Object Creator
5. Storage Object Viewer
6. Secret Manager Secret Accessor
7. Logging Log Writer
```

**How to add each role:**
- Click **SELECT A ROLE** dropdown
- Type role name (e.g., "vertex ai user")
- Click the role from suggestions
- You'll see it added below

7. After adding all 7 roles, click **CONTINUE**

### Final Page
8. You'll see a summary page
9. Click **DONE** at bottom

**Status**: ✅ Done! Service account `pavilion-app` created

---

## ✅ STEP 3: Create Cloud SQL Database

### Go to Cloud SQL
1. Click **☰ (hamburger menu)**
2. Search for `Cloud SQL` 
3. Click **Cloud SQL**

### Select Instance
4. You'll see `pavilion-db-dev` in the list
5. Click on it to open the instance details

### Create Database
6. Look for **DATABASES** tab (in the middle tabs)
7. Click **+ CREATE DATABASE** button

### Database Form
```
Name: pavilion_agentic
Character set: utf8mb4
Collation: utf8mb4_unicode_ci
```
8. Click **CREATE**
9. Wait for green checkmark ✓

**Status**: ✅ Done! Database `pavilion_agentic` created

---

## ✅ STEP 4: Create Database User

### Still in Cloud SQL Instance
You should still be in the `pavilion-db-dev` instance page

### Go to Users Tab
1. Click **USERS** tab (next to Databases)
2. Click **+ CREATE USER ACCOUNT** button

### User Details Form
```
Username: pavilion_app
Password: (Click "Generate password")
```
3. In the Username field, type: `pavilion_app`
4. For Password, click the **GENERATE PASSWORD** button
   - A strong password will be generated automatically
   - **COPY THIS PASSWORD** - save it somewhere!
   - You'll need it in the next step

### Create User
5. Click **CREATE** button
6. Wait for it to complete ✓

**⚠️ IMPORTANT: Copy and save the password!**

Example password (yours will be different):
```
Ab3Cd5EfGhIjKlMnOpQrStUvWxYz1234!
```

**Status**: ✅ Done! User `pavilion_app` created with strong password

---

## ✅ STEP 5: Store Password in Secret Manager

### Go to Secret Manager
1. Click **☰ (hamburger menu)**
2. Search for `Secret Manager`
3. Click **Secret Manager**

### Create New Secret
4. Click **+ CREATE SECRET** button (top)

### Secret Form
```
Name: pavilion-db-password
```

5. In the **Name** field, type: `pavilion-db-password`

### Paste Password
6. In the **Secret value** field, paste the password from Step 4
   - This is the password you saved
   - Just paste it in the text box

7. Keep other settings as default:
   - Replication policy: **Automatic**

8. Click **CREATE SECRET** button

9. You'll see a success message ✓

**Status**: ✅ Done! Password safely stored in Secret Manager

---

## 🎉 COMPLETED!

You've now completed all 5 console steps:

- ✅ Secret Manager API enabled
- ✅ Service account `pavilion-app` created with 7 roles
- ✅ Database `pavilion_agentic` created
- ✅ Database user `pavilion_app` created
- ✅ Password stored in Secret Manager

---

## 🚀 Next: Start Local Development

Now that GCP is set up, run these commands:

```bash
cd ~/pavilion-ai-agentic

# Start all services
docker-compose -f docker-compose.dev.yml up -d

# Test the API
curl http://localhost:8000/api/health/
```

You should see:
```json
{
  "status": "ok",
  "message": "API is running"
}
```

---

## 🔍 Verify Everything Works

```bash
# Check services are running
docker-compose -f docker-compose.dev.yml ps

# Run database migrations
docker-compose -f docker-compose.dev.yml exec django python manage.py migrate

# Create superuser (optional)
docker-compose -f docker-compose.dev.yml exec django python manage.py createsuperuser
```

---

## 🌐 Access Your Application

Once running:

- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/api/schema/swagger/
- **Admin**: http://localhost:8000/admin
- **Frontend**: http://localhost:3000

---

## ⚠️ If You Get Stuck

**Issue**: Can't find Secret Manager API
- Solution: Make sure you're in the right project (pavilion-ai-agentic)
- Look at top of console - it shows current project

**Issue**: Password field empty in Cloud SQL
- Solution: Click "GENERATE PASSWORD" button explicitly
- The password will appear in the text field below

**Issue**: Docker won't start
- Solution: Make sure Docker Desktop is running
- Run: `docker ps` to test

**Issue**: API returns 500 error
- Solution: Check logs: `docker-compose logs django`

---

## ✅ Success Checklist

- [ ] Secret Manager API enabled
- [ ] Service account `pavilion-app` created
- [ ] Database `pavilion_agentic` created
- [ ] Database user `pavilion_app` created with password
- [ ] Password stored in Secret Manager as `pavilion-db-password`
- [ ] Docker services running
- [ ] API health check responds ✓
- [ ] Database migrations completed

**Once all checked**: Your production sports portal is ready! 🏆

---

## 📞 Need Help?

If any step fails:
1. Screenshot the error
2. Tell me which step (1-5)
3. I'll help you fix it!

You're almost there! 💪
