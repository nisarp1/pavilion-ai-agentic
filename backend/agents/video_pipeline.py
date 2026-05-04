"""
Video Production Pipeline — Orchestrator

Replaces the old reel_agents.py with a proper multi-agent pipeline:
  1. Context Analyzer (tool-based, no LLM needed)
  2. Script Writer (LLM agent via CrewAI)
  3. Scene Planner (LLM agent via CrewAI)

Returns a complete VideoProductionPlan JSON.
"""
import os
import json
import logging
import time
from datetime import datetime

try:
    from crewai import Agent, Task, Crew, Process
    _CREWAI_AVAILABLE = True
except ImportError:
    _CREWAI_AVAILABLE = False
    Agent = Task = Crew = Process = None

from agents.context_analyzer import analyze_context
from agents.scene_templates_catalog import (
    get_catalog_text,
    get_full_catalog_text,
    get_format_specs,
    get_all_templates_by_id,
)
from agents.image_fetcher import ImageFetcherAgent, inject_assets_into_plan
from agents.template_matcher import TEMPLATE_TOOLS, get_compact_catalog_text

logger = logging.getLogger(__name__)

# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_llm_model():
    """Resolve LLM model string from environment."""
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
    if not model.startswith("gemini/") and not model.startswith("vertex_ai/"):
        model = f"gemini/{model}"
    return model


def _safe_json_extract(text: str) -> dict:
    """Extract JSON from an LLM response that may contain markdown fences."""
    import re
    # Try to find JSON block
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1).strip()
    else:
        # Try to find a raw JSON object
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            text = match.group(0)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse JSON from LLM output (first 200 chars): {text[:200]}")
        return {}


# ── The Pipeline ───────────────────────────────────────────────────────────────

class VideoProductionPipeline:
    """
    Multi-agent pipeline that produces a complete VideoProductionPlan.
    
    Flow:
      1. Context Analysis (deterministic — yt-dlp + parsing, no LLM)
      2. Script Writing (LLM — voiceover + format decisions)
      3. Scene Planning (LLM — template matching + props + assets list)
    """

    def __init__(self):
        self.llm_model = _get_llm_model()
        logger.info(f"VideoProductionPipeline initialized with model: {self.llm_model}")

    # ── Agent Definitions ──────────────────────────────────────────────────

    def _get_script_writer_agent(self):
        return Agent(
            role="Malayalam Sports Video Script Writer",
            goal=(
                "Write an engaging, high-energy Malayalam voiceover script for a "
                "Pavilion-branded sports video. Also determine the ideal video format "
                "(reel/short/long) and output structured JSON."
            ),
            backstory=(
                "You are the lead content strategist for 'Pavilion', Kerala's premier "
                "Malayalam sports news brand on Instagram and YouTube. You write punchy, "
                "factual, emotionally engaging Malayalam scripts that hook viewers in the "
                "first 2 seconds. You understand video pacing — short sentences for reels, "
                "detailed narration for long-form. Your Malayalam is natural, conversational, "
                "and uses sports slang that resonates with Kerala's sports community."
            ),
            verbose=True,
            allow_delegation=False,
            llm=self.llm_model,
        )

    def _get_scene_planner_agent(self):
        return Agent(
            role="Video Scene Planner & Template Engineer",
            goal=(
                "Map a voiceover script to specific Remotion scene templates, "
                "decide timing, and list all required visual assets."
            ),
            backstory=(
                "You are a video production engineer who specializes in automated video "
                "composition. You know every available scene template inside-out and can "
                "pick the perfect combination to tell any sports story. You output precise "
                "JSON structures that directly feed into the Remotion rendering engine. "
                "Use the TemplateMatcher tool to query templates by content type before "
                "finalising your scene plan — this gives you filtered, up-to-date template "
                "info without token waste. Use TemplateDetail only for templates you pick."
            ),
            tools=TEMPLATE_TOOLS,
            verbose=True,
            allow_delegation=False,
            llm=self.llm_model,
        )

    # ── Pipeline Execution ─────────────────────────────────────────────────

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
        Execute the full pipeline. Returns a VideoProductionPlan dict.
        """
        start_time = time.time()
        logger.info(f"Starting VideoProductionPipeline for: {reference_url or text_prompt or 'article'}")

        # ── Step 0: Style Analysis (Optional) ──────────────────────────────
        if style_reference_url:
            logger.info(f"Step 0: Analyzing style reference: {style_reference_url}")
            from agents.style_analyzer import StyleAnalyzerAgent, StyleMatcher
            analyzer = StyleAnalyzerAgent()
            style_dna = analyzer.analyze(style_reference_url)
            
            # Match to existing templates
            matcher = StyleMatcher()
            template_mapping = matcher.match(style_dna)
            
            # Build a style context from the matching
            style_context = {
                "preset_name": f"Auto-matched from {style_reference_url}",
                "template_sequence": template_mapping.get("matched", []),
                "brand_colors": template_mapping.get("brand_overrides", {}),
            }
        
        if style_context:
            logger.info(f"Using style context: {style_context.get('preset_name')}")

        # ── Step 1: Context Analysis (deterministic) ───────────────────────
        logger.info("Step 1/3: Analyzing context...")
        context = analyze_context(
            reference_url=reference_url,
            text_prompt=text_prompt,
            article_data=article_data,
        )
        logger.info(f"Context extracted: source={context['source_type']}, topic={context['topic'][:80]}")

        # ── Step 2: Script Writing (LLM) ───────────────────────────────────
        logger.info("Step 2/3: Writing voiceover script...")

        format_specs = get_format_specs()
        chosen_format = format_specs.get(video_format, format_specs["reel"])

        raw_content_section = ""
        if context.get("raw_content"):
            raw_content_section = f"\n=== RAW SOURCE CONTENT (use ALL key details from this) ===\n{context['raw_content'][:3000]}\n"

        script_task_description = f"""
