"""
Style Analyzer Agent — Phase 1 of the Style Library pipeline.

Analyzes a reference reel/video and extracts a structured "Style DNA" JSON
that describes every visual aspect: scene structure, color palettes, text
overlays, animation patterns, transitions, and layout types.

Supports two analysis modes:
  1. Full video upload to Gemini 2.5 Pro (higher quality, ~$0.15-0.40/analysis)
  2. Keyframe extraction + image analysis (cheaper, ~$0.02-0.08/analysis)

The output Style DNA feeds into the StyleMatcher (Phase 2) which maps
detected patterns to existing Remotion templates or flags new ones for
AI-based code generation (Phase 3).
"""
import os
import json
import time
import logging
import tempfile
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# Pavilion brand constraints — the analyzer evaluates compatibility against these
PAVILION_BRAND = {
    "allowed_fonts": ["Anek Malayalam", "Manrope"],
    "primary_colors": ["#000000", "#1f7a6e", "#e8b73b", "#FF2D2D", "#ffffff"],
    "language": "ml-IN",
    "brand_elements": ["top_chrome_bar", "brand_logo", "gradient_overlays"],
}

# Known animation patterns (maps to our existing presets)
KNOWN_ANIMATION_PRESETS = {
    "fadeIn":          "Simple opacity fade from 0 to 1",
    "slideFromLeft":   "Element slides in from the left edge",
    "slideFromRight":  "Element slides in from the right edge",
    "slideFromBottom": "Element slides up from below",
    "slideFromTop":    "Element slides down from above",
    "zoomIn":          "Element scales up from small to full size",
    "bounceIn":        "Element scales in with an overshoot bounce",
    "kenBurns":        "Slow continuous zoom on background image",
    "wordByWord":      "Text reveals one word at a time with stagger",
    "staggerReveal":   "Multiple elements appear with sequential delay",
    "counterUp":       "Numeric value counts up from 0",
}

# Known layout types (maps to existing + planned templates)
KNOWN_LAYOUT_TYPES = [
    "hero_fullbleed",       # → hero_headline template
    "player_card_stats",    # → player_card template
    "scoreboard",           # → scoreboard template
    "stat_comparison",      # → stat_comparison template
    "quote_card",           # → quote_card template
    "ticker_headline",      # → ticker_headline template
    "photo_grid",           # → future template
    "countdown_list",       # → future template
    "split_screen",         # → future template
    "text_only_dramatic",   # → variation of hero_headline
    "logo_reveal",          # → brand opener
]

# Style DNA JSON schema for the LLM prompt
STYLE_DNA_SCHEMA = """{
  "source": {
    "url": "original URL",
    "duration_seconds": 32,
    "resolution": {"w": 1080, "h": 1920},
    "total_scenes_detected": 4
  },
  "scenes": [
    {
      "scene_number": 1,
      "start_seconds": 0,
      "end_seconds": 4.5,
      "layout_type": "hero_fullbleed | player_card_stats | scoreboard | stat_comparison | quote_card | ticker_headline | photo_grid | countdown_list | split_screen | text_only_dramatic | logo_reveal",
      "text_overlays": [
        {
          "text_content": "BREAKING",
          "position": "top_center | top_left | top_right | center | bottom_center | bottom_left | bottom_right",
          "estimated_font_size_ratio": 0.06,
          "font_weight": "bold | semibold | normal",
          "color_hex": "#FF2D2D",
          "has_shadow": true,
          "has_outline": false,
          "animation": "fadeIn | slideFromLeft | slideFromRight | slideFromBottom | slideFromTop | zoomIn | bounceIn | wordByWord | none",
          "animation_duration_ms": 400
        }
      ],
      "color_palette": {
        "dominant": "#0a0a0a",
        "accent_1": "#FF2D2D",
        "accent_2": "#e8b73b",
        "text_primary": "#ffffff"
      },
      "visual_elements": ["hero_image", "gradient_overlay", "text_headline", "player_cutout", "stats_grid", "logo_badge", "score_display", "progress_bar"],
      "background_type": "image | video | solid_color | gradient",
      "has_overlay_gradient": true,
      "transition_in": "cut | dissolve | slide_left | slide_right | zoom | wipe",
      "transition_out": "cut | dissolve | slide_left | slide_right | zoom | wipe",
      "mood": "dramatic | energetic | calm | informative | celebratory | tense",
      "motion_style": "static | ken_burns_slow_zoom | ken_burns_pan | parallax | none"
    }
  ],
  "global_style": {
    "color_temperature": "warm | cool | neutral",
    "contrast_level": "high | medium | low",
    "brand_position": "top_bar | bottom_bar | corner | watermark | none",
    "typography_hierarchy": ["headline_large", "subheadline_medium", "body_small", "stats_numeric"],
    "animation_speed": "fast | medium | slow",
    "dominant_easing": "easeOutCubic | easeOutBack | easeInOut | linear",
    "overall_energy": "high | medium | low",
    "uses_glassmorphism": false,
    "uses_blur_backgrounds": true,
    "primary_font_style": "sans-serif | serif | display"
  },
  "animation_patterns": [
    {
      "id": "descriptive_id",
      "type": "text_entry | image_entry | element_entry | transition | continuous",
      "description": "Human-readable description of the animation",
      "easing": "easeOutCubic | easeOutBack | easeInOut | linear",
      "per_element_delay_ms": 220,
      "total_duration_ms": 1200,
      "maps_to_preset": "fadeIn | slideFromLeft | slideFromRight | slideFromBottom | zoomIn | bounceIn | wordByWord | none"
    }
  ],
  "brand_compatibility": {
    "fits_pavilion_style": true,
    "compatibility_score": 0.85,
    "adaptations_needed": [
      "Replace English text with Malayalam",
      "Swap brand colors to Pavilion palette"
    ],
    "reusable_patterns": ["The word-by-word headline reveal matches our existing style"],
    "incompatible_elements": ["3D text rotation not supported in Remotion"]
  }
}"""


