import threading
from django.utils.deprecation import MiddlewareMixin
from .models import Tenant

_thread_locals = threading.local()

def get_current_tenant():
    return getattr(_thread_locals, 'tenant', None)

class TenantMiddleware(MiddlewareMixin):
    """
    Middleware to identify the current tenant and set it in thread local storage.
    Identifies tenant by:
    1. X-Tenant-ID header (for API requests)
    2. Hostname/Subdomain (for web requests)
    """
    def process_request(self, request):
        tenant_id = request.headers.get('X-Tenant-ID')
        tenant = None

        try:
            if tenant_id:
                try:
                    tenant = Tenant.objects.get(id=tenant_id, is_active=True)
                except (Tenant.DoesNotExist, ValueError):
                    pass

            if not tenant:
                # Fallback to subdomain/hostname
                host = request.get_host().split(':')[0]
                subdomain = host.split('.')[0]
                try:
                    tenant = Tenant.objects.get(subdomain=subdomain, is_active=True)
                except Tenant.DoesNotExist:
                    # Last resort: Get the first active tenant or None
                    tenant = Tenant.objects.filter(is_active=True).first()
        except Exception:
            # If database is unavailable, silently fail and set tenant to None
            # This allows the app to continue operating (e.g., for health checks)
            tenant = None

        request.tenant = tenant
        _thread_locals.tenant = tenant

    def process_response(self, request, response):
        if hasattr(_thread_locals, 'tenant'):
            del _thread_locals.tenant
        return response
