import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import cms.routing

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pavilion_gemini.settings')

application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': AuthMiddlewareStack(
        URLRouter(cms.routing.websocket_urlpatterns)
    ),
})
