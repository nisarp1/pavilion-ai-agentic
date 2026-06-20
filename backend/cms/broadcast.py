from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import logging

logger = logging.getLogger(__name__)


def broadcast_new_article(article):
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)('news_feed', {
            'type': 'new_article',
            'article': {
                'id': article.id,
                'title': article.title,
                'source_handle': article.source_handle or '',
                'source_url': article.source_url or '',
                'traction_score': article.traction_score or 0,
                'published_at': article.published_at.isoformat() if article.published_at else None,
                'created_at': article.created_at.isoformat() if article.created_at else None,
                'sport': (article.trend_data or {}).get('sport', ''),
                'urgency': article.urgency or 'standard',
                'author': str(article.author) if article.author else '',
            }
        })
    except Exception as e:
        logger.warning(f'WebSocket broadcast failed: {e}')
