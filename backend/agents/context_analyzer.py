"""
Context Analyzer — Phase 1 of the Video Production Pipeline

Extracts maximum context from any URL the user provides:
  - YouTube: title, description, auto-captions/transcript, chapters, tags
  - News/blog articles: full article body via BeautifulSoup
  - Social media / generic URLs: og: meta tags + visible body text

Optionally enriches context via Google Custom Search (2-3 related snippets).
"""
import logging
import os
import re
import time

import requests as _requests

logger = logging.getLogger(__name__)

_YT_PATTERNS = re.compile(r"(youtube\.com|youtu\.be)")


# ── YouTube ───────────────────────────────────────────────────────────────────

def _extract_youtube(url: str) -> dict:
    """
    Use yt-dlp to pull title, description, auto-captions, chapters, and tags.
    Returns a rich dict; never raises.
    """
    try:
        import yt_dlp

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "writeautomaticsub": True,
            "subtitleslangs": ["ml", "en", "hi"],   # Malayalam first, then English/Hindi
            "subtitlesformat": "json3",
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        title       = info.get("title", "").strip()
        description = (info.get("description") or "").strip()[:3000]
        channel     = info.get("channel") or info.get("uploader", "")
        thumbnail   = info.get("thumbnail", "")
        duration    = info.get("duration", 0)
        tags        = (info.get("tags") or [])[:20]
        chapters    = info.get("chapters") or []

        # Build transcript from auto-captions
        transcript_text = ""
        captions = info.get("automatic_captions") or info.get("subtitles") or {}
        for lang in ["ml", "en", "hi"]:
            cap_list = captions.get(lang, [])
            # yt-dlp returns a list of format dicts; find json3
            for fmt in cap_list:
                if fmt.get("ext") == "json3" and fmt.get("url"):
                    try:
                        resp = _requests.get(fmt["url"], timeout=10)
                        data = resp.json()
                        events = data.get("events", [])
                        words = []
                        for ev in events:
                            for seg in ev.get("segs", []):
                                w = seg.get("utf8", "").strip()
                                if w and w != "\n":
                                    words.append(w)
                        transcript_text = " ".join(words)[:4000]
                        if transcript_text:
                            logger.info(f"[ContextAnalyzer] Got {lang} transcript ({len(transcript_text)} chars)")
                            break
                    except Exception:
                        pass
            if transcript_text:
                break

        chapter_titles = [c.get("title", "") for c in chapters if c.get("title")]

        logger.info(
            f"[ContextAnalyzer] YouTube OK: {title!r} "
            f"duration={duration}s transcript={len(transcript_text)} chars"
        )
        return {
            "ok":           True,
            "source_type":  "youtube",
            "title":        title,
            "description":  description,
            "transcript":   transcript_text,
            "channel":      channel,
            "thumbnail":    thumbnail,
            "duration":     duration,
            "tags":         tags,
            "chapters":     chapter_titles,
        }

    except Exception as e:
        logger.warning(f"[ContextAnalyzer] yt-dlp failed for {url}: {e}")
        return {"ok": False, "error": str(e)}


# ── Generic web page ──────────────────────────────────────────────────────────

