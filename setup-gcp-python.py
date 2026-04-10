#!/usr/bin/env python3
"""
GCP Infrastructure Setup Script for Pavilion-AI Agentic CMS
Uses Python Google Cloud libraries to create infrastructure
"""

import os
import sys
import json
import time
from typing import Optional
from pathlib import Path

# Google Cloud imports
from google.cloud.resourcemanager import ProjectsClient
from google.auth import default
from google.api_core.exceptions import AlreadyExists, NotFound

# Colors for output
class Colors:
    BLUE = '\033[0;34m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    RED = '\033[0;31m'
    NC = '\033[0m'

def print_step(step: int, total: int, message: str):
    print(f"{Colors.YELLOW}[Step {step}/{total}] {message}...{Colors.NC}")

def print_success(message: str):
    print(f"{Colors.GREEN}✓ {message}{Colors.NC}")

def print_error(message: str):
    print(f"{Colors.RED}✗ {message}{Colors.NC}")

def print_header(message: str):
    print(f"\n{Colors.BLUE}{'='*40}{Colors.NC}")
    print(f"{Colors.BLUE}{message}{Colors.NC}")
    print(f"{Colors.BLUE}{'='*40}{Colors.NC}\n")

def get_credentials_and_project():
    """Get default credentials and project"""
    credentials, project = default()
    return credentials, project

def create_gcp_project(project_id: str, project_name: str) -> bool:
    """Create a new GCP project"""
    print_step(1, 10, "Creating GCP project")

    try:
        projects_client = ProjectsClient()

        # Check if project already exists
        try:
            request = {"name": f"projects/{project_id}"}
            projects_client.get_project(request=request)
            print_success(f"Project already exists: {project_id}")
            return True
        except NotFound:
            pass

        # Create new project
        request = {
            "project": {
                "project_id": project_id,
                "name": project_name,
            }
        }

        operation = projects_client.create_project(request=request)

        # Wait for operation to complete
        print("Waiting for project creation to complete...")
        operation.result(timeout=300)

        print_success(f"Project created: {project_id}")
        return True

    except Exception as e:
        print_error(f"Failed to create project: {str(e)}")
        return False

def enable_apis(project_id: str, apis: list) -> bool:
    """Enable required APIs"""
    print_step(2, 10, "Enabling required APIs")

    try:
        import subprocess

        for api in apis:
            print(f"  Enabling {api}...")
            result = subprocess.run(
                ["gcloud", "services", "enable", api, f"--project={project_id}"],
                capture_output=True,
                timeout=120
            )
            if result.returncode == 0:
                print(f"    ✓ {api}")
            else:
                print(f"    ⚠ {api} (may already be enabled)")

        print_success("APIs enabled")
        return True

    except Exception as e:
        print_error(f"Failed to enable APIs: {str(e)}")
        return False

def create_service_account(project_id: str, sa_name: str, sa_display_name: str) -> Optional[str]:
    """Create service account"""
    print_step(3, 10, "Creating service account")

    try:
        import subprocess

        sa_email = f"{sa_name}@{project_id}.iam.gserviceaccount.com"

        # Check if already exists
        result = subprocess.run(
            ["gcloud", "iam", "service-accounts", "describe", sa_email, f"--project={project_id}"],
            capture_output=True,
            timeout=30
        )

        if result.returncode == 0:
            print_success(f"Service account already exists: {sa_email}")
            return sa_email

        # Create service account
        result = subprocess.run(
            [
                "gcloud", "iam", "service-accounts", "create", sa_name,
                f"--display-name={sa_display_name}",
                f"--project={project_id}"
            ],
            capture_output=True,
            timeout=60
        )

        if result.returncode == 0:
            print_success(f"Service account created: {sa_email}")
            return sa_email
        else:
            print_error(f"Failed to create service account: {result.stderr.decode()}")
            return None

    except Exception as e:
        print_error(f"Failed to create service account: {str(e)}")
        return None

def grant_iam_roles(project_id: str, sa_email: str, roles: list) -> bool:
    """Grant IAM roles to service account"""
    print_step(4, 10, "Granting IAM roles")

    try:
        import subprocess

        for role in roles:
            print(f"  Granting {role}...")
            result = subprocess.run(
                [
                    "gcloud", "projects", "add-iam-policy-binding", project_id,
                    f"--member=serviceAccount:{sa_email}",
                    f"--role={role}",
                    "--condition=None",
                    "--quiet"
                ],
                capture_output=True,
                timeout=60
            )
            if result.returncode == 0:
                print(f"    ✓ {role}")
            else:
                print(f"    ⚠ {role}")

        print_success("IAM roles granted")
        return True

    except Exception as e:
        print_error(f"Failed to grant IAM roles: {str(e)}")
        return False

def create_service_account_key(project_id: str, sa_email: str, key_path: str) -> bool:
    """Create service account key"""
    print_step(5, 10, "Creating service account key")

    try:
        import subprocess

        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(key_path), exist_ok=True)

        # Check if key already exists
        if os.path.exists(key_path):
            print_success(f"Key already exists: {key_path}")
            return True

        # Create key
        result = subprocess.run(
            [
                "gcloud", "iam", "service-accounts", "keys", "create", key_path,
                f"--iam-account={sa_email}",
                f"--project={project_id}"
            ],
            capture_output=True,
            timeout=60
        )

        if result.returncode == 0:
            print_success(f"Service account key created: {key_path}")
            return True
        else:
            print_error(f"Failed to create service account key: {result.stderr.decode()}")
            return False

    except Exception as e:
        print_error(f"Failed to create service account key: {str(e)}")
        return False

