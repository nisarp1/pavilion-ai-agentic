"""
Celery tasks for RSS feed fetching.
"""
from celery import shared_task
from django.utils import timezone
from django.conf import settings
from datetime import timedelta, datetime
from cms.models import Article
from .models import RSSFeed
import feedparser
import logging
from slugify import slugify
import json
import time
import requests
from bs4 import BeautifulSoup
import re

logger = logging.getLogger(__name__)

# Google Trends (optional - will fail gracefully if not available)
try:
    from pytrends.request import TrendReq
    PYTRENDS_AVAILABLE = True
except ImportError:
    PYTRENDS_AVAILABLE = False
    logger.warning("pytrends not available. Google Trends integration disabled.")


@shared_task
def fetch_rss_feeds(force=False):
    """
    Fetch articles from all active RSS feeds and create draft articles.
    This task is scheduled to run periodically via Celery Beat.
    Only fetches feeds that haven't been fetched recently based on their fetch_interval.
    
    Args:
        force: If True, fetch all feeds regardless of last_fetched_at timestamp
    """
    logger.info("Starting automatic RSS feed fetch")
    
    # Get RSS feeds from database
    feeds = RSSFeed.objects.filter(is_active=True)
    
    if not feeds.exists():
        # Fallback to settings if no feeds in database
        feed_urls = getattr(settings, 'RSS_FEEDS', [])
        if not feed_urls:
            logger.warning("No RSS feeds configured")
            return {'success': False, 'message': 'No RSS feeds configured'}
    
    articles_created = 0
    feeds_processed = 0
    feeds_skipped = 0
    errors = []
    now = timezone.now()
    
    # Process feeds from database
    for feed in feeds:
        try:
            # Check if feed needs to be fetched based on its interval
            should_fetch = True
            if not force and feed.last_fetched_at:
                minutes_since_last_fetch = (now - feed.last_fetched_at).total_seconds() / 60
                if minutes_since_last_fetch < feed.fetch_interval:
                    should_fetch = False
                    feeds_skipped += 1
                    logger.debug(f"Feed '{feed.name}' skipped (last fetched {int(minutes_since_last_fetch)} min ago, interval: {feed.fetch_interval} min)")
            
            if should_fetch:
                logger.info(f"Fetching feed: {feed.name} ({feed.url}) for tenant {feed.tenant}")
                result = fetch_single_rss_feed(feed.url, tenant=feed.tenant)
                articles_created += result.get('articles_created', 0)
                
                # Update last fetched timestamp
                feed.last_fetched_at = now
                feed.save()
                feeds_processed += 1
                logger.info(f"Feed '{feed.name}': Created {result.get('articles_created', 0)} new articles")
            
        except Exception as e:
            error_msg = f"Error fetching feed '{feed.name}' ({feed.url}): {str(e)}"
            logger.error(error_msg, exc_info=True)
            errors.append(error_msg)
    
    # If no feeds in database, use settings fallback
    if not feeds.exists():
        feed_urls = getattr(settings, 'RSS_FEEDS', [])
        logger.info(f"Using RSS_FEEDS from settings ({len(feed_urls)} feeds)")
        for feed_url in feed_urls:
            try:
                logger.info(f"Fetching feed from settings: {feed_url}")
                result = fetch_single_rss_feed(feed_url)
                articles_created += result.get('articles_created', 0)
                feeds_processed += 1
            except Exception as e:
                error_msg = f"Error fetching feed {feed_url}: {str(e)}"
                logger.error(error_msg, exc_info=True)
                errors.append(error_msg)
    
    logger.info(f"RSS feed fetch completed. Processed {feeds_processed} feeds, skipped {feeds_skipped}, created {articles_created} new articles.")
    
    return {
        'success': True,
        'articles_created': articles_created,
        'feeds_processed': feeds_processed,
        'feeds_skipped': feeds_skipped,
        'errors': errors
    }


