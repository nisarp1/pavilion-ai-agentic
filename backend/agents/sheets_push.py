"""
Google Sheets integration for the Social Post Generator.

Each CanvaTemplate can be linked to a Google Sheet. When a post is generated,
this module appends one row to the sheet — Canva's bulk-create connection
then picks it up automatically on the next refresh.

Sheet structure (headers = slot key names in declaration order):
  Timestamp | Headline_Malayalam | Subtext | Primary_Image | ...

Setup per template (one-time):
  1. Create a Google Sheet with headers matching the template's slot keys
  2. Share it with the GCP service account email (Editor access)
  3. Paste the sheet URL into CanvaTemplate.google_sheet_id

The same GCP service account used for GCS / Cloud TTS is used here —
no extra credentials needed.
"""
import logging
import os
import re
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Google Sheets scopes needed
_SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
]


def _extract_sheet_id(raw: str) -> str:
    """
    Accept either a full Google Sheets URL or a bare sheet ID.
    https://docs.google.com/spreadsheets/d/SHEET_ID/edit  →  SHEET_ID
    """
    if not raw:
        return ''
    # Try to extract from URL
    match = re.search(r'/spreadsheets/d/([a-zA-Z0-9_-]+)', raw)
    if match:
        return match.group(1)
    # Assume it's already a bare ID
    return raw.strip()


def _get_gspread_client():
    """
    Build an authenticated gspread client using the project's GCP service account.
    Uses GOOGLE_APPLICATION_CREDENTIALS env var (same as GCS / TTS).
    """
    import gspread
    from google.oauth2 import service_account

    creds_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', '')
    if not creds_path or not os.path.exists(creds_path):
        raise EnvironmentError(
            'GOOGLE_APPLICATION_CREDENTIALS not set or file missing. '
            'Cannot push to Google Sheet.'
        )

    creds = service_account.Credentials.from_service_account_file(
        creds_path,
        scopes=_SCOPES,
    )
    return gspread.authorize(creds)


def get_service_account_email() -> str:
    """
    Return the service account email so the manager knows which address
    to share the Google Sheet with.
    """
    import json
    creds_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', '')
    if creds_path and os.path.exists(creds_path):
        try:
            with open(creds_path) as f:
                data = json.load(f)
            return data.get('client_email', '')
        except Exception:
            pass
    return ''


def push_plan_to_sheet(plan: dict, template) -> dict:
    """
    Append one row to the Google Sheet connected to this CanvaTemplate.

    Row structure:
      Timestamp  +  one column per slot key (text → image → color order)

    Args:
        plan:     The SocialPostCrew output dict (keys = slot keys)
        template: CanvaTemplate model instance

    Returns:
        {"ok": True,  "row": N, "sheet_id": "..."}
        {"ok": False, "error": "...", "sheet_id": "..."}
    """
    raw_id = getattr(template, 'google_sheet_id', '') or ''
    sheet_id = _extract_sheet_id(raw_id)
    tab_name = getattr(template, 'sheet_tab_name', '') or 'Sheet1'

    if not sheet_id:
        return {
            'ok': False,
            'error': 'No Google Sheet linked to this template. Add a sheet URL in the template settings.',
            'sheet_id': '',
        }

    slot_keys = template.all_slot_keys() if hasattr(template, 'all_slot_keys') else []

    try:
        gc         = _get_gspread_client()
        spreadsheet = gc.open_by_key(sheet_id)

        # Find or create the worksheet tab
        try:
            ws = spreadsheet.worksheet(tab_name)
        except Exception:
            ws = spreadsheet.add_worksheet(title=tab_name, rows=1000, cols=len(slot_keys) + 2)

        # ── Ensure header row exists ──────────────────────────────────────────
        existing_headers = ws.row_values(1)
        expected_headers = ['Timestamp'] + slot_keys

        if existing_headers != expected_headers:
            if not existing_headers:
                # Empty sheet — write headers
                ws.update('A1', [expected_headers])
                logger.info('[SheetsP ush] Wrote headers to %s / %s', sheet_id, tab_name)
            else:
                logger.warning(
                    '[SheetsPush] Header mismatch on %s/%s — '
                    'expected %s, found %s. Appending anyway.',
                    sheet_id, tab_name, expected_headers, existing_headers,
                )

        # ── Build the data row ────────────────────────────────────────────────
        timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
        row_data  = [timestamp] + [str(plan.get(k, '')) for k in slot_keys]

        ws.append_row(row_data, value_input_option='USER_ENTERED')

        # Count rows (subtract 1 for header)
        row_count = len(ws.get_all_values())
        logger.info(
            '[SheetsPush] Appended row %d to %s/%s for template "%s"',
            row_count, sheet_id, tab_name, template.name,
        )

        return {
            'ok':       True,
            'row':      row_count,
            'sheet_id': sheet_id,
            'tab':      tab_name,
            'sheet_url': f'https://docs.google.com/spreadsheets/d/{sheet_id}/edit',
        }

    except Exception as exc:
        exc_str = str(exc)
        sa_email = get_service_account_email()
        if isinstance(exc, PermissionError) or 'PERMISSION_DENIED' in exc_str or '403' in exc_str or not exc_str:
            exc_str = f'Permission denied. Share the sheet with {sa_email} as Editor.'
        logger.error(
            '[SheetsPush] Failed for template "%s" / sheet %s: %s',
            getattr(template, 'name', '?'), sheet_id, exc_str,
        )
        return {
            'ok':       False,
            'error':    exc_str,
            'sheet_id': sheet_id,
        }


