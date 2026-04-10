from django.core.management.base import BaseCommand
from rss_fetcher.tasks import enhance_articles_with_google_trends

class Command(BaseCommand):
    help = 'Enhance articles with Gemini AI'

    def handle(self, *args, **options):
        self.stdout.write('Starting Gemini enhancement...')
        try:
            result = enhance_articles_with_google_trends()
            self.stdout.write(self.style.SUCCESS(f'Enhancement complete. Result: {result}'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error: {str(e)}'))