def _extract_webpage(url: str) -> dict:
    """
    Fetch any URL and extract article content using BeautifulSoup.
    Tries: <article>, <main>, common content divs, then full body fallback.
    Returns a dict; never raises.
    """
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (compatible; PavilionBot/1.0; "
                "+https://pavilion.news/bot)"
            ),
            "Accept-Language": "en-US,en;q=0.9,ml;q=0.8",
        }
        resp = _requests.get(url, headers=headers, timeout=15, allow_redirects=True)
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        logger.warning(f"[ContextAnalyzer] HTTP fetch failed for {url}: {e}")
        return {"ok": False, "error": str(e)}

    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")

        # og: meta tags
        def og(prop):
            tag = soup.find("meta", property=f"og:{prop}") or \
                  soup.find("meta", attrs={"name": prop})
            return (tag.get("content") or "").strip() if tag else ""

        og_title = og("title") or (soup.title.string.strip() if soup.title else "")
        og_desc  = og("description")
        og_image = og("image")
        og_site  = og("site_name")

        # Remove boilerplate elements
        for tag in soup.find_all(["nav", "header", "footer", "aside",
                                   "script", "style", "noscript",
                                   "iframe", "form", "button"]):
            tag.decompose()

        # Try to find the article body in order of preference
        body_text = ""
        for selector in [
            "article",
            "main",
            '[class*="article-body"]',
            '[class*="article_body"]',
            '[class*="entry-content"]',
            '[class*="post-content"]',
            '[class*="story-body"]',
            '[class*="content-body"]',
            '[itemprop="articleBody"]',
        ]:
            el = soup.select_one(selector)
            if el:
                body_text = " ".join(el.get_text(" ", strip=True).split())
                if len(body_text) > 200:
                    break

        # Fallback: whole body
        if len(body_text) < 200:
            body_text = " ".join(soup.get_text(" ", strip=True).split())

        body_text = body_text[:5000]

        logger.info(
            f"[ContextAnalyzer] Webpage OK: {og_title!r} "
            f"body={len(body_text)} chars site={og_site!r}"
        )
        return {
            "ok":          True,
            "source_type": "webpage",
            "title":       og_title,
            "description": og_desc,
            "body":        body_text,
            "image":       og_image,
            "site_name":   og_site,
        }
    except Exception as e:
        logger.warning(f"[ContextAnalyzer] BeautifulSoup parsing failed: {e}")
        return {"ok": False, "error": str(e)}


# ── Research enrichment via Google Custom Search ──────────────────────────────

def _research_topic(topic: str, max_results: int = 3) -> list[str]:
    """
    Query Google Custom Search for the topic and return snippet strings.
    Returns [] if the API keys are missing or the call fails.
    """
    api_key    = os.environ.get("GOOGLE_CUSTOM_SEARCH_API_KEY")
    engine_id  = os.environ.get("GOOGLE_CUSTOM_SEARCH_ENGINE_ID")
    if not api_key or not engine_id or not topic:
        return []
    try:
        from googleapiclient.discovery import build
        service = build("customsearch", "v1", developerKey=api_key)
        res = service.cse().list(q=topic, cx=engine_id, num=max_results).execute()
        snippets = []
        for item in res.get("items", []):
            title   = item.get("title", "")
            snippet = item.get("snippet", "")
            if snippet:
                snippets.append(f"{title}: {snippet}")
        logger.info(f"[ContextAnalyzer] Research: {len(snippets)} snippets for {topic[:60]!r}")
        return snippets
    except Exception as e:
        logger.warning(f"[ContextAnalyzer] Custom Search failed: {e}")
        return []


# ── Main entry point ──────────────────────────────────────────────────────────

