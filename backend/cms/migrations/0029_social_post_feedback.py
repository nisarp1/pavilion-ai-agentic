from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('cms', '0028_add_generated_review_status'),
        ('tenants', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='SocialPostFeedback',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('template_pk', models.IntegerField(blank=True, null=True)),
                ('template_name', models.CharField(blank=True, max_length=200)),
                ('original_plan', models.JSONField()),
                ('edited_plan', models.JSONField()),
                ('original_caption', models.TextField(blank=True)),
                ('edited_caption', models.TextField(blank=True)),
                ('corrections', models.JSONField(default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='social_post_feedback',
                    to='tenants.tenant',
                )),
                ('article', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='social_post_feedback',
                    to='cms.article',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='socialpostfeedback',
            index=models.Index(fields=['tenant', 'template_pk', '-created_at'], name='cms_social_tenant_tmpl_idx'),
        ),
    ]
