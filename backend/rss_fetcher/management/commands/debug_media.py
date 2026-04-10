from django.core.management.base import BaseCommand
from workers.tasks import fetch_and_save_featured_image, generate_audio_for_article
from cms.models import Article
import traceback
import os
import logging

# Configure logging to print to stdout
logger = logging.getLogger('workers.tasks')
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
logger.addHandler(handler)

class Command(BaseCommand):
    help = 'Debug media generation (images and voice)'

    def add_arguments(self, parser):
        parser.add_argument('type', type=str, choices=['image', 'voice', 'creds'], help='Type of debug: image, voice, or creds')
        parser.add_argument('--article_id', type=int, help='Article ID to test with')

    def handle(self, *args, **options):
        debug_type = options['type']
        article_id = options.get('article_id')

        self.stdout.write(f"--- Debugging {debug_type.upper()} ---")

        if debug_type == 'creds':
            self.check_creds()
            return

        if not article_id:
            self.stdout.write(self.style.ERROR("Please provide --article_id for image/voice debug"))
            return

        try:
            article = Article.objects.get(id=article_id)
            self.stdout.write(f"Article: {article.title} (ID: {article.id})")
        except Article.DoesNotExist:
            self.stdout.write(self.style.ERROR(f"Article {article_id} not found"))
            return

        if debug_type == 'image':
            self.debug_image(article)
        elif debug_type == 'voice':
            self.debug_voice(article)

    def check_creds(self):
        self.stdout.write("Checking Google Cloud Credentials...")
        creds_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
        json_content = os.environ.get('GOOGLE_CREDENTIALS_JSON')

        self.stdout.write(f"GOOGLE_APPLICATION_CREDENTIALS env var: {creds_path}")
        self.stdout.write(f"GOOGLE_CREDENTIALS_JSON env var length: {len(json_content) if json_content else 0}")

        if creds_path:
            if os.path.exists(creds_path):
                self.stdout.write(self.style.SUCCESS(f"Credentials file exists at {creds_path}"))
                try:
                    with open(creds_path, 'r') as f:
                        content = f.read()
                        self.stdout.write(f"File content length: {len(content)}")
                        if len(content) < 10:
                            self.stdout.write(self.style.WARNING("File seems empty!"))
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"Error reading file: {e}"))
            else:
                self.stdout.write(self.style.ERROR(f"File does NOT exist at {creds_path}"))
        else:
            self.stdout.write(self.style.WARNING("GOOGLE_APPLICATION_CREDENTIALS is not set"))

    def debug_image(self, article):
        self.stdout.write(f"Source URL: {article.source_url}")
        if not article.source_url:
            self.stdout.write(self.style.ERROR("No source URL to fetch image from"))
            return

        try:
            self.stdout.write("Attempting to fetch image...")
            fetch_and_save_featured_image(article)
            
            # Refresh article
            article.refresh_from_db()
            if article.featured_image:
                self.stdout.write(self.style.SUCCESS(f"Success! Image saved: {article.featured_image.name}"))
                self.stdout.write(f"URL: {article.featured_image.url}")
            else:
                self.stdout.write(self.style.ERROR("Failed: Image field is still empty after execution"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Crash: {str(e)}"))
            self.stdout.write(traceback.format_exc())

    def debug_voice(self, article):
        self.check_creds()
        
        if not article.body:
            self.stdout.write(self.style.ERROR("Article has no body content"))
            return

        try:
            self.stdout.write("Attempting to generate audio...")
            result = generate_audio_for_article(article)
            
            if result:
                article.refresh_from_db()
                if article.audio:
                    self.stdout.write(self.style.SUCCESS(f"Success! Audio saved: {article.audio.name}"))
                else:
                    self.stdout.write(self.style.ERROR("Failed: Audio field is empty despite True return"))
            else:
                self.stdout.write(self.style.ERROR("Function returned False"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Crash: {str(e)}"))
            self.stdout.write(traceback.format_exc())
