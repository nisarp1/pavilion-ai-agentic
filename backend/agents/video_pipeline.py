"""
Video Production Pipeline — Prompt-to-Video

Flow:
  1. Context Analysis  (deterministic — yt-dlp + parsing)
  2. Script Writing    (Gemini API — Malayalam voiceover + short title)
  3. TTS Generation    (Google Cloud TTS with SSML word marks → per-word timing)
  4. Timeline Building (pure Python — assembles timeline.json for PavilionAIVideo)

Output props:  { timeline: <Timeline JSON>, _compositionId: "PavilionAIVideo" }
"""
import json
import logging
import os
import re
import time
from datetime import datetime

from agents.context_analyzer import analyze_context
from agents.scene_templates_catalog import get_format_specs

logger = logging.getLogger(__name__)

# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_gemini_model_name() -> str:
    """Return plain model name for the google-generativeai client (no prefix)."""
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
    # Strip CrewAI / LiteLLM prefixes if present
    for prefix in ("gemini/", "vertex_ai/"):
        if model.startswith(prefix):
            model = model[len(prefix):]
    return model


def _call_gemini(prompt: str) -> str:
    """
    Call Gemini via google-generativeai (same SDK used by workers/tasks.py).
    Returns the raw text response.
    """
    import google.generativeai as genai

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    genai.configure(api_key=api_key)
    model_name = _get_gemini_model_name()
    model = genai.GenerativeModel(model_name)

    try:
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"},
        )
    except Exception:
        # Older SDK versions don't support response_mime_type
        response = model.generate_content(prompt)

    return response.text.strip() if response and response.text else ""


def _safe_json_extract(text: str) -> dict:
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1).strip()
    else:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            text = match.group(0)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning(f"JSON parse failed (first 200 chars): {text[:200]}")
        return {}


# ── Timeline builder helpers ───────────────────────────────────────────────────

def _word_timings_to_captions(word_timings: list) -> list:
    """
    Convert [{word, start_ms, end_ms}] → Caption[] for @remotion/captions.

    Caption type: {text, startMs, endMs, timestampMs, confidence}

    Words after the first are prefixed with a space so that
    createTikTokStyleCaptions() can group them into pages by the
    combineTokensWithinMilliseconds threshold (space-prefix triggers page-splitting).
    """
    words = [wt for wt in word_timings if wt.get("word", "").strip()]
    return [
        {
            "text":        wt["word"] if i == 0 else f" {wt['word']}",
            "startMs":     wt["start_ms"],
            "endMs":       wt["end_ms"],
            "timestampMs": wt["start_ms"],
            "confidence":  None,
        }
        for i, wt in enumerate(words)
    ]


def _chunk_word_timings(word_timings: list, max_chars: int = 14) -> list:
    """
    Group word timings into subtitle chunks of at most max_chars characters.
    Mirrors the logic in the Remotion template's cli/timeline.ts.
    Returns [{startMs, endMs, text, position, animations}].
    """
    if not word_timings:
        return []

    chunks = []
    current_words: list = []
    current_chars = 0
    current_start_ms: int | None = None

    for wt in word_timings:
        word = wt.get("word", "")
        if not word.strip():
            continue

        if current_start_ms is None:
            current_start_ms = wt["start_ms"]

        # Flush if adding this word would exceed max_chars
        if current_chars + len(word) + 1 > max_chars and current_words:
            chunks.append({
                "startMs": current_start_ms,
                "endMs": current_words[-1]["end_ms"],
                "text": " ".join(w["word"] for w in current_words),
                "position": "center",
                "animations": [{"type": "scale", "from": 0.8, "to": 1.0, "startMs": 0, "endMs": 200}],
            })
            current_words = []
            current_chars = 0
            current_start_ms = wt["start_ms"]

        current_words.append(wt)
        current_chars += len(word) + 1

    if current_words:
        chunks.append({
            "startMs": current_start_ms,
            "endMs": current_words[-1]["end_ms"],
            "text": " ".join(w["word"] for w in current_words),
            "position": "center",
            "animations": [{"type": "scale", "from": 0.8, "to": 1.0, "startMs": 0, "endMs": 200}],
        })

    return chunks


