"""
Google Cloud Speech-to-Text — word-level timestamp extraction.

After every TTS / ElevenLabs generation, pass the audio through STT to get
real per-word timestamps from the actual waveform.  This replaces all
proportional / SSML-mark approximations with frame-accurate sync data.

Three paths:
  Short audio (≤ 57 s)  — inline bytes, sync recognize().
  Long audio  (> 57 s)  — auto-upload bytes to GCS as a temp object,
                          then long_running_recognize(), then delete.
  Explicit gcs_uri      — long_running_recognize() directly (no upload).

Falls back silently to [] so callers keep whatever timing they already have.
"""
import logging
import os
import uuid
from typing import Optional

logger = logging.getLogger(__name__)

_WAV_HEADER_BYTES = 44
_SYNC_MAX_S = 57           # safe margin under the 60-second sync API limit
_WAV_SAMPLE_RATE = 24000   # must match TTSAgent sample rate


def _wav_duration_s(audio_bytes: bytes, sample_rate: int = _WAV_SAMPLE_RATE) -> float:
    data = max(0, len(audio_bytes) - _WAV_HEADER_BYTES)
    return data / (sample_rate * 2)   # LINEAR16 mono = 2 bytes / sample


def _estimate_duration_s(audio_bytes: bytes, encoding: str, sample_rate: int) -> float:
    if encoding == "LINEAR16":
        return _wav_duration_s(audio_bytes, sample_rate)
    # ElevenLabs MP3 ≈ 128 kbps — use that so we don't overestimate duration
    # and unnecessarily try GCS upload for sub-60s audio.
    return len(audio_bytes) / (128_000 / 8)


def _upload_temp_gcs(audio_bytes: bytes, encoding: str) -> Optional[str]:
    """Upload bytes to GCS as a temp file. Returns gs://bucket/path or None."""
    bucket_name = os.environ.get("GCS_BUCKET_NAME", "")
    if not bucket_name:
        logger.warning("[STT] GCS_BUCKET_NAME not set — cannot upload long audio for STT")
        return None
    try:
        from google.cloud import storage as gcs
        ext = "mp3" if encoding == "MP3" else "wav"
        blob_path = f"stt-temp/{uuid.uuid4().hex}.{ext}"
        ct = "audio/mpeg" if encoding == "MP3" else "audio/wav"
        client = gcs.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        blob.upload_from_string(audio_bytes, content_type=ct)
        gcs_uri = f"gs://{bucket_name}/{blob_path}"
        logger.info("[STT] Uploaded temp audio → %s", gcs_uri)
        return gcs_uri
    except Exception as exc:
        logger.warning("[STT] Temp GCS upload failed: %s", exc)
        return None


def _delete_temp_gcs(gcs_uri: str) -> None:
    try:
        from google.cloud import storage as gcs
        # gs://bucket/path → bucket, path
        parts = gcs_uri[5:].split("/", 1)
        bucket_name, blob_path = parts[0], parts[1]
        client = gcs.Client()
        client.bucket(bucket_name).blob(blob_path).delete()
        logger.debug("[STT] Deleted temp GCS object %s", gcs_uri)
    except Exception:
        pass   # best-effort cleanup


