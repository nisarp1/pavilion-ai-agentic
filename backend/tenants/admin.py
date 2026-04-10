from django.contrib import admin
from .models import Tenant, TenantUser

class TenantUserInline(admin.TabularInline):
    model = TenantUser
    extra = 1

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ('name', 'subdomain', 'subscription_tier', 'is_active', 'created_at')
    search_fields = ('name', 'subdomain', 'custom_domain')
    list_filter = ('subscription_tier', 'is_active')
    inlines = [TenantUserInline]

@admin.register(TenantUser)
class TenantUserAdmin(admin.ModelAdmin):
    list_display = ('user', 'tenant', 'role')
    list_filter = ('role', 'tenant')
    search_fields = ('user__username', 'tenant__name')
