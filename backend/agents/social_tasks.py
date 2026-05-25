"""
Celery task for the Social Post Generator pipeline.

Flow:
  1. Cascade-scrape the source URL (SocialData API → Playwright → BeautifulSoup)
  2. Select the best CanvaTemplate for this tenant + content
  3. Run SocialPostCrew (3-agent pipeline, template-aware)
  4. Acquire + pre-process images for every image slot
  5. Save plan → Article.social_post_plan; generate native poster fallback
"""
import io
import logging
import os
import re

import requests as _requests
from celery import shared_task

logger = logging.getLogger(__name__)


# ── Image context extraction (Gemini Vision) ───────────────────────────────────────

def _detect_mime_type(image_bytes: bytes) -> str:
    """Detect image mime type from magic bytes."""
    if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if image_bytes[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
        return 'image/webp'
    if image_bytes[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    return 'image/jpeg'  # safe fallback


def analyze_image_context(image_bytes: bytes) -> dict:
    """
    Analyze an uploaded image with Gemini Vision.

    Returns a dict:
      text              — all readable text extracted verbatim
      content_type_hint — template type: quote_card | stat_comparison | playing_xi |
                          predicted_xi | match_result | fact_check | ticker | general
      speaker_count     — number of distinct people quoted
      speakers          — list of speaker names if identifiable
    """
    empty = {'text': '', 'content_type_hint': '', 'speaker_count': 0, 'speakers': []}
    try:
        import json
        from agents.gemini_client import generate_with_parts, make_image_part

        mime_type = _detect_mime_type(image_bytes)
        logger.info('[SocialTask] Vision analyze: %d bytes mime=%s', len(image_bytes), mime_type)

        prompt = (
            "You are analyzing an image for a sports news social media team.\n\n"
            "Return a single JSON object with these keys:\n"
            "  \"text\": Extract ALL readable text verbatim — tweets, quotes, captions, "
            "scores, player names, stats. Preserve speaker attribution (e.g. 'Rohit: ...').\n"
            "  \"content_type\": One of: \"stat_comparison\" (2+ people quoted or head-to-head stats), "
            "\"quote_card\" (1 person quoted), \"playing_xi\" (confirmed match lineup), "
            "\"predicted_xi\" (predicted lineup), \"match_result\" (final score/result), "
            "\"fact_check\" (claim being verified), \"ticker\" (breaking news), \"general\" (other).\n"
            "  \"speaker_count\": Integer — how many distinct people are quoted.\n"
            "  \"speakers\": Array of speaker names if visible, else [].\n\n"
            "Rules:\n"
            "- If 2 people are quoted (e.g. two players reacting) → content_type must be \"stat_comparison\".\n"
            "- If 1 person is quoted → \"quote_card\".\n"
            "- Output ONLY valid JSON. No markdown fences, no explanation.\n"
            "- If no readable text: {\"text\":\"\",\"content_type\":\"general\","
            "\"speaker_count\":0,\"speakers\":[]}"
        )

        raw = generate_with_parts([prompt, make_image_part(image_bytes, mime_type)]).strip()

        # Strip markdown code fences if Gemini wrapped the JSON
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
            raw = raw.strip()

        data = json.loads(raw)
        result = {
            'text':               data.get('text', '').strip(),
            'content_type_hint':  data.get('content_type', '').strip(),
            'speaker_count':      int(data.get('speaker_count', 0)),
            'speakers':           data.get('speakers', []),
        }
        logger.info(
            '[SocialTask] Vision result: %d chars text, type=%r speakers=%d %r',
            len(result['text']), result['content_type_hint'],
            result['speaker_count'], result['speakers'],
        )
        return result

    except Exception as exc:
        logger.warning('[SocialTask] Vision analysis failed: %s', exc)
        return empty


def extract_image_context(image_bytes: bytes) -> str:
    """Thin wrapper — returns just the extracted text from analyze_image_context."""
    return analyze_image_context(image_bytes).get('text', '')


# ── Template selection ─────────────────────────────────────────────────────────────

# Matches "Speaker: <opening-quote>" — handles straight " and curly “
_SPEAKER_QUOTE_RE = re.compile(r'[A-Za-z].{2,60}?:\s*["\u201c]')


def _count_quoted_speakers(text: str) -> int:
    """Count distinct Speaker: quote patterns. Handles straight and curly opening quotes."""
    return len(_SPEAKER_QUOTE_RE.findall(text))


def _select_template(tenant, content_hint: str, preferred_id: int = None, content_type_hint: str = ''):
    """
    Return the best CanvaTemplate for this tenant.

    Priority:
      1. preferred_id          — explicit user pick from the UI
      2. Multi-speaker signal  — 3+ quoted speakers → stat_comparison (Three Players Quote).
                                 Runs before content_type_hint so a wrong LLM guess cannot
                                 override this structural evidence.
      3. content_type_hint     — direct type from prompt interpreter
      4. content_type keyword heuristic on content_hint text
      5. First active hero_headline template
      6. None (generic mode)
    """
    from cms.models_canva import CanvaTemplate

    qs = CanvaTemplate.objects.filter(is_active=True)
    if tenant:
        qs = qs.filter(tenant=tenant)

    if preferred_id:
        tmpl = qs.filter(pk=preferred_id).first()
        if tmpl:
            return tmpl

    # ── Multi-speaker detection (priority 2) ─────────────────────────────────────────────
    # 3 or more "Speaker: quote" patterns → Three Players Quote template.
    # This must run BEFORE content_type_hint because the prompt interpreter
    # always classifies any quoted text as 'quote', regardless of how many
    # different people are speaking.
    _open_quote_count = content_hint.count('\u201c') + content_hint.count('\u201d')
    _speaker_count    = _count_quoted_speakers(content_hint)
    logger.info('[TemplateSelector] Quote signals: open_quotes=%d speakers=%d', _open_quote_count, _speaker_count)

    # 2+ distinct speakers or 4+ quote marks -> multi-quote (stat_comparison) template
    if _speaker_count >= 2 or _open_quote_count >= 4:
        tmpl = qs.filter(content_type='stat_comparison').first()
        if tmpl:
            logger.info(
                '[TemplateSelector] Multi-speaker signal (%d quotes, %d speakers) -> stat_comparison',
                _open_quote_count, _speaker_count,
            )
            return tmpl

    # 1 speaker or 2+ quote marks -> quote_card
    if _speaker_count == 1 or _open_quote_count >= 2:
        tmpl = qs.filter(content_type='quote_card').first()
        if tmpl:
            logger.info('[TemplateSelector] Single-speaker quote (%d quotes, %d speakers) -> quote_card',
                        _open_quote_count, _speaker_count)
            return tmpl

    # ── Prompt-interpreter hint (priority 3) ──────────────────────────────────────────────
    if content_type_hint:
        tmpl = qs.filter(content_type=content_type_hint).first()
        if tmpl:
            return tmpl

    hint = (content_hint or '').lower()

    # Ordered from most-specific to least-specific so the first match wins.
    type_signals = [
        # Playing / Predicted XI (check before generic "vs" signals)
        (['predicted xi', 'predicted 11', 'predicted eleven', 'expected lineup',
          'squad prediction', 'likely xi'],                                       'predicted_xi'),
        (['playing xi', 'playing 11', 'playing eleven', 'toss result',
          'final xi', 'elected to bat', 'elected to bowl'],                       'playing_xi'),
        # Fact check / debunk
        (['fact check', 'fact-check', 'factcheck', 'verdict', 'debunk',
          'myth', 'hoax', 'claim', 'viral claim', 'misleading'],                  'fact_check'),
        # Stat comparison / head-to-head / multi-quote
        (['vs ', ' vs.', 'head to head', 'comparison', 'stats comparison',
          'three quotes', 'multiple quotes', 'three players'],                    'stat_comparison'),
        # Quote cards (single speaker) -- curly \u201c and \u2018 handled by _count_quoted_speakers
        (['quote', 'said', 'stated', 'commented',
          'reacts', 'responds'],                                                   'quote_card'),
        # Match result
        (['result', 'won', 'lost', 'beat', 'defeated', 'victory',
          'win by', 'innings defeat'],                                             'match_result'),
        # Breaking / ticker
        (['breaking', 'just in', 'alert', 'confirmed', 'official announcement',
          'breaking news'],                                                        'ticker'),
        # General player/news posts → hero_headline (default)
        (['announces', 'signs', 'joins', 'transfers', 'named', 'selected',
          'dropped', 'injured', 'returns', 'debut', 'record', 'milestone',
          'century', 'wicket', 'profile', 'spotlight'],                           'hero_headline'),
    ]
    for keywords, content_type in type_signals:
        if any(kw in hint for kw in keywords):
            tmpl = qs.filter(content_type=content_type).first()
            if tmpl:
                return tmpl

    # Default: hero_headline is the general-purpose post template
    return qs.filter(content_type='hero_headline').first() or qs.first()



# ── Image helpers ─────────────────────────────────────────────────────────────

def _ddgs_image_search(query: str) -> tuple:
    """
    DDGS image search returning (url, bytes).
    Mirrors pattern from cms/views.py:1493-1530.
    Returns ('', None) on failure.
    """
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.images(
                query,
                region='in-en',
                safesearch='moderate',
                max_results=10,
            ))
        # Prefer landscape images
        candidates = [r for r in results if r.get('width', 0) >= r.get('height', 1)]
        if not candidates:
            candidates = results
        if not candidates:
            return '', None

        image_url = candidates[0].get('image', '')
        if not image_url:
            return '', None

        resp = _requests.get(image_url, timeout=15, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; PavilionBot/1.0)',
        })
        resp.raise_for_status()
        return image_url, resp.content
    except Exception as exc:
        logger.warning('[SocialTask] DDGS image search failed for %r: %s', query, exc)
        return '', None


