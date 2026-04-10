
from django.db import migrations
from django.core.files import File
import os
from django.conf import settings

def update_templates(apps, schema_editor):
    PosterTemplate = apps.get_model('cms', 'PosterTemplate')
    
    # Template 1: Standard Poster (Top Text)
    t1 = PosterTemplate.objects.filter(name="Standard Poster (Top Text)").first()
    if t1:
        # Config based on the visual requirements
        t1.text_config = {
            "text_fields": [
                {
                    "name": "headline",
                    "x": 50,
                    "y": 80, 
                    "font_size": 85,
                    "color": "#FFFF00", # Yellow
                    "max_width": 980,
                    "align": "center"
                },
                {
                    "name": "summary",
                    "x": 50,
                    "y": 380,
                    "font_size": 55,
                    "color": "#FFFFFF",
                    "max_width": 980,
                    "align": "center"
                }
            ]
        }
        
        t1.image_config = {
            "image_fields": [
                {
                    "name": "featured_image",
                    "x": 0,
                    "y": 550, # Moved UP
                    "width": 1080,
                    "height": 1370, # Increased height
                    "remove_background": True,
                    "fit_mode": "contain",
                    "align_vertical": "bottom"
                }
            ]
        }
        t1.save()

class Migration(migrations.Migration):

    dependencies = [
        ('cms', '0013_article_poster_context'),
    ]

    operations = [
        migrations.RunPython(update_templates),
    ]