# ── Video Download & Keyframe Extraction ──────────────────────────────────────

def download_video(url: str, output_dir: str, max_duration: int = 120) -> Optional[str]:
    """
    Download a video using yt-dlp. Returns the file path or None.
    Limits to max_duration seconds to control costs.
    """
    try:
        import yt_dlp

        output_path = os.path.join(output_dir, "reference_video.mp4")
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "format": "worst[ext=mp4]/worst",  # Smallest format for analysis
            "outtmpl": output_path,
            "max_downloads": 1,
        }
        # Add duration filter for long videos
        if max_duration:
            ydl_opts["match_filter"] = yt_dlp.utils.match_filter_func(
                f"duration <= {max_duration}"
            )

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        if os.path.exists(output_path):
            size_mb = os.path.getsize(output_path) / (1024 * 1024)
            logger.info(f"[StyleAnalyzer] Downloaded video: {size_mb:.1f}MB → {output_path}")
            return output_path

    except Exception as e:
        logger.warning(f"[StyleAnalyzer] Video download failed: {e}")

    return None


def extract_keyframes(video_path: str, output_dir: str, max_frames: int = 15) -> list:
    """
    Extract keyframes from a video using ffmpeg scene detection.
    Returns list of image file paths.
    """
    frames_dir = os.path.join(output_dir, "keyframes")
    os.makedirs(frames_dir, exist_ok=True)

    try:
        # Use ffmpeg scene detection to find cuts/transitions
        cmd = [
            "ffmpeg", "-i", video_path,
            "-vf", f"select='gt(scene,0.25)',setpts=N/FRAME_RATE/TB",
            "-vsync", "vfr",
            "-frames:v", str(max_frames),
            "-q:v", "3",
            os.path.join(frames_dir, "frame_%03d.jpg"),
            "-y", "-loglevel", "warning",
        ]
        subprocess.run(cmd, capture_output=True, timeout=60)

        frames = sorted(Path(frames_dir).glob("frame_*.jpg"))

        # If scene detection found too few, extract at regular intervals
        if len(frames) < 3:
            logger.info("[StyleAnalyzer] Scene detection found few cuts — extracting at intervals")
            # Get video duration
            probe_cmd = [
                "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                "-of", "csv=p=0", video_path,
            ]
            result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=10)
            duration = float(result.stdout.strip()) if result.stdout.strip() else 30
            interval = max(1, duration / min(max_frames, 10))

            cmd2 = [
                "ffmpeg", "-i", video_path,
                "-vf", f"fps=1/{interval:.1f}",
                "-frames:v", str(max_frames),
                "-q:v", "3",
                os.path.join(frames_dir, "interval_%03d.jpg"),
                "-y", "-loglevel", "warning",
            ]
            subprocess.run(cmd2, capture_output=True, timeout=60)
            frames = sorted(Path(frames_dir).glob("*.jpg"))

        frame_paths = [str(f) for f in frames[:max_frames]]
        logger.info(f"[StyleAnalyzer] Extracted {len(frame_paths)} keyframes")
        return frame_paths

    except Exception as e:
        logger.warning(f"[StyleAnalyzer] Keyframe extraction failed: {e}")
        return []