def _acquire_image(article, query: str, needs_cutout: bool, slot_key: str) -> str:
    """
    Acquire, process, and save an image for one template image slot.

    Non-cutout slots (logos, backgrounds):
      Always search DDGS with the slot-specific query and return the raw CDN URL.
      This ensures each logo/background slot gets its own independent image instead
      of all reusing article.featured_image (which only holds one image at a time).

    Cutout slots (player overlays):
      DDGS search → download → process_image_to_webp → save to article.featured_image
      → generate_cutout_image → save to article.featured_image_cutout → return URL.
      Reuses existing cutout if already generated.

    Returns: image URL string, or '' on failure.
    """
    from cms.utils import generate_cutout_image, process_image_to_webp

    def _media_url(field):
        try:
            url = field.url
            return url if url.startswith('http') else url
        except Exception:
            return ''

    # ── Non-cutout slot (logos, backgrounds) ─────────────────────────────────
    # Always run a fresh DDGS search so each slot gets the right image.
    # Return the raw CDN URL without saving to article.featured_image — saving
    # would overwrite it for every subsequent slot, causing all slots to repeat
    # the same image.
    if not needs_cutout:
        img_url, _ = _ddgs_image_search(query)
        if img_url:
            return img_url
        # Fallback: existing featured_image if DDGS failed
        return _media_url(article.featured_image) if article.featured_image else ''

    # ── Cutout slot ───────────────────────────────────────────────────────────
    if article.featured_image_cutout:
        return _media_url(article.featured_image_cutout)

    # ── Fetch source image for cutout — only if user hasn't uploaded one ──────
    # If article.featured_image is already set (uploaded via context field),
    # skip DDGS entirely so we don't overwrite the user's image.
    if not article.featured_image:
        _, img_bytes = _ddgs_image_search(query)
        if img_bytes:
            try:
                img_file = io.BytesIO(img_bytes)
                img_file.name = f'social_{slot_key}.jpg'
                bg_name, bg_content = process_image_to_webp(img_file)
                if bg_name and bg_content:
                    article.featured_image.save(bg_name, bg_content, save=True)
                    article.refresh_from_db(fields=['featured_image'])
                    logger.info('[SocialTask] Saved DDGS image to featured_image: %s', bg_name)
            except Exception as exc:
                logger.warning('[SocialTask] Image save failed for slot %s: %s', slot_key, exc)

    if not article.featured_image:
        return ''

    try:
        article.featured_image.open('rb')
        cutout_name, cutout_content = generate_cutout_image(article.featured_image)
        article.featured_image.close()
        if cutout_name and cutout_content:
            article.featured_image_cutout.save(cutout_name, cutout_content, save=True)
            article.refresh_from_db(fields=['featured_image_cutout'])
            return _media_url(article.featured_image_cutout)
    except Exception as exc:
        logger.warning('[SocialTask] Cutout generation failed for slot %s: %s', slot_key, exc)

    return _media_url(article.featured_image)


