import re
import requests
import xml.etree.ElementTree as ET
from django.http import JsonResponse
from django.views.decorators.http import require_GET

RSSHUB_BASE = "http://pavilion-rsshub:1200"


def _parse_rss(xml_text):
    root = ET.fromstring(xml_text)
    channel = root.find('channel')
    items = []
    for item in (channel.findall('item') if channel else [])[:20]:
        def t(tag):
            return (item.findtext(tag) or '').strip()

        desc = t('description')
        img_m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', desc)
        img = img_m.group(1) if img_m else None
        vid_m = re.search(r'<video[^>]+src=["\']([^"\']+)["\']', desc)
        video = vid_m.group(1) if vid_m else None
        clean = re.sub(r'<[^>]+>', ' ', desc).strip()
        clean = re.sub(r'\s{2,}', ' ', clean)

        items.append({
            'id': t('guid') or t('link'),
            'text': t('title'),
            'description': clean[:300],
            'link': t('link'),
            'pubDate': t('pubDate'),
            'author': t('author'),
            'image': img,
            'video': video,
        })

    title = channel.findtext('title') if channel else ''
    avatar = channel.findtext('image/url') if channel else None
    return {'title': title, 'avatar': avatar, 'items': items}


@require_GET
def rss_proxy(request):
    handle = request.GET.get('handle', '').strip().lstrip('@')
    if not handle or not re.match(r'^[A-Za-z0-9_]{1,50}$', handle):
        return JsonResponse({'error': 'invalid handle'}, status=400)
    try:
        r = requests.get(f"{RSSHUB_BASE}/twitter/user/{handle}", timeout=8)
        r.raise_for_status()
        data = _parse_rss(r.text)
        return JsonResponse(data)
    except requests.HTTPError as e:
        return JsonResponse({'error': f'RSSHub error: {e.response.status_code}'}, status=502)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=502)
