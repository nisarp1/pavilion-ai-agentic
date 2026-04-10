import os
import requests
import time
import logging
from django.conf import settings
import google.generativeai as gemini
from google.cloud import texttospeech
from vercel_blob import put

logger = logging.getLogger(__name__)

# Constants for Anchor Images (to be overridden by .env if needed)
DEFAULT_ANCHOR_LANDSCAPE = os.getenv("ANCHOR_IMAGE_LANDSCAPE_URL", "https://pavilionend.com/wp-content/uploads/2026/03/anchor_landscape.jpg")
DEFAULT_ANCHOR_PORTRAIT = os.getenv("ANCHOR_IMAGE_PORTRAIT_URL", "https://pavilionend.com/wp-content/uploads/2026/03/anchor_portrait.jpg")

def generate_script(article_text, format="portrait"):
    """
    Generate a high-energy Malayalam sports news script using Gemini.
    Uses the same API key and model as the rest of the codebase (settings.GEMINI_API_KEY).
    """
    try:
        api_key = getattr(settings, 'GEMINI_API_KEY', '') or os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            logger.error("GEMINI_API_KEY is not configured. Cannot generate video script.")
            return None

        gemini.configure(api_key=api_key)

        # Use the same model setting as the rest of the codebase
        model_name = getattr(settings, 'GEMINI_MODEL', 'gemini-2.0-flash')

        if format == "portrait":
            prompt = (
                f"Generate a high-energy, punchy Malayalam sports news script for an Instagram Reel/Short. "
                f"Maximum 110 words. Focus on the most exciting parts of this article: {article_text}. "
                f"The script should sound like a professional sports anchor. Use Malayalam script only."
            )
        else:
            prompt = (
                f"Generate a high-energy, 50-60 second Malayalam sports news script for a YouTube video. "
                f"Provide enough content for nearly a minute of narration. Focus on this article: {article_text}. "
                f"The script should sound like a professional sports anchor. Use Malayalam script only."
            )

        try:
            model = gemini.GenerativeModel(model_name)
            response = model.generate_content(prompt)
        except Exception as model_err:
            logger.warning(f"Model {model_name} failed: {model_err}. Retrying with gemini-1.5-flash.")
            model = gemini.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(prompt)

        if response and response.text:
            return response.text.strip()
        else:
            logger.error("Gemini returned an empty response for video script.")
            return None
    except Exception as e:
        logger.error(f"Error generating script via Gemini: {e}", exc_info=True)
        return None

def generate_audio(script_content):
    """
    Generate Malayalam audio using Google Cloud TTS (Neural2/Wavenet).
    """
    try:
        client = texttospeech.TextToSpeechClient()
        
        input_text = texttospeech.SynthesisInput(text=script_content)
        
        voice = texttospeech.VoiceSelectionParams(
            language_code="ml-IN",
            name="ml-IN-Wavenet-B", # High quality Wavenet voice
            ssml_gender=texttospeech.SsmlVoiceGender.MALE
        )
        
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            pitch=1.0,
            speaking_rate=1.05 # Slightly faster for 'high-energy'
        )
        
        response = client.synthesize_speech(
            input=input_text, voice=voice, audio_config=audio_config
        )
        
        return response.audio_content
    except Exception as e:
        logger.error(f"Error generating audio via Google TTS: {e}", exc_info=True)
        return None

def upload_to_blob(content, filename):
    """
    Upload content to Vercel Blob and return the public URL.
    """
    try:
        # vercel-blob expects a file-like object or bytes
        # The Python SDK might vary, but typically it takes (filename, data, options)
        # Assuming vercel-blob 0.x SDK patterns
        token = os.getenv("VERCEL_BLOB_READ_WRITE_TOKEN")
        if not token:
            logger.error("VERCEL_BLOB_READ_WRITE_TOKEN not found in environment.")
            return None
            
        blob = put(filename, content, {"token": token})
        return blob.get("url")
    except Exception as e:
        logger.error(f"Error uploading to Vercel Blob: {e}", exc_info=True)
        return None