# ── Social URL scraper ────────────────────────────────────────────────────────

def _scrape_social_url(url: str, social_data_key: str = '') -> str:
    """
    Cascade-scrape a social platform URL.

    Tier 1: SocialData API  (X/Twitter only, requires key)
    Tier 2: Playwright headless  (Instagram, Facebook, X without key)
    Tier 3: _extract_webpage BeautifulSoup fallback

    Returns plain text (up to 3000 chars) or ''.
    """
    # ── Tier 1: SocialData API (X/Twitter) ────────────────────────────────────
    if ('twitter.com' in url or 'x.com' in url) and social_data_key:
        try:
            tweet_id_match = re.search(r'/status/(\d+)', url)
            if tweet_id_match:
                resp = _requests.get(
                    f'https://api.socialdata.tools/twitter/tweets/{tweet_id_match.group(1)}',
                    headers={'Authorization': f'Bearer {social_data_key}'},
                    timeout=10,
                )
                resp.raise_for_status()
                data = resp.json()
                text = data.get('full_text') or data.get('text') or ''
                if text:
                    logger.info('[SocialTask] SocialData API success: %d chars', len(text))
                    return text[:3000]
        except Exception as exc:
            logger.warning('[SocialTask] SocialData API failed: %s', exc)

    # ── Tier 2: Playwright headless ───────────────────────────────────────────
    # Pattern from backend/rss_fetcher/visual_trends.py:17-72
    try:
        import asyncio
        from playwright.async_api import async_playwright

        async def _pw_scrape():
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=['--no-sandbox', '--disable-setuid-sandbox',
                          '--disable-dev-shm-usage'],
                )
                ctx = await browser.new_context(
                    user_agent=(
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                        'AppleWebKit/537.36 (KHTML, like Gecko) '
                        'Chrome/120.0.0.0 Safari/537.36'
                    ),
                )
                page = await ctx.new_page()
                try:
                    await page.goto(url, wait_until='networkidle', timeout=20000)
                    text = await page.inner_text('body')
                    return (text or '')[:3000]
                finally:
                    await browser.close()

        # Handle existing event loop (Celery worker context)
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    future = pool.submit(asyncio.run, _pw_scrape())
                    return future.result(timeout=30)
            else:
                return loop.run_until_complete(_pw_scrape())
        except RuntimeError:
            return asyncio.run(_pw_scrape())
    except Exception as exc:
        logger.warning('[SocialTask] Playwright scrape failed for %s: %s', url, exc)

    # ── Tier 3: BeautifulSoup fallback ────────────────────────────────────────
    try:
        from agents.context_analyzer import _extract_webpage
        data = _extract_webpage(url)
        return (data.get('body') or data.get('description') or '')[:3000]
    except Exception as exc:
        logger.warning('[SocialTask] BeautifulSoup fallback failed for %s: %s', url, exc)
        return ''


