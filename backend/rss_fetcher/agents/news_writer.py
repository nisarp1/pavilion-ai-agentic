import json
import logging
import re
from .tools import configure_gemini, fetch_google_news_rss, classify_sport
from django.utils import timezone

logger = logging.getLogger(__name__)

_WRITER_PROMPT = """You are an expert sports journalist and news editor for a major Indian sports publication.
Your assignment is to write a detailed, publication-ready news article on the following trending topic:
"{topic}"

Guidelines for the article:
1. Search the web for the absolute latest factual data, scores, quotes, and developments regarding this topic.
2. Write a catchy, SEO-friendly headline.
3. Provide a concise summary (1-2 sentences).
4. Write a comprehensive body (at least 3-4 paragraphs) in engaging, journalistic prose.
5. IF you find any highly relevant social media posts (e.g., from Twitter/X or Instagram) from official players, teams, or journalists, please inject them into the body as HTML blockquotes. For example: `<blockquote class="twitter-tweet"><a href="URL"></a></blockquote>` or similar representations. If you cannot find real social media URLs, DO NOT make them up.
6. Return the result strictly as a valid JSON object.

The JSON MUST have these exact fields:
- title: The article headline
- summary: Short summary
- body: The full article content in HTML (use <p>, <h2>, <blockquote>, etc. as appropriate)
- sport: The sport category (cricket, football, kabaddi, tennis, hockey, badminton, or general)
- tags: Array of 3-5 keyword strings
- ai_confidence: A number from 0 to 1 indicating your confidence in the facts based on search results

Return ONLY valid JSON. No markdown fences around the JSON."""

class NewsWriterAgent:
    def write_article(self, topic: str) -> dict:
        """Autonomously write a news article on the given topic."""
        genai = configure_gemini()
        if genai:
            result = self._write_gemini(genai, topic)
            if result:
                return result
        # Fallback if Gemini fails or is missing API key
        return self._write_fallback(topic)

    def _write_gemini(self, genai, topic: str) -> dict:
        try:
            model = genai.GenerativeModel(
                model_name='gemini-2.0-flash',
                tools='google_search_retrieval',
            )
            prompt = _WRITER_PROMPT.format(topic=topic)
            response = model.generate_content(prompt)
            return self._parse_writer_response(response.text, topic)
        except Exception as exc:
            logger.error(f'NewsWriterAgent Gemini call failed for "{topic[:40]}": {exc}')
            return self._write_fallback(topic)

    def _parse_writer_response(self, text: str, original_topic: str) -> dict:
        text = re.sub(r'```(?:json)?', '', text).strip().rstrip('`')
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if not match:
            logger.warning('NewsWriterAgent: no JSON found in Gemini response')
            return self._write_fallback(original_topic)
        
        try:
            data = json.loads(match.group())
            return {
                'title': str(data.get('title', original_topic)).strip(),
                'summary': str(data.get('summary', '')).strip(),
                'body': str(data.get('body', '')).strip(),
                'sport': str(data.get('sport', 'general')).lower(),
                'tags': [str(t) for t in (data.get('tags') or [])[:5]],
                'ai_confidence': float(data.get('ai_confidence', 0.5)),
                'status': 'success'
            }
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            logger.warning(f'NewsWriterAgent parse error: {exc}')
            return self._write_fallback(original_topic)

    def _write_fallback(self, topic: str) -> dict:
        """Fallback article generation using RSS when Gemini is unavailable."""
        rss_items = fetch_google_news_rss(topic, max_items=5)
        body_html = f"<p>Trending news currently revolves around <strong>{topic}</strong>.</p>"
        
        if rss_items:
            body_html += "<h2>Latest Updates</h2><ul>"
            for item in rss_items:
                body_html += f"<li><a href='{item.get('url')}'>{item['title']}</a></li>"
            body_html += "</ul>"
            
        return {
            'title': topic,
            'summary': f"Latest curated updates and news regarding {topic}.",
            'body': body_html,
            'sport': classify_sport(topic) or 'general',
            'tags': ['trending', 'sports'],
            'ai_confidence': 0.2,
            'status': 'fallback'
        }
