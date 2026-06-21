"""
Lightweight alert channel for the article pipeline's event-day safety net.

`send_alert()` is the single entry point used by the ingestion / trends / watchdog
code paths. It ALWAYS logs (so failures are visible in container logs even with no
webhook configured) and, if SLACK_ALERT_WEBHOOK is set, additionally POSTs a compact
JSON payload to Slack.

Design rule: alerting must NEVER crash the caller. Every external call is wrapped so
a broken webhook, network blip, or bad config degrades to a log line, not an exception.
"""
import json
import logging
import os
import socket
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Map severity → logging level. Unknown severities fall back to WARNING.
_LEVELS = {
    'INFO': logging.INFO,
    'WARNING': logging.WARNING,
    'ERROR': logging.ERROR,
    'CRITICAL': logging.CRITICAL,
}


def send_alert(severity, message, **context):
    """
    Emit an operational alert.

    Args:
        severity: one of "INFO", "WARNING", "ERROR", "CRITICAL".
        message:  short human-readable description.
        **context: arbitrary key/value pairs (source, reason, counts, ...) included
                   in both the log line and the Slack payload.

    Behaviour:
        - ALWAYS logs at the level matching `severity` (so alerts show up in logs
          regardless of webhook config).
        - If env SLACK_ALERT_WEBHOOK is set, also POSTs a compact JSON to it.
        - Never raises — any failure in the webhook path is caught and logged.

    Returns a dict describing what happened (useful for tests / watchdog return values).
    """
    severity = (severity or 'WARNING').upper()
    level = _LEVELS.get(severity, logging.WARNING)

    # ── Always log ────────────────────────────────────────────────────────────
    context_str = ' '.join(f'{k}={v}' for k, v in context.items()) if context else ''
    logger.log(level, '[ALERT:%s] %s %s', severity, message, context_str)

    posted = False
    webhook = os.environ.get('SLACK_ALERT_WEBHOOK', '').strip()
    if webhook:
        try:
            import requests  # local import so module import never depends on requests

            env_name = os.environ.get('ENVIRONMENT', 'development')
            payload = {
                'severity': severity,
                'message': message,
                'env': env_name,
                'host': socket.gethostname(),
                'time': datetime.now(timezone.utc).isoformat(),
                'context': context,
                # Slack renders `text` for the notification preview / mobile push.
                'text': f'[{severity}] ({env_name}) {message}'
                        + (f' — {context_str}' if context_str else ''),
            }
            resp = requests.post(
                webhook,
                data=json.dumps(payload),
                headers={'Content-Type': 'application/json'},
                timeout=5,
            )
            resp.raise_for_status()
            posted = True
        except Exception as exc:
            # Alerting must not crash the caller — log and move on.
            logger.error('send_alert: Slack webhook POST failed: %s', exc)

    return {'severity': severity, 'message': message, 'logged': True, 'posted': posted}