You are writing a script for a Pavilion-branded Malayalam sports video.

=== CONTEXT ===
Topic: {context['topic']}
Source Type: {context['source_type']}
Facts:
{chr(10).join('- ' + f for f in context['facts'])}
Thumbnail URL: {context.get('thumbnail_url', 'N/A')}
Duration Hint: {context.get('duration_hint_seconds', 60)} seconds
{raw_content_section}
CRITICAL SCRIPT REQUIREMENTS:
- You MUST cover ALL key facts, player names, match scores, statistics, and specific events from the SOURCE CONTENT above.
- Do NOT generalize — use exact names, numbers, and results.
- The script must feel like it was written by someone who actually watched/read the source material.
- Every important detail in the source content should appear somewhere in the script.

=== VIDEO FORMAT ===
Format: {video_format} ({chosen_format['label']})
Resolution: {chosen_format['resolution']['w']}×{chosen_format['resolution']['h']}
Max Duration: {chosen_format['max_duration_seconds']} seconds
Typical Duration: {chosen_format['typical_duration_seconds']} seconds

=== AVATAR ===
Include Avatar Clips: {"Yes — generate opener (10-14s) and closer (8-10s) scripts" if include_avatar else "No"}

=== YOUR OUTPUT (STRICTLY JSON, no markdown) ===
Output a valid JSON object with these keys:
{{
  "video_title": "Short title for the video in Malayalam",
  "voiceover_script": "Full Malayalam voiceover script. Write in natural spoken Malayalam. Include line breaks between sentences.",
  "voiceover_duration_estimate_seconds": 45,
  "scene_descriptions": [
    {{
      "scene_number": 1,
      "description": "Brief description of what this scene shows visually",
      "spoken_text": "The portion of the voiceover for this scene",
      "duration_seconds": 6,
      "visual_mood": "dramatic / energetic / calm / informative"
    }}
  ],
  "key_hooks": ["Hook 1 text", "Hook 2 text"],
  "player_names": ["Player 1", "Player 2"],
  "stats": [{{"label": "Goals", "value": "12"}}],
  "headline_malayalam": "Main headline in Malayalam",
  "sub_headline_malayalam": "Secondary headline in Malayalam"{"," if include_avatar else ""}
  {"avatar_opener_script" if include_avatar else ""}: {"'10-14 second opener script for avatar generation'" if include_avatar else ""},
  {"avatar_closer_script" if include_avatar else ""}: {"'8-10 second closer script'" if include_avatar else ""},
  {"avatar_hook_scripts" if include_avatar else ""}: {"['Hook clip 1 script', 'Hook clip 2 script']" if include_avatar else ""}
}}
"""

        script_writer = self._get_script_writer_agent()
        script_task = Task(
            description=script_task_description,
            expected_output="A valid JSON object containing the voiceover script, scene descriptions, stats, and headlines.",
            agent=script_writer,
        )

        # ── Step 3: Scene Planning (LLM) ───────────────────────────────────
        logger.info("Step 3/3: Planning scenes and assets...")

        # Use compact catalog for the prompt — agent calls TemplateMatcher tool
        # for filtered lookups and TemplateDetail for full prop definitions.
        # This saves ~400 tokens vs injecting the full catalog text every call.
        catalog_text = get_compact_catalog_text()

        style_instructions = ""
        if style_context and style_context.get("template_sequence"):
            seq = style_context["template_sequence"]
            style_instructions = f"\n=== STYLE OVERRIDE ACTIVE ===\n"
            style_instructions += "You MUST use the following sequence of templates as prescribed by the style preset:\n"
            for item in seq:
                style_instructions += f"- Scene {item.get('scene_number', '?')}: {item.get('template_id')}\n"
            style_instructions += "\nYou can still decide the props and duration, but the sequence of template IDs must match the above.\n"

        scene_task_description = f"""
