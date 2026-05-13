"""
One-shot script: backfill real STT word timings into all articles
that have audio saved but lack wordCaptions in their timeline.

Run with:
  docker exec pavilion-django-dev python backfill_stt_timings.py
"""
import django, os, sys, logging
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pavilion_gemini.settings')
django.setup()
logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
logger = logging.getLogger('backfill')

from cms.models import Article
from agents.stt_agent import transcribe_for_word_timings
from agents.video_pipeline import _word_timings_to_captions

articles = Article.objects.exclude(instagram_reel_audio='').exclude(video_production_plan={}).filter(
    video_production_plan__isnull=False
)

patched = 0
skipped = 0

for a in articles:
    plan = a.video_production_plan or {}
    tl   = plan.get('timeline') or {}

    # Skip if already has real STT-sourced wordCaptions (> 5 entries means real)
    if tl.get('wordCaptions') and len(tl['wordCaptions']) > 5:
        skipped += 1
        continue

    if not a.instagram_reel_audio:
        continue

    try:
        audio_path = a.instagram_reel_audio.path
    except Exception:
        continue

    try:
        with open(audio_path, 'rb') as f:
            audio_bytes = f.read()
    except FileNotFoundError:
        logger.warning(f'Article {a.pk}: audio file missing at {audio_path}')
        continue

    # Detect encoding from extension
    ext = os.path.splitext(audio_path)[1].lower()
    encoding = 'MP3' if ext in ('.mp3',) else 'LINEAR16'

    logger.info(f'Article {a.pk}: running STT on {len(audio_bytes):,}B {encoding} audio…')
    timings = transcribe_for_word_timings(audio_bytes, language_code='ml-IN', encoding=encoding)

    if not timings:
        logger.warning(f'Article {a.pk}: STT returned 0 timings — skipping')
        continue

    word_captions = _word_timings_to_captions(timings)
    logger.info(f'Article {a.pk}: {len(timings)} real word timings → {len(word_captions)} captions')

    # Patch all timeline objects in the plan
    for key in ('timeline', 'props', 'modular_props'):
        sub = plan.get(key) if key == 'timeline' else (plan.get(key) or {}).get('timeline')
        if sub:
            sub['wordCaptions'] = word_captions

    if 'voiceover' in plan:
        plan['voiceover']['word_timings'] = timings

    a.video_production_plan = plan
    a.save(update_fields=['video_production_plan'])
    logger.info(f'Article {a.pk}: saved ✓')
    patched += 1

print(f'\nDone. Patched: {patched}  Skipped (already had timings): {skipped}')