def transcribe_for_word_timings(
    audio_bytes: bytes,
    language_code: str = "ml-IN",
    encoding: str = "LINEAR16",
    sample_rate: int = _WAV_SAMPLE_RATE,
    gcs_uri: Optional[str] = None,
) -> list:
    """
    Run Google Speech-to-Text and return [{word, start_ms, end_ms}].

    Args:
        audio_bytes   : Raw bytes of the audio file (WAV or MP3).
        language_code : BCP-47 code — "ml-IN" for Malayalam.
        encoding      : "LINEAR16" or "MP3".
        sample_rate   : Required for LINEAR16; ignored for MP3.
        gcs_uri       : Optional explicit gs:// URI — skips auto-upload logic.

    Returns:
        [{word, start_ms, end_ms}] — accurate to ~10 ms.
        []  — on any failure; callers keep their existing timing fallback.
    """
    temp_uri_to_delete: Optional[str] = None

    try:
        from google.cloud import speech as _speech_inner
        client = _speech_inner.SpeechClient()

        _enc = {
            "LINEAR16": _speech_inner.RecognitionConfig.AudioEncoding.LINEAR16,
            "MP3":      _speech_inner.RecognitionConfig.AudioEncoding.MP3,
        }.get(encoding, _speech_inner.RecognitionConfig.AudioEncoding.LINEAR16)

        def _build_config(model_name: str) -> "_speech_inner.RecognitionConfig":
            kw: dict = dict(
                encoding=_enc,
                language_code=language_code,
                enable_word_time_offsets=True,
                enable_automatic_punctuation=False,
                model=model_name,
            )
            if encoding == "LINEAR16":
                kw["sample_rate_hertz"] = sample_rate
            return _speech_inner.RecognitionConfig(**kw)

        def _long_run(audio_obj, duration_s: float) -> list:
            """
            Run long_running_recognize. Tries latest_long first, falls back to
            default ONLY on model-not-supported errors (not timeouts).
            Timeout scales with audio duration: 2× audio length, capped at 480s.
            """
            stt_timeout = max(120, min(480, int(duration_s * 2)))
            for model in ("latest_long", "default"):
                try:
                    cfg = _build_config(model)
                    logger.info("[STT] long_running_recognize model=%s timeout=%ds", model, stt_timeout)
                    op = client.long_running_recognize(config=cfg, audio=audio_obj)
                    response = op.result(timeout=stt_timeout)
                    return _parse_response(response)
                except Exception as e:
                    err_msg = str(e).lower()
                    # Only retry on model-not-supported / invalid-argument errors.
                    # For timeouts or quota errors, bail immediately to avoid double waits.
                    if any(k in err_msg for k in ("not support", "invalid argument", "invalid model", "unknown model")):
                        logger.warning("[STT] model %s not supported, retrying with fallback: %s", model, e)
                        continue
                    logger.warning("[STT] long_running_recognize failed (model=%s): %s", model, e)
                    return []
            return []

        def _parse_response(response) -> list:
            wt = []
            for result in response.results:
                if not result.alternatives:
                    continue
                for w in result.alternatives[0].words:
                    wt.append({
                        "word":     w.word,
                        "start_ms": int(w.start_time.total_seconds() * 1000),
                        "end_ms":   int(w.end_time.total_seconds() * 1000),
                    })
            return wt

        # ── Choose sync vs long_running ───────────────────────────────────────
        if gcs_uri:
            duration_s = _estimate_duration_s(audio_bytes or b'', encoding, sample_rate) if audio_bytes else 120.0
            audio_obj = _speech_inner.RecognitionAudio(uri=gcs_uri)
            logger.info("[STT] long_running_recognize via caller-supplied URI: %s", gcs_uri)
            word_timings = _long_run(audio_obj, duration_s)
        else:
            duration_s = _estimate_duration_s(audio_bytes, encoding, sample_rate)

            if duration_s > _SYNC_MAX_S:
                logger.info(
                    "[STT] Audio ~%.0fs > %ds — uploading to GCS for long_running_recognize",
                    duration_s, _SYNC_MAX_S,
                )
                temp_gcs = _upload_temp_gcs(audio_bytes, encoding)
                if not temp_gcs:
                    logger.warning("[STT] GCS upload failed — skipping STT for long audio")
                    return []
                temp_uri_to_delete = temp_gcs
                audio_obj = _speech_inner.RecognitionAudio(uri=temp_gcs)
                word_timings = _long_run(audio_obj, duration_s)
            else:
                logger.info("[STT] sync recognize (%.1fs, %s)", duration_s, encoding)
                audio_obj = _speech_inner.RecognitionAudio(content=audio_bytes)
                # Try latest_long first, fall back to default on model errors only
                word_timings = []
                for model in ("latest_long", "default"):
                    try:
                        cfg = _build_config(model)
                        response = client.recognize(config=cfg, audio=audio_obj)
                        word_timings = _parse_response(response)
                        break
                    except Exception as e:
                        err_msg = str(e).lower()
                        if any(k in err_msg for k in ("not support", "invalid argument", "invalid model", "unknown model")):
                            logger.warning("[STT] sync model %s not supported, trying fallback: %s", model, e)
                            continue
                        logger.warning("[STT] sync recognize failed (model=%s): %s", model, e)
                        break

        if word_timings:
            logger.info("[STT] %d real word timings extracted (%.1fs audio)", len(word_timings), duration_s)
        else:
            logger.warning("[STT] 0 words returned — STT may not support this language/audio or quota exceeded")

        return word_timings

    except ImportError:
        logger.warning("[STT] google-cloud-speech not installed — skipping")
        return []
    except Exception as exc:
        logger.warning("[STT] Speech-to-Text failed (non-fatal, keeping existing timings): %s", exc)
        return []

    finally:
        if temp_uri_to_delete:
            _delete_temp_gcs(temp_uri_to_delete)
