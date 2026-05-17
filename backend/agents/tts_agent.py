"""
TTS Agent
Generates Malayalam voiceover audio using Google Cloud Text-to-Speech.
Primary: ml-IN-Chirp3-HD-Despina (female, Chirp3 HD)
Fallback chain: Chirp3-HD-Erinome → Wavenet-A

Returns:
  audio_url        — permanent GCS URL
  duration_seconds — total audio duration
  word_timings     — [{word, start_ms, end_ms}] for caption sync
  voice_used       — actual voice name used
"""
import html as _html_lib
import os
import re
import uuid
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ── Voice preferences ─────────────────────────────────────────────────────────
PRIMARY_VOICE      = "ml-IN-Chirp3-HD-Despina"
FALLBACK_VOICES    = ["ml-IN-Chirp3-HD-Erinome", "ml-IN-Wavenet-A"]
LANGUAGE_CODE      = "ml-IN"
AUDIO_ENCODING     = "LINEAR16"   # WAV — best quality
SAMPLE_RATE        = 24000         # Chirp3 HD native rate
MAX_CHARS_PER_CALL = 4800          # Google TTS limit


# ── Module-level SSML helpers (reusable) ──────────────────────────────────────

def _inject_word_marks(text: str, rate: str = "1.05") -> tuple:
    """
    Wrap each word with an SSML <mark> tag.
    Returns (ssml_string, word_list).
    The TTS engine fires a timepoint per mark, giving per-word timing.
    Chirp3-HD rejects <prosody pitch>, so only rate is used.
    """
    words = [w for w in re.split(r"\s+", text.strip()) if w]
    parts = [f'<mark name="w_{i}"/>{_html_lib.escape(w)}' for i, w in enumerate(words)]
    ssml = f'<speak><prosody rate="{rate}">{ " ".join(parts)}</prosody></speak>'
    return ssml, words


def _parse_word_timepoints(timepoints, words: list, total_duration_ms: int) -> list:
    """
    Convert Google TTS timepoints into [{word, start_ms, end_ms}].
    Each timepoint.mark_name is 'w_N'; the next mark's time = this word's end.
    """
    valid = [tp for tp in timepoints if tp.mark_name.startswith("w_")]
    result = []
    for i, tp in enumerate(valid):
        try:
            idx = int(tp.mark_name.split("_")[1])
        except (IndexError, ValueError):
            continue
        start_ms = int(tp.time_seconds * 1000)
        end_ms = int(valid[i + 1].time_seconds * 1000) if i + 1 < len(valid) else total_duration_ms
        if idx < len(words):
            result.append({"word": words[idx], "start_ms": start_ms, "end_ms": end_ms})
    return result


def _uniform_word_timings(words: list, total_duration_ms: int) -> list:
    """Evenly distribute duration across words."""
    if not words:
        return []
    word_ms = total_duration_ms / len(words)
    return [
        {"word": w, "start_ms": int(i * word_ms), "end_ms": int((i + 1) * word_ms)}
        for i, w in enumerate(words)
    ]