def _build_background_elements(
    total_duration_ms: int,
    num_segments: int,
    asset_urls: list = None,
) -> list:
    """
    Create evenly-distributed background elements with alternating Ken Burns zoom.
    asset_urls[i] is the user-uploaded image for segment i; falls back to "" (gradient).
    """
    if num_segments <= 0:
        num_segments = 1
    asset_urls = asset_urls or []
    seg_ms = total_duration_ms // num_segments
    elements = []
    for i in range(num_segments):
        start_ms = i * seg_ms
        end_ms = (i + 1) * seg_ms if i < num_segments - 1 else total_duration_ms
        zoom_in = (i % 2 == 0)
        elements.append({
            "startMs": start_ms,
            "endMs": end_ms,
            "imageUrl": asset_urls[i] if i < len(asset_urls) else "",
            "assetSlot": f"slot_{i}",
            "enterTransition": "blur",
            "exitTransition": "blur",
            "animations": [{
                "type": "scale",
                "from": 1.5 if zoom_in else 1.0,
                "to": 1.0 if zoom_in else 1.5,
                "startMs": 0,
                "endMs": end_ms - start_ms,
            }],
        })
    return elements


def build_timeline(
    short_title: str,
    audio_url: str,
    word_timings: list,
    total_duration_ms: int,
    visual_shots: list = None,
    asset_urls: list = None,
) -> dict:
    """
    Assemble the timeline dict consumed by PavilionAIVideo Remotion composition.
    visual_shots: descriptive labels per segment (from Gemini script writer).
    asset_urls: user-uploaded image URLs per segment (override image lookup).
    """
    num_segments = max(3, total_duration_ms // 8000)
    # If we have AI-suggested shots, align segment count to shot count
    if visual_shots:
        num_segments = max(num_segments, len(visual_shots))

    elements = _build_background_elements(total_duration_ms, num_segments, asset_urls)

    return {
        "shortTitle": short_title,
        "elements": elements,
        "text": _chunk_word_timings(word_timings, max_chars=14),
        "wordCaptions": _word_timings_to_captions(word_timings),
        "audio": [{"startMs": 0, "endMs": total_duration_ms, "audioUrl": audio_url}],
    }


# ── Pipeline ───────────────────────────────────────────────────────────────────

class VideoProductionPipeline:
    """
    Prompt-to-Video pipeline:
      Step 1 — Context Analysis (deterministic)
      Step 2 — Script Writing   (Gemini API direct call)
      Step 3 — TTS Generation   (Google Cloud TTS with SSML word marks)
      Step 4 — Timeline Build   (pure Python)
    """

    def __init__(self):
        self.model_name = _get_gemini_model_name()
        logger.info(f"VideoProductionPipeline initialised — model: {self.model_name}")

    # ── Script Writer ──────────────────────────────────────────────────────────

    def _run_script_writer(self, context: dict, video_format: str) -> dict:
        """
        Call Gemini directly to produce the Malayalam voiceover script.
        Returns {short_title, voiceover_script}.
        """
        format_specs = get_format_specs()
        chosen = format_specs.get(video_format, format_specs["reel"])

        raw_content = (context.get("raw_content") or "")[:5000]
        source_type = context.get("source_type", "unknown")

        # Label the primary source block for the LLM
        if source_type == "youtube":
            source_label = "VIDEO TRANSCRIPT / DESCRIPTION"
        elif source_type == "webpage":
            source_label = "ARTICLE / WEB PAGE CONTENT"
        else:
            source_label = "SOURCE CONTENT"

        source_section = ""
        if raw_content:
            source_section = (
                f"\n=== {source_label} (primary source — base the script on THIS) ===\n"
                f"{raw_content}\n"
            )

        num_shots = {"reel": 5, "short": 7, "long": 10}.get(video_format, 5)

        prompt = f"""You are the lead content strategist for 'Pavilion', Kerala's premier \
Malayalam news brand on Instagram and YouTube. Write a punchy, factual, emotionally \
engaging Malayalam voiceover script for a short video reel.

=== SOURCE ===
URL/Topic: {context['topic']}
Source type: {source_type}
Key facts:
{chr(10).join('- ' + f for f in context['facts'])}
{source_section}
=== FORMAT ===
Format: {video_format} ({chosen['label']})
Target duration when read aloud: ~{chosen['typical_duration_seconds']} seconds

=== REQUIREMENTS ===
- Base the script ENTIRELY on the source content above — do NOT invent facts
- Include exact names, numbers, scores, quotes from the source
- Natural spoken Malayalam — conversational, energetic
- Hook the viewer in the very first sentence
- If the source content is in English, translate the key facts into Malayalam naturally

=== OUTPUT — return ONLY valid JSON, no markdown ===
{{
  "short_title": "3-5 word Malayalam title for the intro card",
  "voiceover_script": "Full Malayalam voiceover script as natural spoken sentences...",
  "visual_shots": [
    "Specific, descriptive English image search query for background visual 1 (e.g. 'Erling Haaland goal celebration vs Arsenal 2024')",
    "... repeat for exactly {num_shots} shots total, one per major moment in the script ..."
  ]
}}"""

        raw = _call_gemini(prompt)
        result = _safe_json_extract(raw)

        if not result.get("voiceover_script"):
            logger.warning(
                "Gemini returned no voiceover_script — raw response: %s", raw[:300]
            )
        return result

    # ── Main pipeline ──────────────────────────────────────────────────────────

    def run(
        self,
        reference_url: str = None,
        text_prompt: str = None,
        article_data: dict = None,
        video_format: str = "reel",
        include_avatar: bool = False,
        style_context: dict = None,
        style_reference_url: str = None,
    ) -> dict:
        """
        Execute the full pipeline.  Returns a VideoProductionPlan dict whose
        props["timeline"] drives the PavilionAIVideo Remotion composition.
        """
        start_time = time.time()
        logger.info(
            f"VideoProductionPipeline start — "
            f"{reference_url or text_prompt or 'article'}"
        )

        # ── Step 1: Context Analysis ───────────────────────────────────────────
        logger.info("Step 1/4: Context analysis...")
        context = analyze_context(
            reference_url=reference_url,
            text_prompt=text_prompt,
            article_data=article_data,
        )
        logger.info(
            f"Context: source={context['source_type']}, topic={context['topic'][:80]}"
        )

        # ── Step 2: Script Writing ─────────────────────────────────────────────
        logger.info("Step 2/4: Script writing (Gemini)...")
        script_data = self._run_script_writer(context, video_format)
        short_title = script_data.get("short_title") or context["topic"][:40]
        voiceover_script = script_data.get("voiceover_script", "")
        visual_shots = script_data.get("visual_shots") or []

        if not voiceover_script:
            logger.warning("Script writer returned empty script — using topic as fallback")
            voiceover_script = context["topic"]

        logger.info(
            f"Script ready: '{short_title}' — "
            f"{len(voiceover_script)} chars, {len(visual_shots)} visual shots"
        )

        # ── Step 3: TTS Generation ────────────────────────────────────────────
        logger.info("Step 3/4: TTS generation (Google Cloud TTS + SSML word marks)...")
        article_id = (
            str(article_data["id"]) if article_data and article_data.get("id") else "temp"
        )

        from agents.tts_agent import generate_reel_audio
        tts_result = generate_reel_audio(script=voiceover_script, article_id=article_id)

        audio_url = tts_result["audio_url"]
        word_timings = tts_result.get("word_timings", [])
        duration_s = tts_result.get("duration_seconds", 0)
        duration_ms = int(duration_s * 1000)
        voice_used = tts_result.get("voice_used", "")

        logger.info(
            f"TTS done: {duration_s:.1f}s audio, "
            f"{len(word_timings)} word timings — {audio_url}"
        )

        # ── Step 4: Timeline Building ──────────────────────────────────────────
        logger.info("Step 4/4: Building timeline JSON...")

        timeline = build_timeline(
            short_title=short_title,
            audio_url=audio_url,
            word_timings=word_timings,
            total_duration_ms=duration_ms,
            visual_shots=visual_shots,
        )

        # Build assets_needed from visual_shots — one slot per timeline element
        assets_needed = [
            {
                "id":          f"slot_{i}",
                "description": visual_shots[i] if i < len(visual_shots) else f"Visual {i + 1}",
                "sceneIndex":  i,
                "type":        "image",
                "status":      "needed",
                "url":         "",
            }
            for i in range(len(timeline["elements"]))
        ]

        # Total frames = audio content + 1-second intro card (30 frames)
        total_frames = int(duration_ms / 1000 * 30) + 30

        elapsed = round(time.time() - start_time, 1)
        logger.info(f"Pipeline complete in {elapsed}s — {len(assets_needed)} asset slots")

        props = {
            "timeline": timeline,
            "_compositionId": "PavilionAIVideo",
        }

        return {
            "status": "success",
            "metadata": {
                "title": short_title,
                "video_format": video_format,
                "resolution": get_format_specs().get(video_format, {}).get(
                    "resolution", {"w": 1080, "h": 1920}
                ),
                "duration_seconds": round(duration_s),
                "fps": 30,
                "total_frames": total_frames,
                "reference_url": reference_url,
                "created_at": datetime.utcnow().isoformat(),
                "pipeline_elapsed_seconds": elapsed,
            },
            "voiceover": {
                "script_plain": voiceover_script,
                "audio_url": audio_url,
                "duration_seconds": duration_s,
                "word_timings": word_timings,
                "language": "ml-IN",
                "voice_used": voice_used,
            },
            "timeline": timeline,
            "props": props,
            "modular_props": props,
            "scenes": [],
            "clips": [],
            "assets_needed": assets_needed,
            "downloadable": {
                "audio_script_txt": voiceover_script,
            },
        }
