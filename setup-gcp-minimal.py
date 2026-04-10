#!/usr/bin/env python3
"""
Minimal GCP Setup - Uses Google Cloud Python libraries directly
Avoids gcloud CLI authentication issues
"""

import subprocess
import json
import os

def run_command(cmd, description=""):
    """Run a command and return success status"""
    if description:
        print(f"Executing: {description}")
    print(f"  Command: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  Error: {result.stderr}")
        return False
    print(f"  Output: {result.stdout[:100]}...")
    return True

print("=" * 50)
print("GCP Setup for Pavilion-AI Agentic CMS")
print("=" * 50)

# Check current GCP setup
print("\n1. Checking GCP authentication...")
try:
    from google.auth import default
    credentials, project = default()
    print(f"   ✓ Authenticated to project: {project}")
    print(f"   ✓ Credentials type: {type(credentials).__name__}")
except Exception as e:
    print(f"   ✗ Error: {e}")
    exit(1)

# Configuration
PROJECT_ID = project or "pitchfact"
SERVICE_ACCOUNT = "pavilion-agentic"
SA_EMAIL = f"{SERVICE_ACCOUNT}@{PROJECT_ID}.iam.gserviceaccount.com"

print(f"\n2. Setup configuration:")
print(f"   Project ID: {PROJECT_ID}")
print(f"   Service Account: {SA_EMAIL}")
print(f"   Region: us-central1")

# Attempt to set gcloud config
print(f"\n3. Configuring gcloud...")
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/Users/nisar/.config/gcloud/application_default_credentials.json"
run_command(["gcloud", "config", "set", "project", PROJECT_ID], "Set default project")

#  List APIs to verify auth is working
print(f"\n4. Testing API access...")
result = subprocess.run(
    ["gcloud", "services", "list", "--enabled", f"--project={PROJECT_ID}"],
    capture_output=True,
    text=True
)
if result.returncode == 0:
    print(f"   ✓ Can list services")
    # Count enabled services
    lines = [l for l in result.stdout.strip().split('\n') if l and not l.startswith('NAME')]
    print(f"   ✓ Currently {len(lines)} services enabled")
else:
    print(f"   ✗ Cannot list services: {result.stderr}")

print("\n" + "=" * 50)
print("Manual Setup Required")
print("=" * 50)
print(f"""
The GCP setup requires manual configuration due to authentication constraints.
Please proceed with:

1. Visit GCP Console: https://console.cloud.google.com
2. Create Project: "pavilion-ai-agentic"
3. Enable APIs:
   - Vertex AI API
   - Generative AI API
   - Cloud SQL Admin API
   - Cloud Storage API
   - Cloud Run API
   - Cloud Tasks API
   - Cloud Logging API
   - Cloud Trace API
   - Secret Manager API
   - Artifact Registry API

4. Create Service Account:
   - Name: pavilion-agentic
   - Grant roles:
     - Vertex AI User
     - Cloud SQL Client
     - Cloud SQL Admin
     - Storage Object Admin
     - Cloud Tasks Enqueuer
     - Secret Manager Secret Accessor
     - Logging Log Writer
     - Cloud Trace Agent

5. Create & Download JSON key

6. Run:
   cp key.json .gcp-secrets/service-account-key.json

7. Update .env with PROJECT_ID

For now, proceeding with documentation setup...
""")

# Create a sample .env
print("\n5. Creating .env file...")
with open(".env.example.bak", "w") as f:
    f.write("""
# Pavilion-AI Agentic CMS Configuration
GOOGLE_PROJECT_ID=pavilion-ai-agentic
GOOGLE_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=.gcp-secrets/service-account-key.json
DATABASE_URL=postgresql://pavilion_user:PASSWORD@127.0.0.1:5432/pavilion_agentic
GCS_BUCKET_MEDIA=pavilion-ai-media-dev
GCS_BUCKET_STATIC=pavilion-ai-static-dev
SECRET_KEY=generate-with-python-manage.py-shell
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1
VERTEX_AI_MODEL=gemini-2.0-flash
VERTEX_AI_EMBEDDINGS_MODEL=text-embedding-004
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
""")
print("   ✓ Created .env.example.bak")

print("\n" + "=" * 50)
print("Status: Manual setup required")
print("=" * 50)

