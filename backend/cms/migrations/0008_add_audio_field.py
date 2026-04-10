# Generated manually for adding audio field to Article model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cms', '0007_webstory_webstoryslide_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='article',
            name='audio',
            field=models.FileField(blank=True, help_text='Generated audio version of the article', null=True, upload_to='articles/audio/'),
        ),
    ]