def _proportional_word_timings(words: list, total_duration_ms: int) -> list:
    """Distribute timing proportionally by character count (Malayalam syllable proxy)."""
    if not words:
        return []
    total_chars = sum(len(w) for w in words)
    if total_chars == 0:
        return _uniform_word_timings(words, total_duration_ms)
    elapsed_ms = 0
    result = []
    for i, word in enumerate(words):
        start_ms = elapsed_ms
        elapsed_ms += int((len(word) / total_chars) * total_duration_ms)
        end_ms = elapsed_ms if i < len(words) - 1 else total_duration_ms
        result.append({"word": word, "start_ms": start_ms, "end_ms": end_ms})
    return result


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

        wav_chunks: list = []
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

            chunk_duration_ms = self._estimate_duration_ms(audio_bytes)
            for t in timings:
                all_word_timings.append({
                    "word":     t.get("word", ""),
                    "start_ms": t.get("start_ms", 0) + offset_ms,
                    "end_ms":   t.get("end_ms", 0) + offset_ms,
                })
            offset_ms += chunk_duration_ms
            wav_chunks.append(audio_bytes)

        # Stitch chunks into one valid WAV (naive concat produces wrong RIFF header)
        all_audio_bytes = self._stitch_linear16_wavs(wav_chunks)

        # Upload / save audio; always keep the GCS path for STT regardless of where audio is stored.
        gcs_path = f"{self._gcs_prefix}/{article_id}/voiceover_{uuid.uuid4().hex[:8]}.wav"
        audio_url = self._upload_to_gcs(all_audio_bytes, gcs_path)

        duration_seconds = round(offset_ms / 1000, 2)

        # ── Replace proportional timings with real STT timestamps ─────────────
        # Only use a GCS URI if the audio was actually uploaded to GCS.
        # If it was saved to Django media (/media/...), pass None so STT uses
        # inline bytes — passing a nonexistent GCS path causes a 404 failure.
        try:
            from agents.stt_agent import transcribe_for_word_timings
            gcs_uri = None
            if audio_url.startswith("https://storage.googleapis.com") or audio_url.startswith("gcs://"):
                gcs_uri = f"gs://{self._gcs_bucket}/{gcs_path}"
            logger.info(
                f"[TTSAgent] Running STT on {duration_seconds:.1f}s audio "
                f"({'GCS URI' if gcs_uri else 'inline bytes → GCS upload if >57s'})"
            )
            stt_timings = transcribe_for_word_timings(
                audio_bytes=all_audio_bytes,
                language_code="ml-IN",
                encoding="LINEAR16",
                sample_rate=SAMPLE_RATE,
                gcs_uri=gcs_uri,
            )
            if stt_timings:
                all_word_timings = stt_timings
                logger.info(
                    f"[TTSAgent] STT succeeded: {len(stt_timings)} real word timings "
                    f"(replaced proportional estimates)"
                )
            else:
                logger.warning(
                    f"[TTSAgent] STT returned 0 timings for {duration_seconds:.1f}s audio — "
                    f"using proportional fallback ({len(all_word_timings)} words). "
                    f"Captions may be out of sync."
                )
        except Exception as _stt_err:
            logger.warning(f"[TTSAgent] STT step failed, keeping proportional: {_stt_err}")

        logger.info(f"[TTSAgent] Done: {duration_seconds}s audio, {len(all_word_timings)} word timings → {audio_url}")
        return {
            "audio_url":       audio_url,
            "duration_seconds": duration_seconds,
            "word_timings":    all_word_timings,
            "voice_used":      voice_used,
        }

    def synthesize_bytes(self, script: str) -> tuple[bytes, list]:
        """
        Synthesize script to raw audio bytes + word timings without GCS upload.
        Used for local media saves (playground / testing).
        Returns: (audio_bytes_wav, word_timings [{word, start_ms, end_ms}])
        """
        if not script or not script.strip():
            raise ValueError("TTS script cannot be empty")

        chunks = self._split_script(script)
        logger.info(f"[TTSAgent] synthesize_bytes: {len(chunks)} chunk(s), {len(script)} chars")

        wav_chunks: list = []
        all_word_timings: list = []
        offset_ms = 0

        for i, chunk in enumerate(chunks):
            try:
                audio_bytes, timings, _ = self._synthesize_chunk(chunk, PRIMARY_VOICE)
            except Exception as e:
                logger.warning(f"[TTSAgent] Primary voice failed (chunk {i}): {e} — trying fallbacks")
                audio_bytes, timings, _ = self._synthesize_with_fallback(chunk)

            chunk_duration_ms = self._estimate_duration_ms(audio_bytes)
            for t in timings:
                all_word_timings.append({
                    "word":     t.get("word", ""),
                    "start_ms": t.get("start_ms", 0) + offset_ms,
                    "end_ms":   t.get("end_ms", 0) + offset_ms,
                })
            offset_ms += chunk_duration_ms
            wav_chunks.append(audio_bytes)

        return self._stitch_linear16_wavs(wav_chunks), all_word_timings

    # ── Internal helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _find_wav_pcm_offset(data: bytes) -> tuple[int, int]:
        """
        Parse WAV header to find the actual PCM data start offset and sample rate.
        Handles non-standard headers with extra chunks (e.g. 'fact').
        Returns (pcm_start_offset, sample_rate).
        """
        import struct
        if len(data) < 12 or data[:4] != b'RIFF' or data[8:12] != b'WAVE':
            return 44, SAMPLE_RATE  # fallback to standard layout
        # Sample rate is always at offset 24 in the fmt chunk (standard layout)
        sr = struct.unpack_from('<I', data, 24)[0] if len(data) > 28 else SAMPLE_RATE
        # Walk chunks to find 'data'
        pos = 12
        while pos + 8 <= len(data):
            chunk_id = data[pos:pos + 4]
            chunk_size = struct.unpack_from('<I', data, pos + 4)[0]
            if chunk_id == b'data':
                return pos + 8, sr or SAMPLE_RATE
            pos += 8 + chunk_size + (chunk_size % 2)  # WAV chunks are word-aligned
        return 44, sr or SAMPLE_RATE  # fallback

    @staticmethod
    def _stitch_linear16_wavs(wav_chunks: list) -> bytes:
        """
        Combine multiple LINEAR16 mono WAV files into one valid WAV file.

        Naive concatenation of WAV bytes produces an invalid file: the browser
        reads only the first chunk's RIFF header and reports wrong duration.
        This method locates the actual PCM data in each chunk (handling non-standard
        WAV headers), concatenates the raw PCM data, then writes a fresh RIFF/WAVE container.
        """
        import struct
        pcm_parts = []
        sample_rate = SAMPLE_RATE

        for chunk in wav_chunks:
            if len(chunk) < 44:
                pcm_parts.append(chunk)
                continue
            pcm_start, sr = TTSAgent._find_wav_pcm_offset(chunk)
            if sr:
                sample_rate = sr
            pcm_parts.append(chunk[pcm_start:])

        all_pcm = b''.join(pcm_parts)
        data_len = len(all_pcm)
        header = struct.pack(
            '<4sI4s'   # RIFF chunk
            '4sIHHIIHH'  # fmt  chunk
            '4sI',       # data chunk header
            b'RIFF', 36 + data_len, b'WAVE',
            b'fmt ', 16, 1, 1, sample_rate, sample_rate * 2, 2, 16,
            b'data', data_len,
        )
        return header + all_pcm

    def _get_client(self):
        """Lazy-load Google Cloud TTS client."""
        if self._tts_client is None:
            from google.cloud import texttospeech_v1beta1 as texttospeech
            self._tts_client = texttospeech.TextToSpeechClient()
        return self._tts_client

    def _synthesize_chunk(
        self, text: str, voice_name: str, use_ssml: bool = False
    ) -> tuple[bytes, list, str]:
        """
        Call Google Cloud TTS for one chunk.
        For Chirp3-HD voices, injects SSML word marks to capture per-word timing.
        Returns (audio_bytes, word_timings [{word, start_ms, end_ms}], voice_used).
        """
        from google.cloud import texttospeech_v1beta1 as texttospeech

        client = self._get_client()

        words: list = [w for w in re.split(r"\s+", text.strip()) if w]

        if use_ssml:
            # Caller-provided SSML — trust it as-is
            synthesis_input = texttospeech.SynthesisInput(ssml=text)
        else:
            # Plain text for ALL voices — Chirp3-HD treats any SSML element
            # (<prosody>, <mark>, even <speak>) as phrase boundaries and inserts
            # audible gaps between words. Rate is controlled via AudioConfig instead.
            synthesis_input = texttospeech.SynthesisInput(text=text)

        voice_params = texttospeech.VoiceSelectionParams(
            language_code=LANGUAGE_CODE,
            name=voice_name,
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.LINEAR16,
            sample_rate_hertz=SAMPLE_RATE,
            speaking_rate=1.05,
            effects_profile_id=["telephony-class-application"],
        )

        request = texttospeech.SynthesizeSpeechRequest(
            input=synthesis_input,
            voice=voice_params,
            audio_config=audio_config,
        )
        response = client.synthesize_speech(request=request)

        duration_ms = self._estimate_duration_ms(response.audio_content)
        word_timings = _proportional_word_timings(words, duration_ms)

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
        """Save audio to Django media (primary) or GCS (fallback).

        Django media URLs (/media/...) are always browser-accessible via the Vite
        proxy in dev and Django's media serving in prod — no GCS ACL issues.
        GCS is still tried as a fallback so the STT agent can use gs:// URIs.
        """
        # ── Primary: Django default_storage (permanent, browser-accessible) ──
        try:
            import os as _os
            from django.core.files.storage import default_storage
            from django.core.files.base import ContentFile
            fname = _os.path.basename(gcs_path)                 # e.g. voiceover_abc123.wav
            article_part = gcs_path.split('/')                  # reels/<article_id>/voiceover_...
            article_id_part = article_part[1] if len(article_part) > 2 else 'unknown'
            media_path = f"articles/reels/tts_{article_id_part}_{fname}"
            saved_path = default_storage.save(media_path, ContentFile(audio_bytes))
            url = default_storage.url(saved_path)              # /media/articles/reels/tts_...wav
            logger.info(f"[TTSAgent] Saved to Django media: {url}")
            return url
        except Exception as e:
            logger.warning(f"[TTSAgent] Django media save failed, falling back to GCS: {e}")

        # ── Fallback: GCS upload ──────────────────────────────────────────────
        try:
            from google.cloud import storage
            client = storage.Client()
            bucket = client.bucket(self._gcs_bucket)
            blob = bucket.blob(gcs_path)
            blob.upload_from_string(audio_bytes, content_type="audio/wav")

            # Try make_public (works when UBLA is not enabled)
            try:
                blob.make_public()
                return blob.public_url
            except Exception:
                pass

            # Try signed URL (7-day expiry; works even with UBLA)
            try:
                import datetime
                return blob.generate_signed_url(
                    expiration=datetime.timedelta(days=7),
                    method='GET',
                    version='v4',
                )
            except Exception as sign_err:
                logger.warning(f"[TTSAgent] Signed URL failed: {sign_err}")

            return blob.public_url  # last resort — may be inaccessible but at least HTTP
        except Exception as e:
            logger.error(f"[TTSAgent] GCS upload failed: {e}")
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
