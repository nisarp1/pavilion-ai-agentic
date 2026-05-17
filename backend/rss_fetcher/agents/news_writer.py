"""
Agentic Malayalam article writer for trending sports topics.

Pipeline:
  Step 1 — Research: gather current articles from enriched_data + Google News RSS
  Step 2 — Write:   plain Gemini call (no grounding tools) with the researched context

Keeping research and writing separate avoids the core failure mode of the old design
where a single grounded Gemini call tried to do both — grounding tools break strict
JSON output, causing silent fallthrough to the garbage static HTML fallback.
"""
import json
import logging
import re
from django.conf import settings
from .tools import configure_gemini, call_vertex_ai, fetch_google_news_rss, classify_sport

_style_guide_cache: dict = {'content': None}


def _load_style_guide(tenant=None) -> str:
    """
    Load the active style guide from DB (tenant-specific → global default).
    Cached in-process for the lifetime of this worker to avoid per-request DB hits.
    Call invalidate_style_guide_cache() after a PUT to style-guide API.
    """
    try:
        from rss_fetcher.models import StyleGuide
        guide = (
            StyleGuide.objects.filter(tenant=tenant).first()
            or StyleGuide.objects.filter(tenant__isnull=True).first()
        )
        return guide.content if guide else ''
    except Exception as exc:
        logger.warning('Could not load style guide: %s', exc)
        return ''


def invalidate_style_guide_cache():
    _style_guide_cache['content'] = None

logger = logging.getLogger(__name__)

# Models tried in order. Plain GenerativeModel — NO grounding tools in the writer.
# Grounding tools interfere with strict JSON output and are the root cause of the
# old pipeline's silent fallback to static HTML.
_WRITER_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']

_WRITER_PROMPT = """\
You are an expert sports journalist writing for a major Malayalam-language sports publication in India.

═══ ASSIGNMENT ═══
TRENDING TOPIC : {topic}
SPORT          : {sport}
WHY TRENDING   : {reason}
KEY ENTITIES   : {entities}
EDITORIAL ANGLE: {editorial_angle}

═══ SOURCE ARTICLES (your factual basis — do NOT invent facts not present here) ═══
{articles_block}

═══ ARTICLE REQUIREMENTS ═══
Write a 4-paragraph Malayalam sports news article. Structure:
  <p> Para 1 — WHAT: Exactly what happened / what was announced (key facts, scores, squad)
  <p> Para 2 — WHY IT MATTERS: Context — season standings, rivalry, significance for Indian fans
  <p> Para 3 — DEEPER CONTEXT: Background on the players/teams involved, recent form
  <p> Para 4 — WHAT'S NEXT: Upcoming match schedule, predictions, what fans should watch for

LANGUAGE RULES:
  • Article body MUST be written in Malayalam Unicode script
  • Player names: Write the Malayalam transliteration first, then the English original in brackets.
    Example: "മുഹമ്മദ് സിറാജ് (Mohammed Siraj)", "രോഹിത് ശർമ്മ (Rohit Sharma)", "ജസ്പ്രീത് ബുംറ (Jasprit Bumrah)"
  • Team names: Write in Malayalam transliteration first, then English in brackets.
    Example: "ഇന്ത്യ (India)", "ശ്രീലങ്ക (Sri Lanka)", "ഡൽഹി ക്യാപിറ്റൽസ് (Delhi Capitals)"
  • Venue / stadium names: Write in Malayalam transliteration first, then English in brackets.
    Example: "ആർ. പ്രേമദാസ സ്റ്റേഡിയം (R. Premadasa Stadium)"
  • Tournament / competition abbreviations stay in plain English: IPL, ICC, BCCI, ODI, T20I, Asia Cup, etc.
  • Numbers, scores, statistics, and dates always stay in English (e.g. "150 runs", "3 wickets", "6.1 overs")
  • If any direct quotes appear in the source articles, include them in English inside <blockquote> tags
  • CRITICAL: The "summary", "meta_title" fields in the JSON output MUST be written in pure English only.
    Zero Malayalam characters are allowed in those fields — they are used as excerpt, SEO meta, and OG tags.

HEADLINE (title): Pure Malayalam only — no English names or brackets anywhere. Specific — include the key fact.
  Good: "ഏഷ്യ കപ്പ് ഫൈനൽ: മുഹമ്മദ് സിറാജിന്റെ 6 വിക്കറ്റ്; ഇന്ത്യ കിരീടം നേടി"
  Bad:  "DC vs RR Match Preview"

META TITLE (meta_title): In English only (SEO). Same key fact, max 65 characters. English names here, no brackets.
  Good: "Asia Cup Final: Siraj Takes 6, India Beat Sri Lanka by 10 Wickets"

SUMMARY: STRICTLY English only — no Malayalam characters. 1-2 sentences summarising the key news. Used as article excerpt, meta description, and OG description.

═══ OUTPUT FORMAT ═══
Return ONLY a raw JSON object. No markdown fences, no preamble, no trailing text.

{{
  "title":      "<Pure Malayalam headline — specific, includes key fact, all names in Malayalam only, no English brackets>",
  "meta_title": "<ENGLISH ONLY — SEO headline, max 65 chars, no Malayalam characters>",
  "summary":    "<ENGLISH ONLY — 1-2 sentence article excerpt/meta description, no Malayalam characters>",
  "body":       "<Full Malayalam article — 4 <p> paragraphs, optional <h2> subheadings, <blockquote> for quotes, all names in Malayalam (English in brackets)>",
  "sport":      "<cricket|football|kabaddi|tennis|hockey|badminton|general>",
  "tags":       ["<tag1 in English>", "<tag2 in English>", "<tag3 in English>"]
}}"""


