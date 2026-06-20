import json
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_post_view(request):
    data = json.loads(request.body)
    tweet_text = data.get('tweet_text', '')
    tweet_url = data.get('tweet_url', '')
    handle = data.get('handle', '')
    category = data.get('category', 'general')

    if not tweet_text:
        return JsonResponse({'error': 'tweet_text required'}, status=400)

    try:
        from agents.claude_client import generate_social_post
        result = generate_social_post(tweet_text, tweet_url, handle, category)
        return JsonResponse(result)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
