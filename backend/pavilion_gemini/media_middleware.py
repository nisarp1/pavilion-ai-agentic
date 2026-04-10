"""
Middleware to add Cache-Control headers to media files served by Django.
"""

class MediaCacheMiddleware:
    """
    Middleware to add Cache-Control headers to media files.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        
        # Check if the path starts with /media/
        if request.path.startswith('/media/'):
            # Cache for 7 days: 60 * 60 * 24 * 7 = 604800 seconds
            response['Cache-Control'] = 'public, max-age=604800'
            
        return response
