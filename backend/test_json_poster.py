
import os
import django
from django.conf import settings

# Setup Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pavilion_gemini.settings")
django.setup()

from cms.models import Article, PosterTemplate
from cms.poster_generator import generate_poster

def test_json_poster():
    # 1. Get an article (using the one from previous test ID 307 or any)
    article = Article.objects.exclude(featured_image='').last()
    if not article:
        print("No article found")
        return
        
    print(f"Testing with Article: {article.title}")
    
    # 2. Inject the JSON context data (simulating what Gemini would provide)
    article.poster_context = {
      "image_content": {
        "player_name": "Sanju Samson",
        "match_statistics": {
          "runs": 24,
          "balls_faced": 15,
          "strike_rate": 160.0,
          "wicket_taker": "Santner"
        },
        "text_overlay_malayalam": "സഞ്ജുവിന്റെ ഇന്നത്തെ പ്രകടനം നിങ്ങൾക്ക് തൃപ്തി നൽകുന്നുണ്ടോ?",
        "text_overlay_english_translation": "Are you satisfied with Sanju's performance today?",
        "branding": {
          "platform_name": "PAVILION END",
          "website": "www.pavilionend.in"
        }
      }
    }
    article.save()
    
    # 3. Get Template
    template = PosterTemplate.objects.filter(name="Standard Poster (Top Text)").first()
    
    # 4. Generate
    print("Generating JSON-driven poster...")
    success, url = generate_poster(article, template_id=template.id)
    
    if success:
        print(f"Success! Poster URL: {url}")
        print(f"Check the file in backend/media/{url.replace('/media/', '')}")
    else:
        print(f"Failed: {url}")

if __name__ == "__main__":
    test_json_poster()
