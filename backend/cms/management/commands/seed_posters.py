
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pavilion_gemini.settings")
django.setup()

from django.core.management.base import BaseCommand
from cms.models import PosterTemplate
import os

from django.conf import settings

class Command(BaseCommand):
    help = 'Seeds initial social media poster templates'

    def handle(self, *args, **options):
        self.create_templates()

    def create_templates(self):
        from django.core.files import File
        import json
        
        # Base directory for fixtures
        fixtures_dir = os.path.join(settings.BASE_DIR, 'cms', 'fixtures', 'posters')
        layout_path = os.path.join(fixtures_dir, 'poster_layouts.json')
        
        if not os.path.exists(layout_path):
            print(f"Error: Layout file not found at {layout_path}")
            return

        try:
            with open(layout_path, 'r') as f:
                data = json.load(f)
                templates = data.get('templates', [])
                
                for tpl_data in templates:
                    name = tpl_data.get('name')
                    bg_filename = tpl_data.get('background_image')
                    bg_path = os.path.join(fixtures_dir, bg_filename)
                    
                    if os.path.exists(bg_path):
                        tpl, created = PosterTemplate.objects.get_or_create(name=name)
                        
                        # Update Image if needed
                        if created or not tpl.background_image:
                            with open(bg_path, 'rb') as img_f:
                                tpl.background_image.save(f"templates/posters/{bg_filename}", File(img_f), save=True)
                        
                        # Update Configs from JSON
                        tpl.text_config = tpl_data.get('text_config', {})
                        tpl.image_config = tpl_data.get('image_config', {})
                        tpl.save()
                        print(f"Synced Template: {name}")
                    else:
                        print(f"Warning: Background image not found for {name} at {bg_path}")
                        
        except Exception as e:
            print(f"Failed to load templates from JSON: {e}")