# ── The Style Analyzer Agent ─────────────────────────────────────────────────

class StyleAnalyzerAgent:
    """
    Analyzes a reference reel and extracts a Style DNA JSON.
    Uses Gemini 2.5 Pro for visual understanding of video content.

    Two analysis modes:
      1. Keyframe mode (default): Extract frames → analyze images
      2. Video mode: Upload full video (Gemini supports native video)

    Usage:
        agent = StyleAnalyzerAgent()
        style_dna = agent.analyze("https://youtube.com/shorts/xyz")
    """

    def __init__(self, model: str = None):
        self.model = model or os.environ.get("STYLE_ANALYZER_MODEL", "gemini-2.5-pro")
        # Ensure correct prefix
        if not self.model.startswith(("gemini/", "vertex_ai/")):
            # Check if we should use Vertex AI
            if os.environ.get("VERTEX_PROJECT"):
                self.model = f"vertex_ai/{self.model}"
            else:
                self.model = f"gemini/{self.model}"
        logger.info(f"[StyleAnalyzer] Initialized with model: {self.model}")

    def analyze(
        self,
        video_url: str,
        mode: str = "keyframes",
        max_keyframes: int = 12,
    ) -> dict:
        """
        Analyze a reference video and return a Style DNA dict.

        Args:
            video_url: URL of the reference reel (YouTube, Instagram, etc.)
            mode: "keyframes" (cheaper) or "video" (richer, more expensive)
            max_keyframes: Maximum keyframes to extract (only for keyframe mode)

        Returns:
            Style DNA dict (see STYLE_DNA_SCHEMA for structure)
        """
        start_time = time.time()
        logger.info(f"[StyleAnalyzer] Starting analysis of: {video_url} (mode={mode})")

        with tempfile.TemporaryDirectory() as tmp_dir:
            # Step 1: Download the video
            video_path = download_video(video_url, tmp_dir)
            if not video_path:
                logger.error("[StyleAnalyzer] Could not download video")
                return self._empty_dna(video_url, error="Video download failed")

            if mode == "keyframes":
                style_dna = self._analyze_keyframes(
                    video_url, video_path, tmp_dir, max_keyframes
                )
            else:
                style_dna = self._analyze_video(video_url, video_path)

        elapsed = round(time.time() - start_time, 1)
        style_dna["_meta"] = {
            "analysis_mode": mode,
            "model_used": self.model,
            "analysis_duration_seconds": elapsed,
            "max_keyframes": max_keyframes if mode == "keyframes" else None,
        }

        logger.info(
            f"[StyleAnalyzer] Analysis complete in {elapsed}s — "
            f"{style_dna.get('source', {}).get('total_scenes_detected', 0)} scenes detected"
        )
        return style_dna

    # ── Keyframe-based analysis (cheaper) ─────────────────────────────────────

    def _analyze_keyframes(
        self, video_url: str, video_path: str, tmp_dir: str, max_keyframes: int
    ) -> dict:
        """Analyze using extracted keyframe images."""
        import google.generativeai as genai

        frames = extract_keyframes(video_path, tmp_dir, max_keyframes)
        if not frames:
            return self._empty_dna(video_url, error="No keyframes extracted")

        # Configure Gemini
        api_key = os.environ.get("GEMINI_API_KEY", "")
        genai.configure(api_key=api_key)

        # Upload frames
        uploaded_files = []
        for frame_path in frames:
            try:
                uploaded = genai.upload_file(frame_path, mime_type="image/jpeg")
                uploaded_files.append(uploaded)
            except Exception as e:
                logger.warning(f"[StyleAnalyzer] Failed to upload frame {frame_path}: {e}")

        if not uploaded_files:
            return self._empty_dna(video_url, error="No frames uploaded to Gemini")

        # Build the prompt
        prompt = self._build_analysis_prompt(video_url, len(frames))

        # Call Gemini
        model = genai.GenerativeModel(self.model.replace("gemini/", "").replace("vertex_ai/", ""))
        try:
            response = model.generate_content(
                [prompt] + uploaded_files,
                generation_config=genai.GenerationConfig(
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            )
            return self._parse_response(response.text, video_url)
        except Exception as e:
            logger.error(f"[StyleAnalyzer] Gemini analysis failed: {e}")
            return self._empty_dna(video_url, error=str(e))
        finally:
            # Clean up uploaded files
            for f in uploaded_files:
                try:
                    genai.delete_file(f.name)
                except Exception:
                    pass

    # ── Full video analysis (richer but more expensive) ───────────────────────

    def _analyze_video(self, video_url: str, video_path: str) -> dict:
        """Analyze using full video upload to Gemini."""
        import google.generativeai as genai

        api_key = os.environ.get("GEMINI_API_KEY", "")
        genai.configure(api_key=api_key)

        try:
            uploaded_video = genai.upload_file(video_path, mime_type="video/mp4")

            # Wait for processing
            import time as t
            while uploaded_video.state.name == "PROCESSING":
                t.sleep(2)
                uploaded_video = genai.get_file(uploaded_video.name)

            if uploaded_video.state.name == "FAILED":
                return self._empty_dna(video_url, error="Video processing failed on Gemini")

            prompt = self._build_analysis_prompt(video_url, mode="video")

            model = genai.GenerativeModel(self.model.replace("gemini/", "").replace("vertex_ai/", ""))
            response = model.generate_content(
                [prompt, uploaded_video],
                generation_config=genai.GenerationConfig(
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            )
            return self._parse_response(response.text, video_url)
        except Exception as e:
            logger.error(f"[StyleAnalyzer] Video analysis failed: {e}")
            return self._empty_dna(video_url, error=str(e))
        finally:
            try:
                genai.delete_file(uploaded_video.name)
            except Exception:
                pass

    # ── Prompt Construction ───────────────────────────────────────────────────

    def _build_analysis_prompt(self, video_url: str, frame_count: int = 0, mode: str = "keyframes") -> str:
        """Build the structured analysis prompt for Gemini."""

        if mode == "keyframes":
            context_line = (
                f"I've extracted {frame_count} keyframes from this video at scene-change boundaries. "
                "Analyze each frame as a distinct scene."
            )
        else:
            context_line = (
                "I've uploaded the full video. Watch it carefully and break it down scene by scene."
            )

        return f"""You are a professional video production analyst specializing in social media content (Reels, Shorts).

{context_line}

VIDEO URL: {video_url}

YOUR TASK: Analyze this reel and produce a comprehensive "Style DNA" — a complete description of every visual design choice.

IMPORTANT INSTRUCTIONS:
1. Be EXTREMELY specific about colors (use hex codes), positions, sizes, and timings.
2. For each scene, identify the LAYOUT TYPE from this list: {', '.join(KNOWN_LAYOUT_TYPES)}
3. For each animation, map it to one of these PRESET NAMES if possible: {', '.join(KNOWN_ANIMATION_PRESETS.keys())}
4. Evaluate BRAND COMPATIBILITY: We are "Pavilion", a Malayalam sports news brand. Our brand uses:
   - Colors: Black background, Teal (#1f7a6e) cards, Gold (#e8b73b) accents, Red (#FF2D2D) alerts
   - Fonts: "Anek Malayalam" (headlines), "Manrope" (stats/labels)
   - Always has a top chrome bar with logo
   - Text is primarily Malayalam with English player names
5. Score brand compatibility from 0 to 1 and list specific adaptations needed.

OUTPUT: Respond with ONLY valid JSON matching this exact schema:

{STYLE_DNA_SCHEMA}

Be precise and thorough. Every scene, every text overlay, every animation matters."""

    # ── Response Parsing ──────────────────────────────────────────────────────

    def _parse_response(self, response_text: str, video_url: str) -> dict:
        """Parse the LLM JSON response into a validated Style DNA dict."""
        import re

        # Try to extract JSON from potential markdown fences
        text = response_text.strip()
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if match:
            text = match.group(1).strip()
        else:
            match = re.search(r"\{[\s\S]*\}", text)
            if match:
                text = match.group(0)

        try:
            dna = json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(f"[StyleAnalyzer] JSON parse failed: {e}")
            return self._empty_dna(video_url, error=f"JSON parse failed: {e}")

        # Validate required top-level keys
        required_keys = ["scenes", "global_style", "animation_patterns", "brand_compatibility"]
        for key in required_keys:
            if key not in dna:
                dna[key] = [] if key in ("scenes", "animation_patterns") else {}

        # Ensure source info
        dna.setdefault("source", {})
        dna["source"]["url"] = video_url
        dna["source"].setdefault("total_scenes_detected", len(dna.get("scenes", [])))

        return dna

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _empty_dna(self, video_url: str, error: str = "") -> dict:
        """Return a minimal Style DNA dict when analysis fails."""
        return {
            "source": {"url": video_url, "total_scenes_detected": 0, "error": error},
            "scenes": [],
            "global_style": {},
            "animation_patterns": [],
            "brand_compatibility": {
                "fits_pavilion_style": False,
                "compatibility_score": 0,
                "adaptations_needed": [],
                "reusable_patterns": [],
                "incompatible_elements": [error] if error else [],
            },
        }


# ── Style Matcher ─────────────────────────────────────────────────────────────

# Maps Style DNA layout types → existing template_ids
LAYOUT_TO_TEMPLATE = {
    "hero_fullbleed":     "hero_headline",
    "text_only_dramatic": "hero_headline",
    "logo_reveal":        "hero_headline",
    "player_card_stats":  "player_card",
    "scoreboard":         "scoreboard",
    "stat_comparison":    "stat_comparison",
    "quote_card":         "quote_card",
    "ticker_headline":    "ticker_headline",
}


class StyleMatcher:
    """
    Maps Style DNA scenes to existing Remotion templates.
    Returns a structured mapping with prop overrides grounded in Pavilion brand.
    """

    def match(self, style_dna: dict, available_templates: dict = None) -> dict:
        """
        Match Style DNA scenes to templates.

        Args:
            style_dna: Full Style DNA dict from StyleAnalyzerAgent
            available_templates: Dict of {template_id: template_dict}
                                If None, uses the default catalog.

        Returns:
            {
                "matched": [{"scene": 1, "template_id": "...", "props_override": {...}}],
                "needs_generation": [scene_dict, ...],
                "brand_overrides": {"bgColor": "#000", ...},
            }
        """
        if available_templates is None:
            from agents.scene_templates_catalog import TEMPLATE_BY_ID
            available_templates = dict(TEMPLATE_BY_ID)

            # Also pull in library templates
            try:
                from style_library.models import StyleTemplate
                for tpl in StyleTemplate.objects.filter(is_active=True, is_verified=True):
                    available_templates[tpl.template_id] = tpl.to_catalog_entry()
            except Exception:
                pass

        result = {
            "matched": [],
            "needs_generation": [],
            "brand_overrides": self._build_brand_overrides(style_dna),
        }

        for scene in style_dna.get("scenes", []):
            layout_type = scene.get("layout_type", "")
            template_id = LAYOUT_TO_TEMPLATE.get(layout_type)

            if template_id and template_id in available_templates:
                result["matched"].append({
                    "scene_number": scene.get("scene_number", 0),
                    "template_id": template_id,
                    "layout_type": layout_type,
                    "props_override": self._build_props_from_scene(scene, style_dna),
                    "animation_overrides": self._map_animations(scene),
                    "duration_seconds": (
                        scene.get("end_seconds", 0) - scene.get("start_seconds", 0)
                    ),
                })
            else:
                result["needs_generation"].append(scene)

        logger.info(
            f"[StyleMatcher] Matched {len(result['matched'])} scenes, "
            f"{len(result['needs_generation'])} need generation"
        )
        return result

    def _build_brand_overrides(self, style_dna: dict) -> dict:
        """
        Extract colors from Style DNA but ground them in Pavilion's palette.
        We ADAPT the reference style, not copy it blindly.
        """
        global_style = style_dna.get("global_style", {})

        # Start with Pavilion defaults
        overrides = {
            "bgColor":    "#000000",
            "cardColor":  "#1f7a6e",
            "cardAccent": "#e8b73b",
            "accent":     "#FF2D2D",
        }

        # If the reference uses a dark theme, keep our dark bg
        # If it uses light, we still keep dark (brand constraint)
        # But we can adapt accent colors if they're close to ours
        if global_style.get("contrast_level") == "high":
            overrides["bgColor"] = "#000000"
        elif global_style.get("color_temperature") == "cool":
            overrides["bgColor"] = "#0a0a14"  # Slight blue-black

        return overrides

    def _build_props_from_scene(self, scene: dict, style_dna: dict) -> dict:
        """Build Remotion props from a scene's Style DNA, filtered through brand constraints."""
        props = {}

        # Extract text overlays
        for i, overlay in enumerate(scene.get("text_overlays", [])):
            if i == 0:
                props["headlineText"] = overlay.get("text_content", "")
            props[f"textOverlay_{i}_animation"] = overlay.get("animation", "fadeIn")

        # Motion style
        motion = scene.get("motion_style", "static")
        if motion == "ken_burns_slow_zoom":
            props["heroMotion"] = "kenBurns"

        return props

    def _map_animations(self, scene: dict) -> dict:
        """Map detected animations to our preset library."""
        overrides = {}
        for overlay in scene.get("text_overlays", []):
            anim = overlay.get("animation", "")
            if anim in KNOWN_ANIMATION_PRESETS:
                overrides["entryAnimation"] = anim
                overrides["animationDurationMs"] = overlay.get("animation_duration_ms", 400)
                break
        return overrides
