"""
Middleware to handle Django deployment in a subdirectory.

This middleware sets the SCRIPT_NAME for requests so Django URLs work correctly
when deployed at a subdirectory path like /super-admin/
"""


class SubdirectoryMiddleware:
    """
    Middleware to handle subdirectory deployment.
    
    Sets SCRIPT_NAME in request.META so Django can generate correct URLs
    when deployed at a subdirectory (e.g., /super-admin/).
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        # Get subdirectory path from settings or environment
        import os
        from django.conf import settings
        self.subdirectory = os.environ.get('DJANGO_SUBDIRECTORY', '/super-admin')

    def __call__(self, request):
        # Set script name for subdirectory
        if not request.META.get('SCRIPT_NAME'):
            request.META['SCRIPT_NAME'] = self.subdirectory.rstrip('/')
        
        # Also set HTTP_X_SCRIPT_NAME header if not present
        if 'HTTP_X_SCRIPT_NAME' not in request.META:
            request.META['HTTP_X_SCRIPT_NAME'] = self.subdirectory.rstrip('/')
        
        response = self.get_response(request)
        
        # Ensure response has correct Location header if redirecting
        if response.status_code in [301, 302, 303, 307, 308]:
            location = response.get('Location', '')
            if location and not location.startswith('http') and not location.startswith(self.subdirectory):
                # Prepend subdirectory to relative URLs
                if location.startswith('/'):
                    location = self.subdirectory.rstrip('/') + location
                else:
                    location = self.subdirectory.rstrip('/') + '/' + location
                response['Location'] = location
        
        return response

