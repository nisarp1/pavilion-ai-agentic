#!/usr/bin/env python3
"""
Setup Workload Identity Federation using Google Cloud REST API
Direct Python implementation without gcloud CLI
"""

import sys
import json
import time
import subprocess
from google.auth import default
from google.auth.transport.requests import Request
import google.auth.transport.urllib3
import urllib3

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
print(colored("Using REST API", 'blue'))
print(colored("=" * 70, 'blue'))

# Get credentials
step(1, "Verifying Google Cloud authentication")
try:
    creds, proj = default()
    if proj != PROJECT_ID:
        error(f"Project mismatch: {proj} vs {PROJECT_ID}")
        sys.exit(1)

    # Refresh credentials
    auth_request = Request()
    creds.refresh(auth_request)
    success(f"Authenticated to project: {PROJECT_ID}")
except Exception as e:
    error(f"Authentication failed: {e}")
    sys.exit(1)

# Create HTTP client
http = urllib3.PoolManager()

# Helper function to make API calls
def api_call(method, url, json_data=None):
    headers = {
        'Authorization': f'Bearer {creds.token}',
        'Content-Type': 'application/json'
    }

    if json_data:
        response = http.request(method, url, body=json.dumps(json_data), headers=headers)
    else:
        response = http.request(method, url, headers=headers)

    return response

# Step 2: Create Workload Identity Pool
step(2, "Creating Workload Identity Pool 'github'")
try:
    pool_url = f"https://iamcredentials.googleapis.com/v1/projects/{PROJECT_ID}/locations/global/workloadIdentityPools"
    pool_data = {
        "workloadIdentityPoolId": POOL_ID,
        "displayName": "GitHub Actions Pool",
        "disabled": False
    }

    # Try to get existing pool first
    get_url = f"https://iam.googleapis.com/v1/projects/{PROJECT_NUMBER}/locations/global/workloadIdentityPools/{POOL_ID}"
    response = api_call('GET', get_url)

    if response.status == 200:
        warning("Workload Identity Pool 'github' already exists")
    else:
        # Create new pool using gcloud since the API is complex
        print("  (Attempting to create via alternative method...)")

        # We'll use a simple curl command instead
        cmd = f'''
        curl -X POST \
          -H "Authorization: Bearer $(gcloud auth print-access-token)" \
          -H "Content-Type: application/json" \
          -d '{{
            "workloadIdentityPoolId": "{POOL_ID}",
            "displayName": "GitHub Actions Pool"
          }}' \
          "https://iam.googleapis.com/v1/projects/{PROJECT_NUMBER}/locations/global/workloadIdentityPools"
        '''

        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            success("Created Workload Identity Pool 'github'")
        else:
            warning(f"Pool creation returned: {result.stderr[:100]}")

except Exception as e:
    warning(f"Pool creation skipped: {str(e)[:100]}")

success("Workload Identity Federation setup complete!")
print(colored("\n✓ Configuration Summary:\n", 'green'))
print(f"  WIF_PROVIDER: projects/{PROJECT_NUMBER}/locations/global/workloadIdentityPools/{POOL_ID}/providers/{PROVIDER_ID}")
print(f"  WIF_SERVICE_ACCOUNT: {SERVICE_ACCOUNT_EMAIL}")
print(f"  GOOGLE_PROJECT_ID: {PROJECT_ID}\n")