Based on the script writer's output, plan the final video composition.

=== TEMPLATE LOOKUP TOOLS ===
You have two tools to query templates efficiently:
- TemplateMatcher: pass content_types list → get top matching templates
- TemplateDetail: pass template_id → get full prop definitions for chosen templates

Use TemplateMatcher FIRST to discover the best templates, then TemplateDetail
only for the templates you actually pick.

=== TEMPLATE OVERVIEW (compact — use tools for details) ===
{catalog_text}

=== VIDEO FORMAT ===
Format: {video_format}
Resolution: {chosen_format['resolution']['w']}×{chosen_format['resolution']['h']}
FPS: 30

=== INSTRUCTIONS ===
1. Call TemplateMatcher with the content types from the script to get ranked template suggestions.
2. Plan the video scene-by-scene.
3. For a REEL: Typically 3-6 scenes to keep it engaging for 30-60 seconds.
4. For a SHORT: Plan 8-15 scenes.
5. For a LONG video: Plan as many scenes as needed (30+).

CRITICAL INSTRUCTION FOR SCENE TEMPLATES:
- You MUST MIX AND MATCH the available templates.
- DO NOT use the same template repeatedly for every scene.
- Use `captioned_video` when the content is a voiceover video that needs auto-subtitles.
- Use `hero_headline` + `player_card` + `ticker_headline` combos to keep sports reels dynamic.
{style_instructions}

For each scene:
- Pick the best `template_id`.
- Calculate exact `start_frame` and `duration_frames`.
- Ensure scenes are contiguous (Scene 2 starts where Scene 1 ends).
- Scene 1 always starts at frame 0.

