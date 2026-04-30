"""
Agent 2 — ContextEnricherAgent
For each trend from Agent 1, uses Gemini Search Grounding to find context:
article links, key entities, editorial angle, why Indian fans care.
Falls back to Google News RSS when Gemini is unavailable.
"""
import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from .tools import configure_gemini, fetch_google_news_rss, get_model_priority_list

logger = logging.getLogger(__name__)

_MAX_TO_ENRICH = 10  # Cap to avoid excessive Gemini API calls

_ENRICH_PROMPT = """You are a senior sports journalist writing for an Indian digital newsroom.
Research the trending sports topic: "{topic}"

Search the web for the latest news. Return a JSON object:
- summary: 2-3 sentences explaining what happened and why Indian fans care
- reason: 1-sentence trigger (e.g. "Team won World Cup semi-final")
- recency_trigger: exact event that started this trend
- is_live_match: true if match is ongoing RIGHT NOW
- articles: array of up to 3 objects with "title" and "url"
- entities: up to 5 key names (players, teams, tournaments)
- editorial_angle: one punchy hook for the headline or article angle
- ai_confidence: 0.0-1.0

Return ONLY valid JSON."""


class ContextEnricherAgent:
    def enrich(self, topics: list[dict], gemini_enabled: bool = True) -> list[dict]:
        """Enrich each topic with context. gemini_enabled=False forces RSS-only (fast path)."""
        genai = configure_gemini() if gemini_enabled else None
        to_enrich = topics[:_MAX_TO_ENRICH]
        rest = topics[_MAX_TO_ENRICH:]

        results_map: dict[int, dict] = {}

        def _do_enrich(idx_topic):
            idx, topic = idx_topic
            ctx = self._enrich_gemini(genai, topic) if genai else self._enrich_rss_fallback(topic)
            logger.debug('Enriched topic %d/%d: %s', idx + 1, len(to_enrich), topic['topic'][:40])
            return idx, {**topic, **ctx}

        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {pool.submit(_do_enrich, (i, t)): i for i, t in enumerate(to_enrich)}
            for fut in as_completed(futures):
                idx, result = fut.result()
                results_map[idx] = result

        enriched = [results_map[i] for i in range(len(to_enrich))]
        for topic in rest:
            enriched.append({**topic, **self._enrich_rss_fallback(topic)})

        return enriched

    def _enrich_gemini(self, genai, topic: dict) -> dict:
        for model_name, tool_spec in get_model_priority_list():
            for attempt in range(2):  # 2 attempts per model (1 retry on 429)
                try:
                    model = genai.GenerativeModel(model_name=model_name, tools=tool_spec)
                    prompt = _ENRICH_PROMPT.format(topic=topic['topic'])
                    response = model.generate_content(prompt)
                    result = self._parse_enrich_response(response.text, topic)
                    if result.get('ai_confidence', 0) > 0.3:
                        return result
                    break  # Low confidence but no error — try next model
                except Exception as exc:
                    err_str = str(exc)
                    if '429' in err_str and attempt == 0:
                        # Rate-limited — only retry if the suggested wait is short (<= 10s)
                        delay_match = re.search(r'retry in (\d+\.?\d*)', err_str)
                        delay = float(delay_match.group(1)) + 1.0 if delay_match else 999.0
                        if delay <= 10.0:
                            logger.info('ContextEnricherAgent 429 for "%s" — waiting %.1fs', topic['topic'][:30], delay)
                            time.sleep(delay)
                            continue  # retry same model
                        # Long delay (quota exhausted) — skip Gemini for this topic
                        logger.info('ContextEnricherAgent quota exhausted for "%s" — falling to RSS', topic['topic'][:30])
                    logger.warning('ContextEnricherAgent %s failed for "%s": %s', model_name, topic['topic'][:40], exc)
                    break  # Non-429 or second failure — try next model
        return self._enrich_rss_fallback(topic)

    def _parse_enrich_response(self, text: str, topic: dict) -> dict:
        text = re.sub(r'```(?:json)?', '', text).strip().rstrip('`')
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if not match:
            return self._enrich_rss_fallback(topic)
        try:
            data = json.loads(match.group())
            reason = str(data.get('reason', '')).strip()
            return {
                'summary': str(data.get('summary', reason)).strip() or reason,
                'reason': reason,
                'recency_trigger': str(data.get('recency_trigger', '')).strip(),
                'is_live_match': bool(data.get('is_live_match', False)),
                'articles': [
                    {'title': str(a.get('title', '')), 'url': str(a.get('url', ''))}
                    for a in (data.get('articles') or [])[:3]
                    if isinstance(a, dict)
                ],
                'entities': [str(e) for e in (data.get('entities') or [])[:5]],
                'editorial_angle': str(data.get('editorial_angle', '')).strip(),
                'ai_confidence': min(1.0, max(0.0, float(data.get('ai_confidence', 0.7)))),
            }
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            logger.warning(f'ContextEnricherAgent parse error: {exc}')
            return self._enrich_rss_fallback(topic)

    def _enrich_rss_fallback(self, topic: dict) -> dict:
        """
        Build minimal context when Gemini is unavailable.
        Prefers articles pre-fetched from the Google Trends API; falls back to RSS.
        """
        prefetched = topic.get('_articles', [])
        prefetched_entities = topic.get('_entities', [])

        if prefetched:
            articles = prefetched[:3]
            confidence = 0.5
        else:
            rss_items = fetch_google_news_rss(topic['topic'], max_items=3)
            articles = [{'title': it['title'], 'url': it.get('url', '')} for it in rss_items]
            confidence = 0.4 if rss_items else 0.2

        reason = topic.get('reason', '')
        return {
            'summary': reason,
            'reason': reason,
            'recency_trigger': '',
            'is_live_match': False,
            'articles': articles,
            'entities': prefetched_entities,
            'editorial_angle': '',
            'ai_confidence': confidence,
        }
