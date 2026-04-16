"""
SPA Middleware for serving React frontend

Handles React Router requests by serving index.html for non-API routes.
This allows the frontend SPA to handle client-side routing.
"""

import os
from django.conf import settings
from django.http import FileResponse
from django.utils.deprecation import MiddlewareMixin


class SPAFallbackMiddleware(MiddlewareMixin):
    """
    Middleware to serve index.html for SPA routing.

    Routes that should be handled by the frontend SPA:
    - /login
    - /dashboard
    - /articles
    - /categories
    - etc.

    Routes that should NOT fallback to index.html:
    - /api/* - API endpoints
    - /admin/* - Django admin
    - /health/* - Health checks
    - /static/* - Static files
    - /media/* - Media files
    """

    FALLBACK_PATHS = ['/api', '/admin', '/health', '/static', '/media', '/debug-media']

    def process_response(self, request, response):
        """
        Serve index.html if request is for a non-existent non-API route.
        This allows React Router to handle all frontend routes.
        """

        # Only process 404 responses
        if response.status_code != 404:
            return response

        # Don't fallback for API, admin, or static routes
        request_path = request.path
        if any(request_path.startswith(path) for path in self.FALLBACK_PATHS):
            return response

        # Try to serve index.html from static files
        index_path = os.path.join(settings.STATIC_ROOT, 'index.html')

        if os.path.exists(index_path):
            try:
                # Return index.html with 200 status (not 404)
                # This allows React Router to handle the routing client-side
                return FileResponse(
                    open(index_path, 'rb'),
                    status=200,
                    content_type='text/html'
                )
            except (FileNotFoundError, IOError):
                pass

        return response
