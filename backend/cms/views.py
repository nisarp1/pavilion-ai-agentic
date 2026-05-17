"""
API views for CMS.
"""
from rest_framework import viewsets, status, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from datetime import timedelta, datetime
import os
import re
import hashlib
import uuid
from PIL import Image
from io import BytesIO
from django.db.models import Q
from django.utils import timezone
from django.http import HttpResponse, HttpResponseBadRequest, Http404
from django.conf import settings
from .models import Article, ArticleVersion, Category, Media, WebStory, PosterTemplate
from .utils import process_image_to_webp, generate_cutout_image
from .serializers import (
    ArticleSerializer,
    ArticleListSerializer,
    ArticleGenerateSerializer,
    CategorySerializer,
    CategoryListSerializer,
    MediaSerializer,
    WebStorySerializer,
    WebStoryListSerializer,
)
from cms.video_generator import generate_script
from tenants.permissions import (
    IsAdminOfTenant,
    IsEditorOrAdminOfTenant,
    HasReadAccessToTenant,
)


class ArticleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing articles.
    """
    queryset = Article.objects.all()
    
    def get_permissions(self):
        """
        RBAC-based permissions:
        - list, retrieve: HasReadAccessToTenant (user must be tenant member)
        - create, update, partial_update: IsEditorOrAdminOfTenant
        - destroy: IsAdminOfTenant
        """
        if self.action in ['list', 'retrieve']:
            return [HasReadAccessToTenant()]
        elif self.action in ['create', 'update', 'partial_update']:
            return [IsEditorOrAdminOfTenant()]
        elif self.action == 'destroy':
            return [IsAdminOfTenant()]
        return [permissions.IsAuthenticated()]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ArticleListSerializer
        return ArticleSerializer
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def get_queryset(self):
        queryset = Article.objects.all().filter(tenant=self.request.tenant).select_related(
            'author', 'editor'
        ).prefetch_related(
            'categories'
        )
        
        status_filter = self.request.query_params.get('status', None)
        category_filter = self.request.query_params.get('category', None)
        slug_filter = self.request.query_params.get('slug', None)
        
        if slug_filter:
            queryset = queryset.filter(slug=slug_filter)
        
        if status_filter:
            queryset = queryset.filter(status=status_filter)
            
            # Apply ordering based on status
            # Apply ordering based on status
            if status_filter == 'published':
                queryset = queryset.order_by('-published_at', '-updated_at')
            elif status_filter == 'draft':
                 # For drafts, sort by last modified (Draft Time)
                queryset = queryset.order_by('-updated_at')
            elif status_filter == 'fetched':
                # For fetched articles, sort by created_at (Fetch Time)
                queryset = queryset.order_by('-created_at')
            else:
                # Default/Archived
                queryset = queryset.order_by('-updated_at')
        else:
            # By default, exclude archived articles
            queryset = queryset.exclude(status='archived')
            # For the "all" view (excluding archived), sort by updated_at to show recent activity
            queryset = queryset.order_by('-updated_at')
        
        if category_filter:
            try:
                category_obj = Category.objects.filter(slug=category_filter, is_active=True).first()
                if category_obj:
                    queryset = queryset.filter(categories=category_obj)
                else:
                    queryset = queryset.filter(category=category_filter)
            except Exception:
                queryset = queryset.filter(category=category_filter)

        exclude_category = self.request.query_params.get('exclude_category', None)
        if exclude_category:
            queryset = queryset.exclude(category=exclude_category)

        search = self.request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) |
                Q(summary__icontains=search) |
                Q(body__icontains=search)
            )

        return queryset
    
    def perform_create(self, serializer):
        serializer.save(author=self.request.user, tenant=self.request.tenant)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Dashboard stats: article counts, recent publishes, RSS health."""
        from django.db.models import Count
        from datetime import timedelta
        from rss_fetcher.models import RSSFeed

        tenant = request.tenant
        now = timezone.now()

        by_status = (
            Article.objects.filter(tenant=tenant)
            .values('status')
            .annotate(count=Count('id'))
        )
        status_map = {row['status']: row['count'] for row in by_status}

        recent_published = Article.objects.filter(
            tenant=tenant, status='published'
        ).order_by('-published_at')[:5]

        from .serializers import ArticleListSerializer
        rss_feeds = list(
            RSSFeed.objects.filter(tenant=tenant)
            .values('id', 'name', 'url', 'last_fetched_at', 'is_active')
        )

        return Response({
            'articles_by_status': status_map,
            'total': sum(status_map.values()),
            'published_last_7_days': Article.objects.filter(
                tenant=tenant, status='published',
                published_at__gte=now - timedelta(days=7)
            ).count(),
            'published_last_30_days': Article.objects.filter(
                tenant=tenant, status='published',
                published_at__gte=now - timedelta(days=30)
            ).count(),
            'pending_generation': status_map.get('fetched', 0),
            'currently_generating': status_map.get('generating', 0),
            'rss_feeds': rss_feeds,
            'recent_published': ArticleListSerializer(
                recent_published, many=True, context={'request': request}
            ).data,
        })

    def perform_update(self, serializer):
        """Save a version snapshot before each update."""
        instance = self.get_object()
        if instance.body or instance.title:
            next_version = instance.versions.count() + 1
            ArticleVersion.objects.create(
                article=instance,
                version_number=next_version,
                title=instance.title,
                body=instance.body,
                summary=instance.summary or '',
                created_by=self.request.user,
            )
        serializer.save()

    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        """List version history for an article."""
        article = self.get_object()
        vers = article.versions.select_related('created_by').all()
        data = [
            {
                'id': v.id,
                'version_number': v.version_number,
                'title': v.title,
                'created_by': v.created_by.get_full_name() if v.created_by else None,
                'created_at': v.created_at,
            }
            for v in vers
        ]
        return Response(data)

    @action(detail=True, methods=['post'], url_path='versions/(?P<version_id>[0-9]+)/restore')
    def restore_version(self, request, pk=None, version_id=None):
        """Restore article content from a specific version."""
        article = self.get_object()
        try:
            version = ArticleVersion.objects.get(id=version_id, article=article)
        except ArticleVersion.DoesNotExist:
            return Response({'error': 'Version not found'}, status=status.HTTP_404_NOT_FOUND)
        article.title = version.title
        article.body = version.body
        article.summary = version.summary
        article.save(update_fields=['title', 'body', 'summary', 'updated_at'])
        return Response({'message': f'Restored to version {version.version_number}'})

    @action(detail=True, methods=['get'])
    def task_status(self, request, pk=None):
        """Return the Celery task state for the article's active background task."""
        article = self.get_object()
        if not article.celery_task_id:
            return Response({'status': 'no_task', 'task_id': None})
        try:
            from celery.result import AsyncResult
            result = AsyncResult(article.celery_task_id)
            return Response({
                'task_id': article.celery_task_id,
                'state': result.state,
                'info': str(result.info) if result.info else None,
            })
        except Exception as e:
            return Response({'status': 'error', 'message': str(e)})

    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        """Trigger article generation via Celery (falls back to thread if broker is down)."""
        article = self.get_object()

        if article.status != 'fetched':
            return Response(
                {'error': "Article must be in 'fetched' status to generate."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Enforce subscription tier generation limits
        try:
            from tenants.limits import check_generation_limit
            allowed, msg = check_generation_limit(request.tenant)
            if not allowed:
                return Response({'error': msg}, status=status.HTTP_402_PAYMENT_REQUIRED)
        except Exception:
            pass

        article.status = 'generating'
        article.generation_started_at = timezone.now()
        article.save(update_fields=['status', 'generation_started_at'])

        try:
            from workers.tasks import generate_article_task
            task = generate_article_task.delay(article.id)
            article.celery_task_id = str(task.id)
            article.save(update_fields=['celery_task_id'])
        except Exception:
            import threading
            from django.db import close_old_connections
            from workers.tasks import _generate_article_task_impl

            def _fallback(article_id):
                close_old_connections()
                try:
                    _generate_article_task_impl(article_id)
                finally:
                    close_old_connections()

            threading.Thread(target=_fallback, args=(article.id,), daemon=True).start()

        return Response({
            'message': 'Article generation started',
            'article_id': article.id,
            'status': 'generating',
        }, status=status.HTTP_202_ACCEPTED)
    
    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """
        Publish an article.
        """
        article = self.get_object()
        article.publish()
        article.editor = request.user
        article.save()
        
        serializer = self.get_serializer(article)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """
        Archive an article.
        """
        article = self.get_object()
        article.status = 'archived'
        article.save()
        
        serializer = self.get_serializer(article)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def generate_audio(self, request, pk=None):
        """
        Generate audio for an article with a specific voice.
        Expected payload: {
            "voice_name": "chirp" | "neural2" | "wavenet" | "karthika"
        }
        """
        article = self.get_object()
        
        if not article.body or not article.body.strip():
            return Response(
                {'error': 'Article must have body content to generate audio.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        voice_name = request.data.get('voice_name', 'chirp')
        
        try:
            from workers.tasks import generate_audio_for_article
            import logging
            logger = logging.getLogger(__name__)
            
            logger.info(f"Generating audio for article {article.id} with voice: {voice_name}")
            result = generate_audio_for_article(article, voice_name=voice_name)
            
            if result:
                article.refresh_from_db()
                serializer = self.get_serializer(article)
                return Response({
                    'message': f'Audio generated successfully with voice: {voice_name}',
                    'article': serializer.data,
                    'audio_url': serializer.data.get('audio_url')
                }, status=status.HTTP_200_OK)
            else:
                return Response(
                    {'error': 'Audio generation failed. Check logs for details.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except ImportError as import_error:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to import audio generation function: {str(import_error)}")
            return Response({
                'error': f'Failed to import audio generation module: {str(import_error)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error generating audio: {str(e)}", exc_info=True)
            return Response({
                'error': f'Audio generation error: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def generate_reel_audio(self, request, pk=None):
        """
        Generate audio for an article's reel script.
        Expected payload: {
            "voice_name": "chirp" | "neural2" | "wavenet"
        }
        """
        article = self.get_object()
        
        if not article.instagram_reel_script or not article.instagram_reel_script.strip():
            return Response(
                {'error': 'Article must have reel script to generate reel audio.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        voice_name = request.data.get('voice_name', 'chirp')
        
        try:
            from workers.tasks import generate_instagram_reel_audio
            import logging
            logger = logging.getLogger(__name__)
            
            logger.info(f"Generating reel audio for article {article.id} with voice: {voice_name}")
            result = generate_instagram_reel_audio(article, voice_name=voice_name)
            
            if result:
                article.refresh_from_db()
                serializer = self.get_serializer(article)
                return Response({
                    'message': f'Reel audio generated successfully with voice: {voice_name}',
                    'article': serializer.data,
                    # Assuming serializer will include the new field automatically or I need to handle it?
                    # The serializer likely uses `fields = '__all__'` or similar.
                    'reel_audio_url': article.instagram_reel_audio.url if article.instagram_reel_audio else None
                }, status=status.HTTP_200_OK)
            else:
                return Response(
                    {'error': 'Reel audio generation failed. Check logs for details.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error generating reel audio: {str(e)}", exc_info=True)
            return Response({
                'error': f'Reel audio generation error: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def generate_poster(self, request, pk=None):
        """
        Generate a social media poster for the article.
        Expected payload: {
            "template_id": (optional) ID of the poster template to use
        }
        """
        article = self.get_object()
        template_id = request.data.get('template_id')
        
        try:
            from .poster_generator import generate_poster
            
            success, result = generate_poster(article, template_id)
            
            if success:
                article.refresh_from_db()
                serializer = self.get_serializer(article)
                return Response({
                    'message': 'Poster generated successfully',
                    'article': serializer.data,
                    'poster_url': result
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'error': f'Poster generation failed: {result}'
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error generating poster: {str(e)}", exc_info=True)
            return Response({
                'error': f'Poster generation error: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def generate_video_script(self, request, pk=None):
        """
        Generate a video script for the article using Gemini.
        Returns the generated script.
        """
        article = self.get_object()
        format = request.data.get('format', article.video_format or 'portrait')
        
        article_text = f"{article.title}. {article.summary or article.body[:200]}"
        
        try:
            script = generate_script(article_text, format=format)
            if script:
                article.video_script = script
                article.video_format = format
                article.video_status = 'idle'
                article.save()
                return Response({'script': script})
            else:
                return Response({'error': 'Script generation failed'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def generate_video_content(self, request, pk=None):
        """
        Trigger asynchronous video generation via Celery (falls back to thread if broker down).
        Optional payload: {"video_script": "custom script", "format": "portrait/landscape"}
        """
        article = self.get_object()
        video_script = request.data.get('video_script', article.video_script)
        video_format = request.data.get('format', article.video_format or 'portrait')

        if not video_script:
            return Response(
                {'error': 'Video script is required. Generate a script first.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        article.video_status = 'generating_video'
        article.video_script = video_script
        article.video_format = video_format
        article.save(update_fields=['video_status', 'video_script', 'video_format'])

        try:
            from workers.tasks import task_generate_sports_video
            task = task_generate_sports_video.delay(article.id, video_format, video_script)
            article.celery_task_id = str(task.id)
            article.save(update_fields=['celery_task_id'])
        except Exception:
            import threading
            from django.db import close_old_connections
            import logging
            logger = logging.getLogger(__name__)

            def _fallback_video(article_id, fmt, script):
                close_old_connections()
                try:
                    from workers.tasks import _generate_article_task_impl
                    from cms.video_generator import generate_sports_video, upload_to_blob, get_did_status
                    from cms.models import Article as ArticleModel
                    import requests as req_lib
                    import time

                    art = ArticleModel.objects.get(id=article_id)
                    result = generate_sports_video(
                        f"{art.title}. {art.summary or ''}",
                        format=fmt, post_id=article_id, script_content=script
                    )
                    if 'error' in result:
                        art.video_status = 'failed'
                        art.video_error = str(result.get('error'))
                        art.save()
                        return
                    talk_id = result.get('talk_id')
                    art.video_audio_url = result.get('audio_url', '')
                    art.save()
                    for _ in range(30):
                        status_data = get_did_status(talk_id)
                        if not status_data:
                            break
                        if status_data.get('status') == 'done':
                            video_url = status_data.get('result_url')
                            art.video_url = video_url
                            art.video_status = 'completed'
                            art.video_error = ''
                            art.save()
                            return
                        if status_data.get('status') == 'error':
                            art.video_status = 'failed'
                            art.video_error = str(status_data.get('error', {}))
                            art.save()
                            return
                        time.sleep(10)
                    art.video_status = 'failed'
                    art.video_error = 'D-ID polling timed out'
                    art.save()
                except Exception as e:
                    logger.error(f"Video fallback thread error: {e}", exc_info=True)
                    try:
                        from cms.models import Article as ArticleModel
                        art = ArticleModel.objects.get(id=article_id)
                        art.video_status = 'failed'
                        art.video_error = str(e)
                        art.save()
                    except Exception:
                        pass
                finally:
                    close_old_connections()

            threading.Thread(target=_fallback_video, args=(article.id, video_format, video_script), daemon=True).start()

        return Response({'message': 'Video generation started', 'status': 'generating_video'})

    @action(detail=True, methods=['post'])
    def trigger_newsroomx_pipeline(self, request, pk=None):
        """
        Trigger the NewsroomX Programmatic API Pipeline (A_B_C Sequence).
        Accepts optional 'newsroomx_dna' in payload.
        """
        article = self.get_object()
        dna = request.data.get('newsroomx_dna', article.newsroomx_dna)
        
        if not dna:
            return Response(
                {'error': 'No NewsroomX DNA provided or stored.'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Save DNA manually if provided in request
        if 'newsroomx_dna' in request.data:
            article.newsroomx_dna = dna
            article.save()
            
        import threading
        from .newsroomx_orchestrator import execute_newsroomx_pipeline
        
        # Reset status and clear old error
        article.newsroomx_status = 'step_a_audio'
        article.newsroomx_error = ""
        article.save()
        
        def run_pipeline(art_id):
            from django.db import close_old_connections
            from .models import Article as ArticleModel
            close_old_connections()
            try:
                art = ArticleModel.objects.get(id=art_id)
                execute_newsroomx_pipeline(art)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Async NewsroomX pipeline error: {e}", exc_info=True)
            finally:
                close_old_connections()
                
        thread = threading.Thread(target=run_pipeline, args=(article.id,), daemon=True)
        thread.start()
        
        return Response({
            'message': 'NewsroomX Pipeline started',
            'status': 'step_a_audio',
            'article_id': article.id
        })

    @action(detail=False, methods=['get'])
    def video_diag(self, request):
        """
        Diagnostic endpoint to check status of API keys and environment.
        """
        import os
        
        def check_key(key_name):
            val = os.getenv(key_name)
            if not val:
                return "MISSING"
            if len(val) < 8:
                return "TOO_SHORT"
            # Return masked version
            return f"PRESENT (ends with ...{val[-4:]})"

        diag = {
            "D_ID_API_KEY": check_key("D_ID_API_KEY"),
            "GOOGLE_CREDENTIALS_JSON": check_key("GOOGLE_CREDENTIALS_JSON"),
            "VERCEL_BLOB_READ_WRITE_TOKEN": check_key("VERCEL_BLOB_READ_WRITE_TOKEN"),
            "GEMINI_API_KEY": check_key("GEMINI_API_KEY"),
            "CREATOMATE_API_KEY": check_key("CREATOMATE_API_KEY"),
            "RAILWAY_ENVIRONMENT": os.getenv("RAILWAY_ENVIRONMENT", "Not detected"),
            "DATABASE_URL_DETECTED": bool(os.getenv("DATABASE_URL")),
        }
        
        # Check if D_ID_API_KEY has ":"
        did_key = os.getenv("D_ID_API_KEY")
        if did_key:
            diag["D_ID_KEY_FORMAT"] = "BASIC_AUTH (username:password)" if ":" in did_key else "TOKEN_ONLY"

        return Response(diag)

    @action(detail=False, methods=['get'])
    def check_available_voices(self, request):
        """
        Check which TTS voices are available in the Google Cloud project.
        Useful for debugging why voices might sound the same (fallback issue).
        """
        try:
            from google.cloud import texttospeech
            import os
            
            # Check if credentials are configured
            creds_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
            if not creds_path or not os.path.exists(creds_path):
                return Response({
                    'error': 'Google Cloud credentials not configured',
                    'available_voices': [],
                    'recommended_voices': {
                        'chirp': 'ml-IN-Chirp3-HD-Despina',
                        'neural2': 'ml-IN-Neural2-A',
                        'wavenet': 'ml-IN-Wavenet-A',
                    }
                }, status=status.HTTP_400_BAD_REQUEST)
            
            client = texttospeech.TextToSpeechClient()
            voices = client.list_voices(language_code='ml-IN')
            
            available_voices = []
            chirp_voices = []
            neural2_voices = []
            wavenet_voices = []
            standard_voices = []
            
            for voice in voices.voices:
                voice_info = {
                    'name': voice.name,
                    'gender': texttospeech.SsmlVoiceGender(voice.ssml_gender).name,
                    'sample_rate': voice.natural_sample_rate_hertz,
                }
                available_voices.append(voice_info)
                
                if 'Chirp' in voice.name:
                    chirp_voices.append(voice_info)
                elif 'Neural2' in voice.name:
                    neural2_voices.append(voice_info)
                elif 'Wavenet' in voice.name:
                    wavenet_voices.append(voice_info)
                elif 'Standard' in voice.name:
                    standard_voices.append(voice_info)
            
            # Check if recommended voices are available
            recommended = {
                'chirp': 'ml-IN-Chirp3-HD-Despina',
                'neural2': 'ml-IN-Neural2-A',
                'wavenet': 'ml-IN-Wavenet-A',
            }
            
            voice_status = {}
            for key, voice_name in recommended.items():
                voice_status[key] = {
                    'requested': voice_name,
                    'available': any(v['name'] == voice_name for v in available_voices),
                    'alternatives': [v['name'] for v in available_voices if key in v['name'].lower() or voice_name.split('-')[2] in v['name']]
                }
            
            return Response({
                'total_voices': len(available_voices),
                'available_voices': available_voices,
                'by_type': {
                    'chirp': chirp_voices,
                    'neural2': neural2_voices,
                    'wavenet': wavenet_voices,
                    'standard': standard_voices,
                },
                'recommended_voice_status': voice_status,
                'diagnosis': {
                    'chirp_available': len(chirp_voices) > 0,
                    'neural2_available': len(neural2_voices) > 0,
                    'wavenet_available': len(wavenet_voices) > 0,
                    'all_same_voice_issue': len(wavenet_voices) > 0 and len(chirp_voices) == 0 and len(neural2_voices) == 0,
                }
            })
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error checking available voices: {str(e)}", exc_info=True)
            return Response({
                'error': f'Error checking voices: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'])
    def bulk_update(self, request):
        """
        Bulk update multiple articles.
        Expected payload: {
            "article_ids": [1, 2, 3],
            "updates": {
                "category_ids": [1, 2],  # Add categories (will be merged with existing)
                "status": "published",    # Update status
                "category": "trends"      # Update source category
            }
        }
        """
        article_ids = request.data.get('article_ids', [])
        updates = request.data.get('updates', {})
        
        if not article_ids:
            return Response(
                {'error': 'article_ids is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not updates:
            return Response(
                {'error': 'updates is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            articles = Article.objects.filter(id__in=article_ids)
            updated_count = 0
            
            for article in articles:
                # Update status if provided
                if 'status' in updates:
                    article.status = updates['status']
                    if updates['status'] == 'published' and not article.published_at:
                        from django.utils import timezone
                        article.published_at = timezone.now()
                
                # Update source category if provided
                if 'category' in updates:
                    article.category = updates['category']
                
                # Handle category_ids - add to existing categories
                if 'category_ids' in updates:
                    category_ids = updates['category_ids']
                    if category_ids:  # Only update if not empty
                        # Get category objects
                        categories = Category.objects.filter(id__in=category_ids, is_active=True)
                        # Add to existing categories (use set to avoid duplicates)
                        existing_ids = set(article.categories.values_list('id', flat=True))
                        new_ids = set(category_ids)
                        # Merge: add new categories, keep existing
                        all_ids = list(existing_ids | new_ids)
                        article.categories.set(all_ids)
                
                article.save()
                updated_count += 1
            
            return Response({
                'message': f'Successfully updated {updated_count} article(s)',
                'updated_count': updated_count
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['get'])
    def poster_editor_config(self, request, pk=None):
        """
        Get configuration for the manual poster editor.
        Returns template layout, text content, and image URLs (including cutout).
        """
        article = self.get_object()
        
        # 1. Ensure we have a cutout image
        if article.featured_image and not article.featured_image_cutout:
             # Try to generate it on the fly
             try:
                 filename, content = generate_cutout_image(article.featured_image)
                 if filename and content:
                     article.featured_image_cutout.save(filename, content, save=True)
             except Exception as e:
                 print(f"Failed to generate cutout: {e}")

        # 2. Get Layout Config
        # We use "Standard Poster (Top Text)" as default
        template_name = request.query_params.get('template', "Standard Poster (Top Text)")
        template = PosterTemplate.objects.filter(name=template_name).first()
        
        if not template:
             return Response({'error': 'Template not found'}, status=404)
             
        # 3. Prepare Text Data (similar logic to poster_generator.py)
        poster_context = getattr(article, 'poster_context', {}) or {}
        json_image_content = poster_context.get('image_content', {})
        
        # Headline
        headline = ""
        if json_image_content.get('text_overlay_malayalam'):
            headline = json_image_content.get('text_overlay_malayalam')
        elif article.social_media_poster_text:
            headline = article.social_media_poster_text
        else:
            headline = article.title
            
        # Summary
        summary = ""
        if json_image_content.get('match_statistics'):
             stats = json_image_content.get('match_statistics', {})
             player = json_image_content.get('player_name', '')
             runs = stats.get('runs', '')
             balls = stats.get('balls_faced', '')
             sr = stats.get('strike_rate', '')
             parts = []
             if player: parts.append(player.upper())
             if runs: parts.append(f"{runs} ({balls})")
             if sr: parts.append(f"SR: {sr}")
             if parts: summary = " | ".join(parts)
        
        if not summary:
            summary = article.social_media_caption or article.summary

        # 4. Construct Response
        data = {
            "template": {
                "name": template.name,
                "background_url": request.build_absolute_uri(template.background_image.url) if template.background_image else None,
                "text_config": template.text_config, # Contains X, Y, Color, Font info
                "image_config": template.image_config
            },
            "assets": {
                "cutout_url": request.build_absolute_uri(article.featured_image_cutout.url) if article.featured_image_cutout else None,
                "original_url": request.build_absolute_uri(article.featured_image.url) if article.featured_image else None
            },
            "content": {
                "headline": headline,
                "summary": summary
            }
        }
        return Response(data)

    @action(detail=True, methods=['post'])
    def save_poster(self, request, pk=None):
        """
        Upload a manually edited poster image.
        """
        article = self.get_object()
        
        if 'image' not in request.FILES:
             return Response({'error': 'No image provided'}, status=400)
             
        image_file = request.FILES['image']
        
        # Save to generated_poster field
        article.generated_poster.save(f"poster_{article.id}_manual.png", image_file)
        article.save()
        
        return Response({
            'success': True, 
            'url': request.build_absolute_uri(article.generated_poster.url)
        })

    @action(detail=False, methods=['post'])
    def recreate_reel_agentic(self, request):
        """
        AI Video Production Pipeline API.

        Accepts:
          - article_id: ID of an existing CMS article to generate a reel from
          - url: Reference YouTube URL (overrides article context if provided)
          - text_prompt: Free text prompt (alternative to URL)
          - video_format: "reel" | "short" | "long" (default: "reel")
          - include_avatar: boolean (default: false)
        """
        import logging as _logging
        logger = _logging.getLogger(__name__)

        reference_url  = request.data.get('url')
        text_prompt    = request.data.get('text_prompt')
        article_id_req = request.data.get('article_id')
        video_format   = request.data.get('video_format', 'reel')
        include_avatar = request.data.get('include_avatar', False)

        logger.info(
            f"[Pipeline] recreate_reel_agentic: article_id={article_id_req!r} "
            f"url={reference_url!r} text_prompt={text_prompt!r}"
        )

        if not reference_url and not text_prompt and not article_id_req:
            return Response(
                {'error': 'Provide article_id, a reference URL, or a text prompt.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if video_format not in ('reel', 'short', 'long'):
            video_format = 'reel'

        # Build article_data dict when an article_id is supplied
        article_data_for_pipeline = None
        if article_id_req:
            try:
                src_article = Article.objects.get(pk=article_id_req)
                article_data_for_pipeline = {
                    'id':                    src_article.id,
                    'title':                 src_article.title or '',
                    'summary':               src_article.summary or '',
                    'content':               src_article.body or '',
                    'category':              src_article.category or '',
                    'source_url':            src_article.source_url or '',
                    'instagram_reel_script': src_article.instagram_reel_script or '',
                }
                logger.info(
                    f"[Pipeline] article_data built: id={src_article.id} "
                    f"title={src_article.title[:60]!r} "
                    f"body_len={len(src_article.body or '')} "
                    f"reel_script_len={len(src_article.instagram_reel_script or '')}"
                )
            except Article.DoesNotExist:
                return Response({'error': f'Article {article_id_req} not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            from workers.tasks import task_recreate_reel_agentic

            result = task_recreate_reel_agentic(
                reference_url or text_prompt or '',
                video_format=video_format,
                include_avatar=include_avatar,
                article_data=article_data_for_pipeline,
            )
            
            if result.get('status') == 'success':
                # Auto-save as draft Video Article
                try:
                    meta = result.get('metadata', {})
                    voiceover = result.get('voiceover', {})
                    article_title = meta.get('title', f"Video: {(reference_url or text_prompt)[:60]}")
                    
                    article = Article(
                        title=article_title,
                        status='draft',
                        category='video_project',
                        source_url=reference_url or '',
                        body=voiceover.get('script_plain', ''),
                        summary=f"AI-generated {video_format} video project",
                        video_script=voiceover.get('script_plain', ''),
                        video_production_plan=result,
                        video_format='portrait' if video_format in ('reel', 'short') else 'landscape',
                        video_status='generating_script',
                        author=request.user if request.user.is_authenticated else None,
                        tenant=getattr(request, 'tenant', None),
                    )
                    article.save()
                    result['article_id'] = article.id
                    result['article_slug'] = article.slug
                    
                    # ── ElevenLabs audio (preferred) or keep pipeline's Google TTS ──
                    # The pipeline already generated Google TTS inside pipeline.run().
                    # If ElevenLabs is configured, upgrade to it now and rebuild the
                    # timeline so captions + audio share one authoritative source.
                    # On any ElevenLabs failure we keep the pipeline's existing audio.
                    import uuid as _uuid2
                    import os as _os
                    _logger_pipe = _logging.getLogger(__name__)

                    el_key = _os.environ.get("ELEVENLABS_API_KEY", "")
                    if el_key:
                        try:
                            from django.core.files.base import ContentFile as _CF
                            from agents.elevenlabs_agent import ElevenLabsAgent as _ELAgent, _mp3_duration_ms as _mp3dur
                            from agents.stt_agent import transcribe_for_word_timings as _stt
                            from agents.video_pipeline import _word_timings_to_captions as _wt2cap, _chunk_word_timings as _wt2txt

                            el_script = voiceover.get('script_plain', '')
                            if not el_script:
                                raise ValueError("No voiceover script to synthesise")

                            _logger_pipe.info("[Pipeline] ElevenLabs synthesis starting...")
                            _el = _ELAgent()
                            el_bytes, el_timings = _el.synthesize_with_timings_chunked(script=el_script)

                            # STT validation — replace approximate ElevenLabs timestamps
                            try:
                                stt_t = _stt(audio_bytes=el_bytes, language_code="ml-IN", encoding="MP3")
                                if stt_t:
                                    el_timings = stt_t
                                    _logger_pipe.info(f"[Pipeline] STT replaced timings: {len(stt_t)} words")
                            except Exception as _stt_e:
                                _logger_pipe.warning(f"[Pipeline] STT skipped: {_stt_e}")

                            # Save audio file
                            el_fname = f'elevenlabs_{article.pk}_{_uuid2.uuid4().hex[:8]}.mp3'
                            article.instagram_reel_audio.save(el_fname, _CF(el_bytes), save=False)
                            article.elevenlabs_audio_url = article.instagram_reel_audio.url
                            article.save(update_fields=['instagram_reel_audio', 'elevenlabs_audio_url'])

                            audio_url    = article.instagram_reel_audio.url
                            dur_ms       = _mp3dur(el_bytes)
                            word_caps    = _wt2cap(el_timings) if el_timings else []
                            text_caps    = _wt2txt(el_timings) if el_timings else []
                            new_audio    = [{'startMs': 0, 'endMs': dur_ms, 'audioUrl': audio_url}]

                            result['audio_url'] = audio_url
                            for _tl_key in ('timeline',):
                                _tl = result.get(_tl_key)
                                if _tl:
                                    _tl['audio']        = new_audio
                                    _tl['wordCaptions'] = word_caps
                                    _tl['text']         = text_caps
                            for _pp_key in ('props', 'modular_props'):
                                _pp_tl = (result.get(_pp_key) or {}).get('timeline')
                                if _pp_tl:
                                    _pp_tl['audio']        = new_audio
                                    _pp_tl['wordCaptions'] = word_caps
                                    _pp_tl['text']         = text_caps

                            article.video_production_plan = {
                                **article.video_production_plan,
                                'audio_url': audio_url,
                                'timeline':  result.get('timeline'),
                                'props':     result.get('props'),
                            }
                            article.save(update_fields=['video_production_plan'])
                            _logger_pipe.info(f"[Pipeline] ElevenLabs audio saved → {audio_url}")

                        except Exception as _el_err:
                            _logger_pipe.warning(
                                f"[Pipeline] ElevenLabs failed, keeping Google TTS audio: {_el_err}"
                            )
                        
                except Exception as save_err:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Failed to auto-save video article: {save_err}")
                    # Pipeline still succeeded, just couldn't save as article
                    result['article_id'] = None
                
                return Response(result)
            else:
                return Response(
                    {'error': result.get('error', 'Unknown error occurred')},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
                
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Video Pipeline API error: {str(e)}", exc_info=True)
            return Response(
                {'error': f"Pipeline error: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


    @action(detail=True, methods=['post'], url_path='save_plan_assets')
    def save_plan_assets(self, request, pk=None):
        """
        Persist asset URLs and brand settings assigned in Video Studio back into
        the article's video_production_plan so they survive page refresh.
        """
        article = self.get_object()
        assets = request.data.get('assets', [])
        brand  = request.data.get('brand', {})   # logoSrc, brandName, accent
        if not isinstance(assets, list):
            return Response({'error': 'assets must be a list'}, status=status.HTTP_400_BAD_REQUEST)

        plan = article.video_production_plan or {}
        plan['assets_needed'] = assets
        if brand and isinstance(brand, dict):
            plan['brand'] = brand
        article.video_production_plan = plan
        article.save(update_fields=['video_production_plan', 'updated_at'])
        return Response({'status': 'ok', 'saved': len(assets)})

    @action(detail=True, methods=['post'], url_path='generate_elevenlabs_audio')
    def generate_elevenlabs_audio(self, request, pk=None):
        """
        Manually trigger ElevenLabs TTS for the article's Malayalam voiceover.
        PAID API — only trigger for final approved reels.

        Audio is saved as a local Django media file (same pattern as the Google TTS
        pipeline) to avoid GCS uniform-bucket-level-access ACL issues.

        On success:
          - Saves MP3 to media/articles/reels/elevenlabs_{id}_{uuid}.mp3
          - Saves absolute URL to article.elevenlabs_audio_url
          - Updates plan.audio_url + plan.audio_source so renders use ElevenLabs audio
        """
        import logging as _logging
        import uuid as _uuid
        from django.core.files.base import ContentFile

        _logger = _logging.getLogger(__name__)

        article = self.get_object()
        plan    = article.video_production_plan or {}
        # Prefer script from request body (editor override) over stored plan script
        script  = (request.data.get('script') or '').strip() or plan.get('voiceover', {}).get('script_plain', '')

        if not script:
            return Response(
                {'error': 'No voiceover script found in production plan. Run the AI pipeline first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from agents.elevenlabs_agent import ElevenLabsAgent, _mp3_duration_ms
            from agents.video_pipeline import _word_timings_to_captions
            agent = ElevenLabsAgent()

            _logger.info(f"[ElevenLabs] Starting chunked generation for article {pk} ({len(script)} chars)")
            audio_bytes, word_timings = agent.synthesize_with_timings_chunked(script=script)
            _logger.info(
                f"[ElevenLabs] Received {len(audio_bytes)} bytes, "
                f"{len(word_timings)} word timings (chunked)"
            )

            # ── STT validation: replace approximate ElevenLabs timestamps with
            # accurate waveform-derived timestamps from Google Cloud STT.
            # ElevenLabs character alignment sometimes breaks (stacks multiple words
            # at the same ms). STT gives frame-accurate sync directly from the audio.
            # Falls back silently if STT is unavailable or fails.
            try:
                from agents.stt_agent import transcribe_for_word_timings
                _logger.info(f"[ElevenLabs] Running Google STT for accurate word timestamps...")
                stt_timings = transcribe_for_word_timings(
                    audio_bytes=audio_bytes,
                    language_code="ml-IN",
                    encoding="MP3",
                )
                if stt_timings:
                    # STT timestamps are waveform-derived ground truth — always prefer them.
                    # Linear index mapping was removed: if STT misses words at the start,
                    # linear math shifts all subsequent timestamps to wrong positions.
                    # Using STT directly means ≤5% of words may be missing from captions
                    # (when STT can't recognise a word), but every caption that appears
                    # is perfectly timed. That beats showing all words at wrong times.
                    n_el_orig = len(word_timings)
                    word_timings = stt_timings
                    _logger.info(
                        f"[ElevenLabs] STT replaced ElevenLabs alignment: "
                        f"{len(stt_timings)} words (was {n_el_orig})"
                    )
                else:
                    _logger.info("[ElevenLabs] STT returned 0 timings — keeping ElevenLabs alignment")
            except Exception as _stt_err:
                _logger.warning(f"[ElevenLabs] STT validation failed (non-fatal, keeping ElevenLabs): {_stt_err}")

            # Save as local Django media file — avoids GCS ACL issues entirely
            filename = f'elevenlabs_{article.pk}_{_uuid.uuid4().hex[:8]}.mp3'
            article.instagram_reel_audio.save(
                filename,
                ContentFile(audio_bytes),
                save=False,
            )

            # Return the relative /media/... URL — same pattern as the existing TTS pipeline.
            audio_url = article.instagram_reel_audio.url   # e.g. /media/articles/reels/...

            # Parse actual MP3 frame headers for exact duration — more accurate than
            # a fixed-bitrate estimate, and captures trailing silence after the last word.
            mp3_dur_ms  = _mp3_duration_ms(audio_bytes)
            wt_dur_ms   = word_timings[-1]['end_ms'] if word_timings else 0
            duration_seconds = round(max(mp3_dur_ms, wt_dur_ms) / 1000, 2)

            # ── Build wordCaptions from validated word timings ─────────────────
            word_captions = _word_timings_to_captions(word_timings) if word_timings else []

            # ── Update plan with new audio URL + word captions ────────────────
            updated_plan = dict(plan)
            updated_plan['audio_url']    = audio_url
            updated_plan['audio_source'] = 'elevenlabs'
            # Persist edited script back to plan so future runs use the correct text
            updated_plan.setdefault('voiceover', {})['script_plain'] = script

            if word_captions:
                for _key in ('timeline', 'props', 'modular_props'):
                    _tl = updated_plan.get(_key) if _key == 'timeline' \
                        else (updated_plan.get(_key) or {}).get('timeline')
                    if _tl:
                        _tl['wordCaptions'] = word_captions
                        _tl['audio'] = [{'startMs': 0, 'endMs': int(duration_seconds * 1000), 'audioUrl': audio_url}]
                if 'voiceover' in updated_plan:
                    updated_plan['voiceover']['word_timings'] = word_timings

            # Persist on article
            article.elevenlabs_audio_url = audio_url
            article.video_production_plan = updated_plan
            article.save(update_fields=['instagram_reel_audio', 'elevenlabs_audio_url', 'video_production_plan'])

            _logger.info(
                f"[ElevenLabs] Article {article.pk}: {duration_seconds}s, "
                f"{len(word_captions)} word captions → {audio_url}"
            )

            return Response({
                'status':           'success',
                'audio_url':        audio_url,
                'duration_seconds': duration_seconds,
                'word_timings_count': len(word_timings),
                'voice_id':         agent._voice_id,
            })

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            _logger.error(f"[ElevenLabs] Generation failed for article {pk}: {e}", exc_info=True)
            return Response(
                {'error': f'ElevenLabs generation failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'], url_path='generate_google_tts_audio')
    def generate_google_tts_audio(self, request, pk=None):
        """
        Generate Google Cloud TTS audio for playground / testing.
        Accepts optional `script` body param — if provided it overrides the
        stored plan script and the edit is persisted back to the plan.
        Free-tier friendly: saves audio as a local Django media file.
        """
        import logging as _logging
        import uuid as _uuid
        from django.core.files.base import ContentFile

        _logger = _logging.getLogger(__name__)

        article = self.get_object()
        plan    = article.video_production_plan or {}
        script  = (request.data.get('script') or '').strip() or plan.get('voiceover', {}).get('script_plain', '')

        if not script:
            return Response(
                {'error': 'No voiceover script found. Run the AI pipeline first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from agents.tts_agent import TTSAgent, SAMPLE_RATE
            from agents.video_pipeline import _word_timings_to_captions

            agent = TTSAgent()
            _logger.info(f"[GoogleTTS] Starting synthesis for article {pk} ({len(script)} chars)")
            audio_bytes, word_timings = agent.synthesize_bytes(script=script)
            _logger.info(f"[GoogleTTS] Got {len(audio_bytes)} bytes, {len(word_timings)} word timings")

            filename = f'google_tts_{article.pk}_{_uuid.uuid4().hex[:8]}.wav'
            article.instagram_reel_audio.save(filename, ContentFile(audio_bytes), save=False)
            audio_url = article.instagram_reel_audio.url

            # Use actual WAV byte count for duration — more reliable than last word end_ms,
            # which misses trailing silence after the final spoken word.
            data_bytes = max(0, len(audio_bytes) - 44)
            wav_duration_seconds = data_bytes / 2 / SAMPLE_RATE
            wt_duration_seconds  = word_timings[-1]['end_ms'] / 1000 if word_timings else 0
            duration_seconds = round(max(wav_duration_seconds, wt_duration_seconds), 2)

            word_captions = _word_timings_to_captions(word_timings) if word_timings else []

            updated_plan = dict(plan)
            updated_plan['audio_url']    = audio_url
            updated_plan['audio_source'] = 'google_tts'
            updated_plan.setdefault('voiceover', {})['script_plain'] = script

            if word_captions:
                for _key in ('timeline', 'props', 'modular_props'):
                    _tl = updated_plan.get(_key) if _key == 'timeline' \
                        else (updated_plan.get(_key) or {}).get('timeline')
                    if _tl:
                        _tl['wordCaptions'] = word_captions
                        _tl['audio'] = [{'startMs': 0, 'endMs': int(duration_seconds * 1000), 'audioUrl': audio_url}]
                if 'voiceover' in updated_plan:
                    updated_plan['voiceover']['word_timings'] = word_timings

            # Clear any ElevenLabs flag since we're now using Google TTS
            article.elevenlabs_audio_url = ''
            article.video_production_plan = updated_plan
            article.save(update_fields=['instagram_reel_audio', 'elevenlabs_audio_url', 'video_production_plan'])

            _logger.info(f"[GoogleTTS] Article {article.pk}: {duration_seconds}s, {len(word_captions)} captions → {audio_url}")

            return Response({
                'status':            'success',
                'audio_url':         audio_url,
                'duration_seconds':  duration_seconds,
                'word_timings_count': len(word_timings),
            })

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            _logger.error(f"[GoogleTTS] Generation failed for article {pk}: {e}", exc_info=True)
            return Response(
                {'error': f'Google TTS generation failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


    # ── Social Post Generator actions ─────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='generate_social_post')
    def generate_social_post(self, request, pk=None):
        """
        Trigger the Social Post Generator pipeline for an article.

        Body params (all optional):
          source_url        (str)  — social/web URL to scrape
          plain_text        (str)  — raw text input (alternative to URL)
          vibe_override     (str)  — tone instruction, e.g. "celebratory"
          canva_template_id (int)  — CanvaTemplate PK; omit for auto-detect
        """
        import logging as _logging
        _logger = _logging.getLogger(__name__)

        article = self.get_object()

        from agents.social_tasks import generate_social_post_task

        options = {
            'source_url':        request.data.get('source_url', ''),
            'plain_text':        request.data.get('plain_text', ''),
            'vibe_override':     request.data.get('vibe_override', ''),
            'canva_template_id': request.data.get('canva_template_id'),
            'tenant_id':         getattr(request.tenant, 'pk', None),
        }

        task = generate_social_post_task.apply_async(args=[article.pk, options], queue='social')
        article.social_post_status          = 'queued'
        article.social_post_celery_task_id  = task.id
        article.save(update_fields=['social_post_status', 'social_post_celery_task_id'])

        _logger.info('[SocialPost] Queued task %s for article %d', task.id, article.pk)
        return Response({
            'status':     'queued',
            'task_id':    task.id,
            'article_id': article.pk,
        })

    @action(detail=True, methods=['get'], url_path='social_post_status')
    def social_post_status_view(self, request, pk=None):
        """
        Poll social post generation status.
        Returns status + full plan JSON when done.
        """
        article = self.get_object()
        plan    = article.social_post_plan or {}
        return Response({
            'status':                article.social_post_status,
            'task_id':               article.social_post_celery_task_id,
            'plan':                  plan if article.social_post_status == 'done' else None,
            'selected_template_name': plan.get('_template_name'),
            'log':                   (article.canva_export_log or [])[-10:],
        })

    @action(detail=True, methods=['get'], url_path='export_canva_csv')
    def export_canva_csv(self, request, pk=None):
        """
        Download a Canva-compatible CSV for the article's social post plan.

        Column headers are the Canva element names from the selected template's
        slot schema. First column is always Template_ID.
        Returns a direct file-download response.
        """
        import csv
        import io
        from django.http import HttpResponse

        article = self.get_object()
        plan    = article.social_post_plan or {}

        if not plan:
            return Response(
                {'error': 'No social post plan found. Run the Social Post Generator first.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Load the CanvaTemplate that was used for this plan
        template      = None
        template_name = plan.get('_template_name', 'canva')
        template_pk   = plan.get('_template_pk')
        if template_pk:
            try:
                from cms.models_canva import CanvaTemplate
                template = CanvaTemplate.objects.get(pk=template_pk)
            except Exception:
                pass

        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', template_name)[:30]
        filename  = f'canva_{safe_name}_article_{article.pk}.csv'

        def _slot_value(slot_key, raw):
            """
            Return the value to write for this slot.

            Squad_List  → always newline-separated (one player per line)
            Match_Header / Match_Teams → literal \\n replaced with real newline
            everything else → as-is
            """
            if isinstance(raw, list):
                raw = '\n'.join(str(x) for x in raw)
            val = str(raw) if raw is not None else ''

            if slot_key == 'Squad_List':
                # Replace literal backslash-n written by the LLM
                val = val.replace('\\n', '\n')
                # Split on every possible separator the LLM might have used
                import re as _re
                parts = _re.split(r'\s*[,;]\s*|\n', val)
                parts = [p.strip().strip('"\'') for p in parts if p.strip()]
                val = '\n'.join(parts)
            elif slot_key in ('Match_Header', 'Match_Teams'):
                val = val.replace('\\n', '\n')

            return val

        if template:
            all_slots = template.all_slots_flat()
            columns   = ['Template_ID'] + [s['canva_name'] for s in all_slots]
            row       = {'Template_ID': template.canva_template_id}
            for slot in all_slots:
                row[slot['canva_name']] = _slot_value(slot['key'], plan.get(slot['key'], ''))
        else:
            columns = [
                'Template_ID', 'Headline', 'Subheadline', 'Stat_1', 'Stat_2',
                'Background_Image_URL', 'Player_Cutout_URL', 'Accent_Color', 'Caption',
            ]
            row = {
                'Template_ID':          plan.get('_canva_template_id', ''),
                'Headline':             plan.get('Headline', ''),
                'Subheadline':          plan.get('Subheadline', ''),
                'Stat_1':               plan.get('Stat_1', ''),
                'Stat_2':               plan.get('Stat_2', ''),
                'Background_Image_URL': plan.get('Background_Image', ''),
                'Player_Cutout_URL':    plan.get('Player_Cutout', ''),
                'Accent_Color':         plan.get('Accent_Color', ''),
                'Caption':              plan.get('Caption', ''),
            }

        # io.StringIO with newline='' is required so the csv module correctly
        # quotes cells that contain embedded newlines (RFC 4180).
        buf = io.StringIO(newline='')
        writer = csv.DictWriter(buf, fieldnames=columns, extrasaction='ignore')
        writer.writeheader()
        writer.writerow(row)

        # UTF-8 BOM so Excel opens Malayalam characters without garbling
        content = '﻿' + buf.getvalue()
        response = HttpResponse(content.encode('utf-8'), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class CategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing categories and subcategories.
    """
    queryset = Category.objects.all()

    def get_permissions(self):
        """
        RBAC-based permissions:
        - list, retrieve, tree, children: HasReadAccessToTenant
        - create, update, partial_update: IsEditorOrAdminOfTenant
        - destroy: IsAdminOfTenant
        """
        if self.action in ['list', 'retrieve', 'tree', 'children']:
            return [HasReadAccessToTenant()]
        elif self.action in ['create', 'update', 'partial_update']:
            return [IsEditorOrAdminOfTenant()]
        elif self.action == 'destroy':
            return [IsAdminOfTenant()]
        return [permissions.IsAuthenticated()]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return CategoryListSerializer
        return CategorySerializer
    
    def get_queryset(self):
        queryset = Category.objects.filter(tenant=self.request.tenant)
        parent_only = self.request.query_params.get('parent_only', None)
        is_active = self.request.query_params.get('is_active', None)
        
        if parent_only == 'true':
            # Return only parent categories (no parent)
            queryset = queryset.filter(parent__isnull=True)
        
        if is_active == 'true':
            queryset = queryset.filter(is_active=True)
        elif is_active == 'false':
            queryset = queryset.filter(is_active=False)
        
        return queryset.order_by('order', 'name')
    
    @action(detail=True, methods=['get'])
    def children(self, request, pk=None):
        """Get all children of a category."""
        category = self.get_object()
        children = category.children.filter(is_active=True).order_by('order', 'name')
        serializer = CategoryListSerializer(children, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def tree(self, request):
        """Get category tree with all parents and children."""
        parents = Category.objects.filter(parent__isnull=True, is_active=True).order_by('order', 'name')
        serializer = CategorySerializer(parents, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def batch_update(self, request):
        """Batch update category order and parent relationships."""
        updates = request.data.get('updates', [])
        
        if not isinstance(updates, list):
            return Response(
                {'error': 'updates must be a list'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            for update in updates:
                category_id = update.get('id')
                if not category_id:
                    continue
                
                category = Category.objects.get(id=category_id)
                
                if 'order' in update:
                    category.order = update['order']
                
                if 'parent' in update:
                    parent_id = update['parent']
                    if parent_id:
                        category.parent = Category.objects.get(id=parent_id)
                    else:
                        category.parent = None
                
                category.save()
            
            return Response({'message': 'Categories updated successfully'})
        except Category.DoesNotExist:
            return Response(
                {'error': 'Category not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class MediaViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing media library.
    RBAC-based:
    - list, retrieve: HasReadAccessToTenant
    - create, update, partial_update: IsEditorOrAdminOfTenant
    - destroy: IsAdminOfTenant
    """
    queryset = Media.objects.all()
    serializer_class = MediaSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [HasReadAccessToTenant()]
        elif self.action in ['create', 'update', 'partial_update']:
            return [IsEditorOrAdminOfTenant()]
        elif self.action == 'destroy':
            return [IsAdminOfTenant()]
        return [permissions.IsAuthenticated()]
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def get_queryset(self):
        queryset = Media.objects.filter(tenant=self.request.tenant)
        
        # Search functionality
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) |
                Q(alt_text__icontains=search) |
                Q(description__icontains=search) |
                Q(file__icontains=search)
            )
        
        # Filter by MIME type (images only for now)
        mime_type = self.request.query_params.get('mime_type', None)
        if mime_type:
            queryset = queryset.filter(mime_type__startswith=mime_type)
        else:
            # Default to images only
            queryset = queryset.filter(mime_type__startswith='image/')
        
        return queryset.order_by('-created_at')
    
    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user, tenant=self.request.tenant)

    @action(detail=False, methods=['get'])
    def search_external(self, request):
        """
        Search for images from external sources (DuckDuckGo).
        """
        query = request.query_params.get('query', '')
        if not query:
            return Response({'error': 'Query parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from ddgs import DDGS
            results = []
            
            # Use DuckDuckGo Search
            with DDGS() as ddgs:
                # limited to 20 results for speed
                ddg_results = list(ddgs.images(
                    query, 
                    region="in-en", 
                    safesearch="moderate", 
                    max_results=20
                ))
                
                for res in ddg_results:
                    results.append({
                        'title': res.get('title', ''),
                        'url': res.get('image', ''),
                        'thumbnail': res.get('thumbnail', ''),
                        'source': res.get('source', ''),
                        'width': res.get('width', 0),
                        'height': res.get('height', 0)
                    })
            
            return Response({'results': results})
            
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"External search failed: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def save_external(self, request):
        """
        Download and save an external image to the media library.
        """
        image_url = request.data.get('image_url')
        title = request.data.get('title', '')
        
        if not image_url:
            return Response({'error': 'image_url is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            import requests
            from django.core.files.base import ContentFile
            from urllib.parse import urlparse
            import os
            
            # Download image
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            response = requests.get(image_url, headers=headers, timeout=15)
            response.raise_for_status()
            
            # Determine filename
            parsed_url = urlparse(image_url)
            filename = os.path.basename(parsed_url.path)
            if not filename:
                filename = f"external_image_{timezone.now().timestamp()}.jpg"
                
            # Clean filename
            import re
            filename = re.sub(r'[^a-zA-Z0-9._-]', '', filename)
            if len(filename) > 100:
                filename = filename[-100:]
            if not any(filename.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
                filename += '.jpg'
                
            # Create Media object
            media = Media(
                title=title or filename,
                uploaded_by=request.user,
                mime_type=response.headers.get('Content-Type', 'image/jpeg')
            )
            media.file.save(filename, ContentFile(response.content), save=True)
            
            serializer = self.get_serializer(media)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to save external image: {e}")
            return Response({'error': f"Failed to save image: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def crop_image(self, request, pk=None):
        """
        Crop an image and save as a new media item.
        Expected payload: x, y, width, height (all integers)
        """
        media = self.get_object()
        
        try:
            x = int(request.data.get('x'))
            y = int(request.data.get('y'))
            width = int(request.data.get('width'))
            height = int(request.data.get('height'))
        except (ValueError, TypeError):
            return Response(
                {'error': 'Invalid crop parameters. x, y, width, height must be integers.'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if not media.file:
            return Response({'error': 'No file associated with this media'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            from PIL import Image
            from io import BytesIO
            from django.core.files.base import ContentFile
            import os
            
            # Open existing image
            # We need to access the file directly. 
            # If using S3/storage, opening the file field gives a file-like object
            with media.file.open('rb') as f:
                img = Image.open(f)
                img_format = img.format
                
                # Crop
                # Ensure crop box is within bounds
                img_width, img_height = img.size
                if x < 0: x = 0
                if y < 0: y = 0
                if x + width > img_width: width = img_width - x
                if y + height > img_height: height = img_height - y
                
                cropped_img = img.crop((x, y, x + width, y + height))
                
                # Save cropped image to memory
                buffer = BytesIO()
                # Use original format if possible, default to JPEG
                save_format = img_format if img_format else 'JPEG'
                if save_format == 'JPEG':
                     cropped_img = cropped_img.convert('RGB')
                     
                cropped_img.save(buffer, format=save_format, quality=90)
                
                # Create new media item
                new_filename = f"cropped_{os.path.basename(media.file.name)}"
                # Clean filename to avoid issues
                import re
                new_filename = re.sub(r'cropped_cropped+', 'cropped', new_filename)
                
                new_media = Media(
                    title=f"{media.title} (Cropped)",
                    uploaded_by=request.user,
                    mime_type=Image.MIME.get(save_format, 'image/jpeg')
                )
                
                # Save file content
                new_media.file.save(new_filename, ContentFile(buffer.getvalue()), save=True)
                
                serializer = self.get_serializer(new_media)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
                
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Image cropping failed: {e}", exc_info=True)
            return Response({'error': f"Cropping failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WebStoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing web stories.
    RBAC-based:
    - list, retrieve: HasReadAccessToTenant
    - create, update, partial_update: IsEditorOrAdminOfTenant
    - destroy: IsAdminOfTenant
    """
    queryset = WebStory.objects.all().prefetch_related('slides')

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [HasReadAccessToTenant()]
        elif self.action in ['create', 'update', 'partial_update']:
            return [IsEditorOrAdminOfTenant()]
        elif self.action == 'destroy':
            return [IsAdminOfTenant()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == 'list':
            include_slides = self.request.query_params.get('include_slides', '').lower() == 'true'
            if include_slides:
                return WebStorySerializer
            return WebStoryListSerializer
        return WebStorySerializer

    def get_queryset(self):
        queryset = WebStory.objects.filter(tenant=self.request.tenant).prefetch_related('slides')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        published_after = self.request.query_params.get('published_after')
        if published_after:
            queryset = queryset.filter(published_at__gte=published_after)

        queryset = queryset.order_by('-published_at', '-created_at')

        page_size = self.request.query_params.get('page_size')
        if page_size:
            try:
                page_size = int(page_size)
                if page_size > 0:
                    queryset = queryset[:page_size]
            except ValueError:
                pass

        return queryset

    def perform_create(self, serializer):
        serializer.save(author=self.request.user, tenant=self.request.tenant)

    def perform_update(self, serializer):
        serializer.save(editor=self.request.user)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        story = self.get_object()
        story.publish()
        story.editor = request.user
        story.save()
        serializer = self.get_serializer(story)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def latest(self, request):
        """
        Return recently published stories (default last 24 hours).
        """
        try:
            hours = int(request.query_params.get('hours', 24))
        except (TypeError, ValueError):
            hours = 24

        hours = max(1, min(hours, 168))  # between 1 hour and 7 days

        try:
            limit = int(request.query_params.get('limit', 6))
        except (TypeError, ValueError):
            limit = 6

        limit = max(1, min(limit, 50))
        include_slides = request.query_params.get('include_slides', '').lower() == 'true'

        cutoff = timezone.now() - timedelta(hours=hours)
        queryset = (
            WebStory.objects.filter(
                status='published',
                published_at__isnull=False,
                published_at__gte=cutoff,
            )
            .order_by('-published_at', '-created_at')
            .prefetch_related('slides')
        )[:limit]

        serializer_class = WebStorySerializer if include_slides else WebStoryListSerializer
        serializer = serializer_class(queryset, many=True, context={'request': request})
        return Response(serializer.data)


class CanvaTemplateViewSet(viewsets.ModelViewSet):
    """
    CRUD for CanvaTemplate objects.

    Each template describes one Canva design already in the workspace.
    The `slots` JSONField drives both the SocialPostCrew agent prompts and
    the CSV column headers for bulk-create uploads.

    Permissions:
      list / retrieve        → any authenticated tenant member
      create / update        → editor or admin
      destroy                → admin only
    """
    from cms.models_canva import CanvaTemplate as _CT
    queryset = _CT.objects.all()

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [HasReadAccessToTenant()]
        elif self.action in ['create', 'update', 'partial_update']:
            return [IsEditorOrAdminOfTenant()]
        return [IsAdminOfTenant()]

    def get_serializer_class(self):
        from cms.serializers import CanvaTemplateSerializer
        return CanvaTemplateSerializer

    def get_queryset(self):
        from cms.models_canva import CanvaTemplate
        return CanvaTemplate.objects.filter(
            tenant=self.request.tenant,
            is_active=True,
        ).order_by('content_type', 'name')

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    @action(detail=True, methods=['get'], url_path='test-sheet')
    def test_sheet_connection(self, request, pk=None):
        """
        GET /api/canva-templates/{id}/test-sheet/

        Verify the linked Google Sheet is accessible and headers match.
        Returns sheet status, service account email, header comparison, and row count.
        """
        template = self.get_object()
        from agents.sheets_push import test_sheet_connection as _test, get_service_account_email
        result = _test(template)
        result['service_account_email'] = get_service_account_email()
        return Response(result)

    @action(detail=False, methods=['get'], url_path='service-account-email')
    def service_account_email(self, request):
        """
        GET /api/canva-templates/service-account-email/

        Return the GCP service account email the manager needs to share sheets with.
        """
        from agents.sheets_push import get_service_account_email
        return Response({'email': get_service_account_email()})


def resize_media_view(request):
    """
    Resize media on the fly and cache it.
    Query params:
    - path: Relative path to media file (e.g. articles/featured/img.jpg)
    - w: Width (optional)
    - h: Height (optional)
    """
    path = request.GET.get('path', '')
    width = request.GET.get('w')
    height = request.GET.get('h')

    if not path:
        return HttpResponseBadRequest("Path required")

    # Security check: Prevent directory traversal
    path = os.path.normpath(path)
    if '..' in path or path.startswith('/'):
        return HttpResponseBadRequest("Invalid path")

    # Remove 'media/' prefix if present in the path param (common mistake)
    if path.startswith('media/'):
        path = path[6:]

    # Define paths
    original_path = os.path.join(settings.MEDIA_ROOT, path)
    
    if not os.path.exists(original_path):
        raise Http404("Image not found")

    # If no resize parameters, just serve the original
    if not width and not height:
        from django.views.static import serve
        return serve(request, path, document_root=settings.MEDIA_ROOT)

    try:
        # Validate dimensions
        w = int(width) if width else None
        h = int(height) if height else None
        
        # Limit max dimensions
        if (w and w > 2400) or (h and h > 2400):
             return HttpResponseBadRequest("Dimensions too large")
        
        # Generate cache filename
        cache_dir = os.path.join(settings.MEDIA_ROOT, 'cache', 'resized')
        os.makedirs(cache_dir, exist_ok=True)
        
        # Unique hash for this resize request
        file_hash = hashlib.md5(f"{path}_{w}_{h}".encode()).hexdigest()
        ext = os.path.splitext(path)[1].lower()
        if not ext: ext = '.webp'
        
        # Force WebP output for optimization if original is not animated
        output_format = 'WEBP'
        if ext not in ['.gif']:
             ext = '.webp'
             
        cache_filename = f"{file_hash}{ext}"
        cache_path = os.path.join(cache_dir, cache_filename)
        
        # Return cached file if it exists and is newer than original
        if os.path.exists(cache_path):
            original_mtime = os.path.getmtime(original_path)
            cache_mtime = os.path.getmtime(cache_path)
            if cache_mtime >= original_mtime:
                 with open(cache_path, 'rb') as f:
                      content = f.read()
                 response = HttpResponse(content, content_type=f"image/webp")
                 response['Cache-Control'] = 'public, max-age=2592000' # 30 days
                 return response

        # Perform Resize
        img = Image.open(original_path)
        
        # Convert mode if needed (PNG/RGBA to RGB for JPEG, but we use WebP so RGBA is fine)
        if img.mode == 'P':
             img = img.convert('RGBA')
            
        old_w, old_h = img.size
        
        from PIL import ImageOps
        if w and h:
            # Smart crop (cover)
            img = ImageOps.fit(img, (w, h), method=Image.Resampling.LANCZOS)
        elif w:
             ratio = w / float(old_w)
             h = int(float(old_h) * ratio)
             img = img.resize((w, h), Image.Resampling.LANCZOS)
        elif h:
             ratio = h / float(old_h)
             w = int(float(old_w) * ratio)
             img = img.resize((w, h), Image.Resampling.LANCZOS)
             
        # Save to cache
        img.save(cache_path, format=output_format, quality=85)
        
        # Serve
        with open(cache_path, 'rb') as f:
            content = f.read()
            
        response = HttpResponse(content, content_type="image/webp")
        response['Cache-Control'] = 'public, max-age=2592000' # 30 days
        return response

    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Resize error: {e}")
        return HttpResponseBadRequest(f"Error resizing image")


class SocialStudioGenerateView(APIView):
    """
    POST /api/social-studio/generate/

    Standalone Social Post Generator endpoint — article is optional.
    Accepts any combination of: article_id, source_url, plain_text, image file.
    Auto-creates a draft Article when no article_id is provided so results
    are always stored and pollable.

    Multipart form fields:
      article_id        (int,  optional)
      source_url        (str,  optional)
      plain_text        (str,  optional)
      vibe_override     (str,  optional)
      canva_template_id (int,  optional)
      image             (file, optional)
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from agents.social_tasks import generate_social_post_task
        from django.utils.text import slugify

        article_id        = request.data.get('article_id') or ''
        source_url        = request.data.get('source_url', '').strip()
        plain_text        = request.data.get('plain_text', '').strip()
        vibe_override     = request.data.get('vibe_override', '').strip()
        canva_template_id = request.data.get('canva_template_id') or None
        image_file        = request.FILES.get('image')

        if not any([article_id, source_url, plain_text, image_file]):
            return Response(
                {'error': 'Provide at least one input: article, URL, text, or image.'},
                status=400,
            )

        # ── Get or auto-create Article ─────────────────────────────────────────
        if article_id:
            article = get_object_or_404(Article, pk=article_id, tenant=request.tenant)
        else:
            if plain_text:
                title = plain_text[:100].strip()
            elif source_url:
                title = source_url[:100]
            else:
                title = f'Social Post {datetime.now().strftime("%d %b %Y %H:%M")}'

            base_slug = slugify(title[:80]) or f'social-post-{uuid.uuid4().hex[:8]}'
            slug, counter = base_slug, 1
            while Article.objects.filter(slug=slug).exists():
                slug = f'{base_slug}-{counter}'
                counter += 1

            article = Article.objects.create(
                title=title,
                slug=slug,
                tenant=request.tenant,
                status='draft',
                body=plain_text or '',
                source_url=source_url or '',
            )

        # ── Save uploaded / pasted image ───────────────────────────────────────
        if image_file:
            try:
                name, content = process_image_to_webp(image_file)
                if name and content:
                    article.featured_image.save(name, content, save=True)
                else:
                    article.featured_image.save(image_file.name, image_file, save=True)
            except Exception:
                try:
                    article.featured_image.save(image_file.name, image_file, save=True)
                except Exception:
                    pass

        # ── Dispatch Celery task ───────────────────────────────────────────────
        options = {
            'source_url':        source_url,
            'plain_text':        plain_text,
            'vibe_override':     vibe_override,
            'canva_template_id': canva_template_id,
            'tenant_id':         getattr(request.tenant, 'pk', None),
        }

        task = generate_social_post_task.apply_async(args=[article.pk, options], queue='social')
        article.social_post_status         = 'queued'
        article.social_post_celery_task_id = task.id
        article.canva_export_log           = []
        article.save(update_fields=[
            'social_post_status', 'social_post_celery_task_id', 'canva_export_log',
        ])

        return Response({
            'status':        'queued',
            'task_id':       task.id,
            'article_id':    article.pk,
            'article_title': article.title,
        })
