# Generated migration to add viewer roles to TenantUser

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0003_bootstrap_staging'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tenantuser',
            name='role',
            field=models.CharField(
                choices=[
                    ('admin', 'Admin'),
                    ('editor', 'Editor'),
                    ('viewer', 'Viewer'),
                    ('viewer-only', 'Viewer Only'),
                ],
                default='editor',
                max_length=20
            ),
        ),
    ]
