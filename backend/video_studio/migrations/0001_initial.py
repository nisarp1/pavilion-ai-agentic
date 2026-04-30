import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('cms', '0021_article_celery_task_id_publish_at_version'),
        ('tenants', '0005_userprofile_usagerecord'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='VideoJob',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('job_type', models.CharField(
                    choices=[('render', 'Cloud Render (GCP)'), ('fallback', 'Fallback Export (AEP ZIP)')],
                    max_length=20,
                )),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'), ('rendering', 'Rendering'),
                        ('uploading', 'Uploading'), ('done', 'Done'), ('failed', 'Failed'),
                    ],
                    db_index=True, default='pending', max_length=20,
                )),
                ('props', models.JSONField(default=dict)),
                ('audio_url', models.URLField(blank=True, max_length=2048)),
                ('asset_urls', models.JSONField(default=list)),
                ('output_url', models.URLField(blank=True, max_length=2048)),
                ('error_message', models.TextField(blank=True)),
                ('celery_task_id', models.CharField(blank=True, max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('article', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='video_jobs', to='cms.article',
                )),
                ('created_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='video_jobs', to=settings.AUTH_USER_MODEL,
                )),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='video_jobs', to='tenants.tenant',
                )),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.AddIndex(
            model_name='videojob',
            index=models.Index(fields=['tenant', 'status'], name='video_job_tenant_status_idx'),
        ),
        migrations.AddIndex(
            model_name='videojob',
            index=models.Index(fields=['tenant', 'created_at'], name='video_job_tenant_created_idx'),
        ),
    ]
