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


# ── Template selection ────────────────────────────────────────────────────────

def _select_template(tenant, content_hint: str, preferred_id: int = None):
    """
    Return the best CanvaTemplate for this tenant.

    Priority:
      1. preferred_id  — explicit user pick from the UI
      2. content_type keyword heuristic on content_hint
      3. First active template
      4. None (generic mode)
    """
    from cms.models_canva import CanvaTemplate

    qs = CanvaTemplate.objects.filter(is_active=True)
    if tenant:
        qs = qs.filter(tenant=tenant)

    if preferred_id:
        tmpl = qs.filter(pk=preferred_id).first()
        if tmpl:
            return tmpl

    hint = (content_hint or '').lower()

    type_signals = [
        (['vs ', ' vs.', 'head to head', 'comparison'],  'stat_comparison'),
        (['"', '"', 'quote', 'said'],                     'quote_card'),
        (['result', 'won', 'lost', 'beat', 'defeated'],   'match_result'),
        (['breaking', 'just in', 'alert', 'update'],      'ticker'),
        (['player', 'profile', 'spotlight'],              'player_card'),
    ]
    for keywords, content_type in type_signals:
        if any(kw in hint for kw in keywords):
            tmpl = qs.filter(content_type=content_type).first()
            if tmpl:
                return tmpl

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

    Steps:
      1. Use article.featured_image if available (for cutout slots) or if slot is background
      2. Else DDGS search → download → process_image_to_webp → save to article.featured_image
      3. If needs_cutout and cutout not yet generated → generate_cutout_image → save
      Returns: absolute media URL string, or '' on failure.
    """
    from cms.utils import generate_cutout_image, process_image_to_webp

    def _media_url(field):
        try:
            url = field.url
            return url if url.startswith('http') else url
        except Exception:
            return ''

    # ── Cutout slot: prefer existing cutout ───────────────────────────────────
    if needs_cutout and article.featured_image_cutout:
        return _media_url(article.featured_image_cutout)

    # ── Background slot: use existing featured_image ──────────────────────────
    if not needs_cutout and article.featured_image:
        return _media_url(article.featured_image)

    # ── Fetch via DDGS ────────────────────────────────────────────────────────
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

    if needs_cutout:
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

@shared_task(bind=True, max_retries=1, default_retry_delay=60, time_limit=600)
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
    from cms.models import Article
    from agents.context_analyzer import analyze_context
    from agents.social_post_crew import SocialPostCrew

    options           = options or {}
    vibe_override     = options.get('vibe_override', '')
    source_url_opt    = options.get('source_url', '')
    plain_text        = options.get('plain_text', '')
    canva_template_pk = options.get('canva_template_id')

    try:
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
        _log('source', f'url={url!r} plain_text={bool(plain_text)} vibe={vibe_override!r}')

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
        _log('context', f"source_type={context.get('source_type')} topic={context.get('topic','')[:60]!r}")

        # ── 4. Template selection ─────────────────────────────────────────────
        template = _select_template(
            tenant,
            context.get('topic', ''),
            preferred_id=int(canva_template_pk) if canva_template_pk else None,
        )
        _log('template', f"Selected: {template.name if template else 'Generic (no templates in DB)'}")

        # ── 5. SocialPostCrew ─────────────────────────────────────────────────
        _log('crew', 'Starting SocialPostCrew...')
        crew = SocialPostCrew()
        plan = crew.run_pipeline(context, vibe_override=vibe_override, template=template)
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
        article.save(update_fields=['social_post_plan', 'social_post_status', 'canva_export_log'])
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
