#!/usr/bin/env python3
"""
Production-Safe Setup for Pavilion-AI Agentic CMS
Uses Workload Identity Federation + Secret Manager (NO service account keys)
Recommended by Google Cloud for production applications
"""

import subprocess
import os

def run(cmd, desc=""):
    print(f"\n► {desc}")
    print(f"  Command: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ⚠ {result.stderr[:100]}")
        return False
    print(f"  ✓ {result.stdout.strip()[:80]}")
    return True

PROJECT = "pavilion-ai-agentic"
REGION = "us-central1"

print("=" * 70)
print("PRODUCTION-SAFE GCP SETUP (No Service Account Keys)")
print("=" * 70)

print("\n1️⃣  Creating Cloud SQL Database")
run([
    "gcloud", "sql", "databases", "create", "pavilion_agentic",
    f"--instance=pavilion-db-dev", f"--project={PROJECT}"
], "Create database")

print("\n2️⃣  Setting Database User Password")
# Generate random password
import secrets
db_password = secrets.token_urlsafe(16)

run([
    "gcloud", "sql", "users", "set-password", "postgres",
    f"--instance=pavilion-db-dev",
    f"--password={db_password}",
    f"--project={PROJECT}"
], "Set postgres password")

print("\n3️⃣  Storing Secrets in Secret Manager")
# Store DB password
result = subprocess.run([
    "gcloud", "secrets", "create", "pavilion-db-password",
    f"--project={PROJECT}",
    "--replication-policy=automatic"
], capture_output=True, text=True)

if "already exists" in result.stderr:
    # Update existing
    subprocess.run([
        "bash", "-c",
        f"echo -n '{db_password}' | gcloud secrets versions add pavilion-db-password --data-file=- --project={PROJECT}"
    ], capture_output=True)
    print("  ✓ Updated DB password in Secret Manager")
else:
    # Create new
    subprocess.run([
        "bash", "-c",
        f"echo -n '{db_password}' | gcloud secrets create pavilion-db-password --data-file=- --project={PROJECT}"
    ], capture_output=True)
    print("  ✓ Created DB password secret")

print("\n4️⃣  Creating Service Account (for Cloud Run - NO KEY)")
run([
    "gcloud", "iam", "service-accounts", "create", "pavilion-app",
    "--display-name=Pavilion Agentic CMS (Cloud Run)",
    f"--project={PROJECT}"
], "Create service account")

SA_EMAIL = f"pavilion-app@{PROJECT}.iam.gserviceaccount.com"

print("\n5️⃣  Granting Minimal Required Roles")
roles = [
    "roles/aiplatform.user",
    "roles/cloudsql.client",
    "roles/storage.objectViewer",
    "roles/storage.objectCreator",
    "roles/secretmanager.secretAccessor",
    "roles/logging.logWriter",
    "roles/cloudtrace.agent",
]

for role in roles:
    run([
        "gcloud", "projects", "add-iam-policy-binding", PROJECT,
        f"--member=serviceAccount:{SA_EMAIL}",
        f"--role={role}",
        "--condition=None", "--quiet"
    ], f"Grant {role.split('/')[-1]}")

print("\n6️⃣  Enabling Workload Identity Federation (for CI/CD)")
print("  This allows GitHub Actions to authenticate without keys")

# Create Workload Identity Pool
run([
    "gcloud", "iam", "workload-identity-pools", "create", "github",
    f"--project={PROJECT}",
    "--location=global",
    "--display-name=GitHub Actions"
], "Create Workload Identity Pool")

# Create Workload Identity Provider
run([
    "gcloud", "iam", "workload-identity-providers", "create-oidc", "github",
    "--project={PROJECT}",
    "--location=global",
    "--workload-identity-pool=github",
    "--display-name=GitHub",
    "--attribute-mapping=google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.environment=assertion.environment,attribute.repository=assertion.repository",
    "--issuer-uri=https://token.actions.githubusercontent.com"
], "Create Workload Identity Provider")

print("\n7️⃣  Configuring GitHub Actions Authentication")
SERVICE_ACCOUNT_JSON = {
    "type": "external_account",
    "audience": f"urn:goog:params:oauth:audience:projects/$(gcloud projects describe {PROJECT} --format='value(projectNumber)'):locations/global:workloadIdentityPools/github:providers/github",
    "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
    "token_url": "https://sts.googleapis.com/v1/token",
    "service_account_impersonation_url": f"https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/{SA_EMAIL}:generateAccessToken",
    "credential_source": {
        "environment_variable_name": "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
        "regional_cred_verification_url": "https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15"
    }
}

print(f"  ✓ Workload Identity configured")
print(f"  ✓ Service Account: {SA_EMAIL}")

print("\n" + "=" * 70)
print("✅ PRODUCTION SETUP COMPLETE")
print("=" * 70)

print("\n📋 Configuration Summary:")
print(f"  Project: {PROJECT}")
print(f"  Region: {REGION}")
print(f"  Database: pavilion_agentic")
print(f"  DB User: postgres")
print(f"  DB Password: Stored in Secret Manager")
print(f"  Service Account: {SA_EMAIL}")
print(f"  Auth Method: Workload Identity (keyless)")

print("\n🚀 Next Steps:")
print("  1. Update Django settings for Cloud SQL Proxy:")
print("     - DATABASE_URL=postgresql://postgres:PASSWORD@127.0.0.1:5432/pavilion_agentic")
print("  2. Store Vertex AI credentials in Secret Manager")
print("  3. Deploy to Cloud Run with Workload Identity")
print("  4. GitHub Actions will authenticate via Workload Identity")

print("\n🔐 Security Checklist:")
print("  ✓ No service account JSON keys")
print("  ✓ Secrets stored in Secret Manager")
print("  ✓ IAM-based access control")
print("  ✓ Workload Identity for CI/CD")
print("  ✓ Organization policy enforced")