def create_cloud_sql_instance(project_id: str, instance_name: str, region: str) -> bool:
    """Create Cloud SQL PostgreSQL instance"""
    print_step(6, 10, "Creating Cloud SQL PostgreSQL instance")

    try:
        import subprocess

        # Check if instance already exists
        result = subprocess.run(
            ["gcloud", "sql", "instances", "describe", instance_name, f"--project={project_id}"],
            capture_output=True,
            timeout=30
        )

        if result.returncode == 0:
            print_success(f"Cloud SQL instance already exists: {instance_name}")
            return True

        # Create instance
        print("This may take 5-10 minutes...")
        result = subprocess.run(
            [
                "gcloud", "sql", "instances", "create", instance_name,
                "--database-version=POSTGRES_15",
                "--tier=db-f1-micro",
                f"--region={region}",
                "--no-backup",
                "--storage-type=PD_HDD",
                f"--project={project_id}"
            ],
            capture_output=True,
            timeout=900  # 15 minutes
        )

        if result.returncode == 0:
            print_success(f"Cloud SQL instance created: {instance_name}")
            return True
        else:
            error_msg = result.stderr.decode()
            print_error(f"Failed to create Cloud SQL instance: {error_msg}")
            return False

    except Exception as e:
        print_error(f"Failed to create Cloud SQL instance: {str(e)}")
        return False

def create_cloud_storage_buckets(project_id: str, buckets: list) -> bool:
    """Create Cloud Storage buckets"""
    print_step(7, 10, "Creating Cloud Storage buckets")

    try:
        import subprocess

        for bucket_name in buckets:
            print(f"  Creating {bucket_name}...")

            # Check if bucket already exists
            result = subprocess.run(
                ["gsutil", "ls", f"gs://{bucket_name}"],
                capture_output=True,
                timeout=30
            )

            if result.returncode == 0:
                print(f"    ✓ Bucket already exists: {bucket_name}")
                continue

            # Create bucket
            result = subprocess.run(
                ["gsutil", "mb", f"gs://{bucket_name}"],
                capture_output=True,
                timeout=60
            )

            if result.returncode == 0:
                print(f"    ✓ {bucket_name}")
            else:
                print(f"    ⚠ {bucket_name} (error: {result.stderr.decode()})")

        print_success("Cloud Storage buckets created")
        return True

    except Exception as e:
        print_error(f"Failed to create Cloud Storage buckets: {str(e)}")
        return False

def create_env_file(project_id: str, db_instance: str, buckets: dict, key_path: str) -> bool:
    """Create .env file"""
    print_step(8, 10, "Creating .env configuration file")

    try:
        env_content = f"""# ============================================================================
# Pavilion-AI Agentic CMS - Environment Configuration
# ============================================================================
# Generated automatically by setup-gcp-python.py
# Created on: {time.strftime("%Y-%m-%d %H:%M:%S")}

# ============================================================================
# Google Cloud Platform
# ============================================================================
GOOGLE_PROJECT_ID={project_id}
GOOGLE_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS={key_path}

# ============================================================================
# Cloud SQL (PostgreSQL)
# ============================================================================
# Use Cloud SQL Proxy for local development:
# cloud_sql_proxy -instances=PROJECT_ID:REGION:INSTANCE_NAME=tcp:5432
DATABASE_URL=postgresql://pavilion_user:CHANGE_ME_PASSWORD@127.0.0.1:5432/pavilion_agentic
CLOUD_SQL_INSTANCE={db_instance}

# ============================================================================
# Cloud Storage
# ============================================================================
GCS_BUCKET_MEDIA={buckets.get('media', 'pavilion-ai-media-dev')}
GCS_BUCKET_STATIC={buckets.get('static', 'pavilion-ai-static-dev')}

# ============================================================================
# Django Configuration
# ============================================================================
SECRET_KEY=CHANGE_ME_GENERATE_WITH_python_manage.py_shell_from_django.core.management.utils_get_random_secret_key
DEBUG=False  # Set to False in production
ALLOWED_HOSTS=localhost,127.0.0.1,localhost:8000,127.0.0.1:8000

# ============================================================================
# Vertex AI
# ============================================================================
VERTEX_AI_MODEL=gemini-2.0-flash
VERTEX_AI_EMBEDDINGS_MODEL=text-embedding-004
VERTEX_AI_EMBEDDINGS_DIMENSION=256

# ============================================================================
# CORS Configuration
# ============================================================================
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000,http://127.0.0.1:3000,http://127.0.0.1:8000

# ============================================================================
# Environment
# ============================================================================
ENVIRONMENT=development

# ============================================================================
# Celery & Redis (for local development)
# ============================================================================
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# ============================================================================
# Email Configuration
# ============================================================================
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend  # Dev only

# ============================================================================
# Note
# ============================================================================
# Fill in CHANGE_ME values before deployment
# Update DATABASE_URL password after running Cloud SQL setup
# Generate SECRET_KEY with: python manage.py shell -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
"""

        # Write to .env file
        with open(".env", "w") as f:
            f.write(env_content)

        print_success(".env file created")
        return True

    except Exception as e:
        print_error(f"Failed to create .env file: {str(e)}")
        return False

