"""
Context Analyzer Agent — Phase 1

Extracts real metadata from YouTube URLs, text prompts, or article references.
Uses yt-dlp for YouTube metadata extraction (no video download needed).
"""
import os
import json
import logging
import re

logger = logging.getLogger(__name__)


def extract_youtube_metadata(url: str) -> dict:
    """
    Extract metadata from a YouTube URL using yt-dlp.
    Does NOT download the video — only fetches metadata.
    """
    try:
        import yt_dlp

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": False,
            "format": "best",
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        metadata = {
            "title": info.get("title", ""),
            "description": info.get("description", "")[:2000],  # Trim to avoid token bloat
            "duration_seconds": info.get("duration", 0),
            "channel": info.get("channel", info.get("uploader", "")),
            "view_count": info.get("view_count", 0),
            "like_count": info.get("like_count", 0),
            "upload_date": info.get("upload_date", ""),
            "thumbnail": info.get("thumbnail", ""),
            "tags": (info.get("tags") or [])[:15],  # Top 15 tags
            "categories": info.get("categories") or [],
            "is_short": info.get("duration", 0) <= 90,
        }

        # Extract hashtags from description
        desc = info.get("description", "")
        hashtags = re.findall(r"#(\w+)", desc)
        metadata["hashtags"] = hashtags[:10]

        logger.info(f"Extracted YouTube metadata: {metadata['title']} ({metadata['duration_seconds']}s)")
        return metadata

    except Exception as e:
        logger.error(f"yt-dlp metadata extraction failed: {e}")
        return {
            "title": "",
            "description": "",
            "duration_seconds": 0,
            "channel": "",
            "error": str(e),
        }


def analyze_context(reference_url: str = None, text_prompt: str = None, article_data: dict = None) -> dict:
    """
    Main entry point for context analysis.
    Supports multiple input types: YouTube URL, text prompt, article data.
    Returns a structured context dict.
    """
    context = {
        "source_type": None,
        "topic": "",
        "facts": [],
        "players": [],
        "stats": [],
        "tone": "energetic",
        "duration_hint_seconds": 60,
        "thumbnail_url": "",
        "raw_metadata": {},
    }

    # 1. YouTube URL
    if reference_url and ("youtube.com" in reference_url or "youtu.be" in reference_url):
        context["source_type"] = "youtube"
        metadata = extract_youtube_metadata(reference_url)
        context["raw_metadata"] = metadata
        context["topic"] = metadata.get("title", "")
        context["thumbnail_url"] = metadata.get("thumbnail", "")
        context["duration_hint_seconds"] = min(metadata.get("duration_seconds", 60), 90)

        # Extract facts from title + description
        desc = metadata.get("description", "")
        title = metadata.get("title", "")
        context["facts"] = [
            f"Video title: {title}",
            f"Channel: {metadata.get('channel', 'Unknown')}",
            f"Duration: {metadata.get('duration_seconds', 0)} seconds",
        ]
        if metadata.get("tags"):
            context["facts"].append(f"Tags: {', '.join(metadata['tags'][:8])}")

        # Guess if it's a short/reel
        if metadata.get("is_short") or "/shorts/" in reference_url:
            context["duration_hint_seconds"] = min(context["duration_hint_seconds"], 60)

    # 2. Generic URL (non-YouTube)
    elif reference_url:
        context["source_type"] = "url"
        context["topic"] = reference_url
        context["facts"] = [f"Reference URL: {reference_url}"]

    # 3. Text prompt
    elif text_prompt:
        context["source_type"] = "text_prompt"
        context["topic"] = text_prompt
        context["facts"] = [f"User prompt: {text_prompt}"]

    # 4. Article data from CMS
    elif article_data:
        context["source_type"] = "article"
        context["topic"] = article_data.get("title", "")
        context["facts"] = [
            f"Article title: {article_data.get('title', '')}",
            f"Summary: {article_data.get('summary', '')}",
        ]
        if article_data.get("content"):
            context["facts"].append(f"Content excerpt: {article_data['content'][:500]}")

    return context
