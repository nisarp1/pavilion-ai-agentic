"""Product models: real (hashed) API keys + writer StyleProfiles."""
import hashlib
import secrets

from django.conf import settings
from django.db import models

from tenants.models import Tenant


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class APIKey(models.Model):
    """Per-tenant API key for the productized /api/v1/ surface.

    The full key is shown ONCE at creation; only its SHA-256 hash + display prefix
    are stored, so an incoming request can be authenticated by hashing and matching.
    """
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="api_key_objs")
    name = models.CharField(max_length=100)
    key_prefix = models.CharField(max_length=16)
    key_hash = models.CharField(max_length=64, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["key_hash"]), models.Index(fields=["tenant", "-created_at"])]

    def __str__(self):
        return f"{self.name} ({self.key_prefix}…) [{self.tenant_id}]"

    @classmethod
    def generate(cls, tenant, name, created_by=None):
        raw = "pvl_" + secrets.token_urlsafe(32)
        obj = cls.objects.create(
            tenant=tenant, name=name, key_prefix=raw[:12],
            key_hash=hash_key(raw), created_by=created_by,
        )
        return obj, raw


class StyleProfile(models.Model):
    """A per-editor writer persona: exemplars + a distilled style guide, injected
    few-shot into the writer prompt to emulate a specific writer's voice."""
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="style_profiles")
    name = models.CharField(max_length=100)
    language = models.CharField(max_length=20, default="ml")
    exemplars = models.JSONField(default=list, blank=True)   # list[str]
    style_guide = models.TextField(blank=True)               # distilled fingerprint
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} [{self.tenant_id}]"