def main():
    """Main setup function"""
    print_header("Pavilion-AI Agentic CMS - GCP Setup (Python)")

    # Configuration
    PROJECT_ID = "pavilion-ai-agentic"
    PROJECT_NAME = "Pavilion AI Agentic CMS"
    SERVICE_ACCOUNT_NAME = "pavilion-agentic"
    SA_DISPLAY_NAME = "Pavilion Agentic CMS Service Account"
    REGION = "us-central1"
    DB_INSTANCE = "pavilion-db-dev"
    DB_NAME = "pavilion_agentic"
    BUCKET_MEDIA = "pavilion-ai-media-dev"
    BUCKET_STATIC = "pavilion-ai-static-dev"
    KEY_PATH = ".gcp-secrets/service-account-key.json"

    APIs = [
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

    ROLES = [
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

    BUCKETS = [BUCKET_MEDIA, BUCKET_STATIC]

    # Verify authentication
    print_step(0, 10, "Verifying Google Cloud authentication")
    try:
        credentials, default_project = get_credentials_and_project()
        print_success(f"Authenticated to GCP (default project: {default_project})")
    except Exception as e:
        print_error(f"Failed to authenticate to GCP: {str(e)}")
        return False

    # Execute setup steps
    steps = [
        ("Create GCP Project", lambda: create_gcp_project(PROJECT_ID, PROJECT_NAME)),
        ("Enable APIs", lambda: enable_apis(PROJECT_ID, APIs)),
        ("Create Service Account", lambda: create_service_account(PROJECT_ID, SERVICE_ACCOUNT_NAME, SA_DISPLAY_NAME) is not None),
        ("Grant IAM Roles", lambda: grant_iam_roles(PROJECT_ID, f"{SERVICE_ACCOUNT_NAME}@{PROJECT_ID}.iam.gserviceaccount.com", ROLES)),
        ("Create Service Account Key", lambda: create_service_account_key(PROJECT_ID, f"{SERVICE_ACCOUNT_NAME}@{PROJECT_ID}.iam.gserviceaccount.com", KEY_PATH)),
        ("Create Cloud SQL Instance", lambda: create_cloud_sql_instance(PROJECT_ID, DB_INSTANCE, REGION)),
        ("Create Cloud Storage Buckets", lambda: create_cloud_storage_buckets(PROJECT_ID, BUCKETS)),
        ("Create .env File", lambda: create_env_file(PROJECT_ID, f"{PROJECT_ID}:us-central1:{DB_INSTANCE}", {"media": BUCKET_MEDIA, "static": BUCKET_STATIC}, KEY_PATH)),
    ]

    for i, (name, func) in enumerate(steps, 1):
        try:
            if not func():
                print_error(f"Setup step failed: {name}")
                return False
        except Exception as e:
            print_error(f"Setup step failed ({name}): {str(e)}")
            return False
        print()

    print_header("Setup Complete!")
    print(f"{Colors.GREEN}✓ GCP infrastructure setup completed successfully!{Colors.NC}\n")
    print("Next steps:")
    print("1. Update DATABASE_URL in .env with the Cloud SQL password")
    print("2. Update SECRET_KEY in .env")
    print("3. Run: cloud_sql_proxy -instances={PROJECT_ID}:us-central1:{DB_INSTANCE}=tcp:5432")
    print("4. Run migrations: python manage.py migrate")
    print("5. Start development: docker-compose -f docker-compose.dev.yml up -d\n")

    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
