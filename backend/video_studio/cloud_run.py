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


def trigger_render(props: dict, job_id: str, output_blob: str, composition_id: str = None) -> dict:
    """
    POST to the Remotion Cloud Run renderer and block until the render completes.
    Returns the JSON response which must contain 'videoUrl'.

    composition_id resolves in this order:
      1. Explicit argument
      2. props['_compositionId'] set by the pipeline
      3. Default: 'PavilionReel'

    If CLOUD_RUN_RENDERER_URL is not set, raises ValueError so the caller
    can decide what to do (e.g. save the plan as a manifest JSON instead).
    """
    base_url = os.environ.get('CLOUD_RUN_RENDERER_URL', '').rstrip('/')
    if not base_url:
        raise ValueError("CLOUD_RUN_RENDERER_URL is not configured")

    # Resolve which Remotion composition to render
    resolved_composition = (
        composition_id
        or props.pop('_compositionId', None)
        or 'PavilionReel'
    )
    logger.info(f"[VideoJob {job_id}] compositionId={resolved_composition}")

    endpoint = f"{base_url}/render"
    payload = {
        'compositionId': resolved_composition,
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


def upload_plan_as_manifest(props: dict, job_id: str, output_blob: str) -> dict:
    """
    Fallback when Cloud Run renderer is not available.
    Uploads the props JSON as a manifest file to GCS and returns its public URL.
    This ensures the Article always gets a URL — even without a rendered video.
    The manifest can later be used to render once Cloud Run is configured.
    """
    import json
    bucket_name = os.environ.get('GCS_BUCKET_NAME', '')
    if not bucket_name:
        logger.warning(f"[VideoJob {job_id}] GCS_BUCKET_NAME not set — cannot upload manifest")
        return {}

    try:
        from google.cloud import storage
        client = storage.Client()
        bucket = client.bucket(bucket_name)

        # Upload props as JSON manifest
        manifest_blob = output_blob.replace('.mp4', '_manifest.json')
        blob = bucket.blob(manifest_blob)
        blob.upload_from_string(
            json.dumps(props, ensure_ascii=False, indent=2),
            content_type='application/json'
        )
        blob.make_public()
        manifest_url = blob.public_url
        logger.info(f"[VideoJob {job_id}] Manifest uploaded: {manifest_url}")
        return {"videoUrl": manifest_url, "type": "manifest", "note": "Cloud Run not configured — manifest only"}
    except Exception as e:
        logger.error(f"[VideoJob {job_id}] Manifest upload failed: {e}")
        return {}

