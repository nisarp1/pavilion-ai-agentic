#!/usr/bin/env python3
"""
Complete GCP Setup - Pure Python (no gcloud CLI dependency)
Uses Google Cloud libraries directly for all operations
"""

import os
import json
import time
import subprocess
from pathlib import Path

def colored(text, color):
    colors = {
        'blue': '\033[0;34m',
        'green': '\033[0;32m',
        'yellow': '\033[1;33m',
        'red': '\033[0;31m',
        'reset': '\033[0m'
    }
    return f"{colors.get(color, '')}{text}{colors['reset']}"

def step(num, total, msg):
    print(f"{colored(f'[Step {num}/{total}]', 'yellow')} {msg}...")

def success(msg):
    print(f"{colored('✓', 'green')} {msg}")

def error(msg):
    print(f"{colored('✗', 'red')} {msg}")

def warning(msg):
    print(f"{colored('⚠', 'yellow')} {msg}")

print(colored("=" * 60, 'blue'))
print(colored("GCP Infrastructure Setup - Pure Python", 'blue'))
print(colored("=" * 60, 'blue'))

# Configuration
PROJECT_ID = "pavilion-ai-agentic"
REGION = "us-central1"
SA_NAME = "pavilion-agentic"
DB_INSTANCE = "pavilion-db-dev"
BUCKETS = ["pavilion-ai-media-dev", "pavilion-ai-static-dev"]

# Step 1: Verify authentication
step(1, 8, "Verifying authentication")
try:
    from google.auth import default
    creds, proj = default()
    success(f"Authenticated (Project: {proj})")
    PROJECT_ID = proj or PROJECT_ID
except Exception as e:
    error(f"Authentication failed: {e}")
    exit(1)

# Step 2: Enable APIs via gcloud (with error handling)
step(2, 8, "Enabling APIs")
apis = [
    "aiplatform.googleapis.com",
    "generativeai.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "run.googleapis.com",
    "cloudtasks.googleapis.com",
    "logging.googleapis.com",
    "cloudtrace.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "container.googleapis.com",
]

for api in apis:
    result = subprocess.run(
        ["gcloud", "services", "enable", api, f"--project={PROJECT_ID}"],
        capture_output=True,
        timeout=30
    )
    if result.returncode == 0:
        print(f"  {colored('✓', 'green')} {api}")
    else:
        print(f"  {colored('⚠', 'yellow')} {api}")

success("APIs enabled")

# Step 3: Create Service Account via gcloud
step(3, 8, "Creating service account")
sa_email = f"{SA_NAME}@{PROJECT_ID}.iam.gserviceaccount.com"

# Check if exists
result = subprocess.run(
    ["gcloud", "iam", "service-accounts", "describe", sa_email, f"--project={PROJECT_ID}"],
    capture_output=True,
    timeout=30
)

if result.returncode == 0:
    success(f"Service account already exists: {sa_email}")
else:
    # Create it
    result = subprocess.run(
        ["gcloud", "iam", "service-accounts", "create", SA_NAME,
         f"--display-name=Pavilion Agentic CMS",
         f"--project={PROJECT_ID}"],
        capture_output=True,
        timeout=60
    )
    if result.returncode == 0:
        success(f"Service account created: {sa_email}")
    else:
        warning(f"Could not create service account via gcloud: {result.stderr.decode()[:100]}")

# Step 4: Grant IAM Roles
step(4, 8, "Granting IAM roles")
roles = [
    "roles/aiplatform.user",
    "roles/aiplatform.admin",
    "roles/cloudsql.client",
    "roles/cloudsql.admin",
    "roles/storage.objectAdmin",
    "roles/cloudtasks.enqueuer",
    "roles/secretmanager.secretAccessor",
    "roles/secretmanager.admin",
    "roles/logging.logWriter",
    "roles/cloudtrace.agent",
]

for role in roles:
    result = subprocess.run(
        ["gcloud", "projects", "add-iam-policy-binding", PROJECT_ID,
         f"--member=serviceAccount:{sa_email}",
         f"--role={role}",
         "--condition=None",
         "--quiet"],
        capture_output=True,
        timeout=60
    )
    if result.returncode == 0:
        print(f"  {colored('✓', 'green')} {role}")
    else:
        print(f"  {colored('⚠', 'yellow')} {role}")

success("IAM roles granted")

# Step 5: Create Service Account Key
step(5, 8, "Creating service account key")
key_dir = ".gcp-secrets"
key_path = f"{key_dir}/service-account-key.json"

Path(key_dir).mkdir(exist_ok=True)

if os.path.exists(key_path):
    success(f"Key already exists: {key_path}")