# ── Main Celery task ──────────────────────────────────────────────────────────

@shared_task(
    bind=True,
    max_retries=1,
    default_retry_delay=60,
    time_limit=600,
    acks_late=True,
    reject_on_worker_lost=True,
)
def generate_social_post_task(self, article_id: int, options: dict = None):
    """
    Generate a Canva-ready Social Post plan for an Article.

    options keys:
      source_url        (str)  — social/web URL to scrape (overrides article.source_url)
      plain_text        (str)  — raw text input (alternative to URL)
      vibe_override     (str)  — tone instruction for the MalayalamLocalizer
      canva_template_id (int)  — CanvaTemplate PK; None = auto-select
      tenant_id         (int)  — used for per-tenant SocialData API key lookup
    """
    # Close any stale inherited DB connections from the prefork parent so this
    # worker gets a fresh connection (prevents CONN_MAX_AGE hang on first query).
    from django.db import close_old_connections
    close_old_connections()

    options            = options or {}
    vibe_override      = options.get('vibe_override', '')
    source_url_opt     = options.get('source_url', '')
    plain_text         = options.get('plain_text', '')
    canva_template_pk  = options.get('canva_template_id')
    content_type_hint  = options.get('content_type_hint', '')

    try:
        from cms.models import Article
        from agents.context_analyzer import analyze_context
        from agents.social_post_crew import SocialPostCrew

        article = Article.objects.get(pk=article_id)
        article.social_post_status = 'running'
        article.canva_export_log   = []
        article.save(update_fields=['social_post_status', 'canva_export_log'])

        def _log(stage: str, msg: str, **kw):
            entry = {'stage': stage, 'message': msg, **kw}
            logger.info('[SocialTask] Article %d | %s: %s', article_id, stage, msg)
            article.canva_export_log = list(article.canva_export_log or []) + [entry]
            article.save(update_fields=['canva_export_log'])

        # ── 1. Source determination ───────────────────────────────────────────
        url = source_url_opt or (article.source_url or '')
        tenant = getattr(article, 'tenant', None)
        social_data_key = (tenant.api_keys or {}).get('socialdata', '') if tenant else ''
        _log('source', f'url={url!r} plain_text_len={len(plain_text)} vibe={vibe_override!r}')
        if plain_text:
            logger.info('[SocialTask] Article %d | plain_text preview: %r', article_id, plain_text[:200])

        # ── 2. Social platform scrape (cascade) ───────────────────────────────
        social_platforms = ('twitter.com', 'x.com', 'instagram.com', 'facebook.com')
        is_social = url and any(p in url for p in social_platforms)
        scraped_text = ''

        if is_social:
            _log('scrape', f'Social URL detected: {url}')
            scraped_text = _scrape_social_url(url, social_data_key=social_data_key)
            _log('scrape', f'Scraped {len(scraped_text)} chars')

        # ── 3. Build context ──────────────────────────────────────────────────
        article_data = {
            'id':       article.pk,
            'title':    article.title,
            'summary':  article.summary,
            'content':  article.body,
            'category': article.category or '',
        }
        context = analyze_context(
            reference_url=(url if not is_social else None),
            text_prompt=(plain_text or scraped_text or None),
            article_data=article_data,
        )
        # If social scrape produced more content, prefer it
        if scraped_text and len(scraped_text) > len(context.get('raw_content', '')):
            context['raw_content'] = scraped_text
        _log('context', f"source_type={context.get('source_type')} topic={context.get('topic','')[:80]!r} raw_content_len={len(context.get('raw_content',''))}")
        logger.info('[SocialTask] Article %d | raw_content preview: %r', article_id, context.get('raw_content','')[:300])

        # ── 4. Template selection ─────────────────────────────────────────────
        # Use the full raw input for multi-speaker detection; topic is too short.
        _hint_text = plain_text or context.get('raw_content', '') or context.get('topic', '')
        logger.info('[SocialTask] Article %d | template hint_text: %r', article_id, _hint_text[:200])
        template = _select_template(
            tenant,
            _hint_text,
            preferred_id=int(canva_template_pk) if canva_template_pk else None,
            content_type_hint=content_type_hint,
        )
        _log('template', f"Selected: {template.name if template else 'Generic (no templates in DB)'}")

        # ── 5. SocialPostCrew ─────────────────────────────────────────────────
        # Fetch recent human corrections to inject as few-shot learning examples
        feedback_examples = []
        try:
            from cms.models import SocialPostFeedback
            template_pk = template.pk if template else None
            qs = SocialPostFeedback.objects.filter(
                tenant_id=article.tenant_id,
            ).order_by('-created_at')[:10]
            for fb in qs:
                feedback_examples.extend(fb.corrections or [])
            feedback_examples = feedback_examples[:8]
        except Exception as _fb_exc:
            logger.warning('[SocialTask] Could not load feedback examples: %s', _fb_exc)

        # Detect quote posts — exempt quote slots from word-limit truncation
        is_quote = (
            content_type_hint == 'quote_card'
            or (template and getattr(template, 'content_type', '') == 'quote_card')
        )
        post_type = 'quote' if is_quote else (content_type_hint or '')

        _log('crew', f'Starting SocialPostCrew (post_type={post_type!r}, feedback examples: {len(feedback_examples)})...')
        crew = SocialPostCrew()
        plan = crew.run_pipeline(
            context,
            vibe_override=vibe_override,
            template=template,
            post_type=post_type,
            feedback_examples=feedback_examples or None,
        )
        _log('crew', f"Crew complete — slots: {[k for k in plan if not k.startswith('_')]}")

        # ── 6. Image acquisition ──────────────────────────────────────────────
        image_slots = template.image_slots() if template else [
            {'key': 'Background_Image', 'canva_name': 'Background_Image', 'needs_cutout': False},
            {'key': 'Player_Cutout',    'canva_name': 'Player_Cutout',    'needs_cutout': True},
        ]

        for slot in image_slots:
            slot_key    = slot['key']
            needs_cutout = slot.get('needs_cutout', False)
            # plan[slot_key] is the English image-search query produced by the crew
            query = plan.get(slot_key) or context.get('topic', 'sports')
            _log('image', f'Acquiring image for slot {slot_key!r} query={query!r}')
            resolved_url = _acquire_image(article, query, needs_cutout, slot_key)
            plan[slot_key] = resolved_url
            _log('image', f'Slot {slot_key!r} → {resolved_url!r}')

        # ── 7. Team colour override ───────────────────────────────────────────
        if template and template.team_colors:
            headline = plan.get('Headline', '') or ''
            for team_name, hex_color in template.team_colors.items():
                if team_name.lower() in headline.lower():
                    color_slots = template.color_slots()
                    if color_slots:
                        plan[color_slots[0]['key']] = hex_color
                        _log('color', f'Team colour override: {team_name} → {hex_color}')
                    break

        # ── 8. Native poster fallback ─────────────────────────────────────────
        try:
            from cms.poster_generator import generate_poster
            ok, poster_info = generate_poster(article, template_id=None)
            _log('poster', f'Native poster: {"saved" if ok else "failed"} — {poster_info}')
        except Exception as poster_exc:
            _log('poster', f'Native poster error (non-fatal): {poster_exc}')

        # ── 9. Persist ────────────────────────────────────────────────────────
        article.social_post_plan   = plan
        article.social_post_status = 'done'
        # Write the generated social caption back to the article field so it's
        # immediately available for copy-paste when posting to social platforms.
        generated_caption = plan.get('social_media_caption', '')
        if generated_caption:
            article.social_media_caption = generated_caption
        article.save(update_fields=[
            'social_post_plan', 'social_post_status', 'canva_export_log',
            'social_media_caption',
        ])
        _log('done', 'Social post plan saved — status: done')

        # ── 10. Push to Google Sheet (if template has one linked) ─────────────
        if template and getattr(template, 'google_sheet_id', ''):
            try:
                from agents.sheets_push import push_plan_to_sheet
                result = push_plan_to_sheet(plan, template)
                if result.get('ok'):
                    _log('sheets', f"Row {result['row']} appended → {result.get('sheet_url', '')}")
                else:
                    _log('sheets', f"Sheet push failed: {result.get('error', 'unknown')}")
            except Exception as sheet_exc:
                _log('sheets', f'Sheet push error (non-fatal): {sheet_exc}')

        # ── 11. Canva Autofill (if CANVA_API_TOKEN is set) ───────────────────
        if template and getattr(template, 'canva_template_id', '') and os.environ.get('CANVA_API_TOKEN', ''):
            try:
                from agents.canva_push import autofill_template
                _log('canva', 'Creating autofilled design via Canva API…')
                canva_result = autofill_template(template, plan)
                if canva_result.get('ok'):
                    plan['_canva_design_url'] = canva_result['design_url']
                    plan['_canva_design_id']  = canva_result.get('design_id', '')
                    article.social_post_plan  = plan
                    article.save(update_fields=['social_post_plan'])
                    _log('canva', f"Design ready → {canva_result['design_url']}")
                else:
                    _log('canva', f"Autofill failed (non-fatal): {canva_result.get('error', 'unknown')}")
            except Exception as canva_exc:
                _log('canva', f'Canva autofill error (non-fatal): {canva_exc}')

        return {
            'status':     'success',
            'article_id': article_id,
            'template':   plan.get('_template_name'),
            'slot_keys':  [k for k in plan if not k.startswith('_')],
        }

    except Article.DoesNotExist:
        logger.error('[SocialTask] Article %d not found', article_id)
        return {'status': 'error', 'message': 'Article not found'}

    except Exception as exc:
        logger.error('[SocialTask] Article %d failed: %s', article_id, exc, exc_info=True)
        try:
            Article.objects.filter(pk=article_id).update(social_post_status='failed')
        except Exception:
            pass
        raise self.retry(exc=exc)