def analyze_context(
    reference_url: str = None,
    text_prompt:   str = None,
    article_data:  dict = None,   # kept for API compatibility; ignored in URL mode
) -> dict:
    """
    Build a rich context dict for the script-writer.

    Priority:
      1. reference_url (YouTube → yt-dlp; any URL → web scraper)
      2. text_prompt (plain topic)
      3. article_data (CMS fallback — only used when no URL/prompt given)
    """
    context = {
        "source_type":           None,
        "topic":                 "",
        "facts":                 [],
        "tone":                  "energetic",
        "duration_hint_seconds": 60,
        "thumbnail_url":         "",
        "raw_content":           "",
        "raw_metadata":          {},
    }

    # ── 1. URL provided ───────────────────────────────────────────────────────
    if reference_url and reference_url.startswith("http"):
        is_youtube = bool(_YT_PATTERNS.search(reference_url))

        if is_youtube:
            data = _extract_youtube(reference_url)
        else:
            data = _extract_webpage(reference_url)

        if data.get("ok"):
            title   = data.get("title", "").strip()
            context["source_type"]   = data["source_type"]
            context["topic"]         = title
            context["thumbnail_url"] = data.get("thumbnail") or data.get("image", "")
            context["raw_metadata"]  = data

            # Build facts list from extracted metadata
            facts = []
            if title:
                facts.append(f"Title: {title}")
            if data.get("channel"):
                facts.append(f"Channel/Publisher: {data['channel']}")
            if data.get("site_name"):
                facts.append(f"Source: {data['site_name']}")
            if data.get("description"):
                facts.append(f"Description: {data['description'][:400]}")
            if data.get("tags"):
                facts.append(f"Tags: {', '.join(data['tags'][:10])}")
            if data.get("chapters"):
                facts.append(f"Chapters: {', '.join(data['chapters'][:6])}")
            if data.get("duration"):
                facts.append(f"Video duration: {data['duration']}s")

            # raw_content: transcript (YouTube) or body (webpage) — the gold source
            raw = data.get("transcript") or data.get("body") or data.get("description", "")
            context["raw_content"] = raw

            # Supplemental research pass
            if title:
                research = _research_topic(title)
                if research:
                    facts.append("--- Additional context (web research) ---")
                    facts.extend(research)

            context["facts"] = facts
            logger.info(
                f"[ContextAnalyzer] URL context ready: source={data['source_type']} "
                f"topic={title[:60]!r} raw_content={len(raw)} chars"
            )
            return context

        # URL fetch failed — try finding the article via Google Custom Search
        logger.warning(
            f"[ContextAnalyzer] URL extraction failed ({data.get('error')}), "
            f"trying Custom Search fallback"
        )
        search_snippets = _research_topic(reference_url, max_results=5)
        if search_snippets:
            # Use the first snippet's title as the topic
            first = search_snippets[0]
            topic_guess = first.split(":")[0].strip() if ":" in first else first[:100]
            context["source_type"]  = "url_searched"
            context["topic"]        = topic_guess
            context["facts"]        = [f"Source URL: {reference_url}"] + search_snippets
            context["raw_content"]  = "\n".join(search_snippets)
            logger.info(f"[ContextAnalyzer] Custom Search fallback: topic={topic_guess!r}")
            return context
        text_prompt = text_prompt or reference_url

    # ── 2. Text prompt ────────────────────────────────────────────────────────
    if text_prompt:
        context["source_type"] = "text_prompt"
        context["topic"]       = text_prompt
        context["facts"]       = [f"Topic: {text_prompt}"]

        research = _research_topic(text_prompt)
        if research:
            context["facts"].append("--- Web research ---")
            context["facts"].extend(research)
            context["raw_content"] = "\n".join(research)

        logger.info(f"[ContextAnalyzer] Text prompt: {text_prompt[:80]!r}")
        return context

    # ── 3. CMS article fallback (no URL/prompt given) ─────────────────────────
    if article_data:
        title       = (article_data.get("title")    or "").strip()
        summary     = (article_data.get("summary")  or "").strip()
        content     = (article_data.get("content")  or article_data.get("body") or "").strip()
        reel_script = (article_data.get("instagram_reel_script") or "").strip()
        category    = (article_data.get("category") or "").strip()

        context["source_type"] = "article"
        context["topic"]       = title

        facts = []
        if title:
            facts.append(f"Article title: {title}")
        if category:
            facts.append(f"Category: {category}")
        if summary:
            facts.append(f"Summary: {summary}")
        if reel_script:
            facts.append(f"Existing reel script: {reel_script[:800]}")
        context["facts"]       = facts
        context["raw_content"] = content or summary

        logger.info(
            f"[ContextAnalyzer] Article fallback: id={article_data.get('id')} "
            f"title={title[:60]!r} content={len(content)} chars"
        )
        return context

    logger.warning("[ContextAnalyzer] No usable context — returning empty")
    return context
