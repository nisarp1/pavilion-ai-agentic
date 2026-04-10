"""
Django management command to manually fetch RSS feeds.
"""
from django.core.management.base import BaseCommand
from rss_fetcher.models import RSSFeed
from rss_fetcher.tasks import fetch_single_rss_feed, fetch_rss_feeds
from django.utils import timezone


class Command(BaseCommand):
    help = 'Fetch articles from RSS feeds'

    def add_arguments(self, parser):
        parser.add_argument(
            '--feed-id',
            type=int,
            help='Fetch a specific RSS feed by ID',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Fetch all active RSS feeds',
        )

    def handle(self, *args, **options):
        if options['feed_id']:
            # Fetch specific feed
            try:
                feed = RSSFeed.objects.get(id=options['feed_id'])
                self.stdout.write(f'Fetching feed: {feed.name} ({feed.url})')
                result = fetch_single_rss_feed(feed.url)
                
                feed.last_fetched_at = timezone.now()
                feed.save()
                
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Successfully fetched {result.get("articles_created", 0)} articles from {feed.name}'
                    )
                )
            except RSSFeed.DoesNotExist:
                self.stdout.write(
                    self.style.ERROR(f'RSS Feed with ID {options["feed_id"]} not found')
                )
        
        elif options['all']:
            # Fetch all active feeds
            self.stdout.write('Fetching all active RSS feeds...')
            result = fetch_rss_feeds()
            
            if result.get('success'):
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Successfully fetched {result.get("articles_created", 0)} articles from all feeds'
                    )
                )
                if result.get('errors'):
                    for error in result['errors']:
                        self.stdout.write(self.style.WARNING(f'  Error: {error}'))
            else:
                self.stdout.write(self.style.ERROR(result.get('message', 'Failed to fetch feeds')))
        
        else:
            # Fetch all active feeds by default
            feeds = RSSFeed.objects.filter(is_active=True)
            if not feeds.exists():
                self.stdout.write(self.style.WARNING('No active RSS feeds found'))
                return
            
            total_created = 0
            for feed in feeds:
                self.stdout.write(f'Fetching feed: {feed.name} ({feed.url})')
                try:
                    result = fetch_single_rss_feed(feed.url)
                    articles_created = result.get('articles_created', 0)
                    total_created += articles_created
                    
                    feed.last_fetched_at = timezone.now()
                    feed.save()
                    
                    self.stdout.write(
                        self.style.SUCCESS(f'  Created {articles_created} articles')
                    )
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f'  Error fetching {feed.name}: {str(e)}')
                    )
            
            self.stdout.write(
                self.style.SUCCESS(f'\nTotal articles created: {total_created}')
            )

