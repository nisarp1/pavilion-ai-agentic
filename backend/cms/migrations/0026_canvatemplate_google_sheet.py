from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cms', '0025_canvatemplate_and_social_post_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='canvatemplate',
            name='google_sheet_id',
            field=models.CharField(
                blank=True,
                max_length=255,
                help_text=(
                    'Google Sheet ID or full URL. '
                    'The sheet must be shared (Editor) with the GCP service account. '
                    'Headers must match the slot key names exactly.'
                ),
            ),
        ),
        migrations.AddField(
            model_name='canvatemplate',
            name='sheet_tab_name',
            field=models.CharField(
                blank=True,
                max_length=100,
                default='Sheet1',
                help_text='Worksheet tab name inside the Google Sheet (default: Sheet1)',
            ),
        ),
    ]
