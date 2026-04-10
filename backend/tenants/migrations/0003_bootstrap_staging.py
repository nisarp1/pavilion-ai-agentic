from django.db import migrations

def bootstrap_staging_data(apps, schema_editor):
    Tenant = apps.get_model('tenants', 'Tenant')
    TenantUser = apps.get_model('tenants', 'TenantUser')
    User = apps.get_model('auth', 'User')
    
    # Create default tenant if it doesn't exist
    tenant, created = Tenant.objects.get_or_create(
        slug='pavilion-end-staging',
        defaults={
            'name': 'Pavilion End Staging',
            'subdomain': 'staging',
            'subscription_tier': 'enterprise',
        }
    )
    
    # Find admin user
    admin_user = User.objects.filter(username='admin').first() or User.objects.filter(is_superuser=True).first()
    
    if admin_user:
        # Link admin user to the tenant
        TenantUser.objects.get_or_create(
            user=admin_user,
            tenant=tenant,
            defaults={'role': 'admin'}
        )

class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0002_reset_admin'), # Ensure admin user exists first
    ]

    operations = [
        migrations.RunPython(bootstrap_staging_data),
    ]
