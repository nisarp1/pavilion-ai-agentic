"""
API views for RSS Fetcher.
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import RSSFeed
from .serializers import RSSFeedSerializer
from .tasks import fetch_single_feed_task, fetch_single_rss_feed, fetch_rss_feeds, fetch_google_trends_sports, enhance_articles_with_google_trends, _get_trending_topics_from_google_trends, _fetch_articles_for_topic_task
import logging


class RSSFeedViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing RSS feeds.
    """
    def get_queryset(self):
        return RSSFeed.objects.filter(tenant=self.request.tenant)
    serializer_class = RSSFeedSerializer
    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)
    
    @action(detail=True, methods=['post'])
    def fetch(self, request, pk=None):
        """
        Manually trigger fetching of a single RSS feed.
        Works synchronously if Celery is not available.
        """
        feed = self.get_object()
        
        # Try to use Celery if available, otherwise run synchronously
        try:
            task = fetch_single_feed_task.delay(feed.id)
            return Response({
                'message': 'Feed fetch task started',
                'task_id': task.id,
                'feed_id': feed.id
            }, status=status.HTTP_202_ACCEPTED)
        except Exception:
            # Celery not available, run synchronously
            try:
                result = fetch_single_rss_feed(feed.url)
                feed.last_fetched_at = timezone.now()
                feed.save()
                
                return Response({
                    'message': 'Feed fetched successfully',
                    'articles_created': result.get('articles_created', 0),
                    'feed_id': feed.id
                }, status=status.HTTP_200_OK)
            except Exception as e:
                return Response({
                    'error': str(e)
                }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def fetch_all(self, request):
        """
        Manually trigger fetching of all active RSS feeds.
        Works synchronously if Celery is not available.
        Force parameter forces fetch even if recently fetched.
        """
        try:
            # Force fetch when manually triggered
            result = fetch_rss_feeds(force=True)
            return Response({
                'message': 'All feeds fetched successfully',
                'articles_created': result.get('articles_created', 0),
                'errors': result.get('errors', [])
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'], url_path='fetch-trends')
    def fetch_trends(self, request):
        """
        Manually trigger fetching of Sports trending topics from RSS feeds.
        Works synchronously if Celery is not available.
        """
        try:
            # Try to use Celery if available, otherwise run synchronously
            try:
                task = fetch_google_trends_sports.delay()
                return Response({
                    'message': 'Trends fetch task started',
                    'task_id': task.id
                }, status=status.HTTP_202_ACCEPTED)
            except Exception:
                # Celery not available, run synchronously
                result = fetch_google_trends_sports()
                return Response({
                    'message': 'Trends fetched successfully',
                    'articles_created': result.get('articles_created', 0)
                }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'], url_path='enhance-trends')
    def enhance_trends(self, request):
        """
        Manually trigger enhancement of trend articles with Google Trends data.
        Works synchronously if Celery is not available.
        """
        try:
            # Try to use Celery if available, otherwise run synchronously
            try:
                task = enhance_articles_with_google_trends.delay()
                return Response({
                    'message': 'Google Trends enhancement task started',
                    'task_id': task.id
                }, status=status.HTTP_202_ACCEPTED)
            except Exception:
                # Celery not available, run synchronously
                result = enhance_articles_with_google_trends()
                return Response({
                    'message': 'Google Trends enhancement completed',
                    'articles_enhanced': result.get('articles_enhanced', 0)
                }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='fetch-topic-articles')
    def fetch_topic_articles(self, request):
        """
        Fetch 2-3 most relevant articles for a specific trend topic on usage demand.
        Params: topic (string)
        """
        topic = request.data.get('topic')
        if not topic:
             return Response({'error': 'topic parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
             
        try:
            # Pass tenant so articles are associated with the right tenant
            tenant = getattr(request, 'tenant', None)
            result = _fetch_articles_for_topic_task(topic, tenant=tenant)
            return Response(result, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    
    @action(detail=False, methods=['get'], url_path='realtime-trends')
    def realtime_trends(self, request):
        """Real-time trending sports topics via the agentic Gemini pipeline."""
        from .agents.coordinator import run_trends_pipeline
        payload = run_trends_pipeline()
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='twitter-trends')
    def twitter_trends(self, request):
        """Sports trends (replaces broken Twitter/pytrends with agentic pipeline)."""
        from .agents.coordinator import run_trends_pipeline
        payload = run_trends_pipeline()
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='agentic-trends')
    def agentic_trends(self, request):
        """Full enriched agentic trends — always returns enriched_trends array."""
        force = request.query_params.get('refresh', '').lower() == 'true'
        from .agents.coordinator import run_trends_pipeline
        payload = run_trends_pipeline(force_refresh=force)
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='trend-click',
            permission_classes=[permissions.IsAuthenticated])
    def trend_click(self, request):
        """Record a user click on a trend card to power the self-training boost."""
        topic = request.data.get('topic', '').strip()
        if not topic:
            return Response({'error': 'topic required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            from cms.models import Article
            article = Article.objects.filter(
                trend_data__trending_topic__icontains=topic[:40]
            ).order_by('-created_at').first()
            if article:
                td = article.trend_data or {}
                td['click_count'] = int(td.get('click_count', 0)) + 1
                Article.objects.filter(pk=article.pk).update(trend_data=td)
                return Response({'success': True, 'click_count': td['click_count']})
            return Response({'success': True, 'click_count': 0})
        except Exception as exc:
            logging.getLogger(__name__).error('trend_click error: %s', exc)
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from workers.tasks import fetch_and_save_featured_image, generate_audio_for_article
from cms.models import Article
import os
import traceback
import io
import sys

@api_view(['GET'])
@permission_classes([AllowAny])
def debug_media_view(request):
    """
    Public view to debug media generation.
    Usage: 
    /debug-media/?type=creds
    /debug-media/?type=image&article_id=10
    /debug-media/?type=voice&article_id=10
    """
    debug_type = request.query_params.get('type', 'creds')
    article_id = request.query_params.get('article_id')
    
    logs = []
    def log(msg):
        logs.append(str(msg))
    
    log(f"--- Debugging {debug_type.upper()} ---")
    
    if debug_type == 'creds':
        creds_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
        json_content = os.environ.get('GOOGLE_CREDENTIALS_JSON')
        
        log(f"GOOGLE_APPLICATION_CREDENTIALS env var: {creds_path}")
        log(f"GOOGLE_CREDENTIALS_JSON env var length: {len(json_content) if json_content else 0}")
        
        if creds_path:
            if os.path.exists(creds_path):
                log(f"SUCCESS: Credentials file exists at {creds_path}")
                try:
                    with open(creds_path, 'r') as f:
                        content = f.read()
                        log(f"File content length: {len(content)}")
                        if len(content) < 10:
                            log("WARNING: File seems empty!")
                except Exception as e:
                    log(f"ERROR reading file: {e}")
            else:
                log(f"ERROR: File does NOT exist at {creds_path}")
        else:
            log("WARNING: GOOGLE_APPLICATION_CREDENTIALS is not set")
            
    elif debug_type in ['image', 'voice']:
        if not article_id:
            return JsonResponse({'error': 'Please provide article_id'}, status=400)
            
        try:
            article = Article.objects.get(id=article_id)
            log(f"Article: {article.title} (ID: {article.id})")
            
            if debug_type == 'image':
                log(f"Source URL: {article.source_url}")
                if not article.source_url:
                    log("ERROR: No source URL")
                else:
                    log("Attempting to fetch image...")
                    fetch_and_save_featured_image(article)
                    article.refresh_from_db()
                    if article.featured_image:
                        log(f"SUCCESS! Image saved: {article.featured_image.name}")
                        log(f"URL: {article.featured_image.url}")
                    else:
                        log("FAILED: Image field is empty after execution")
                        
            elif debug_type == 'voice':
                if not article.body:
                    log("ERROR: Article has no body content")
                else:
                    log("Attempting to generate audio...")
                    result = generate_audio_for_article(article)
                    if result:
                        article.refresh_from_db()
                        if article.audio:
                            log(f"SUCCESS! Audio saved: {article.audio.name}")
                            log(f"URL: {article.audio.url}")
                        else:
                            log("FAILED: Audio field is empty despite True return")
                    else:
                        log("FAILED: Function returned False (check logs for details)")
                        
        except Article.DoesNotExist:
            log(f"ERROR: Article {article_id} not found")
        except Exception as e:
            log(f"CRASH: {str(e)}")
            log(traceback.format_exc())
            
    return JsonResponse({
        'status': 'finished',
        'logs': logs
    })
