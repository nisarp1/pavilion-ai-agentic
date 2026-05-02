#!/usr/bin/env python
"""
Test script for the new Video Production Pipeline.
Run from container: python backend/test_reel.py
"""
import os, sys, django, json, logging

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pavilion_gemini.settings")
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
django.setup()

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')

from workers.tasks import task_recreate_reel_agentic

TEST_URL = "https://www.youtube.com/shorts/dYu8bFtWLxo"

print(f"\n🎬 Testing Video Production Pipeline")
print(f"   URL: {TEST_URL}\n")

result = task_recreate_reel_agentic(TEST_URL, video_format="reel", include_avatar=False)

print(f"\n{'='*60}")
print(f"Status: {result.get('status')}")

if result.get('status') == 'success':
    meta = result.get('metadata', {})
    print(f"Title: {meta.get('title', 'N/A')}")
    print(f"Format: {meta.get('video_format')} | Duration: {meta.get('duration_seconds')}s")
    print(f"Elapsed: {meta.get('pipeline_elapsed_seconds')}s")
    
    vo = result.get('voiceover', {})
    print(f"\n📝 Voiceover Script:")
    print(vo.get('script_plain', 'N/A')[:300])
    
    assets = result.get('assets_needed', [])
    print(f"\n📦 Assets Needed ({len(assets)}):")
    for a in assets:
        print(f"  [{a.get('status','?')}] {a.get('id')}: {a.get('description','')}")
    
    props = result.get('props', {})
    print(f"\n🎨 Props:")
    print(f"  scene1Headline: {props.get('scene1Headline', 'N/A')[:60]}")
    print(f"  scene2Headline: {props.get('scene2Headline', 'N/A')[:60]}")
    print(f"  playerName: {props.get('playerName', 'N/A')}")
    print(f"  stats: {json.dumps(props.get('stats', []), ensure_ascii=False)[:120]}")
    
    clips = result.get('clips', [])
    print(f"\n🎞️ Clips ({len(clips)}):")
    for c in clips:
        print(f"  {c.get('id'):20s} | {c.get('globalStartFrame'):4d}f – {c.get('globalStartFrame',0)+c.get('durationFrames',0):4d}f | {c.get('label')}")
else:
    print(f"Error: {result.get('error', 'Unknown')}")

print(f"\n{'='*60}")