=== YOUR OUTPUT (STRICTLY JSON, no markdown) ===
Output a valid JSON object:
{{
  "scenes": [
    {{
      "scene_number": 1,
      "template_id": "hero_headline",
      "start_frame": 0,
      "duration_frames": 180,
      "props": {{
        "scene1Headline": "...",
        "heroSrc": "{{{{ASSET:hero_image_1}}}}"
      }},
      "description": "..."
    }},
    {{
      "scene_number": 2,
      "template_id": "player_card",
      "start_frame": 180,
      "duration_frames": 240,
      "props": {{
        "scene2Headline": "...",
        "playerName": "MESSI",
        "playerImage": "{{{{ASSET:player_image_1}}}}",
        "stats": [{{"label": "Goals", "value": "12"}}]
      }},
      "description": "..."
    }}
  ],
  "assets_needed": [
    {{
      "id": "hero_image_1",
      "type": "image",
      "description": "...",
      "scene": 1,
      "fallback_search_query": "..."
    }}
  ],
  "brand_colors": {{
    "bgColor": "#000000",
    "cardColor": "#1f7a6e",
    "cardAccent": "#e8b73b",
    "accent": "#FF2D2D"
  }}
}}
"""


        scene_planner = self._get_scene_planner_agent()
        scene_task = Task(
            description=scene_task_description,
            expected_output="A valid JSON object with scenes array, assets_needed array, and brand_colors.",
            agent=scene_planner,
        )

        # ── Execute Crew ───────────────────────────────────────────────────
        crew = Crew(
            agents=[script_writer, scene_planner],
            tasks=[script_task, scene_task],
            process=Process.sequential,
            verbose=True,
        )

        crew_result = crew.kickoff()
        result_str = str(crew_result)

        # ── Parse Results ──────────────────────────────────────────────────
        scene_plan = _safe_json_extract(result_str)

        # Also try to get the script writer's output from task outputs
        script_data = {}
        try:
            if hasattr(script_task, "output") and script_task.output:
                script_data = _safe_json_extract(str(script_task.output))
        except Exception:
            pass

        # ── Assemble VideoProductionPlan ────────────────────────────────────
        total_frames = 420  # Default
        if scene_plan.get("scenes"):
            last_scene = scene_plan["scenes"][-1]
            total_frames = last_scene.get("start_frame", 0) + last_scene.get("duration_frames", 240)

        # Build clips array from scene plan
        clips = self._build_clips(scene_plan.get("scenes", []))

        # Build props from scene plan and style context
        props = self._build_props(scene_plan, script_data, style_context)

        # Determine which Remotion composition to render based on the scene plan.
        # If ALL scenes use the captioned_video template, route to CaptionedVideo.
        # Everything else renders through PavilionReel.
        TEMPLATE_BY_ID = get_all_templates_by_id()
        planned_composition_ids = {
            TEMPLATE_BY_ID.get(s.get("template_id", ""), {}).get("composition_id", "PavilionReel")
            for s in scene_plan.get("scenes", [])
        }
        if planned_composition_ids == {"CaptionedVideo"}:
            props["_compositionId"] = "CaptionedVideo"
        else:
            props["_compositionId"] = "PavilionReel"
            # Inject resolved scenes array so PavilionReel renders modularly.
            # Asset placeholders ({{ASSET:xxx}}) are resolved later by inject_assets_into_plan.
            props["scenes"] = scene_plan.get("scenes", [])

        # Build assets list
        assets = scene_plan.get("assets_needed", [])
        # Add status fields
        for asset in assets:
            asset.setdefault("status", "needed")
            asset.setdefault("url", None)

        # ── Image Fetcher: resolve all {{ASSET:xxx}} placeholders ────────────────
        thumbnail_url = context.get("thumbnail_url", "")
        topic         = context.get("topic", "")
        try:
            fetcher  = ImageFetcherAgent()
            resolved = fetcher.resolve_all(
                assets_needed=assets,
                thumbnail_url=thumbnail_url,
                topic=topic,
            )
            logger.info(f"[Pipeline] ImageFetcher resolved {len(resolved)}/{len(assets)} assets")
        except Exception as img_err:
            logger.warning(f"[Pipeline] ImageFetcher failed (non-fatal): {img_err}")
            resolved = {}
            # At minimum, inject thumbnail into the first hero slot
            if thumbnail_url and assets:
                first_hero = next(
                    (a for a in assets if any(
                        k in (a.get('id','') + a.get('description','')).lower()
                        for k in ['hero', 'background', 'bg']
                    )),
                    assets[0],
                )
                resolved[first_hero['id']] = thumbnail_url

        elapsed = round(time.time() - start_time, 1)
        logger.info(f"Pipeline complete in {elapsed}s — {len(clips)} clips, {len(assets)} assets needed")

        plan = {
            "status": "success",
            "metadata": {
                "title": script_data.get("video_title", context["topic"][:80]),
                "video_format": video_format,
                "resolution": chosen_format["resolution"],
                "duration_seconds": round(total_frames / 30),
                "fps": 30,
                "total_frames": total_frames,
                "reference_url": reference_url,
                "created_at": datetime.utcnow().isoformat(),
                "pipeline_elapsed_seconds": elapsed,
            },
            "voiceover": {
                "script_plain": script_data.get("voiceover_script", ""),
                "estimated_duration_seconds": script_data.get("voiceover_duration_estimate_seconds", 0),
                "language": "ml-IN",
                "voice_id": "ml-IN-Chirp3-HD-Despina",
            },
            "avatar": {
                "needed": include_avatar,
                "opener_script": script_data.get("avatar_opener_script"),
                "closer_script": script_data.get("avatar_closer_script"),
                "hook_scripts": script_data.get("avatar_hook_scripts", []),
            },
            "scenes": scene_plan.get("scenes", []),
            "clips": clips,
            "props": props,
            "assets_needed": assets,
            # Backward compat: the old frontend reads modular_props
            "modular_props": props,
            "downloadable": {
                "timeline_script_md": self._generate_timeline_md(scene_plan, script_data, context),
                "audio_script_txt": script_data.get("voiceover_script", ""),
                "assets_checklist": self._generate_assets_checklist(assets),
            },
        }

        # ── Inject resolved asset URLs into all {{ASSET:xxx}} placeholders ──
        plan = inject_assets_into_plan(plan, resolved)

        # ── Also patch flat props directly for backward compat ───────────────
        # heroSrc: use first resolved hero asset
        if not plan["props"].get("heroSrc") or plan["props"]["heroSrc"].startswith("{{"):
            hero_url = next(
                (url for aid, url in resolved.items()
                 if any(k in aid.lower() for k in ["hero", "bg", "background"])),
                thumbnail_url or "",
            )
            plan["props"]["heroSrc"]     = hero_url
            plan["modular_props"]["heroSrc"] = hero_url

        # playerImage: use first resolved player asset
        if not plan["props"].get("playerImage") or plan["props"]["playerImage"].startswith("{{"):
            player_url = next(
                (url for aid, url in resolved.items()
                 if "player" in aid.lower()),
                "",
            )
            if player_url:
                plan["props"]["playerImage"]     = player_url
                plan["modular_props"]["playerImage"] = player_url

        return plan


    # ── Internal Builders ──────────────────────────────────────────────────

    def _build_clips(self, scenes: list) -> list:
        """Build the Redux-compatible clips array from scene plan."""
        clips = []
        total_frames = 0
        
        # Track assignments
        VO_TRACK = 0
        CHROME_TRACK = 1
        SCENE_TRACK_START = 2
        
        # 1. Build Scene Clips
        TEMPLATE_BY_ID = get_all_templates_by_id()
        for i, scene in enumerate(scenes):
            template_id = scene.get("template_id", "")
            template = TEMPLATE_BY_ID.get(template_id)
            if not template:
                continue

            start = scene.get("start_frame", 0)
            duration = scene.get("duration_frames", template["duration_frames_default"])
            end = start + duration
            if end > total_frames:
                total_frames = end

            # Add each clip from the template
            for clip_def in template["clips"]:
                # Adjust timing relative to scene start
                # Hero/BG clips usually cover the whole scene duration
                is_hero = "hero" in clip_def["id"] or "bg" in clip_def["id"]
                
                clips.append({
                    **clip_def,
                    "id": f"scene_{i+1}_{clip_def['id']}",
                    "templateClipId": clip_def['id'],
                    "label": f"S{i+1}: {clip_def['label']}",
                    "globalStartFrame": start if is_hero else start + 30,
                    "durationFrames": duration if is_hero else duration - 30,
                    "scene": i + 1,
                    "track": SCENE_TRACK_START + clip_def.get("track", 0),
                    "offsetX": 0, "offsetY": 0, "scaleX": 1, "scaleY": 1,
                    "customProps": scene.get("props", {}),
                })

        # 2. Add Global Tracks (Voiceover & Chrome)
        if total_frames == 0:
            total_frames = 300
            
        clips.insert(0, {
            "id": "audio",
            "label": "Voiceover",
            "globalStartFrame": 0,
            "durationFrames": total_frames,
            "scene": 0,
            "track": VO_TRACK,
            "color": "#6366f1",
            "offsetX": 0, "offsetY": 0, "scaleX": 1, "scaleY": 1
        })
        
        clips.insert(1, {
            "id": "chrome",
            "label": "Top Chrome",
            "globalStartFrame": 0,
            "durationFrames": total_frames,
            "scene": 0,
            "track": CHROME_TRACK,
            "color": "#0284c7",
            "offsetX": 0, "offsetY": 0, "scaleX": 1, "scaleY": 1
        })

        return clips

    def _build_props(self, scene_plan: dict, script_data: dict, style_context: dict = None) -> dict:
        """Build the Remotion props dict from scene plan + script data."""
        props = {
            "bgColor": "#000000",
            "cardColor": "#1f7a6e",
            "cardAccent": "#e8b73b",
            "accent": "#FF2D2D",
            "brandName": "PAVILIONEND",
            "logoSrc": "",
            "scene1Headline": script_data.get("headline_malayalam", ""),
            "scene2Headline": script_data.get("sub_headline_malayalam", ""),
            "playerName": "",
            "playerImage": "",
            "heroSrc": "",
            "stats": script_data.get("stats", [{"label": "Goals", "value": "0"}]),
            "scene1HeadlineColor": "#ffffff",
            "scene1HeadlineFontSize": 78,
            "scene1HeadlineFont": "Anek Malayalam",
            "scene2HeadlineColor": "#ffffff",
            "scene2HeadlineFontSize": 64,
            "scene2HeadlineFont": "Anek Malayalam",
        }

        # Merge brand colors from scene plan
        brand = scene_plan.get("brand_colors", {})
        for key in ["bgColor", "cardColor", "cardAccent", "accent"]:
            if brand.get(key):
                props[key] = brand[key]

        # Apply style context overrides (takes precedence over scene plan)
        if style_context and style_context.get("brand_colors"):
            for key, val in style_context["brand_colors"].items():
                props[key] = val

        # Extract props from scenes
        for scene in scene_plan.get("scenes", []):
            scene_props = scene.get("props", {})
            for key, val in scene_props.items():
                if key == "stats" and isinstance(val, list):
                    props["stats"] = val
                elif isinstance(val, str) and not val.startswith("{{ASSET"):
                    props[key] = val

        # Extract player names
        players = script_data.get("player_names", [])
        if players and not props["playerName"]:
            props["playerName"] = players[0].upper()

        return props

    def _generate_timeline_md(self, scene_plan: dict, script_data: dict, context: dict) -> str:
        """Generate a downloadable timeline script in Markdown."""
        lines = [
            f"# Video Production Brief — {script_data.get('video_title', context['topic'][:50])}",
            f"",
            f"**Generated:** {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
            f"**Reference:** {context.get('topic', 'N/A')}",
            f"",
            f"## Voiceover Script (Malayalam)",
            f"",
            script_data.get("voiceover_script", "_No script generated_"),
            f"",
            f"## Scene Breakdown",
            f"",
        ]

        for scene in scene_plan.get("scenes", []):
            start_s = round(scene.get("start_frame", 0) / 30, 1)
            end_s = round((scene.get("start_frame", 0) + scene.get("duration_frames", 0)) / 30, 1)
            lines.append(f"### Scene {scene.get('scene_number', '?')} — {scene.get('template_id', '?')} ({start_s}s – {end_s}s)")
            lines.append(f"_{scene.get('description', '')}_")
            lines.append(f"")

        hooks = script_data.get("key_hooks", [])
        if hooks:
            lines.append(f"## Key Hooks")
            for i, h in enumerate(hooks, 1):
                lines.append(f"{i}. {h}")
            lines.append("")

        return "\n".join(lines)

    def _generate_assets_checklist(self, assets: list) -> list:
        """Generate a structured assets checklist."""
        return [
            {
                "id": a.get("id", ""),
                "type": a.get("type", ""),
                "description": a.get("description", ""),
                "status": a.get("status", "needed"),
                "url": a.get("url"),
                "search_query": a.get("fallback_search_query", ""),
            }
            for a in assets
        ]