def test_sheet_connection(template) -> dict:
    """
    Verify the sheet is accessible and headers match the template's slot keys.
    Used by the API endpoint before the manager sets up Canva bulk-create.

    Returns:
        {
          "ok": True/False,
          "sheet_url": "...",
          "service_account_email": "...",
          "headers_match": True/False,
          "sheet_headers": [...],
          "expected_headers": [...],
          "row_count": N,
          "error": "..." (only if ok=False)
        }
    """
    raw_id   = getattr(template, 'google_sheet_id', '') or ''
    sheet_id = _extract_sheet_id(raw_id)
    tab_name = getattr(template, 'sheet_tab_name', '') or 'Sheet1'
    sa_email = get_service_account_email()
    slot_keys = template.all_slot_keys() if hasattr(template, 'all_slot_keys') else []
    expected_headers = ['Timestamp'] + slot_keys

    result = {
        'ok':                    False,
        'sheet_url':             f'https://docs.google.com/spreadsheets/d/{sheet_id}/edit' if sheet_id else '',
        'service_account_email': sa_email,
        'headers_match':         False,
        'sheet_headers':         [],
        'expected_headers':      expected_headers,
        'row_count':             0,
    }

    if not sheet_id:
        result['error'] = 'No Google Sheet URL set on this template.'
        return result

    try:
        gc           = _get_gspread_client()
        spreadsheet  = gc.open_by_key(sheet_id)
        ws           = spreadsheet.worksheet(tab_name)
        all_rows     = ws.get_all_values()
        sheet_headers = all_rows[0] if all_rows else []
        row_count    = max(0, len(all_rows) - 1)  # exclude header

        result['sheet_headers'] = sheet_headers
        result['row_count']     = row_count
        result['headers_match'] = sheet_headers == expected_headers
        result['ok']            = True

        if not result['headers_match']:
            result['warning'] = (
                f'Headers do not match. '
                f'Expected: {expected_headers}. '
                f'Found: {sheet_headers}. '
                f'Update your sheet headers or the template slot keys.'
            )

        return result

    except Exception as exc:
        exc_str = str(exc)
        if isinstance(exc, PermissionError) or 'PERMISSION_DENIED' in exc_str or '403' in exc_str or not exc_str:
            result['error'] = (
                f'Permission denied. Share the sheet with {sa_email} as Editor.'
            )
        else:
            result['error'] = exc_str
        return result
