from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cms', '0023_reel_pipeline_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='article',
            name='elevenlabs_audio_url',
            field=models.URLField(
                blank=True,
                default='',
                help_text='ElevenLabs premium Malayalam voiceover GCS URL (manually triggered, paid API)',
                max_length=2000,
            ),
        ),
    ]
