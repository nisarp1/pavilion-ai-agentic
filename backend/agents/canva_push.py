"""
Canva Autofill API integration for the Social Post Generator.

Workflow:
  1. Backend calls POST /v1/autofills with the brand template ID + slot data
  2. Canva creates a filled copy of the template as a new design
  3. Backend polls GET /v1/autofills/{job_id} until complete
  4. Returns the edit URL of the generated design

Setup (one-time):
  1. Go to https://www.canva.com/developers/
  2. Create an integration → choose "Via integration" authentication
  3. Under Scopes, enable: design:content:write  asset:read  asset:write
  4. Generate a Client Credentials token
  5. Set CANVA_API_TOKEN=<token> in backend/.env

Template setup (per template):
  - Open template in Canva → click any text element → "Data" tab → assign a field name
  - Field names must match the slot's canva_name exactly (case-sensitive)
  - Do the same for image elements you want auto-filled

Note: Color fields are not supported by Canva's autofill API — those stay as template defaults.
"""
import logging
import os
import time

import requests

logger = logging.getLogger(__name__)

CANVA_API_BASE = 'https://api.canva.com/rest/v1'
_POLL_INTERVAL = 2   # seconds between polls
_POLL_TIMEOUT  = 90  # seconds max wait for autofill job


def _headers() -> dict:
    token = os.environ.get('CANVA_API_TOKEN', '').strip()
    if not token:
        raise EnvironmentError('CANVA_API_TOKEN not set in environment.')
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }


def _upload_image_from_url(image_url: str, name: str = 'image') -> str:
    """
    Download an image from a URL and upload it to Canva's asset library.
    Returns the Canva asset_id, or '' on failure.
    """
    try:
        # Download the image
        img_resp = requests.get(image_url, timeout=20)
        img_resp.raise_for_status()
        img_bytes = img_resp.content
        content_type = img_resp.headers.get('Content-Type', 'image/jpeg')

        headers = {}  # built below with correct content-type

        import base64 as _base64
        name_b64 = _base64.b64encode(f'{name[:45]}.jpg'.encode()).decode()
        upload_headers = {
            'Authorization': _headers()['Authorization'],
            'Content-Type': 'application/octet-stream',
            'Asset-Upload-Metadata': _base64.b64encode(
                f'{{"name_base64":"{name_b64}"}}'.encode()
            ).decode(),
        }
        upload_resp = requests.post(
            f'{CANVA_API_BASE}/asset-uploads',
            headers=upload_headers,
            data=img_bytes,
            timeout=30,
        )
        upload_resp.raise_for_status()
        job_id = upload_resp.json().get('job', {}).get('id', '')
        if not job_id:
            return ''

        # Poll until asset is ready
        deadline = time.time() + 30
        while time.time() < deadline:
            time.sleep(_POLL_INTERVAL)
            poll = requests.get(
                f'{CANVA_API_BASE}/asset-uploads/{job_id}',
                headers={'Authorization': _headers()['Authorization']},
                timeout=10,
            )
            poll.raise_for_status()
            job_data = poll.json().get('job', {})
            status = job_data.get('status', '')
            if status == 'success':
                return job_data.get('asset', {}).get('id', '')
            if status == 'failed':
                logger.warning('[CanvaPush] Asset upload job failed for %s', name)
                return ''

    except Exception as exc:
        logger.warning('[CanvaPush] Image upload failed for %s: %s', name, exc)
    return ''


def autofill_template(template, plan: dict) -> dict:
    """
    Create a filled Canva design from a brand template using the plan data.

    Args:
        template: CanvaTemplate model instance
        plan:     social_post_plan dict (keys = slot keys)

    Returns:
        {"ok": True,  "design_url": "https://...", "design_id": "..."}
        {"ok": False, "error": "..."}
    """
    canva_template_id = getattr(template, 'canva_template_id', '').strip()
    if not canva_template_id:
        return {'ok': False, 'error': 'No Canva template ID set on this template.'}

    try:
        headers = _headers()
    except EnvironmentError as e:
        return {'ok': False, 'error': str(e)}

    # ── Build data payload ────────────────────────────────────────────────────
    data = {}

    # Text slots
    for slot in (template.text_slots() if hasattr(template, 'text_slots') else []):
        canva_name = slot.get('canva_name', '')
        key        = slot.get('key', '')
        value      = str(plan.get(key, '')).strip()
        if canva_name and value:
            data[canva_name] = {'type': 'text', 'text': value}

    # Image slots — upload to Canva assets then reference by ID
    for slot in (template.image_slots() if hasattr(template, 'image_slots') else []):
        canva_name = slot.get('canva_name', '')
        key        = slot.get('key', '')
        img_url    = str(plan.get(key, '')).strip()
        if canva_name and img_url and img_url.startswith('http'):
            asset_id = _upload_image_from_url(img_url, name=key)
            if asset_id:
                data[canva_name] = {'type': 'image', 'asset_id': asset_id}
            else:
                logger.warning('[CanvaPush] Skipping image slot %s — upload failed', key)

    if not data:
        return {'ok': False, 'error': 'No fillable data fields found. Check template slot canva_name values match Canva data field names.'}

    # ── Kick off autofill job ─────────────────────────────────────────────────
    headline = plan.get('Headline', plan.get('headline', ''))[:40] or 'Social Post'
    try:
        resp = requests.post(
            f'{CANVA_API_BASE}/autofills',
            headers=headers,
            json={
                'brand_template_id': canva_template_id,
                'title': headline,
                'data': data,
            },
            timeout=20,
        )
        resp.raise_for_status()
    except requests.HTTPError as e:
        body = ''
        try:
            body = e.response.json()
        except Exception:
            pass
        return {'ok': False, 'error': f'Canva autofill request failed: {e} — {body}'}

    job_id = resp.json().get('job', {}).get('id', '')
    if not job_id:
        return {'ok': False, 'error': f'No job ID in Canva response: {resp.json()}'}

    logger.info('[CanvaPush] Autofill job %s started for template %s', job_id, canva_template_id)

    # ── Poll for completion ───────────────────────────────────────────────────
    deadline = time.time() + _POLL_TIMEOUT
    poll_headers = {k: v for k, v in headers.items() if k != 'Content-Type'}

    while time.time() < deadline:
        time.sleep(_POLL_INTERVAL)
        try:
            poll = requests.get(
                f'{CANVA_API_BASE}/autofills/{job_id}',
                headers=poll_headers,
                timeout=10,
            )
            poll.raise_for_status()
        except Exception as exc:
            logger.warning('[CanvaPush] Poll error: %s', exc)
            continue

        job = poll.json().get('job', {})
        status = job.get('status', '')

        if status == 'success':
            design = job.get('result', {}).get('design', {})
            design_id  = design.get('id', '')
            edit_url   = design.get('urls', {}).get('edit_url', '')
            if not edit_url and design_id:
                edit_url = f'https://www.canva.com/design/{design_id}/edit'
            logger.info('[CanvaPush] Design created: %s', edit_url)
            return {
                'ok':         True,
                'design_id':  design_id,
                'design_url': edit_url,
            }

        if status == 'failed':
            error = job.get('error', {})
            return {'ok': False, 'error': f"Autofill job failed: {error}"}

    return {'ok': False, 'error': f'Autofill job timed out after {_POLL_TIMEOUT}s'}
