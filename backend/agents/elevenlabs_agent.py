"""
ElevenLabs TTS Agent
Generates Malayalam voiceover using the official ElevenLabs Python SDK.

Manually triggered only — paid API. Not part of the automated pipeline.

Env vars required:
  ELEVENLABS_API_KEY              — ElevenLabs API key
  ELEVENLABS_MALAYALAM_VOICE_ID   — Voice ID (e.g. iP95p4xoKVk53GoZ742B)

SDK settings (from ElevenLabs backend reference):
  model_id      : eleven_v3
  language_code : ml
  seed          : None

Audio is saved as a local Django media file (same pattern as the TTS pipeline)
to avoid GCS uniform-bucket-level-access ACL restrictions.
"""
import os
import uuid
import logging

logger = logging.getLogger(__name__)


class ElevenLabsAgent:
    def __init__(self):
        self._api_key  = os.environ.get("ELEVENLABS_API_KEY", "")
        self._voice_id = os.environ.get("ELEVENLABS_MALAYALAM_VOICE_ID", "")

    def synthesize(self, script: str) -> bytes:
        """
        Call the ElevenLabs API and return raw MP3 bytes.
        Validates config and raises ValueError on misconfiguration.
        """
        if not self._api_key:
            raise ValueError("ELEVENLABS_API_KEY is not set in environment")
        if not self._voice_id:
            raise ValueError("ELEVENLABS_MALAYALAM_VOICE_ID is not set in environment")
        if not script or not script.strip():
            raise ValueError("Voiceover script cannot be empty")

        from elevenlabs.client import ElevenLabs

        client   = ElevenLabs(api_key=self._api_key)
        response = client.text_to_speech.convert(
            voice_id=self._voice_id,
            text=script,
            model_id="eleven_v3",
            language_code="ml",
            seed=None,
        )

        # SDK returns Iterator[bytes] in v2.x — collect all chunks
        if isinstance(response, bytes):
            return response
        return b"".join(response)