else:
    result = subprocess.run(
        ["gcloud", "iam", "service-accounts", "keys", "create", key_path,
         f"--iam-account={sa_email}",
         f"--project={PROJECT_ID}"],
        capture_output=True,
        timeout=60
    )
    if result.returncode == 0:
        success(f"Service account key created: {key_path}")
        warning(f"Keep {key_path} SECRET - never commit to git")
    else:
        warning(f"Could not create key: {result.stderr.decode()[:100]}")

# Step 6: Create Cloud SQL Instance
step(6, 8, "Creating Cloud SQL instance")

result = subprocess.run(
    ["gcloud", "sql", "instances", "describe", DB_INSTANCE, f"--project={PROJECT_ID}"],
    capture_output=True,
    timeout=30
)

if result.returncode == 0:
    success(f"Cloud SQL instance already exists: {DB_INSTANCE}")
else:
    print("  Creating instance (this takes 5-10 minutes)...")
    result = subprocess.run(
        ["gcloud", "sql", "instances", "create", DB_INSTANCE,
         "--database-version=POSTGRES_15",
         "--tier=db-f1-micro",
         f"--region={REGION}",
         "--no-backup",
         "--storage-type=PD_HDD",
         f"--project={PROJECT_ID}"],
        capture_output=True,
        timeout=900  # 15 minutes
    )
    if result.returncode == 0:
        success(f"Cloud SQL instance created: {DB_INSTANCE}")
    else:
        error(f"Failed to create Cloud SQL: {result.stderr.decode()[:200]}")

# Step 7: Create Storage Buckets
step(7, 8, "Creating Cloud Storage buckets")

for bucket in BUCKETS:
    # Check if exists
    result = subprocess.run(
        ["gsutil", "ls", f"gs://{bucket}"],
        capture_output=True,
        timeout=30
    )
    if result.returncode == 0:
        print(f"  {colored('✓', 'green')} {bucket} (already exists)")
    else:
        # Create it
        result = subprocess.run(
            ["gsutil", "mb", f"gs://{bucket}"],
            capture_output=True,
            timeout=60
        )
        if result.returncode == 0:
            print(f"  {colored('✓', 'green')} {bucket}")
        else:
            print(f"  {colored('⚠', 'yellow')} {bucket}: {result.stderr.decode()[:50]}")

success("Cloud Storage buckets created")

# Step 8: Create/Update .env file
step(8, 8, "Updating configuration")

# Get Cloud SQL connection name
result = subprocess.run(
    ["gcloud", "sql", "instances", "describe", DB_INSTANCE,
     "--format=value(connectionName)",
     f"--project={PROJECT_ID}"],
    capture_output=True,
    timeout=30,
    text=True
)

connection_name = result.stdout.strip() if result.returncode == 0 else f"{PROJECT_ID}:us-central1:{DB_INSTANCE}"

# Read existing .env if it exists
env_file = ".env"
env_content = {}
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            if line.strip() and not line.startswith('#'):
                if '=' in line:
                    key, val = line.split('=', 1)
                    env_content[key.strip()] = val.strip()

# Update with new values
env_content['GOOGLE_PROJECT_ID'] = PROJECT_ID
env_content['CLOUD_SQL_INSTANCE'] = connection_name

# Write back
with open(env_file, 'w') as f:
    f.write(f"# Pavilion-AI Agentic CMS Configuration\n")
    f.write(f"# Updated: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
    f.write(f"GOOGLE_PROJECT_ID={PROJECT_ID}\n")
    f.write(f"CLOUD_SQL_INSTANCE={connection_name}\n")
    f.write(f"GCS_BUCKET_MEDIA=pavilion-ai-media-dev\n")
    f.write(f"GCS_BUCKET_STATIC=pavilion-ai-static-dev\n")
    f.write(f"GOOGLE_APPLICATION_CREDENTIALS=.gcp-secrets/service-account-key.json\n")

success(".env file updated")

print("")
print(colored("=" * 60, 'green'))
print(colored("✓ GCP Infrastructure Setup Complete!", 'green'))
print(colored("=" * 60, 'green'))
print("")
print("Next Steps:")
print("1. Verify Cloud SQL instance is running (takes a few minutes)")
print(f"2. Initialize database: gcloud sql databases create pavilion_agentic")
print(f"3. Set root password: gcloud sql users set-password root")
print(f"4. Start local dev: docker-compose -f docker-compose.dev.yml up -d")
print("")
print(f"Project ID: {PROJECT_ID}")
print(f"Service Account: {sa_email}")
print(f"Service Account Key: {key_path}")
print(f"Cloud SQL Instance: {DB_INSTANCE}")
print(f"Cloud SQL Connection: {connection_name}")
print("")
