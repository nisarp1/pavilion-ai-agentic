
import os
import django
from django.conf import settings
from PIL import Image

# Setup Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pavilion_gemini.settings")
django.setup()

from cms.models import Article, PosterTemplate
from cms.poster_generator import generate_poster

# Create a test setup
def run_visual_test():
    # 1. Create specific test template with background removal enabled
    # We will modify "Standard Poster (Top Text)" for this test
    # Or create a mocked template object
    
    # Let's find an existing article with an image
    article = Article.objects.exclude(featured_image='').first()
    if not article:
        print("No article with image found. Please upload one via admin or provide a path.")
        return

    print(f"Using Article: {article.title}")
    
    # 2. Get the template
    template = PosterTemplate.objects.filter(name="Standard Poster (Top Text)").first()
    if not template:
        print("Template not found. Run seed_posters first.")
        # Try running seed
        from django.core.management import call_command
        call_command('seed_posters')
        template = PosterTemplate.objects.filter(name="Standard Poster (Top Text)").first()
    
    # 3. Modify template config purely in memory for this test
    # Enable background removal
    image_config = template.image_config
    # Update config to remove BG and align bottom
    for field in image_config['image_fields']:
        if field['name'] == 'featured_image':
            field['remove_background'] = True
            field['fit_mode'] = 'contain'
            field['align_vertical'] = 'bottom'
            # Let's adjust height/y to look good with a cutout
            # Full height from bottom: y=600 to 1920?
            # 1920 - 600 = 1320
            # field['height'] = 1320 
    
    template.image_config = image_config
    
    # 4. Generate
    print("Generating poster with background removal...")
    success, url = generate_poster(article, template_id=template.id)
    
    if success:
        print(f"Success! Poster URL: {url}")
        print(f"Check the file in backend/media/{url.replace('/media/', '')}")
    else:
        print(f"Failed: {url}")

if __name__ == "__main__":
    run_visual_test()