def _build_articles_block(articles: list) -> str:
    if not articles:
        return '(No pre-fetched articles — write from general knowledge of this topic.)'
    lines = []
    for i, art in enumerate(articles[:5], 1):
        if isinstance(art, dict):
            title = art.get('title', '').strip()
            url = art.get('url', '').strip()
            line = f"{i}. {title}"
            if url:
                line += f"\n   Source: {url}"
        else:
            line = f"{i}. {art}"
        lines.append(line)
    return '\n'.join(lines)


class NewsWriterAgent:

    def write_article(self, topic: str, enriched_data: dict = None, tenant=None) -> dict:
        enriched_data = enriched_data or {}
        self._tenant = tenant  # stored for use in _build_prompt

        # ── Step 1: Research ──────────────────────────────────────────────────
        context = self._research_topic(topic, enriched_data)
        logger.info(
            'NewsWriterAgent: research complete — %d articles, sport=%s, reason=%r',
            len(context['articles']), context['sport'], context['reason'][:60],
        )

        # ── Step 2: Write ─────────────────────────────────────────────────────
        # Try Vertex AI first (service account — no free-tier quota limits)
        result = self._write_with_vertex(topic, context)
        if result:
            return result

        # Fall back to AI Studio key if Vertex AI is unavailable
        genai = configure_gemini()
        if genai:
            result = self._write_with_context(genai, topic, context)
            if result:
                return result

        return self._write_fallback(topic, context)

    # ── Step 1: Research ──────────────────────────────────────────────────────

    def _research_topic(self, topic: str, enriched_data: dict) -> dict:
        """
        Build the research context that the writer will use.

        Priority order for articles:
          1. enriched_data.articles — already fetched by ContextEnricherAgent (highest quality)
          2. Google News RSS for the topic — live, always works, no API key needed
        """
        articles = list(enriched_data.get('articles') or [])
        reason = (enriched_data.get('reason') or enriched_data.get('summary') or '').strip()
        entities = enriched_data.get('entities') or []
        editorial_angle = (enriched_data.get('editorial_angle') or '').strip()
        sport = enriched_data.get('sport') or classify_sport(topic) or 'general'

        # Supplement with RSS if we have fewer than 3 source articles
        if len(articles) < 3:
            rss_items = fetch_google_news_rss(topic, max_items=6)
            existing_titles = {
                a.get('title', '').lower() for a in articles if isinstance(a, dict)
            }
            for item in rss_items:
                if item['title'].lower() not in existing_titles:
                    articles.append({'title': item['title'], 'url': item.get('url', '')})
                    existing_titles.add(item['title'].lower())
            if rss_items:
                logger.info('NewsWriterAgent: supplemented with %d RSS articles', len(rss_items))

        return {
            'articles': articles[:5],
            'reason': reason or f'{topic} is currently trending in Indian sports news.',
            'entities': entities,
            'editorial_angle': editorial_angle,
            'sport': sport,
        }

    # ── Step 2: Write ─────────────────────────────────────────────────────────

    def _write_with_vertex(self, topic: str, context: dict):
        """
        Primary write path: Vertex AI REST API via the GCP service account.
        No free-tier quota — bypasses the AI Studio RPM/daily limits entirely.
        """
        configured_model = getattr(settings, 'GEMINI_MODEL', 'gemini-2.5-flash')
        # Strip litellm prefix: "vertex_ai/gemini-2.5-flash" → "gemini-2.5-flash"
        if '/' in configured_model:
            configured_model = configured_model.split('/', 1)[1]
        models_to_try = list(dict.fromkeys([configured_model] + _WRITER_MODELS))
        prompt = self._build_prompt(topic, context)

        for model_name in models_to_try:
            text = call_vertex_ai(prompt, model=model_name)
            if text:
                result = self._parse_response(text, topic, context)
                if result:
                    logger.info('NewsWriterAgent: Malayalam article written via Vertex AI (%s)', model_name)
                    return result
                logger.warning('NewsWriterAgent: Vertex AI %s returned unparseable/short response', model_name)
            # call_vertex_ai already logged the failure — try next model
        return None

    def _write_with_context(self, genai, topic: str, context: dict):
        """Plain Gemini call via new SDK (Vertex AI or AI Studio, no grounding tools)."""
        from agents.gemini_client import generate_text as _gemini_text
        prompt = self._build_prompt(topic, context)
        try:
            text = _gemini_text(prompt)
            if text:
                result = self._parse_response(text, topic, context)
                if result:
                    logger.info('NewsWriterAgent: Malayalam article written via Gemini SDK')
                    return result
                logger.warning('NewsWriterAgent: Gemini SDK returned unparseable/short response')
        except Exception as exc:
            logger.warning('NewsWriterAgent Gemini SDK failed: %s', exc)
        return None

    def _build_prompt(self, topic: str, context: dict) -> str:
        entities_str = ', '.join(str(e) for e in context.get('entities', [])) or 'N/A'
        base = _WRITER_PROMPT.format(
            topic=topic,
            sport=context.get('sport', 'general'),
            reason=context.get('reason', ''),
            entities=entities_str,
            editorial_angle=context.get('editorial_angle', '') or 'Inform Malayalam-speaking fans.',
            articles_block=_build_articles_block(context.get('articles', [])),
        )
        style_guide = _load_style_guide(tenant=getattr(self, '_tenant', None))
        if style_guide:
            base += f'\n\n═══ EDITORIAL STYLE GUIDE (follow every rule strictly) ═══\n{style_guide}'
        return base

    def _parse_response(self, text: str, original_topic: str, context: dict):
        # Strip markdown fences if the model wraps the JSON
        text = re.sub(r'```(?:json)?', '', text).strip().rstrip('`')
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if not match:
            logger.warning('NewsWriterAgent: no JSON object found in model response')
            return None
        try:
            data = json.loads(match.group())
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning('NewsWriterAgent JSON parse error: %s', exc)
            return None

        body = str(data.get('body', '')).strip()
        if len(body) < 100:
            logger.warning(
                'NewsWriterAgent: body too short (%d chars) — likely not Malayalam', len(body)
            )
            return None

        summary = str(data.get('summary', '')).strip()
        return {
            'title': str(data.get('title', original_topic)).strip() or original_topic,
            'meta_title': str(data.get('meta_title', '')).strip()[:65],
            'summary': summary,
            'body': body,
            'sport': str(data.get('sport', context.get('sport', 'general'))).lower(),
            'tags': [str(t) for t in (data.get('tags') or [])[:5]],
            'ai_confidence': 0.85,
            'status': 'success',
        }

    # ── Fallback ──────────────────────────────────────────────────────────────

    def _write_fallback(self, topic: str, context: dict) -> dict:
        """Last-resort — all Gemini calls failed. Returns minimal HTML so the editor at least
        has source links to work from."""
        logger.error(
            'NewsWriterAgent: ALL Gemini models failed for topic "%s" — returning link-only fallback',
            topic,
        )
        articles = context.get('articles', [])
        reason = context.get('reason', '')

        body_html = f'<p><strong>{topic}</strong> — ഈ വിഷയം ഇപ്പോൾ ഇന്ത്യൻ സ്പോർട്സ് വാർത്തകളിൽ ട്രെൻഡ് ചെയ്യുകയാണ്.</p>'
        if reason:
            body_html += f'<p>{reason}</p>'
        if articles:
            body_html += '<h2>Latest Sources</h2><ul>'
            for art in articles[:5]:
                if isinstance(art, dict):
                    url = art.get('url', '#')
                    title = art.get('title', '')
                    body_html += f"<li><a href='{url}'>{title}</a></li>"
                else:
                    body_html += f'<li>{art}</li>'
            body_html += '</ul>'
        body_html += '<p><em>(AI article generation failed — please edit this manually.)</em></p>'

        return {
            'title': topic,
            'summary': f'Latest updates on {topic}.',
            'body': body_html,
            'sport': context.get('sport', 'general'),
            'tags': ['trending', 'sports'],
            'ai_confidence': 0.0,
            'status': 'fallback',
        }
