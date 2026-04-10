import os
import requests
import time
import logging
import base64
from django.conf import settings
from google.cloud import texttospeech
from .video_generator import upload_to_blob, generate_script
import json

logger = logging.getLogger(__name__)

def process_step_a_audio(dna, article_id=None):
    """
    Step A: Generate Malayalam audio. 
    Prioritizes ElevenLabs for 'well-toned' quality, falls back to Google Chirp.
    """
    try:
        audio_config = dna.get('step_A_audio', {})
        ssml_content = audio_config.get('ssml')
        text_content = audio_config.get('text') or ssml_content # Fallback to cleaned text
        
        if not text_content:
            logger.error("No content found in Step A DNA")
            return None

        # 1. Try ElevenLabs if API key is present
        elevenlabs_key = os.getenv("ELEVENLABS_API_KEY")
        if elevenlabs_key:
            try:
                voice_id = os.getenv("ELEVENLABS_MALAYALAM_VOICE_ID", "George") # Best for News
                url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
                
                headers = {
                    "Accept": "audio/mpeg",
                    "Content-Type": "application/json",
                    "xi-api-key": elevenlabs_key
                }
                
                data = {
                    "text": text_content,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                        "style": 0.5,
                        "use_speaker_boost": True
                    }
                }
                
                response = requests.post(url, json=data, headers=headers)
                if response.status_code == 200:
                    filename = f"elevenlabs_audio_{article_id or 'temp'}_{int(time.time())}.mp3"
                    return upload_to_blob(response.content, filename)
                else:
                    logger.warning(f"ElevenLabs failed ({response.status_code}): {response.text}. Falling back to Google.")
            except Exception as e:
                logger.error(f"ElevenLabs error: {e}. Falling back to Google.")

        # 2. Fallback to Google Cloud TTS (Chirp)
        client = texttospeech.TextToSpeechClient()
        synthesis_input = texttospeech.SynthesisInput(ssml=ssml_content if '<speak>' in str(ssml_content) else None, text=text_content if '<speak>' not in str(text_content) else None)
        
        voice = texttospeech.VoiceSelectionParams(
            language_code="ml-IN",
            name="ml-IN-Chirp3-HD-Zephyr"
        )
        
        audio_config_params = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )
        
        response = client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config_params
        )
        
        timestamp = int(time.time())
        filename = f"newsroomx_audio_{article_id or 'temp'}_{timestamp}.mp3"
        return upload_to_blob(response.audio_content, filename)
    except Exception as e:
        logger.error(f"Error in Step A (Audio): {e}", exc_info=True)
        return None

def process_step_b_avatar(audio_url, dna):
    """
    Step B: Generate talking head video using D-ID API.
    """
    try:
        avatar_config = dna.get('step_B_avatar', {})
        source_url = avatar_config.get('avatar_url', "https://milieumedia.in/assets/anchor_male_01.jpg")
        
        api_key = os.getenv("D_ID_API_KEY")
        if not api_key:
            logger.error("D_ID_API_KEY not found")
            return None
            
        url = "https://api.d-id.com/talks"
        
        payload = {
            "source_url": source_url,
            "script": {
                "type": "audio",
                "audio_url": audio_url
            },
            "config": {
                "stitch": True,
                "result_format": "mp4",
                "aspect_ratio": "9:16" # NewsroomX focused on Reels/Shorts
            }
        }
        
        auth_header = api_key
        if ":" in api_key:
            auth_header = base64.b64encode(api_key.encode()).decode()
            
        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Basic {auth_header}"
        }
        
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code != 201:
            logger.error(f"D-ID API error: {response.text}")
            return None
            
        talk_id = response.json().get("id")
        
        # Polling for D-ID status
        max_attempts = 30
        for _ in range(max_attempts):
            status_url = f"https://api.d-id.com/talks/{talk_id}"
            res = requests.get(status_url, headers=headers)
            status_data = res.json()
            
            if status_data.get("status") == "done":
                return status_data.get("result_url")
            elif status_data.get("status") == "error":
                logger.error(f"D-ID generation error: {status_data}")
                return None
            
            time.sleep(10)
            
        return None
    except Exception as e:
        logger.error(f"Error in Step B (Avatar): {e}", exc_info=True)
        return None

