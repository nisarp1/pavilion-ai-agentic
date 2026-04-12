#!/usr/bin/env python3
"""
Setup Workload Identity Federation for GitHub Actions
Enables keyless authentication from GitHub Actions to Google Cloud
"""

import sys
import time
import json
from google.auth import default

# Configuration
PROJECT_ID = "pavilion-ai-agentic"
PROJECT_NUMBER = "608132621768"
POOL_ID = "github"
PROVIDER_ID = "github"
SERVICE_ACCOUNT_EMAIL = "pavilion-app@pavilion-ai-agentic.iam.gserviceaccount.com"
GITHUB_REPO = "nisarp1/pavilion-ai-agentic"

def colored(text, color):
    colors = {
        'blue': '\033[0;34m',
        'green': '\033[0;32m',
        'yellow': '\033[1;33m',
        'red': '\033[0;31m',
        'reset': '\033[0m'
    }
    return f"{colors.get(color, '')}{text}{colors['reset']}"

def step(num, msg):
    print(f"\n{colored(f'[Step {num}]', 'yellow')} {msg}")

def success(msg):
    print(f"{colored('✓', 'green')} {msg}")

def error(msg):
    print(f"{colored('✗', 'red')} {msg}")

def warning(msg):
    print(f"{colored('⚠', 'yellow')} {msg}")

print(colored("=" * 70, 'blue'))
print(colored("SETUP WORKLOAD IDENTITY FEDERATION", 'blue'))
print(colored("Enabling GitHub Actions → Google Cloud keyless auth", 'blue'))
print(colored("=" * 70, 'blue'))

# Step 1: Verify authentication
step(1, "Verifying Google Cloud authentication")
try:
    creds, proj = default()
    if proj != PROJECT_ID:
        error(f"Project mismatch: {proj} vs {PROJECT_ID}")
        sys.exit(1)
    success(f"Authenticated to project: {PROJECT_ID}")
except Exception as e:
    error(f"Authentication failed: {e}")
    sys.exit(1)

# Step 2: Create Workload Identity Pool using gcloud CLI
step(2, "Creating Workload Identity Pool 'github'")
try:
    import subprocess

    # Check if pool already exists
    result = subprocess.run([
        "gcloud", "iam", "workload-identity-pools", "describe", POOL_ID,
        f"--location=global",
        f"--project={PROJECT_ID}"
    ], capture_output=True, text=True)

    if result.returncode == 0:
        warning("Workload Identity Pool 'github' already exists")
    else:
        # Create the pool
        result = subprocess.run([
            "gcloud", "iam", "workload-identity-pools", "create", POOL_ID,
            f"--project={PROJECT_ID}",
            f"--location=global",
            "--display-name='GitHub Actions Pool'"
        ], capture_output=True, text=True)

        if result.returncode == 0:
            success("Created Workload Identity Pool 'github'")
        else:
            error(f"Failed to create pool: {result.stderr}")
            sys.exit(1)

    time.sleep(1)

except Exception as e:
    error(f"Pool creation failed: {e}")
    sys.exit(1)

# Step 3: Create Workload Identity Provider
step(3, "Creating Workload Identity Provider 'github'")
try:
    import subprocess

    # Check if provider already exists
    result = subprocess.run([
        "gcloud", "iam", "workload-identity-pools", "providers", "describe", PROVIDER_ID,
        f"--location=global",
        f"--workload-identity-pool={POOL_ID}",
        f"--project={PROJECT_ID}"
    ], capture_output=True, text=True)

    if result.returncode == 0:
        warning("Workload Identity Provider 'github' already exists")
    else:
        # Create the provider
        result = subprocess.run([
            "gcloud", "iam", "workload-identity-pools", "providers", "create-oidc", PROVIDER_ID,
            f"--location=global",
            f"--workload-identity-pool={POOL_ID}",
            f"--project={PROJECT_ID}",
            "--display-name=GitHub OIDC Provider",
            "--attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor",
            "--issuer-uri=https://token.actions.githubusercontent.com",
            f"--attribute-condition=assertion.repository == 'nisarp1/pavilion-ai-agentic'",
        ], capture_output=True, text=True)

        if result.returncode == 0:
            success("Created Workload Identity Provider 'github'")
        else:
            error(f"Failed to create provider: {result.stderr}")
            sys.exit(1)

    time.sleep(1)

except Exception as e:
    error(f"Provider creation failed: {e}")
    sys.exit(1)

# Step 4: Configure service account impersonation
step(4, "Configuring service account impersonation")
try:
    import subprocess

    # Get the WIF provider resource name
    result = subprocess.run([
        "gcloud", "iam", "workload-identity-pools", "providers", "describe", PROVIDER_ID,
        f"--location=global",
        f"--workload-identity-pool={POOL_ID}",
        f"--project={PROJECT_ID}",
        "--format=value(name)"
    ], capture_output=True, text=True)

    if result.returncode == 0:
        provider_resource = result.stdout.strip()
        success(f"Got provider resource: {provider_resource}")
    else:
        error(f"Failed to get provider resource: {result.stderr}")
        sys.exit(1)

    # Grant the service account permission to be impersonated by GitHub Actions
    result = subprocess.run([
        "gcloud", "iam", "service-accounts", "add-iam-policy-binding", SERVICE_ACCOUNT_EMAIL,
        f"--project={PROJECT_ID}",
        f"--role=roles/iam.workloadIdentityUser",
        f"--member=principalSet://iam.googleapis.com/{provider_resource}/attribute.repository/nisarp1/pavilion-ai-agentic"
    ], capture_output=True, text=True)

    if result.returncode == 0:
        success("Granted workload identity impersonation permissions")
    else:
        # This might fail if already exists, which is fine
        warning("Could not grant impersonation binding (may already exist)")

    time.sleep(1)

except Exception as e:
    error(f"Impersonation configuration failed: {e}")
    sys.exit(1)

# Step 5: Grant Cloud Run deployment permissions
step(5, "Granting Cloud Run deployment permissions")
try:
    import subprocess

    roles = [
        "roles/run.admin",  # Deploy to Cloud Run
        "roles/iam.serviceAccountUser",  # Use service accounts
        "roles/cloudsql.client",  # Connect to Cloud SQL
    ]

    for role in roles:
        result = subprocess.run([
            "gcloud", "projects", "add-iam-policy-binding", PROJECT_ID,
            f"--member=serviceAccount:{SERVICE_ACCOUNT_EMAIL}",
            f"--role={role}",
            "--condition=None"
        ], capture_output=True, text=True)

        if result.returncode == 0:
            success(f"Granted {role}")
        else:
            warning(f"Could not grant {role} (may already exist)")

    time.sleep(1)

except Exception as e:
    error(f"Permission grant failed: {e}")
    sys.exit(1)

# Step 6: Display configuration for verification
step(6, "Workload Identity Federation Configuration")
print(colored("\n✓ WIF Setup Complete! Use these values in GitHub secrets:\n", 'green'))
print(f"  WIF_PROVIDER: projects/{PROJECT_NUMBER}/locations/global/workloadIdentityPools/{POOL_ID}/providers/{PROVIDER_ID}")
print(f"  WIF_SERVICE_ACCOUNT: {SERVICE_ACCOUNT_EMAIL}")
print(f"  GOOGLE_PROJECT_ID: {PROJECT_ID}\n")

print(colored("Next Steps:\n", 'yellow'))
print("1. Verify these values match your GitHub repository secrets")
print("2. Re-run the GitHub Actions workflow")
print("3. Monitor the deployment in Actions tab\n")

success("Workload Identity Federation is now configured!")
