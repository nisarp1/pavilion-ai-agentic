"""
RBAC Permission Classes for Pavilion AI Multi-Tenant System.

Provides role-based access control at the API level:
- IsAdminOfTenant: User must be admin in current tenant
- IsEditorOrAdminOfTenant: User must be editor or admin
- HasReadAccessToTenant: User can read if in any role (viewer+)
"""

from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.views import APIView
from .models import TenantUser


class IsAdminOfTenant(permissions.BasePermission):
    """
    User must be an admin in the current tenant.
    Used for sensitive operations like user management, settings, deletion.
    """
    message = "You must be an admin to perform this action."

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False

        if not hasattr(request, 'tenant') or not request.tenant:
            return False

        return TenantUser.objects.filter(
            user=request.user,
            tenant=request.tenant,
            role='admin'
        ).exists()


class IsEditorOrAdminOfTenant(permissions.BasePermission):
    """
    User must be an editor or admin in the current tenant.
    Used for content creation, editing, and publishing operations.
    """
    message = "You must be an editor or admin to perform this action."

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False

        if not hasattr(request, 'tenant') or not request.tenant:
            return False

        return TenantUser.objects.filter(
            user=request.user,
            tenant=request.tenant,
            role__in=['admin', 'editor']
        ).exists()


class HasReadAccessToTenant(permissions.BasePermission):
    """
    User can read content if they're a member of the tenant (any role).
    Write operations (POST, PUT, PATCH, DELETE) require editor/admin role.
    """
    message = "You don't have access to this tenant."

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False

        if not hasattr(request, 'tenant') or not request.tenant:
            return False

        # Check if user is member of this tenant
        is_member = TenantUser.objects.filter(
            user=request.user,
            tenant=request.tenant
        ).exists()

        if not is_member:
            return False

        # Read operations allowed for all members
        if request.method in permissions.SAFE_METHODS:
            return True

        # Write operations require editor or admin role
        return TenantUser.objects.filter(
            user=request.user,
            tenant=request.tenant,
            role__in=['admin', 'editor']
        ).exists()


class IsTenantMember(permissions.BasePermission):
    """
    User must be a member of the current tenant (any role).
    Allows both read and write access for any tenant member.
    Use sparingly - prefer more specific permission classes.
    """
    message = "You must be a member of this tenant."

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False

        if not hasattr(request, 'tenant') or not request.tenant:
            return False

        return TenantUser.objects.filter(
            user=request.user,
            tenant=request.tenant
        ).exists()
