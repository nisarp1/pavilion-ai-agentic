from rest_framework import serializers
from .models import Tenant, TenantUser

class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ['id', 'name', 'slug', 'subdomain', 'subscription_tier', 'branding', 'is_active']

class TenantUserSerializer(serializers.ModelSerializer):
    tenant = TenantSerializer(read_only=True)
    
    class Meta:
        model = TenantUser
        fields = ['id', 'tenant', 'role']
