from django.views.static import serve
from django.utils.cache import patch_cache_control

def serve_media_with_cache(request, path, document_root=None, show_indexes=False):
    """
    Serve media files with aggressive caching headers.
    This is necessary because django.views.static.serve does not set cache headers by default,
    leading to 'Serve static assets with an efficient cache policy' warnings in Lighthouse.
    """
    response = serve(request, path, document_root, show_indexes)
    # Cache for 30 days (2592000 seconds)
    patch_cache_control(response, public=True, max_age=2592000, immutable=True)
    return response