def process_step_c_composition(avatar_video_url, dna):
    """
    Step C: Final news composition using Creatomate API.
    """
    try:
        comp_config = dna.get('step_C_composition', {})
        template_id = comp_config.get('template', 'newsroom_x_reels_v3')
        layers = comp_config.get('layers', {})
        
        api_key = os.getenv("CREATOMATE_API_KEY")
        if not api_key:
            logger.error("CREATOMATE_API_KEY not found. Attempting to use a placeholder for testing.")
            # For now, we will fail if no key is present to avoid confusion, 
            # but in a real app we might return the inputs for manual editing.
            return None
            
        url = "https://api.creatomate.com/v1/renders"
        
        # Modifications for Creatomate
        # We need to map the DNA layers to Creatomate modifications
        # We also need to add the D-ID avatar video as a layer named 'anchor_video' 
        # (Assuming the template has this layer)
        modifications = {
            "Headline": layers.get("headline", ""),
            "Ticker": layers.get("ticker", ""),
            "Media": layers.get("main_media", ""),
            "Avatar_Video": avatar_video_url # The talking head from Step B
        }
        
        payload = {
            "template_id": template_id,
            "modifications": modifications
        }
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            logger.error(f"Creatomate API error: {response.text}")
            return None
            
        render_id = response.json()[0].get("id")
        
        # Polling for Creatomate status
        for _ in range(30):
            status_url = f"https://api.creatomate.com/v1/renders/{render_id}"
            res = requests.get(status_url, headers=headers)
            status_data = res.json()
            
            if status_data.get("status") == "succeeded":
                return status_data.get("url")
            elif status_data.get("status") == "failed":
                logger.error(f"Creatomate render error: {status_data}")
                return None
                
            time.sleep(5)
            
        return None
    except Exception as e:
        logger.error(f"Error in Step C (Composition): {e}", exc_info=True)
        return None

def process_step_d_edit_link(avatar_video_url, dna):
    """
    Step D: Generate an Editor URL for Creatomate.
    Constructed manually via query parameters for template_id and modifications.
    """
    try:
        import urllib.parse
        import json
        
        comp_config = dna.get('step_C_composition', {})
        template_id = comp_config.get('template', 'newsroom_x_reels_v3')
        layers = comp_config.get('layers', {})
        
        modifications = {
            "Headline": layers.get("headline", ""),
            "Ticker": layers.get("ticker", ""),
            "Media": layers.get("main_media", ""),
            "Avatar_Video": avatar_video_url
        }
        
        # URL encode the modifications JSON
        mod_json = json.dumps(modifications)
        encoded_mods = urllib.parse.quote(mod_json)
        
        # Construct the specialized editor URL
        editor_url = f"https://editor.creatomate.com/?template_id={template_id}&modifications={encoded_mods}"
        
        return editor_url
    except Exception as e:
        logger.error(f"Error in Step D (Editor URL Construction): {e}", exc_info=True)
        return None

def execute_newsroomx_pipeline(article):
    """
    Orchestrate the A_B_C_D sequence.
    """
    dna = article.newsroomx_dna
    if not dna:
        article.newsroomx_error = "No NewsroomX DNA found."
        article.newsroomx_status = "failed"
        article.save()
        return
    
    # Ensure DNA is a dictionary (it might be a JSON string from the DB)
    if isinstance(dna, str):
        try:
            dna = json.loads(dna)
        except Exception as e:
            article.newsroomx_error = f"Malformed DNA JSON: {e}"
            article.newsroomx_status = "failed"
            article.save()
            return
        
    try:
        # Step A: Audio
        article.newsroomx_status = "step_a_audio"
        article.save()
        audio_url = process_step_a_audio(dna, article.id)
        if not audio_url:
            raise Exception("Failed to generate audio (Step A)")
            
        # Step B: Avatar
        article.newsroomx_status = "step_b_avatar"
        article.save()
        avatar_url = process_step_b_avatar(audio_url, dna)
        if not avatar_url:
            raise Exception("Failed to generate avatar video (Step B)")
            
        # Step C: Composition (Optional background render)
        # We can still do a background render, but the primary goal is the Edit Link for handoff
        
        # Step D: Edit Link (Handoff to Platform)
        article.newsroomx_status = "step_c_composition" # Reusing status key for simplicity in UI
        article.save()
        edit_url = process_step_d_edit_link(avatar_url, dna)
        if not edit_url:
             raise Exception("Failed to generate Edit Link (Step D)")
            
        # Completion
        article.newsroomx_video_url = edit_url # Store the edit link as the primary URL
        article.newsroomx_status = "completed"
        article.newsroomx_error = ""
        article.save()
        logger.info(f"NewsroomX Pipeline completed for article {article.id}: {edit_url}")
        
    except Exception as e:
        article.newsroomx_status = "failed"
        article.newsroomx_error = str(e)
        article.save()
        logger.error(f"NewsroomX Pipeline failed for article {article.id}: {e}")
