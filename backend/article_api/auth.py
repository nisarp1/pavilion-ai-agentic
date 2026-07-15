"""API-key authentication for the productized /api/v1/ surface.

Reads `Authorization: Api-Key <key>` or `X-Api-Key: <key>`, hashes it, and resolves
an active APIKey → sets request.tenant + request.api_key. JWT auth is untouched
elsewhere; this class is applied only to the v1 product views.
"""
from django.utils import timezone
from rest_framework import authentication, exceptions

from .models import APIKey, hash_key

KEYWORD = "Api-Key"


class _APIKeyUser:
    """Minimal auth principal so DRF's IsAuthenticated passes for key holders."""
    is_authenticated = True

    def __init__(self, tenant):
        self.tenant = tenant
        self.username = f"apikey:{getattr(tenant, 'subdomain', tenant.pk)}"
        self.pk = None


class APIKeyAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        raw = None
        header = request.META.get("HTTP_AUTHORIZATION", "")
        if header.startswith(KEYWORD + " "):
            raw = header[len(KEYWORD) + 1:].strip()
        if not raw:
            raw = (request.META.get("HTTP_X_API_KEY", "") or "").strip() or None
        if not raw:
            return None  # no key presented → let permission layer reject (401)

        try:
            key = APIKey.objects.select_related("tenant").get(
                key_hash=hash_key(raw), is_active=True,
            )
        except APIKey.DoesNotExist:
            raise exceptions.AuthenticationFailed("Invalid or revoked API key.")

        APIKey.objects.filter(pk=key.pk).update(last_used_at=timezone.now())
        request.tenant = key.tenant
        request.api_key = key
        return (_APIKeyUser(key.tenant), key)

    def authenticate_header(self, request):
        return KEYWORD