def fetch_single_rss_feed(feed_url, category='reliable_sources', trend_data=None, tenant=None):
    """
    Fetch and process a single RSS feed.
    """
    logger.info(f"Fetching RSS feed: {feed_url}")
    
    # Parse RSS feed
    feed = feedparser.parse(feed_url)
    
    if feed.bozo:
        logger.warning(f"Feed parsing issues for {feed_url}: {feed.bozo_exception}")
    
    articles_created = 0
    
    for entry in feed.entries[:10]:  # Limit to 10 most recent entries
        try:
            # Check if article already exists (by source_url)
            if entry.get('link'):
                existing = Article.objects.filter(source_url=entry.link).first()
                if existing:
                    logger.debug(f"Article already exists: {entry.link}")
                    continue
            
            # Create article
            title = entry.get('title', 'Untitled')
            summary = entry.get('summary', '') or entry.get('description', '')
            
            # Try to extract image from RSS entry
            image_url = None
            # Check for media:content or enclosure (common RSS image formats)
            if 'media_content' in entry and entry.media_content:
                for media in entry.media_content:
                    if media.get('type', '').startswith('image/'):
                        image_url = media.get('url') or media.get('fileUrl')
                        break
            # Check for enclosure
            if not image_url and 'enclosures' in entry:
                for enclosure in entry.enclosures:
                    if enclosure.get('type', '').startswith('image/'):
                        image_url = enclosure.get('href')
                        break
            # Check for links with image extensions
            if not image_url:
                links = entry.get('links', [])
                for link in links:
                    href = link.get('href', '')
                    if any(href.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
                        image_url = href
                        break
            
            # Generate unique slug
            slug = slugify(title)
            base_slug = slug
            counter = 1
            while Article.objects.filter(slug=slug).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            
            # Ensure we never pass None into JSONField
            trend_payload = trend_data if trend_data is not None else {}
            
            article = Article.objects.create(
                title=title,
                slug=slug,
                summary=summary[:500],  # Limit summary length
                status='fetched',
                source_url=entry.get('link', ''),
                source_feed=feed_url,
                category=category,
                trend_data=trend_payload,
                tenant=tenant,
            )
            
            # Try to fetch image if URL found in RSS
            if image_url:
                try:
                    from workers.tasks import fetch_and_save_featured_image
                    fetch_and_save_featured_image(article, image_url)
                except Exception as e:
                    logger.debug(f"Could not fetch image from RSS: {str(e)}")
                    # Will be fetched from source URL during generation
            
            articles_created += 1
            logger.debug(f"Created article: {article.title}")
            
        except Exception as e:
            logger.error(f"Error creating article from entry: {str(e)}")
            continue
    
    return {'articles_created': articles_created}


@shared_task
def fetch_single_feed_task(feed_id):
    """
    Fetch a single RSS feed by ID.
    """
    try:
        feed = RSSFeed.objects.get(id=feed_id)
        result = fetch_single_rss_feed(feed.url)
        
        feed.last_fetched_at = timezone.now()
        feed.save()
        
        return result
    except RSSFeed.DoesNotExist:
        logger.error(f"RSS Feed {feed_id} not found")
        return {'success': False, 'error': 'Feed not found'}


@shared_task
def fetch_google_trends_sports():
    """
    Fetch trending sports articles using Google Trends to find trending topics,
    then fetching articles from NewsAPI or Google News based on those topics.
    Falls back to RSS feeds if APIs not configured.
    """
    logger.info("Starting Sports Trends fetch using Google Trends")
    
    # Step 1: Get trending topics from Google Trends (Realtime)
    google_trends = _get_trending_topics_from_google_trends()
    
    # Step 2: Get trending topics from Twitter (via Trends24) - 30min and 24h
    twitter_trends = _get_trends24_sports_trends()
    
    # Combine and deduplicate
    trending_topics = list(set(google_trends + twitter_trends))
    
    # Fallback: Use common sports keywords if no trends found
    if not trending_topics:
        logger.info("No trends found from Google or Twitter. Using fallback sports keywords.")
        trending_topics = [
            'cricket', 'football', 'ipl', 'premier league', 'world cup',
            'soccer', 'champions league', 'india cricket', 'england cricket',
            'football match', 'cricket match', 'sports news'
        ]
        logger.info(f"Using fallback keywords: {trending_topics[:5]}")
    
    if trending_topics:
        logger.info(f"Found {len(trending_topics)} total trending topics: {trending_topics[:10]}")
        
        # Step 3: Fetch articles based on trending topics
        if settings.NEWS_API_KEY:
            result = _fetch_articles_from_trending_topics(trending_topics)
            if result['success'] and result['articles_created'] > 0:
                logger.info(f"Successfully created {result['articles_created']} articles from trending topics")
                return result
            logger.info("NewsAPI returned no articles for trending topics, trying Google News")
        else:
            logger.info("NewsAPI not configured, trying Google News")
        
        # Try Google News search if NewsAPI not available or failed
        result = _fetch_articles_from_google_news(trending_topics)
        if result['success'] and result['articles_created'] > 0:
            logger.info(f"Successfully created {result['articles_created']} articles from Google News")
            return result
        logger.info("Google News returned no articles, falling back to RSS")
    
    # Fallback to RSS feeds if all methods fail
    logger.info("All trending methods failed, falling back to RSS feeds")
    return _fetch_sports_rss()


def _get_trending_topics_from_google_trends():
    """
    Get sports-related trending topics from Google Trends for India.
    Uses Google Trends RSS feed for sports category (category=17) to get actual trending data.
    """
    trending_topics = []
    
    # Strategy 1: Pytrends Realtime (Primary)
    if PYTRENDS_AVAILABLE:
        try:
            pytrends = TrendReq(hl='en-US', tz=330, retries=2, backoff_factor=0.5)
            logger.info("Fetching Google Trends Realtime (IN)...")
            
            df = pytrends.realtime_trending_searches(pn='IN')
            
            if not df.empty:
                titles = df['title'].tolist()
                logger.info(f"Pytrends Realtime found: {titles[:5]}")
                trending_topics.extend(titles)
                
        except Exception as e:
            logger.error(f"Pytrends Realtime failed: {e}")

    # Strategy 2: Visual Screenshot + AI (New Robust Method)
    try:
        visual_topics = run_visual_fetch()
        if visual_topics:
            logger.info(f"Visual AI found topics: {visual_topics}")
            trending_topics.extend(visual_topics)
    except Exception as e:
        logger.error(f"Visual Strategy failed: {e}")
    
    # Strategy 2 was here (old pytrends), now merged into Strategy 1 above for cleaner flow.
    pass
    
    # Strategy 3: Try web scraping Google Trends sports page
    logger.info("Trying to scrape Google Trends sports page...")
    scraped_topics = _scrape_google_trends_sports()
    if scraped_topics:
        logger.info(f"Found {len(scraped_topics)} sports trending topics from scraping: {scraped_topics[:10]}")
        return scraped_topics[:10]
    
    # Final fallback
    logger.warning("No sports trending topics found, returning fallback topics")
    return _get_fallback_trends()


def _scrape_google_trends_sports():
    """
    Scrape Google Trends for sports category (category=17) in India.
    Gets the actual sports trending topics from Google Trends website.
    """
    trending_topics = []
    sports_keywords = ['cricket', 'football', 'soccer', 'ipl', 'premier', 'league', 'match', 'sport', 'world cup', 'championship', 'tournament', 'team', 'player', 'goal', 'wicket', 'run', 'score', 'bcci', 'kohli', 'dhoni', 'messi', 'ronaldo']
    
    try:
        logger.info("Attempting to scrape Google Trends Sports page directly...")
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
        # Strategy 1: Scrape Google Trends Sports category page (category=17) for India
        try:
            logger.info("Trying Google Trends Sports category page (India)...")
            trends_urls = [
                'https://trends.google.com/trending?geo=IN&hl=en-US&hours=24&category=17',  # Sports category
                'https://trends.google.com/trending?geo=IN&hl=en-US&hours=24',  # All categories as fallback
            ]
            
            for trends_url in trends_urls:
                try:
                    logger.info(f"Scraping Google Trends page: {trends_url}")
                    response = requests.get(trends_url, headers=headers, timeout=15, allow_redirects=True)
                    
                    if response.status_code == 200:
                        html_content = response.text
                        soup = BeautifulSoup(html_content, 'html.parser')
                        
                        # Method 1: Look for embedded JSON data in script tags
                        # Google Trends often embeds data in script tags or window variables
                        script_tags = soup.find_all('script')
                        for script in script_tags:
                            script_content = script.string if script.string else ''
                            if not script_content:
                                continue
                            
                            # Look for various JSON patterns in scripts
                            json_patterns = [
                                r'window\.__INITIAL_STATE__\s*=\s*({.*?});',
                                r'window\.__DATA__\s*=\s*({.*?});',
                                r'window\.__INITIAL_DATA__\s*=\s*({.*?});',
                                r'"trendingSearchesDays":\s*(\[.*?\])',
                                r'"trendingSearches":\s*(\[.*?\])',
                                r'"default":\s*\{[^}]*"trendingSearchesDays":\s*(\[.*?\])',
                                r'"trends":\s*(\[.*?\])',
                            ]
                            
                            for pattern in json_patterns:
                                matches = re.finditer(pattern, script_content, re.DOTALL)
                                for match in matches:
                                    try:
                                        json_str = match.group(1) if match.groups() else match.group(0)
                                        
                                        # Try to parse as JSON
                                        if json_str.startswith('[') or json_str.startswith('{'):
                                            data = json.loads(json_str)
                                            
                                            # Handle array of trends
                                            if isinstance(data, list):
                                                for item in data[:25]:
                                                    if isinstance(item, dict):
                                                        # Try various possible keys
                                                        title = (item.get('title', {}).get('query', '') if isinstance(item.get('title'), dict) 
                                                               else item.get('title', '') or item.get('query', '') or 
                                                               item.get('name', '') or item.get('articleTitle', ''))
                                                        if title and title.strip():
                                                            title = title.strip()
                                                            title_lower = title.lower()
                                                            if any(keyword in title_lower for keyword in sports_keywords):
                                                                if title not in trending_topics:
                                                                    trending_topics.append(title)
                                                                    logger.info(f"Found trending topic from JSON array: {title}")
                                            
                                            # Handle object with trends
                                            elif isinstance(data, dict):
                                                # Navigate through possible structures
                                                trends_data = (data.get('trendingSearchesDays', []) or 
                                                             data.get('trendingSearches', []) or 
                                                             data.get('trends', []) or
                                                             data.get('default', {}).get('trendingSearchesDays', []))
                                                
                                                if trends_data:
                                                    logger.info(f"Found trends data structure in JSON")
                                                    for day_data in trends_data[:1]:  # Just get today
                                                        if isinstance(day_data, dict):
                                                            searches = (day_data.get('trendingSearches', []) or 
                                                                      day_data.get('searches', []) or
                                                                      day_data.get('trends', []))
                                                            for search in searches[:25]:
                                                                if isinstance(search, dict):
                                                                    title = (search.get('title', {}).get('query', '') if isinstance(search.get('title'), dict) 
                                                                           else search.get('title', '') or 
                                                                           search.get('query', '') or 
                                                                           search.get('articleTitle', ''))
                                                                else:
                                                                    title = str(search)
                                                                
                                                                if title and title.strip():
                                                                    title = title.strip()
                                                                    title_lower = title.lower()
                                                                    if any(keyword in title_lower for keyword in sports_keywords):
                                                                        if title not in trending_topics:
                                                                            trending_topics.append(title)
                                                                            logger.info(f"Found trending topic from JSON: {title}")
                                                                            
                                            # If we found topics, we can return early
                                            if trending_topics:
                                                logger.info(f"Found {len(trending_topics)} topics from JSON, continuing to verify...")
                                                
                                    except (json.JSONDecodeError, KeyError, AttributeError, ValueError) as e:
                                        logger.debug(f"Could not parse JSON pattern: {str(e)}")
                                        continue
                        
                        # Method 2: Parse HTML to find trend elements (soup already created above)
                        # Filter out common UI/control words
                        ui_words = ['search', 'explore', 'trends', 'trending', 'volume', 'status', 'active', 'lasted', 
                                   'sort', 'by', 'title', 'relevance', 'hours', 'past', 'category', 'all', 'categories',
                                   'export', 'download', 'csv', 'copy', 'clipboard', 'rss', 'feed', 'sign', 'in',
                                   'home', 'help', 'send', 'feedback', 'about', 'privacy', 'terms', 'google', 'apps',
                                   'main', 'menu', 'clear', 'close', 'location', 'select', 'calendar', 'month', 'year']
                        
                        # Method 2a: Look for table rows (Google Trends uses tables for trends)
                        tables = soup.find_all('table')
                        for table in tables:
                            rows = table.find_all('tr')
                            # Skip header row (usually first row)
                            for row in rows[1:31]:  # Skip first row, check next 30
                                cells = row.find_all(['td', 'th'])
                                # Usually the first column contains the trend title
                                if len(cells) > 0:
                                    first_cell = cells[0]
                                    # Get text from first cell
                                    text = first_cell.get_text(strip=True)
                                    
                                    # Clean up text - remove common UI elements
                                    if text:
                                        # Remove if it contains only UI words
                                        text_words = text.lower().split()
                                        if all(word in ui_words for word in text_words[:3]):  # If first 3 words are all UI words, skip
                                            continue
                                        
                                        # Remove if it's too short or contains only numbers/symbols
                                        if len(text) < 3 or len(text) > 100:
                                            continue
                                        
                                        # Skip if it looks like a UI label
                                        if text.lower() in ui_words or any(text.lower().startswith(ui_word + ' ') for ui_word in ui_words):
                                            continue
                                        
                                        # Skip if it contains common table headers
                                        if 'sort by' in text.lower() or 'trend status' in text.lower() or 'search volume' in text.lower():
                                            continue
                                        
                                        # Check if it's sports-related
                                        text_lower = text.lower()
                                        if any(keyword in text_lower for keyword in sports_keywords):
                                            if text not in trending_topics:
                                                trending_topics.append(text)
                                                logger.info(f"Found trending topic from table: {text}")
                        
                        # Method 2b: Look for links to trends/explore (these often contain trend names)
                        trend_links = soup.find_all('a', href=lambda x: x and ('/trends/explore' in x or '/trending' in x))
                        for link in trend_links[:50]:
                            text = link.get_text(strip=True)
                            href = link.get('href', '')
                            
                            # Extract query from URL if present
                            if '/trends/explore' in href:
                                query_match = re.search(r'q=([^&]+)', href)
                                if query_match:
                                    text = query_match.group(1).replace('+', ' ').replace('%20', ' ')
                            
                            if text and 3 < len(text) < 100:
                                text_words = text.lower().split()
                                # Skip if it's mostly UI words
                                if not all(word in ui_words for word in text_words[:2]):
                                    if text.lower() not in ui_words:
                                        text_lower = text.lower()
                                        if any(keyword in text_lower for keyword in sports_keywords):
                                            if text not in trending_topics:
                                                trending_topics.append(text)
                                                logger.info(f"Found trending topic from link: {text}")
                        
                        # Method 2c: Look for data attributes
                        elements_with_data = soup.find_all(attrs={'data-query': True})
                        for elem in elements_with_data[:30]:
                            text = elem.get('data-query', '').strip()
                            if text and 3 < len(text) < 100:
                                text_lower = text.lower()
                                if any(keyword in text_lower for keyword in sports_keywords):
                                    if text not in trending_topics:
                                        trending_topics.append(text)
                                        logger.info(f"Found trending topic from data-query: {text}")
                        
                        if trending_topics:
                            logger.info(f"Found {len(trending_topics)} trending topics from Google Trends page")
                            return trending_topics[:10]
                            
                except requests.RequestException as e:
                    logger.debug(f"Request failed for {trends_url}: {str(e)}")
                    continue
                except Exception as e:
                    logger.debug(f"Error parsing {trends_url}: {str(e)}")
                    continue
        except Exception as e:
            logger.debug(f"Google Trends page scraping failed: {str(e)}")
        
        # Strategy 2: Try Google News RSS feeds for sports as fallback
        try:
            logger.info("Trying Google News RSS feeds as fallback...")
            news_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/rss+xml, application/xml, */*',
            }
            
            google_news_urls = [
                'https://news.google.com/rss/search?q=cricket+football+OR+sports&hl=en-IN&gl=IN&ceid=IN:en',
                'https://news.google.com/rss/search?q=ipl+OR+premier+league+OR+sports&hl=en-IN&gl=IN&ceid=IN:en',
                'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0FtVnVHZ0pWVXlnQVAB?hl=en-IN&gl=IN&ceid=IN:en',
            ]
            
            for rss_url in google_news_urls:
                try:
                    response = requests.get(rss_url, headers=news_headers, timeout=10)
                    if response.status_code == 200 and response.content:
                        feed = feedparser.parse(response.content)
                        if hasattr(feed, 'entries') and feed.entries:
                            logger.info(f"Found {len(feed.entries)} entries in Google News RSS")
                            
                            for entry in feed.entries[:20]:
                                title = entry.get('title', '').strip()
                                if title and len(title) > 10 and len(title) < 150:
                                    title_lower = title.lower()
                                    if any(keyword in title_lower for keyword in sports_keywords):
                                        words = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', title)
                                        for word_phrase in words:
                                            if 4 < len(word_phrase) < 50:
                                                word_lower = word_phrase.lower()
                                                if any(keyword in word_lower for keyword in sports_keywords):
                                                    if word_phrase not in trending_topics:
                                                        trending_topics.append(word_phrase)
                                                        logger.info(f"Found trending topic from Google News: {word_phrase}")
                            
                            if len(trending_topics) >= 5:
                                logger.info(f"Found {len(trending_topics)} trending topics from Google News")
                                return trending_topics[:10]
                except Exception as e:
                    logger.debug(f"Google News RSS failed: {str(e)}")
                    continue
        except Exception as e:
            logger.debug(f"Google News scraping failed: {str(e)}")
        
        # Strategy 2: Try NewsAPI if available
        try:
            newsapi_key = getattr(settings, 'NEWSAPI_KEY', None)
            if newsapi_key:
                logger.info("Trying NewsAPI for trending topics...")
                
                # Get top headlines for sports
                newsapi_url = 'https://newsapi.org/v2/top-headlines'
                params = {
                    'category': 'sports',
                    'country': 'in',
                    'pageSize': 20,
                    'apiKey': newsapi_key
                }
                
                response = requests.get(newsapi_url, params=params, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    articles = data.get('articles', [])
                    
                    for article in articles[:15]:
                        title = article.get('title', '').strip()
                        if title:
                            # Extract key terms
                            title_lower = title.lower()
                            if any(keyword in title_lower for keyword in sports_keywords):
                                # Extract key phrases
                                words = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', title)
                                for word_phrase in words:
                                    if 4 < len(word_phrase) < 50:
                                        word_lower = word_phrase.lower()
                                        if any(keyword in word_lower for keyword in sports_keywords):
                                            if word_phrase not in trending_topics:
                                                trending_topics.append(word_phrase)
                                                logger.info(f"Found trending topic from NewsAPI: {word_phrase}")
                            
                            if len(trending_topics) >= 5:
                                logger.info(f"Found {len(trending_topics)} trending topics from NewsAPI")
                                return trending_topics[:10]
        except Exception as e:
            logger.debug(f"NewsAPI failed: {str(e)}")
        
        # Strategy 3: Try ESPN or other sports news RSS feeds
        try:
            logger.info("Trying sports news RSS feeds...")
            sports_rss_urls = [
                'https://www.espn.com/espn/rss/news',
                'https://feeds.bbci.co.uk/sport/rss.xml',
            ]
            
            for rss_url in sports_rss_urls:
                try:
                    response = requests.get(rss_url, headers=headers, timeout=10)
                    if response.status_code == 200:
                        feed = feedparser.parse(response.content)
                        if hasattr(feed, 'entries') and feed.entries:
                            for entry in feed.entries[:15]:
                                title = entry.get('title', '').strip()
                                if title:
                                    # Extract trending terms
                                    words = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', title)
                                    for word_phrase in words:
                                        if 4 < len(word_phrase) < 50:
                                            word_lower = word_phrase.lower()
                                            if any(keyword in word_lower for keyword in sports_keywords):
                                                if word_phrase not in trending_topics:
                                                    trending_topics.append(word_phrase)
                                                    logger.info(f"Found trending topic from sports RSS: {word_phrase}")
                            
                            if len(trending_topics) >= 5:
                                logger.info(f"Found {len(trending_topics)} trending topics from sports RSS")
                                return trending_topics[:10]
                except Exception as e:
                    logger.debug(f"Sports RSS failed: {str(e)}")
                    continue
        except Exception as e:
            logger.debug(f"Sports RSS scraping failed: {str(e)}")
        
        if trending_topics:
            logger.info(f"Found {len(trending_topics)} trending topics from alternative sources")
            return trending_topics[:10]
        
        logger.warning("All alternative sources failed - no trending topics found")
        return []
        
    except Exception as e:
        logger.error(f"Error getting trending topics from alternative sources: {str(e)}")
        import traceback
        logger.debug(traceback.format_exc())
        return []


def _get_fallback_trends():
    """Return fallback trending topics when Google Trends is unavailable."""
    return [
        'Cricket News',
        'Football Updates',
        'Sports Highlights',
        'IPL Updates',
        'Premier League',
    ]


def _classify_sports_trends_with_ai(trends_list):
    """
    Use Gemini AI to filter a list of trends and return only the sports-related ones.
    This effectively mimics the X 'Sports' tab classification.
    """
    if not settings.GEMINI_API_KEY:
        logger.warning("Gemini API key missing, skipping AI classification")
        return []
        
    try:
        import google.generativeai as genai
        
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        prompt = f"""
        Analyze this list of trending topics from India:
        {json.dumps(trends_list)}
        
        Return a JSON array containing ONLY the topics that are related to Sports (Cricket, Football, WWE, Tennis, Basketball, F1, Olympics, individual athletes, sports venues/stadiums, sports hashtags).
        Include topics like 'Gunther' (WWE), 'Christchurch' (Cricket Venue), 'Ravindra Jadeja' (Cricketer), etc.
        Do not include political, entertainment, or general news topics unless they are directly sports-related.
        
        Return ONLY valid JSON array of strings. Example: ["Kohli", "Manchester United", "#IPL2024"]
        """
        
        response = model.generate_content(prompt)
        text = response.text.replace('```json', '').replace('```', '').strip()
        
        sports_trends = json.loads(text)
        if isinstance(sports_trends, list):
            logger.info(f"AI classified {len(sports_trends)} sports trends from {len(trends_list)} candidates")
            return sports_trends
            
    except Exception as e:
        logger.error(f"AI classification failed: {str(e)}")
        
    return []


def _get_trends24_sports_trends():
    """
    Fetch Twitter trends from trends24.in/india/
    Gets both 30-minute (current) and 24-hour (aggregate) trends.
    Uses AI to classify them as 'Sports' to get exact matches like specific players or venues.
    """
    raw_candidates = []
    sports_keywords = ['cricket', 'football', 'soccer', 'ipl', 'premier', 'league', 'match', 'sport', 'world cup', 'championship', 'tournament', 'team', 'player', 'goal', 'wicket', 'run', 'score', 'bcci', 'kohli', 'dhoni', 'messi', 'ronaldo', 'rohit', 'pandya', 'stokes', 'babar', 'azham', 'sachin', 'ganguly', 'dravid', 'olympics', 'asian games', 'wrestling', 'hockey', 'badminton', 'tennis', 'open', 'wimbledon', 'us open', 'australian', 'french', 'kabaddi', 'pro kabaddi']
    
    url = "https://trends24.in/india/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.04472.124 Safari/537.36'
    }
    
    try:
        logger.info("Fetching Twitter trends from Trends24...")
        response = requests.get(url, headers=headers, timeout=15)
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            lists = soup.find_all('ol', class_='trend-card__list')
            
            logger.info(f"Found {len(lists)} trend lists on Trends24")
            
            # 1. Collect ALL raw candidates from top lists
            # We explicitly want the top 50-100 items to feed to AI
            seen = set()
            
            # Helper to extract clean text
            def extract_text(li):
                anchor = li.find('a')
                if anchor:
                    text = anchor.get_text(strip=True)
                else:
                    text = li.get_text(strip=True)
                    text = re.sub(r'\s*\d+[KkMm]$', '', text).strip()
                return text

            # Get Top 3 Hourly lists (Current, -1h, -2h) to capture immediate trends
            for i in range(min(3, len(lists))):
                items = lists[i].find_all('li')
                for li in items:
                    text = extract_text(li)
                    if text and len(text) > 2 and text not in seen:
                        raw_candidates.append(text)
                        seen.add(text)
            
            # Get persistent 24h candidates (appeared in 4+ lists)
            all_24h_counts = {}
            for lst in lists:
                items = lst.find_all('li')
                for li in items:
                    text = extract_text(li)
                    if text:
                        all_24h_counts[text] = all_24h_counts.get(text, 0) + 1
            
            for k, v in all_24h_counts.items():
                if v >= 4 and k not in seen:
                    raw_candidates.append(k)
                    seen.add(k)
            
            logger.info(f"Collected {len(raw_candidates)} unique candidates for AI classification")
            
            # 2. Use AI to Filter for Sports
            # This solves the 'Gunther', 'Christchurch' problem
            ai_filtered_trends = _classify_sports_trends_with_ai(raw_candidates)
            
            if ai_filtered_trends:
                logger.info(f"Using {len(ai_filtered_trends)} AI-verified sports trends")
                # Fallback: clean up duplicates (case insensitive)
                final_trends = []
                seen_lower = set()
                for t in ai_filtered_trends:
                    if t.lower() not in seen_lower:
                        final_trends.append(t)
                        seen_lower.add(t.lower())
                return final_trends
                
            # 3. Fallback to Keyword Matching if AI fails
            logger.warning("AI classification returned empty or failed, falling back to keywords")
            keyword_filtered = []
            for text in raw_candidates:
                text_lower = text.lower()
                if any(keyword in text_lower for keyword in sports_keywords):
                    keyword_filtered.append(text)
            
            return keyword_filtered
        
        else:
            logger.warning(f"Trends24 returned status {response.status_code}")
            
    except Exception as e:
        logger.error(f"Error fetching Trends24: {str(e)}")
    
    return []


def _get_twitter_trends_sports_india():
    """
    Get Twitter-like trending topics for sports in India.
    Uses Google Trends RSS for sports category (category=17) in India - this reflects
    what people are actually searching for, which correlates with Twitter trends.
    Since Twitter API is restricted, Google Trends RSS is the best proxy for actual trending topics.
    """
    logger.info("Fetching Twitter-like trends for sports in India")
    
    # Use the new robust strategy (Trends24 + AI)
    trends = _get_trends24_sports_trends()
    
    if trends:
        logger.info(f"Returning {len(trends)} trends from Trends24+AI")
        return trends
        
    # Only if that fails, return fallback
    logger.warning("Trends24/AI failed, returning generic fallback")
    return _get_twitter_fallback_trends()


def _get_twitter_fallback_trends():
    """Return fallback Twitter trending topics for sports in India."""
    return [
        'India Cricket',
        'IPL Updates',
        'Indian Football',
        'Sports News India',
        'Cricket Match',
        'Football Match',
        'BCCI News',
        'Indian Sports',
        'Premier League India',
        'World Cup India',
    ]


def _fetch_articles_from_trending_topics(trending_topics):
    """
    Fetch articles from NewsAPI based on trending topics from Google Trends.
    """
    logger.info(f"Fetching articles from NewsAPI for trending topics: {trending_topics}")
    
    if not settings.NEWS_API_KEY:
        return {'success': False, 'articles_created': 0, 'error': 'NewsAPI key not configured'}
    
    # Calculate timestamp for last 1 hour
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    from_time = one_hour_ago.strftime('%Y-%m-%dT%H:%M:%SZ')
    
    api_url = 'https://newsapi.org/v2/everything'
    articles_created = 0
    errors = []
    processed_urls = set()
    
    # Search for articles on each trending topic
    for topic in trending_topics[:5]:  # Limit to top 5 topics
        try:
            params = {
                'q': topic,
                'language': 'en',
                'sortBy': 'popularity',
                'from': from_time,
                'pageSize': 10,  # Get up to 10 articles per topic
                'apiKey': settings.NEWS_API_KEY,
            }
            
            logger.info(f"Searching NewsAPI for trending topic: {topic}")
            response = requests.get(api_url, params=params, timeout=30)
            
            if response.status_code != 200:
                logger.warning(f"NewsAPI request failed for {topic}: {response.status_code}")
                continue
            
            data = response.json()
            if data.get('status') != 'ok':
                logger.warning(f"NewsAPI returned error for {topic}: {data.get('message')}")
                continue
            
            articles = data.get('articles', [])
            logger.info(f"Found {len(articles)} articles for topic: {topic}")
            
            for article_data in articles:
                try:
                    url = article_data.get('url')
                    if not url or url in processed_urls:
                        continue
                    
                    # Check if article already exists
                    existing = Article.objects.filter(source_url=url).first()
                    if existing:
                        continue
                    
                    processed_urls.add(url)
                    
                    # Determine sport category
                    title = article_data.get('title', 'Untitled').lower()
                    if any(word in title for word in ['cricket', 'ipl', 'bcci', 'kohli', 'dhoni', 'ashes']):
                        sport = 'Cricket'
                    elif any(word in title for word in ['football', 'soccer', 'premier league', 'messi', 'ronaldo']):
                        sport = 'Football'
                    else:
                        sport = 'Sports'
                    
                    # Build trend data with trending topic info
                    trend_data = {
                        'title': article_data.get('title', ''),
                        'link': url,
                        'published': article_data.get('publishedAt', ''),
                        'sport': sport,
                        'trending_topic': topic,
                        'source': article_data.get('source', {}).get('name', 'NewsAPI'),
                        'author': article_data.get('author', ''),
                        'description': article_data.get('description', ''),
                        'image_url': article_data.get('urlToImage', ''),
                        'newsapi': True,
                        'from_google_trends': True,
                    }
                    
                    summary = article_data.get('description', '') or article_data.get('content', '')[:500]
                    
                    # Generate unique slug
                    title = article_data.get('title', 'Untitled')
                    slug = slugify(title)
                    base_slug = slug
                    counter = 1
                    while Article.objects.filter(slug=slug).exists():
                        slug = f"{base_slug}-{counter}"
                        counter += 1
                    
                    article = Article.objects.create(
                        title=title,
                        slug=slug,
                        summary=summary[:500],
                        status='fetched',
                        source_url=url,
                        source_feed='NewsAPI (Google Trends)',
                        category='trends',
                        trend_data=trend_data,
                    )
                    
                    articles_created += 1
                    logger.debug(f"Created article from trending topic '{topic}': {title}")
                    
                except Exception as e:
                    logger.error(f"Error processing article for topic {topic}: {str(e)}")
                    continue
            
            # Add delay between topic searches
            time.sleep(1)
            
        except Exception as e:
            logger.error(f"Error fetching articles for topic {topic}: {str(e)}")
            errors.append(str(e))
            continue
    
    logger.info(f"NewsAPI fetch from trending topics completed. Created {articles_created} articles.")
    
    return {
        'success': True,
        'articles_created': articles_created,
        'errors': errors,
        'topics_searched': len(trending_topics)
    }


def _fetch_articles_from_google_news(trending_topics):
    """
    Fetch articles from Google News RSS based on trending topics.
    Fallback when NewsAPI is not available.
    """
    logger.info(f"Fetching articles from Google News for trending topics: {trending_topics}")
    
    articles_created = 0
    errors = []
    processed_urls = set()
    
    for topic in trending_topics[:5]:  # Limit to top 5 topics
        try:
            # Google News RSS feed URL
            # URL encode the topic
            from urllib.parse import quote_plus
            # Construct Google News RSS URL (Best source for fetching)
            # We use the RSS feed for fetching because it's machine-readable
            encoded_topic = quote_plus(topic)
            google_news_rss_url = f"https://news.google.com/rss/search?q={encoded_topic}+sports+when:24h&hl=en&gl=IN&ceid=IN:en"
            
            # Construct Human-Readable News Search URL (for the 'source_url' field)
            # This points to the 'News' tab (tbm=nws) which is what the user wants
            human_news_url = f"https://www.google.com/search?q={encoded_topic}+sports&tbm=nws&tbs=qdr:d" # tbm=nws (News), tbs=qdr:d (Past 24h)

            logger.info(f"Fetching Google News RSS for topic: {topic}")
            feed = feedparser.parse(google_news_rss_url)
            
            if feed.bozo:
                logger.warning(f"Feed parsing issues for {topic}: {feed.bozo_exception}")
                continue
            
            one_hour_ago = timezone.now() - timedelta(hours=1)
            
            for entry in feed.entries[:10]:  # Limit to 10 articles per topic
                try:
                    url = entry.get('link', '')
                    if not url or url in processed_urls:
                        continue
                    
                    # Check if article already exists
                    existing = Article.objects.filter(source_url=url).first()
                    if existing:
                        continue
                    
                    # Check if article is from last hour
                    published_time = None
                    if entry.get('published_parsed'):
                        try:
                            published_time = datetime(*entry.published_parsed[:6])
                            published_time = timezone.make_aware(published_time)
                            if published_time < one_hour_ago:
                                continue
                        except:
                            pass
                    
                    processed_urls.add(url)
                    
                    # Determine sport
                    title = entry.get('title', 'Untitled').lower()
                    if any(word in title for word in ['cricket', 'ipl', 'bcci']):
                        sport = 'Cricket'
                    elif any(word in title for word in ['football', 'soccer', 'premier league']):
                        sport = 'Football'
                    else:
                        sport = 'Sports'
                    
                    trend_data = {
                        'title': entry.get('title', ''),
                        'link': url,
                        'published': entry.get('published', ''),
                        'sport': sport,
                        'trending_topic': topic,
                        'source': 'Google News',
                        'from_google_trends': True,
                    }
                    
                    summary = entry.get('summary', '') or entry.get('description', '')
                    
                    slug = slugify(entry.get('title', 'Untitled'))
                    base_slug = slug
                    counter = 1
                    while Article.objects.filter(slug=slug).exists():
                        slug = f"{base_slug}-{counter}"
                        counter += 1
                    
                    article = Article.objects.create(
                        title=entry.get('title', 'Untitled'),
                        slug=slug,
                        summary=summary[:500],
                        status='fetched',
                        source_url=url,
                        source_feed='Google News (Google Trends)',
                        category='trends',
                        trend_data=trend_data,
                    )
                    
                    articles_created += 1
                    logger.debug(f"Created article from Google News topic '{topic}': {article.title}")
                    
                except Exception as e:
                    logger.error(f"Error processing Google News article: {str(e)}")
                    continue
            
            time.sleep(1)  # Delay between topics
            
        except Exception as e:
            logger.error(f"Error fetching Google News for topic {topic}: {str(e)}")
            errors.append(str(e))
            continue
    
    logger.info(f"Google News fetch from trending topics completed. Created {articles_created} articles.")
    
    return {
        'success': True,
        'articles_created': articles_created,
        'errors': errors,
        'topics_searched': len(trending_topics)
    }


def _fetch_newsapi_india_sports():
    """
    Fetch trending sports articles from NewsAPI for India (last 1 hour).
    """
    logger.info("Fetching sports articles from NewsAPI for India")
    
    # Calculate timestamp for 1 hour ago
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    from_time = one_hour_ago.strftime('%Y-%m-%dT%H:%M:%SZ')
    
    # Build API URL for India sports articles
    # Using 'everything' endpoint with country and sports keywords
    api_url = 'https://newsapi.org/v2/everything'
    
    # Indian sports keywords for better filtering
    sports_keywords = '(cricket OR football OR ipl OR bcci OR kohli OR dhoni OR messi OR ronaldo OR premier league)'
    
    params = {
        'q': sports_keywords,
        'language': 'en',
        'sortBy': 'popularity',  # Most popular/trending articles first
        'from': from_time,
        'pageSize': 50,  # Get up to 50 articles
        'apiKey': settings.NEWS_API_KEY,
    }
    
    articles_created = 0
    errors = []
    
    try:
        logger.info(f"Fetching NewsAPI with params: q={sports_keywords}, from={from_time}")
        response = requests.get(api_url, params=params, timeout=30)
        
        if response.status_code != 200:
            error_msg = f"NewsAPI request failed: {response.status_code} - {response.text}"
            logger.error(error_msg)
            errors.append(error_msg)
            return {
                'success': False,
                'articles_created': 0,
                'errors': errors
            }
        
        data = response.json()
        
        if data.get('status') != 'ok':
            error_msg = f"NewsAPI returned error: {data.get('message', 'Unknown error')}"
            logger.error(error_msg)
            errors.append(error_msg)
            return {
                'success': False,
                'articles_created': 0,
                'errors': errors
            }
        
        articles = data.get('articles', [])
        logger.info(f"Received {len(articles)} articles from NewsAPI")
        
        # Filter articles and create database entries
        for article_data in articles:
            try:
                url = article_data.get('url')
                if not url:
                    continue
                
                # Check if article already exists
                existing = Article.objects.filter(source_url=url).first()
                if existing:
                    logger.debug(f"Article already exists: {url}")
                    continue
                
                # Parse published date
                published_time = None
                published_str = article_data.get('publishedAt', '')
                if published_str:
                    try:
                        # NewsAPI uses ISO 8601 format: 2024-01-01T12:00:00Z
                        published_time = datetime.fromisoformat(published_str.replace('Z', '+00:00'))
                    except:
                        logger.debug(f"Could not parse date: {published_str}")
                
                # Determine sport from title/content
                title = article_data.get('title', 'Untitled')
                title_lower = title.lower()
                
                if any(word in title_lower for word in ['cricket', 'ipl', 'bcci', 'kohli', 'dhoni', 'ashes', 'test match']):
                    sport = 'Cricket'
                elif any(word in title_lower for word in ['football', 'soccer', 'premier league', 'messi', 'ronaldo', 'world cup', 'epl']):
                    sport = 'Football'
                else:
                    sport = 'Sports'  # Generic sports
                
                # Build trend data
                trend_data = {
                    'title': title,
                    'link': url,
                    'published': published_str,
                    'published_parsed': published_time.isoformat() if published_time else None,
                    'sport': sport,
                    'feed_name': article_data.get('source', {}).get('name', 'NewsAPI'),
                    'source': article_data.get('source', {}).get('name', 'NewsAPI'),
                    'author': article_data.get('author', ''),
                    'description': article_data.get('description', ''),
                    'content': article_data.get('content', ''),
                    'image_url': article_data.get('urlToImage', ''),
                    'newsapi': True,
                }
                
                summary = article_data.get('description', '') or article_data.get('content', '')[:500]
                
                # Generate unique slug
                slug = slugify(title)
                base_slug = slug
                counter = 1
                while Article.objects.filter(slug=slug).exists():
                    slug = f"{base_slug}-{counter}"
                    counter += 1
                
                article = Article.objects.create(
                    title=title,
                    slug=slug,
                    summary=summary[:500],
                    status='fetched',
                    source_url=url,
                    source_feed='NewsAPI',
                    category='trends',
                    trend_data=trend_data,
                )
                
                articles_created += 1
                logger.debug(f"Created NewsAPI article: {title} ({sport})")
                
            except Exception as e:
                logger.error(f"Error processing NewsAPI article: {str(e)}")
                continue
        
        logger.info(f"NewsAPI fetch completed. Created {articles_created} new articles.")
        
        return {
            'success': True,
            'articles_created': articles_created,
            'errors': errors
        }
        
    except Exception as e:
        error_msg = f"Error in NewsAPI fetch: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {
            'success': False,
            'articles_created': 0,
            'errors': [error_msg]
        }


def _fetch_sports_rss():
    """
    Fetch sports articles from RSS feeds for Football and Cricket.
    """
    logger.info("Fetching sports RSS feeds")
    
    feeds_to_fetch = [
        {
            'name': 'ESPN Cricket',
            'url': 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml',
            'sport': 'Cricket'
        },
        {
            'name': 'BBC Football',
            'url': 'http://feeds.bbci.co.uk/sport/football/rss.xml',
            'sport': 'Football'
        },
        {
            'name': 'BBC Cricket',
            'url': 'http://feeds.bbci.co.uk/sport/cricket/rss.xml',
            'sport': 'Cricket'
        },
        {
            'name': 'ESPN Football',
            'url': 'http://www.espn.com/espn/rss/soccer/news',
            'sport': 'Football'
        },
    ]
    
    articles_created = 0
    total_errors = []
    
    for feed_info in feeds_to_fetch:
        trends_url = feed_info['url']
        sport_name = feed_info['sport']
        
        try:
            logger.info(f"Fetching {feed_info['name']} feed: {trends_url}")
            feed = feedparser.parse(trends_url)
            
            if feed.bozo:
                logger.warning(f"Feed parsing issues for {feed_info['name']}: {feed.bozo_exception}")
            
            one_hour_ago = timezone.now() - timedelta(hours=1)
            
            for entry in feed.entries[:20]:
                try:
                    if entry.get('link'):
                        existing = Article.objects.filter(source_url=entry.link).first()
                        if existing:
                            logger.debug(f"Trend already exists: {entry.link}")
                            continue
                    
                    published_time = None
                    if entry.get('published_parsed'):
                        try:
                            published_time = datetime(*entry.published_parsed[:6])
                            published_time = timezone.make_aware(published_time)
                        except:
                            pass
                    
                    if published_time and published_time < one_hour_ago:
                        logger.debug(f"Skipping old article: {entry.title}")
                        continue
                    
                    title = entry.get('title', 'Untitled')
                    summary = entry.get('summary', '') or entry.get('description', '')
                    
                    trend_data = {
                        'title': title,
                        'link': entry.get('link', ''),
                        'published': entry.get('published', ''),
                        'published_parsed': published_time.isoformat() if published_time else None,
                        'sport': sport_name,
                        'feed_name': feed_info['name'],
                        'source': entry.get('source', {}).get('title', feed_info['name']) if entry.get('source') else feed_info['name'],
                        'tags': entry.get('tags', []),
                        'author': entry.get('author', ''),
                    }
                    
                    slug = slugify(title)
                    base_slug = slug
                    counter = 1
                    while Article.objects.filter(slug=slug).exists():
                        slug = f"{base_slug}-{counter}"
                        counter += 1
                    
                    article = Article.objects.create(
                        title=title,
                        slug=slug,
                        summary=summary[:500],
                        status='fetched',
                        source_url=entry.get('link', ''),
                        source_feed=trends_url,
                        category='trends',
                        trend_data=trend_data,
                    )
                    
                    articles_created += 1
                    logger.debug(f"Created article: {article.title} ({sport_name})")
                    
                except Exception as e:
                    logger.error(f"Error creating article: {str(e)}")
                    continue
            
        except Exception as e:
            error_msg = f"Error fetching {feed_info['name']}: {str(e)}"
            logger.error(error_msg, exc_info=True)
            total_errors.append(error_msg)
    
    logger.info(f"RSS-only fetch completed. Created {articles_created} new articles.")
    
    return {
        'success': True if not total_errors else False,
        'articles_created': articles_created,
        'errors': total_errors
    }


@shared_task
def enhance_articles_with_google_trends():
    """
    Enhance existing trend articles with Google Trends data.
    Fetches actual Google Trends data for sports keywords and updates trend_data.
    """
    if not PYTRENDS_AVAILABLE:
        logger.warning("pytrends not available. Skipping Google Trends enhancement.")
        return {
            'success': False,
            'message': 'pytrends library not installed'
        }
    
    logger.info("Starting Google Trends enhancement")
    
    try:
        # Initialize pytrends
        pytrends = TrendReq(hl='en-US', tz=360)
        
        # Get recent trend articles (last hour)
        one_hour_ago = timezone.now() - timedelta(hours=1)
        recent_articles = Article.objects.filter(
            category='trends',
            created_at__gte=one_hour_ago
        )[:20]  # Process up to 20 recent articles
        
        if not recent_articles.exists():
            logger.info("No recent trend articles to enhance")
            return {
                'success': True,
                'articles_enhanced': 0
            }
        
        articles_enhanced = 0
        
        for article in recent_articles:
            try:
                # Extract keywords from title
                title_words = article.title.split()
                # Get first 3 significant words as potential search terms
                keywords = [w for w in title_words if len(w) > 4][:3]
                
                if not keywords:
                    continue
                
                # Add delay to avoid rate limiting (2 seconds between requests)
                time.sleep(2)
                
                # Get Google Trends interest for these keywords
                pytrends.build_payload(keywords, cat=0, timeframe='now 1-H', geo='US')
                trends_data = pytrends.interest_over_time()
                
                if not trends_data.empty:
                    # Calculate average interest
                    avg_interest = trends_data[keywords].sum(axis=1).mean()
                    
                    # Get related queries
                    related_queries = pytrends.related_queries()
                    
                    # Update trend_data with Google Trends info
                    trend_data = article.trend_data or {}
                    trend_data.update({
                        'google_trends': {
                            'avg_interest': float(avg_interest),
                            'timeframe': 'last 1 hour',
                            'keywords_searched': keywords,
                            'related_queries': {
                                kw: {
                                    'top': list(related_queries.get(kw, {}).get('top', {}).head(5)['query'].values) if kw in related_queries and related_queries[kw].get('top') is not None else [],
                                    'rising': list(related_queries.get(kw, {}).get('rising', {}).head(5)['query'].values) if kw in related_queries and related_queries[kw].get('rising') is not None else []
                                } for kw in keywords
                            }
                        }
                    })
                    
                    article.trend_data = trend_data
                    article.save()
                    articles_enhanced += 1
                    logger.debug(f"Enhanced article with Google Trends: {article.title}")
                
            except Exception as e:
                logger.error(f"Error enhancing article {article.id}: {str(e)}")
                continue
        
        logger.info(f"Google Trends enhancement completed. Enhanced {articles_enhanced} articles.")
        
        return {
            'success': True,
            'articles_enhanced': articles_enhanced
        }
        
    except Exception as e:
        error_msg = f"Error in Google Trends enhancement: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {
            'success': False,
            'error': error_msg
        }


def _fetch_articles_for_topic_task(topic, tenant=None):
    """
    Fetch 2-3 most relevant articles for a specific trend topic from Google News on-demand.
    Used when a user clicks a trend card.
    """
    logger.info(f"On-demand fetching articles for topic: {topic} (tenant: {tenant})")

    articles_created = 0
    created_articles = []
    
    # Pre-calculate URLs for use in logic and fallbacks
    from urllib.parse import quote_plus
    encoded_topic = quote_plus(topic)
    # Human-Readable Link to Google News Tab (for clickable source)
    human_news_url = f"https://www.google.com/search?q={encoded_topic}+sports&tbm=nws&tbs=qdr:d"
    
    try:
        # RSS Feed URL (machine readable)
        google_news_url = f"https://news.google.com/rss/search?q={encoded_topic}+sports+when:24h&hl=en&gl=IN&ceid=IN:en"
        
        # Use requests with User-Agent to avoid 403/Blocking
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, */*'
        }
        
        response = requests.get(google_news_url, headers=headers, timeout=10)
        
        if response.status_code != 200:
            logger.error(f"Google News returned status {response.status_code}")
            return {'success': False, 'error': f"Google News API returned {response.status_code}"}
            
        feed = feedparser.parse(response.content)
        
        if not feed.entries:
             logger.warning(f"No entries found for topic: {topic}. Trying broader search.")
             # Fallback: Try searching without 'sports' or date restriction if too strict
             fallback_url = f"https://news.google.com/rss/search?q={encoded_topic}&hl=en&gl=IN&ceid=IN:en"
             response = requests.get(fallback_url, headers=headers, timeout=10)
             if response.status_code == 200:
                feed = feedparser.parse(response.content)

        if not feed.entries:
             return {'success': False, 'error': f"No recent articles found for '{topic}'."}
             
        # We only want the top 3 most relevant (RSS is usually sorted by relevance/date)
        for entry in feed.entries[:3]:
            try:
                url = entry.get('link', '')
                if not url:
                    continue
                
                # Check if article already exists
                existing = Article.objects.filter(source_url=url).first()
                if existing:
                    created_articles.append(existing)
                    continue
                
                # Determine sport
                title = entry.get('title', 'Untitled').lower()
                if any(word in title for word in ['cricket', 'ipl', 'bcci']):
                    sport = 'Cricket'
                elif any(word in title for word in ['football', 'soccer', 'premier league']):
                    sport = 'Football'
                else:
                    sport = 'Sports'
                
                trend_data = {
                    'title': entry.get('title', ''),
                    'link': url,
                    'published': entry.get('published', ''),
                    'sport': sport,
                    'trending_topic': topic,
                    'source': 'Google News (On-Demand)',
                    'from_google_trends': True,
                }
                
                summary = entry.get('summary', '') or entry.get('description', '')
                
                slug = slugify(entry.get('title', 'Untitled'))
                base_slug = slug
                counter = 1
                while Article.objects.filter(slug=slug).exists():
                    slug = f"{base_slug}-{counter}"
                    counter += 1
                
                article = Article.objects.create(
                    title=entry.get('title', 'Untitled'),
                    slug=slug,
                    summary=summary[:500],
                    status='fetched',
                    source_url=url,
                    source_feed='Google News (On-Demand)',
                    category='trends',
                    trend_data=trend_data,
                    tenant=tenant,
                )
                
                articles_created += 1
                created_articles.append(article)
                logger.info(f"Created on-demand article: {article.title}")
                
            except Exception as e:
                logger.error(f"Error processing entry: {e}")
                continue
                
    except Exception as e:
        logger.error(f"Error in on-demand fetch: {e}")
        # FALLBACK: Create a stub article if scraping fails completely
        # This ensures the user always gets an actionable item.
        try:
             stub_title = f"{topic}: Latest Updates"
             slug = slugify(stub_title)
             if not Article.objects.filter(slug=slug).exists():
                 stub_article = Article.objects.create(
                    title=stub_title,
                    slug=slug,
                    summary=f"Automated stub for trending topic: {topic}. Click Generate to fetch real content.",
                    status='fetched',
                    source_url=f"https://www.google.com/search?q={quote_plus(topic)}",
                    source_feed='Trends Stub',
                    category='trends',
                    trend_data={'trending_topic': topic, 'sport': 'Sports'},
                    tenant=tenant,
                 )
                 articles_created += 1
                 created_articles.append(stub_article)
                 return {
                    'success': True,
                    'articles_created': 1,
                    'articles': [{'id': stub_article.id, 'title': stub_article.title, 'url': stub_article.source_url}]
                 }
        except Exception as ex:
             logger.error(f"Failed to create stub: {ex}")
             
        return {'success': False, 'error': str(e)}

    # If we have created articles OR found existing ones, it's a success
    if articles_created == 0 and len(created_articles) == 0:
         # FALLBACK: Create a stub article if valid RSS entries were not found
         try:
             stub_title = f"{topic}: Latest News"
             slug = slugify(stub_title)
             
             # Avoid dupe
             base_slug = slug
             counter = 1
             while Article.objects.filter(slug=slug).exists():
                 slug = f"{base_slug}-{counter}"
                 counter += 1
             # Create a "Stub Article" so the user sees something in the list
             # We use the Human-Readable News URL so clicking "View Source" goes to the News tab
             stub_article = Article.objects.create(
                 title=f"{topic}: Latest Updates",
                 slug=slugify(f"{topic}-latest-updates-{timezone.now().strftime('%Y%m%d-%H%M')}"),
                 summary=f"Automated stub for trending topic: {topic}. Click Generate to fetch real content.",
                 source_url=human_news_url,
                 source_feed="Trends Stub",
                 category='trends',
                 trend_data={'trending_topic': topic, 'sport': 'Sports'},
                 status='fetched',
                 published_at=timezone.now(),
                 tenant=tenant,
             )
             articles_created += 1
             created_articles.append(stub_article)
         except Exception as ex:
             logger.error(f"Failed to create stub: {ex}")
             return {'success': False, 'error': "No relevant articles could be saved."}

    return {
        'success': True,
        'articles_created': articles_created,
        'articles': [{'id': a.id, 'title': a.title, 'url': a.source_url} for a in created_articles]
    }
