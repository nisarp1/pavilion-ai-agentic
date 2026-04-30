from django.db import models
from django.contrib.auth.models import User
from django.utils.text import slugify

class Tenant(models.Model):
    """
    Main Tenant model for SAAS multi-tenancy.
    """
    TIER_CHOICES = [
        ('basic', 'Basic'),
        ('pro', 'Pro'),
        ('enterprise', 'Enterprise'),
    ]

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    subdomain = models.CharField(max_length=100, unique=True)
    custom_domain = models.CharField(max_length=255, blank=True, null=True)
    
    # API Configuration per tenant
    api_keys = models.JSONField(default=dict, blank=True, help_text="NewsAPI, Gemini, etc.")
    
    # Branding Configuration
    branding = models.JSONField(default=dict, blank=True, help_text="Logo, Colors, Fonts, Social Links")
    
    # Subscription & Limits
    subscription_tier = models.CharField(max_length=20, choices=TIER_CHOICES, default='basic')
    max_users = models.IntegerField(default=5)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

class TenantUser(models.Model):
    """
    Relationship between User and Tenant with Role.
    """
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('editor', 'Editor'),
        ('viewer', 'Viewer'),
        ('viewer-only', 'Viewer Only'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tenant_memberships')
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='members')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='editor')
    
    class Meta:
        unique_together = ('user', 'tenant')

    def __str__(self):
        return f"{self.user.username} - {self.tenant.name} ({self.role})"

class TenantInvitation(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='invitations')
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=TenantUser.ROLE_CHOICES, default='editor')
    token = models.CharField(max_length=64, unique=True)
    invited_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='sent_invitations')
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('tenant', 'email')

    def __str__(self):
        return f"Invite to {self.email} for {self.tenant.name}"


class UserProfile(models.Model):
    """Extended profile for each Django User."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bio = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile of {self.user.email}"


class UsageRecord(models.Model):
    """Tracks per-tenant usage for billing and limit enforcement."""
    METRIC_TYPES = [
        ('article_generated', 'Article Generated'),
        ('audio_generated', 'Audio Generated'),
        ('video_generated', 'Video Generated'),
        ('rss_fetched', 'RSS Fetched'),
    ]
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='usage_records')
    metric_type = models.CharField(max_length=30, choices=METRIC_TYPES)
    created_at = models.DateTimeField(auto_now_add=True)
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['tenant', 'metric_type', '-created_at']),
            models.Index(fields=['tenant', '-created_at']),
        ]

    def __str__(self):
        return f"{self.tenant.name} – {self.metric_type} at {self.created_at}"
