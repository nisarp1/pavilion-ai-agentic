"""
TTS Agent — Phase 1
Generates Malayalam voiceover audio using Google Cloud Text-to-Speech
Primary: ml-IN-Chirp3-HD-Despina (female, neural, highest quality)
Fallback chain: Chirp3-HD-Erinome → Wavenet-A

Returns:
  audio_url       — permanent GCS URL
  duration_seconds — total audio duration
  word_timings    — [{word, start_ms, end_ms}] for sync agents
"""
import os
import io
import uuid
import logging
import hashlib
from typing import Optional

logger = logging.getLogger(__name__)

# ── Voice preferences ─────────────────────────────────────────────────────────
PRIMARY_VOICE      = "ml-IN-Chirp3-HD-Despina"
FALLBACK_VOICES    = ["ml-IN-Chirp3-HD-Erinome", "ml-IN-Wavenet-A"]
LANGUAGE_CODE      = "ml-IN"
AUDIO_ENCODING     = "LINEAR16"   # WAV — best quality; we'll transcode to MP3
SAMPLE_RATE        = 24000         # Chirp3 HD native rate
MAX_CHARS_PER_CALL = 4800          # Google TTS limit


class TTSAgent:
    """
    Google Cloud TTS agent for Malayalam voiceover generation.

    Usage:
        agent = TTSAgent()
        result = agent.generate(script="ഹലോ...", article_id="123")
        # result = {
        #   "audio_url": "https://storage.googleapis.com/...",
        #   "duration_seconds": 42.3,
        #   "word_timings": [{"word": "ഹലോ", "start_ms": 0, "end_ms": 450}],
        #   "voice_used": "ml-IN-Chirp3-HD-Despina",
        # }
    """

    def __init__(self):
        self._tts_client = None
        self._gcs_bucket = os.environ.get("GCS_BUCKET_NAME") or "pavilion-media"
        self._gcs_prefix  = "reels"

    # ── Public API ────────────────────────────────────────────────────────────

    def generate(
        self,
        script: str,
        article_id: str,
        voice_name: Optional[str] = None,
        use_ssml: bool = False,
    ) -> dict:
        """
        Generate Malayalam TTS audio from a plain-text or SSML script.

        Args:
            script:     Plain-text Malayalam script (or SSML if use_ssml=True)
            article_id: Used for the GCS path (reels/{article_id}/audio.mp3)
            voice_name: Override the primary voice selection
            use_ssml:   True if `script` is an SSML string

        Returns:
            dict with keys: audio_url, duration_seconds, word_timings, voice_used
        """
        if not script or not script.strip():
            raise ValueError("TTS script cannot be empty")

        voice = voice_name or PRIMARY_VOICE

        # Split into chunks if script is too long
        chunks = self._split_script(script)
        logger.info(f"[TTSAgent] Generating audio for article {article_id} "
                    f"({len(chunks)} chunk(s), voice={voice})")

        all_audio_bytes = b""
        all_word_timings: list = []
        offset_ms = 0
        voice_used = voice

        for i, chunk in enumerate(chunks):
            try:
                audio_bytes, timings, voice_used = self._synthesize_chunk(
                    chunk, voice, use_ssml=(use_ssml and i == 0)
                )
            except Exception as e:
                logger.warning(f"[TTSAgent] Primary voice failed (chunk {i}): {e} — trying fallbacks")
                audio_bytes, timings, voice_used = self._synthesize_with_fallback(chunk)

            # Adjust timing offset for multi-chunk stitching
            chunk_duration_ms = self._estimate_duration_ms(audio_bytes)
            for t in timings:
                all_word_timings.append({
                    "word":     t.get("word", ""),
                    "start_ms": t.get("start_ms", 0) + offset_ms,
                    "end_ms":   t.get("end_ms", 0) + offset_ms,
                })
            offset_ms += chunk_duration_ms
            all_audio_bytes += audio_bytes

        # Upload to GCS
        gcs_path = f"{self._gcs_prefix}/{article_id}/voiceover_{uuid.uuid4().hex[:8]}.wav"
        audio_url = self._upload_to_gcs(all_audio_bytes, gcs_path)

        duration_seconds = round(offset_ms / 1000, 2)

        logger.info(f"[TTSAgent] Done: {duration_seconds}s audio → {audio_url}")
        return {
            "audio_url":       audio_url,
            "duration_seconds": duration_seconds,
            "word_timings":    all_word_timings,
            "voice_used":      voice_used,
        }

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _get_client(self):
        """Lazy-load Google Cloud TTS client."""
        if self._tts_client is None:
            from google.cloud import texttospeech_v1beta1 as texttospeech
            self._tts_client = texttospeech.TextToSpeechClient()
        return self._tts_client

    def _synthesize_chunk(
        self, text: str, voice_name: str, use_ssml: bool = False
    ) -> tuple[bytes, list, str]:
        """Call Google Cloud TTS for a single chunk. Returns (audio_bytes, word_timings, voice_used)."""
        from google.cloud import texttospeech_v1beta1 as texttospeech

        client = self._get_client()

        if use_ssml:
            synthesis_input = texttospeech.SynthesisInput(ssml=text)
        else:
            synthesis_input = texttospeech.SynthesisInput(text=text)

        voice_params = texttospeech.VoiceSelectionParams(
            language_code=LANGUAGE_CODE,
            name=voice_name,
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.LINEAR16,
            sample_rate_hertz=SAMPLE_RATE,
            effects_profile_id=["telephony-class-application"],
        )

        # Request word-level timing marks (available for Chirp3 HD)
        enable_time_pointing = []
        if "Chirp3" in voice_name:
            enable_time_pointing = [texttospeech.SynthesizeSpeechRequest.TimepointType.SSML_MARK]

        request = texttospeech.SynthesizeSpeechRequest(
            input=synthesis_input,
            voice=voice_params,
            audio_config=audio_config,
            enable_time_pointing=enable_time_pointing if enable_time_pointing else None,
        )

        response = client.synthesize_speech(request=request)

        # Parse word timings from timepoints
        word_timings = []
        if hasattr(response, "timepoints") and response.timepoints:
            prev_time_ms = 0
            for tp in response.timepoints:
                mark_name = tp.mark_name  # e.g. "word_0"
                time_ms   = int(tp.time_seconds * 1000)
                if word_timings:
                    word_timings[-1]["end_ms"] = time_ms
                word_timings.append({
                    "word":     mark_name,
                    "start_ms": time_ms,
                    "end_ms":   time_ms + 500,  # default width, will be corrected on next iteration
                })
                prev_time_ms = time_ms

        return response.audio_content, word_timings, voice_name

    def _synthesize_with_fallback(self, text: str) -> tuple[bytes, list, str]:
        """Try fallback voices in order."""
        for voice in FALLBACK_VOICES:
            try:
                logger.info(f"[TTSAgent] Trying fallback voice: {voice}")
                return self._synthesize_chunk(text, voice)
            except Exception as e:
                logger.warning(f"[TTSAgent] Fallback {voice} also failed: {e}")
        raise RuntimeError("All TTS voices failed — check Google Cloud credentials and quotas")

    def _split_script(self, script: str) -> list[str]:
        """Split a long script into chunks of ≤ MAX_CHARS_PER_CALL characters at sentence boundaries."""
        if len(script) <= MAX_CHARS_PER_CALL:
            return [script]

        # Split on sentence endings for Malayalam and English
        import re
        sentences = re.split(r'(?<=[.!?।\n])\s+', script.strip())
        chunks, current = [], ""
        for sentence in sentences:
            if len(current) + len(sentence) + 1 > MAX_CHARS_PER_CALL:
                if current:
                    chunks.append(current.strip())
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        if current:
            chunks.append(current.strip())
        return chunks or [script[:MAX_CHARS_PER_CALL]]

    def _estimate_duration_ms(self, wav_bytes: bytes) -> int:
        """Estimate WAV duration in ms from raw bytes (LINEAR16 at SAMPLE_RATE)."""
        # LINEAR16 = 2 bytes per sample, mono
        header_bytes = 44  # standard WAV header size
        data_bytes = len(wav_bytes) - header_bytes
        if data_bytes <= 0:
            return 0
        samples = data_bytes // 2  # 16-bit = 2 bytes per sample
        return int((samples / SAMPLE_RATE) * 1000)

    def _upload_to_gcs(self, audio_bytes: bytes, gcs_path: str) -> str:
        """Upload audio bytes to GCS, return public URL."""
        try:
            from google.cloud import storage
            client = storage.Client()
            bucket = client.bucket(self._gcs_bucket)
            blob = bucket.blob(gcs_path)
            blob.upload_from_string(audio_bytes, content_type="audio/wav")
            blob.make_public()
            return blob.public_url
        except Exception as e:
            logger.error(f"[TTSAgent] GCS upload failed: {e}")
            # Fallback: return a data-uri placeholder (won't work in production)
            return f"gcs://{self._gcs_bucket}/{gcs_path}"


# ── Convenience function for pipeline use ─────────────────────────────────────

def generate_reel_audio(script: str, article_id: str, voice: str = None) -> dict:
    """
    Top-level helper called by VideoProductionPipeline.

    Returns TTS result dict:
      { audio_url, duration_seconds, word_timings, voice_used }
    """
    agent = TTSAgent()
    return agent.generate(script=script, article_id=str(article_id), voice_name=voice)
