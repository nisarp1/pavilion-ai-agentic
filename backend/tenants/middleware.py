import re
import threading
from django.conf import settings
from django.utils.deprecation import MiddlewareMixin
from .models import Tenant

_thread_locals = threading.local()

# Subdomain labels that never identify a tenant: apex/marketing labels plus
# local/internal hostnames. Overridable via settings.RESERVED_SUBDOMAINS.
DEFAULT_RESERVED_SUBDOMAINS = {'newsai', 'www', 'staging', 'dev', 'localhost', 'django'}
_IPV4_RE = re.compile(r'^\d{1,3}(\.\d{1,3}){3}$')


def get_current_tenant():
    return getattr(_thread_locals, 'tenant', None)


def _extract_subdomain(host):
    """Return the leftmost label of a multi-label host, or None for apex /
    reserved / IP / local hosts (which never map to a tenant)."""
    if not host or _IPV4_RE.match(host):
        return None
    parts = host.split('.')
    subdomain = parts[0] if len(parts) > 2 else None
    reserved = getattr(settings, 'RESERVED_SUBDOMAINS', DEFAULT_RESERVED_SUBDOMAINS)
    if subdomain in reserved:
        return None
    return subdomain


class TenantMiddleware(MiddlewareMixin):
    """
    Identify the current tenant and store it in thread-local storage.

    Resolution order:
      1. X-Tenant-ID header — explicit override (API requests).
      2. Subdomain — leftmost label; apex/reserved/IP/local hosts are non-tenant.
      3. No match — fail-closed (tenant=None) when PRODUCT='article' (the trial
         product) so there is no cross-tenant "first active tenant" leak; otherwise
         fall back to the first active tenant (preserves full/dev behavior).

    DB errors anywhere -> tenant=None so health checks keep working.
    """
    def process_request(self, request):
        tenant_id = request.headers.get('X-Tenant-ID')
        tenant = None

        try:
            # 1) Explicit header override.
            if tenant_id:
                try:
                    tenant = Tenant.objects.get(id=tenant_id, is_active=True)
                except (Tenant.DoesNotExist, ValueError):
                    tenant = None

            # 2) Subdomain resolution.
            if not tenant:
                host = request.get_host().split(':')[0].lower()
                subdomain = _extract_subdomain(host)
                if subdomain:
                    try:
                        tenant = Tenant.objects.get(subdomain=subdomain, is_active=True)
                    except Tenant.DoesNotExist:
                        tenant = None

            # 3) No match — fail-closed for the trial product, else dev fallback.
            if not tenant:
                strict = getattr(settings, 'PRODUCT', 'full') == 'article'
                if not strict:
                    tenant = Tenant.objects.filter(is_active=True).first()
                # strict: leave tenant = None (no first-active cross-tenant leak)
        except Exception:
            # Database unavailable etc. — fail safe so the app (and health
            # checks) keep operating.
            tenant = None

        request.tenant = tenant
        _thread_locals.tenant = tenant

    def process_response(self, request, response):
        if hasattr(_thread_locals, 'tenant'):
            del _thread_locals.tenant
        return response
