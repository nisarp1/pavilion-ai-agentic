"""
API views for CMS.
"""
from rest_framework import viewsets, status, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from datetime import timedelta
import os
import hashlib
from PIL import Image
from io import BytesIO
from django.db.models import Q
from django.utils import timezone
from django.http import HttpResponse, HttpResponseBadRequest, Http404
from django.conf import settings
from .models import Article, Category, Media, WebStory, PosterTemplate
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
            # Try to filter by categories (many-to-many) using slug first
            # This handles category slugs like 'cricket', 'football', etc.
            try:
                category_obj = Category.objects.filter(slug=category_filter, is_active=True).first()
                if category_obj:
                    queryset = queryset.filter(categories=category_obj)
                else:
                    # Fallback: filter by source category (for backward compatibility)
                    # This handles source categories like 'reliable_sources', 'trends', etc.
                    queryset = queryset.filter(category=category_filter)
            except Exception as e:
                # If category lookup fails, fallback to source category
                queryset = queryset.filter(category=category_filter)
        
        return queryset
    
    def perform_create(self, serializer):
        serializer.save(author=self.request.user, tenant=self.request.tenant)
    
    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        """
        Trigger article generation for a fetched article.
        Uses threading to avoid blocking the main server process.
        """
        article = self.get_object()
        
        if article.status != 'fetched':
            return Response(
                {'error': "Article must be in 'fetched' status to generate."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Use threading to run generation in background without blocking the server
        import threading
        
        def run_generation_task(article_id):
            # Close any old connections before starting to ensure clean state
            from django.db import close_old_connections
            close_old_connections()
            
            try:
                from workers.tasks import _generate_article_task_impl
                import logging
                logger = logging.getLogger(__name__)
                
                logger.info(f"Starting threaded generation for article {article_id}")
                _generate_article_task_impl(article_id)
                logger.info(f"Threaded generation completed for article {article_id}")
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Threaded generation failed: {e}", exc_info=True)
            finally:
                # IMPORTANT: Close the connection for this thread to prevent leaks/locking
                close_old_connections()

        # Start generation in a background thread
        thread = threading.Thread(target=run_generation_task, args=(article.id,))
        thread.daemon = True
        thread.start()
        
        return Response({
            'message': 'Article generation started',
            'article_id': article.id,
            'status': 'generating'
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
        Trigger asynchronous video generation in a background thread (TTS + D-ID).
        Uses threading instead of Celery so it works without a Redis broker.
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

        # Save script and mark as generating before spinning up the thread
        article.video_status = 'generating_video'
        article.video_script = video_script
        article.video_format = video_format
        article.save()

        import threading
        import logging
        logger = logging.getLogger(__name__)

        def run_video_generation(article_id, fmt, script):
            from django.db import close_old_connections
            close_old_connections()
            try:
                from cms.video_generator import generate_sports_video, upload_to_blob, get_did_status
                from cms.models import Article as ArticleModel
                import requests as req_lib
                import time

                art = ArticleModel.objects.get(id=article_id)
                logger.info(f"Background thread: Starting video generation for article {article_id}")

                result = generate_sports_video(
                    f"{art.title}. {art.summary or ''}",
                    format=fmt,
                    post_id=article_id,
                    script_content=script
                )

                if 'error' in result:
                    error_msg = result.get('error')
                    logger.error(f"Video generation failed for article {article_id}: {error_msg}")
                    art.video_status = 'failed'
                    art.video_error = str(error_msg)
                    art.save()
                    return

                talk_id = result.get('talk_id')
                art.video_audio_url = result.get('audio_url', '')
                art.save()

                # Poll D-ID for up to 5 minutes
                max_attempts = 30
                video_url = None
                logger.info(f"Background thread: Polling D-ID for talk_id {talk_id}")
                
                for attempt in range(max_attempts):
                    status_data = get_did_status(talk_id)
                    if not status_data:
                        logger.error(f"Failed to get D-ID status for talk_id {talk_id}")
                        break
                        
                    did_status = status_data.get('status')
                    if did_status == 'done':
                        video_url = status_data.get('result_url')
                        break
                    elif did_status == 'error':
                        error_detail = status_data.get('error', {})
                        logger.error(f"D-ID error for article {article_id}: {error_detail}")
                        art.video_status = 'failed'
                        art.video_error = f"D-ID Error: {error_detail.get('message', 'Unknown D-ID error')}"
                        art.save()
                        return
                    
                    time.sleep(10)

                if not video_url:
                    logger.error(f"D-ID polling timed out or failed for article {article_id}")
                    art.video_status = 'failed'
                    art.video_error = "D-ID polling timed out or failed to return a result URL."
                    art.save()
                    return

                # Try to upload to Vercel Blob for persistence
                try:
                    logger.info(f"Background thread: Uploading final video to Vercel Blob for article {article_id}")
                    vid_response = req_lib.get(video_url, timeout=60)
                    if vid_response.status_code == 200:
                        blob_url = upload_to_blob(vid_response.content, f"video_{article_id}_{fmt}.mp4")
                        if blob_url:
                            video_url = blob_url
                except Exception as up_err:
                    logger.warning(f"Blob upload failed for article {article_id}: {up_err}. Using D-ID URL.")

                art.video_url = video_url
                art.video_status = 'completed'
                art.video_error = "" # Clear any previous error
                art.save()
                logger.info(f"Video generation completed for article {article_id}: {video_url}")

            except Exception as e:
                logger.error(f"Video generation thread error for article {article_id}: {str(e)}", exc_info=True)
                try:
                    from cms.models import Article as ArticleModel
                    art = ArticleModel.objects.get(id=article_id)
                    art.video_status = 'failed'
                    art.video_error = f"Exception: {str(e)}"
                    art.save()
                except Exception:
                    pass
            finally:
                close_old_connections()

        thread = threading.Thread(
            target=run_video_generation,
            args=(article.id, video_format, video_script),
            daemon=True
        )
        thread.start()

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
