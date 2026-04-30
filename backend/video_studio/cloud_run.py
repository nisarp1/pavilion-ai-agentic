import os
import logging
import requests

logger = logging.getLogger(__name__)

TIMEOUT = int(os.environ.get('CLOUD_RUN_RENDER_TIMEOUT', '600'))


def _auth_header(audience: str) -> dict:
    """Return Authorization header for a private Cloud Run service."""
    try:
        import google.oauth2.id_token
        from google.auth.transport.requests import Request
        token = google.oauth2.id_token.fetch_id_token(Request(), audience)
        return {'Authorization': f'Bearer {token}'}
    except Exception as e:
        logger.warning(f"Could not fetch Cloud Run ID token: {e}. Proceeding unauthenticated.")
        return {}


def trigger_render(props: dict, job_id: str, output_blob: str) -> dict:
    """
    POST to the Remotion Cloud Run renderer and block until the render completes.
    Returns the JSON response which must contain 'videoUrl'.
    """
    base_url = os.environ.get('CLOUD_RUN_RENDERER_URL', '').rstrip('/')
    if not base_url:
        raise ValueError("CLOUD_RUN_RENDERER_URL is not configured")

    endpoint = f"{base_url}/render"
    payload = {
        'compositionId': 'PavilionReel',
        'props': props,
        'jobId': job_id,
        'outputGcsPath': output_blob,
        'bucketName': os.environ.get('GCS_BUCKET_NAME', ''),
    }
    headers = {'Content-Type': 'application/json', **_auth_header(base_url)}

    logger.info(f"[VideoJob {job_id}] Calling Cloud Run renderer at {endpoint}")
    response = requests.post(endpoint, json=payload, headers=headers, timeout=TIMEOUT)
    response.raise_for_status()
    return response.json()