def request_did_video(audio_url, format="portrait"):
    """
    Call D-ID API to generate a video talk.
    Handles Basic Auth by encoding 'user:pass'.
    The D_ID_API_KEY environment variable should be in 'username:password' format
    as provided by the D-ID Studio.
    """
    try:
        api_key = os.getenv("D_ID_API_KEY")
        if not api_key:
            logger.error("D_ID_API_KEY not found in environment.")
            return None
            
        url = "https://api.d-id.com/talks"
        
        source_url = DEFAULT_ANCHOR_PORTRAIT if format == "portrait" else DEFAULT_ANCHOR_LANDSCAPE
        
        payload = {
            "source_url": source_url,
            "script": {
                "type": "audio",
                "audio_url": audio_url
            },
            "config": {
                "stitch": True,
                "result_format": "mp4",
                "fluent": "false",
                "pad_audio": "0.0"
            }
        }
        
        if format == "portrait":
            payload["config"]["aspect_ratio"] = "9:16"
        else:
            payload["config"]["aspect_ratio"] = "16:9"
            
        # D-ID Basic Auth construction
        import base64
        auth_header = api_key
        
        # If the key contains a colon, it's the raw 'username:password' (even if username is base64 email)
        # We must encode the whole string to base64 for the Basic header.
        if ":" in api_key:
            auth_header = base64.b64encode(api_key.encode()).decode()
        else:
            # If no colon, we assume it's already the full base64 token
            pass
            
        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Basic {auth_header}"
        }
        
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code != 201:
            logger.error(f"D-ID API returned {response.status_code}: {response.text}")
            # If 403, it's likely a trial restriction or credit issue.
            if response.status_code == 403:
                logger.warning("D-ID API returned 403 Forbidden. This often happens on Trial plans for certain API operations.")
            response.raise_for_status()
            
        data = response.json()
        return data.get("id")
    except Exception as e:
        logger.error(f"Error requesting D-ID video: {e}", exc_info=True)
        return None

def get_did_status(talk_id):
    """
    Get the status of a D-ID talk.
    """
    try:
        api_key = os.getenv("D_ID_API_KEY")
        url = f"https://api.d-id.com/talks/{talk_id}"
        
        import base64
        auth_header = api_key
        if ":" in api_key:
            auth_header = base64.b64encode(api_key.encode()).decode()
            
        headers = {
            "accept": "application/json",
            "authorization": f"Basic {auth_header}"
        }
        
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        return response.json()
    except Exception as e:
        logger.error(f"Error getting D-ID status for {talk_id}: {e}", exc_info=True)
        return None

def generate_sports_video(article_text, format="portrait", post_id=None, script_content=None):
    """
    Orchestrate the entire video generation pipeline.
    If script_content is provided, it skips script generation.
    """
    logger.info(f"Starting video generation for post_id: {post_id}, format: {format}")
    
    # 1. Script Generation (only if not provided)
    if not script_content:
        script_content = generate_script(article_text, format)
        if not script_content:
            return {"error": "Failed to generate script"}
        
    # 2. Audio Generation
    audio_data = generate_audio(script_content)
    if not audio_data:
        return {"error": "Failed to generate audio"}
        
    # 3. Upload Audio to Vercel Blob
    timestamp = int(time.time())
    audio_filename = f"audio_{post_id or 'temp'}_{timestamp}.mp3"
    audio_url = upload_to_blob(audio_data, audio_filename)
    if not audio_url:
        return {"error": "Failed to upload audio to blob"}
        
    # 4. Request D-ID Video
    talk_id = request_did_video(audio_url, format)
    if not talk_id:
        return {"error": "Failed to request D-ID video"}
        
    return {
        "status": "pending",
        "talk_id": talk_id,
        "audio_url": audio_url,
        "script_content": script_content,
        "format": format,
        "post_id": post_id
    }
