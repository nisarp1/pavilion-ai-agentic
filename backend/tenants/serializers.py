from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import Tenant, TenantUser, UserProfile


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ['id', 'name', 'slug', 'subdomain', 'subscription_tier', 'branding', 'is_active', 'max_users', 'created_at']
        read_only_fields = ['id', 'slug', 'subscription_tier', 'is_active', 'created_at']


class TenantCreateSerializer(serializers.ModelSerializer):
    """Used when a user creates a new newsroom/tenant."""
    class Meta:
        model = Tenant
        fields = ['name', 'subdomain']

    def validate_subdomain(self, value):
        value = value.lower().strip()
        if Tenant.objects.filter(subdomain=value).exists():
            raise serializers.ValidationError("This subdomain is already taken.")
        if not value.replace('-', '').isalnum():
            raise serializers.ValidationError("Subdomain may only contain letters, numbers, and hyphens.")
        if len(value) < 3:
            raise serializers.ValidationError("Subdomain must be at least 3 characters.")
        return value


class TenantUpdateSerializer(serializers.ModelSerializer):
    """Used when an admin updates tenant settings."""
    class Meta:
        model = Tenant
        fields = ['name', 'subdomain', 'branding', 'custom_domain']

    def validate_subdomain(self, value):
        value = value.lower().strip()
        qs = Tenant.objects.filter(subdomain=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This subdomain is already taken.")
        return value


class TenantUserSerializer(serializers.ModelSerializer):
    tenant = TenantSerializer(read_only=True)

    class Meta:
        model = TenantUser
        fields = ['id', 'tenant', 'role']


class RegisterSerializer(serializers.Serializer):
    """Validates new user registration data."""
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=150, default='')
    last_name = serializers.CharField(max_length=150, default='')

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value

    def create(self, validated_data):
        email = validated_data['email']
        user = User.objects.create_user(
            username=email,
            email=email,
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
        )
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name')
    last_name = serializers.CharField(source='user.last_name')
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = UserProfile
        fields = ['id', 'email', 'username', 'first_name', 'last_name', 'bio', 'avatar']

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        if 'first_name' in user_data:
            instance.user.first_name = user_data['first_name']
        if 'last_name' in user_data:
            instance.user.last_name = user_data['last_name']
        instance.user.save(update_fields=['first_name', 'last_name'])
        return super().update(instance, validated_data)
