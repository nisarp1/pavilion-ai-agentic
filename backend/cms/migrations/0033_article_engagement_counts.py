from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cms', '0032_socialmediahandle_sport'),
    ]

    operations = [
        migrations.AddField(
            model_name='article',
            name='retweet_count',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='article',
            name='favorite_count',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='article',
            name='reply_count',
            field=models.IntegerField(default=0),
        ),
    ]
