"""
ElevenLabs TTS Agent
Generates Malayalam voiceover using the official ElevenLabs Python SDK.

Uses convert_with_timestamps() to get character-level timing, which we
aggregate into word-level [{word, start_ms, end_ms}] for perfect caption sync.

For long scripts (>~50s of speech), uses chunked synthesis: the script is
split at sentence boundaries into ~600-char chunks, each synthesized
separately. Per-chunk timestamps are accurate, then offset by cumulative
audio duration. This scales to any video length (3 min, 15 min, etc.).

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
import base64
import os
import re
import logging

logger = logging.getLogger(__name__)

# Max characters per synthesis chunk. ~600 chars ≈ 20-25s of Malayalam speech —
# well within ElevenLabs' reliable alignment range (~50s limit).
_CHUNK_MAX_CHARS = 600

# Malayalam and common sentence-ending punctuation for split boundaries.
_SENTENCE_END_RE = re.compile(r'(?<=[।?!.।\n])\s*')


def _split_into_chunks(script: str, max_chars: int = _CHUNK_MAX_CHARS) -> list:
    """
    Split a script into chunks at natural sentence boundaries.
    Each chunk is at most max_chars characters. Sentences longer than
    max_chars are kept as-is (ElevenLabs can handle them; alignment may
    degrade only for very long single sentences).
    """
    # First split into individual sentences
    raw_sentences = _SENTENCE_END_RE.split(script.strip())
    sentences = [s.strip() for s in raw_sentences if s.strip()]

    chunks = []
    current = ''
    for sentence in sentences:
        separator = ' ' if current else ''
        if len(current) + len(separator) + len(sentence) <= max_chars:
            current = current + separator + sentence
        else:
            if current:
                chunks.append(current)
            # If a single sentence exceeds max_chars, keep it whole
            current = sentence

    if current:
        chunks.append(current)

    return chunks


_MP3_BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
_MP3_SAMPLERATES   = [44100, 48000, 32000]


def _mp3_duration_ms(audio_bytes: bytes) -> int:
    """
    Parse MP3 frame headers to get accurate duration in milliseconds.
    Works with CBR MP3s — which is what ElevenLabs produces.
    Falls back to 128 kbps estimate if no valid header is found.
    """
    data = audio_bytes
    n = len(data)
    offset = 0

    # Skip ID3v2 tag at the start if present
    if n >= 10 and data[:3] == b'ID3':
        id3_size = (
            ((data[6] & 0x7F) << 21) |
            ((data[7] & 0x7F) << 14) |
            ((data[8] & 0x7F) << 7)  |
            (data[9] & 0x7F)
        )
        offset = 10 + id3_size

    # Scan for first MPEG1 Layer3 sync frame
    i = offset
    bitrate_bps = 0
    while i < n - 3:
        b0, b1, b2 = data[i], data[i + 1], data[i + 2]
        if b0 == 0xFF and (b1 & 0xE0) == 0xE0:
            version   = (b1 >> 3) & 0x3   # 3 = MPEG1
            layer     = (b1 >> 1) & 0x3   # 1 = Layer3
            br_idx    = (b2 >> 4) & 0xF
            sr_idx    = (b2 >> 2) & 0x3
            if version == 3 and layer == 1 and 0 < br_idx < 15 and sr_idx < 3:
                bitrate_bps = _MP3_BITRATES_V1_L3[br_idx] * 1000
                break
        i += 1

    if bitrate_bps == 0:
        bitrate_bps = 128_000  # ElevenLabs default

    audio_size_bits = (n - offset) * 8
    return int(audio_size_bits / bitrate_bps * 1000)


def _mp3_duration_ms_from_timings(word_timings: list, audio_bytes: bytes) -> int:
    """
    Return accurate chunk duration: parse actual MP3 headers.
    Falls back to last-word-end + buffer if parsing fails.
    """
    try:
        return _mp3_duration_ms(audio_bytes)
    except Exception:
        if word_timings:
            return word_timings[-1]['end_ms'] + 500
        return int(len(audio_bytes) / (128 * 1000 / 8) * 1000)


def _redistribute_stacked_timings(word_timings: list) -> list:
    """
    When ElevenLabs alignment breaks, multiple consecutive words end up with
    the same start_ms (they get stacked at the breakdown point).  The zero-
    duration fix gives each one only 10 ms, so they all flash simultaneously
    instead of appearing at their actual spoken time.

    This function detects runs of words sharing the same start_ms and spreads
    them evenly across the available time window up to the next uniquely-timed
    word.  The result is an approximation, but words appear spread across the
    right time range rather than all at once.

    Example (before):  words 37-59 all at 23,144 ms → 23,154 ms
    Example (after):   word 37 at 23,144 ms, word 38 at 23,479 ms, … word 59
                       at 30,520 ms — evenly spaced to gap_end = 30,855 ms
    """
    if not word_timings:
        return word_timings

    result = [dict(wt) for wt in word_timings]
    n = len(result)
    i = 0

    while i < n:
        anchor_start = result[i]['start_ms']

        # Find end of the run sharing anchor_start
        j = i + 1
        while j < n and result[j]['start_ms'] == anchor_start:
            j += 1

        run_len = j - i
        if run_len > 1:
            # Gap end: start of the next word with a different timestamp,
            # or the last word's end_ms + 1 s as a fallback.
            if j < n:
                gap_end_ms = result[j]['start_ms']
            else:
                gap_end_ms = max(r['end_ms'] for r in result[i:j]) + 1000

            available_ms = max(0, gap_end_ms - anchor_start)
            per_word_ms  = available_ms // run_len if run_len else available_ms

            for k in range(run_len):
                w_start = anchor_start + k * per_word_ms
                w_end   = anchor_start + (k + 1) * per_word_ms - 10
                result[i + k]['start_ms'] = w_start
                result[i + k]['end_ms']   = max(w_start + 50, w_end)

        i = j

    return result


def _chars_to_word_timings(characters, starts, ends) -> list:
    """
    Aggregate ElevenLabs character-level timestamps into word-level timings.

    Characters include spaces; we split at spaces to get word boundaries.
    Returns [{word, start_ms, end_ms}].
    """
    word_timings = []
    current_chars = []
    current_start = None

    for char, start_s, end_s in zip(characters, starts, ends):
        if char == " ":
            # Flush current word
            if current_chars and current_start is not None:
                word = "".join(current_chars)
                last_end = end_s  # space end ≈ previous word's end
                word_timings.append({
                    "word":     word,
                    "start_ms": int(current_start * 1000),
                    "end_ms":   int(starts[starts.index(start_s) - 1 if starts.index(start_s) > 0 else 0] * 1000 + 10),
                })
                current_chars = []
                current_start = None
        else:
            if current_start is None:
                current_start = start_s
            current_chars.append(char)

    # Flush final word
    if current_chars and current_start is not None:
        word_timings.append({
            "word":     "".join(current_chars),
            "start_ms": int(current_start * 1000),
            "end_ms":   int(ends[-1] * 1000),
        })

    return word_timings


def _chars_to_word_timings_v2(characters, starts, ends) -> list:
    """
    Cleaner character→word aggregation.
    Tracks the previous character's end time to set word end correctly.
    """
    word_timings = []
    current_chars = []
    word_start_s = None
    prev_end_s = 0.0

    for char, start_s, end_s in zip(characters, starts, ends):
        if char in (" ", "\n", "\t"):
            if current_chars and word_start_s is not None:
                word_timings.append({
                    "word":     "".join(current_chars),
                    "start_ms": int(word_start_s * 1000),
                    "end_ms":   int(prev_end_s * 1000),
                })
            current_chars = []
            word_start_s = None
        else:
            if word_start_s is None:
                word_start_s = start_s
            current_chars.append(char)
        prev_end_s = end_s

    if current_chars and word_start_s is not None:
        word_timings.append({
            "word":     "".join(current_chars),
            "start_ms": int(word_start_s * 1000),
            "end_ms":   int(prev_end_s * 1000),
        })

    # ElevenLabs sometimes returns degenerate alignment (start == end) for the
    # last few characters when the model can't resolve them.  Fix by distributing
    # the available time forward: each zero-duration word steals time from the
    # next word with a valid window, falling back to the last character's end.
    audio_end_ms = int(ends[-1] * 1000) if ends else 0
    for i in range(len(word_timings)):
        wt = word_timings[i]
        if wt["end_ms"] <= wt["start_ms"]:
            if i + 1 < len(word_timings):
                next_start = word_timings[i + 1]["start_ms"]
                wt["end_ms"] = max(wt["start_ms"] + 10, next_start - 10)
            else:
                wt["end_ms"] = max(wt["start_ms"] + 100, audio_end_ms)

    return word_timings


class ElevenLabsAgent:
    def __init__(self):
        self._api_key  = os.environ.get("ELEVENLABS_API_KEY", "")
        self._voice_id = os.environ.get("ELEVENLABS_MALAYALAM_VOICE_ID", "")

    def synthesize(self, script: str) -> bytes:
        """
        Call ElevenLabs and return raw MP3 bytes (no timestamps).
        Kept for backwards compatibility — prefer synthesize_with_timings_chunked().
        """
        audio_bytes, _ = self.synthesize_with_timings_chunked(script)
        return audio_bytes

    def synthesize_with_timings_chunked(self, script: str) -> tuple[bytes, list]:
        """
        Reliable entry point for any script length (short reels → long videos).

        Splits the script at sentence boundaries into ≤600-char chunks
        (~20-25s of speech each — well within ElevenLabs' reliable alignment range).
        Each chunk is synthesized independently so the character-level alignment
        is always accurate.  Chunk timestamps are offset by the actual MP3
        duration of previous chunks (parsed from frame headers, not estimated
        from word timings, so inter-chunk boundaries are exact).

        Returns: (concatenated_mp3_bytes, word_timings_ms)
        """
        if not script or not script.strip():
            raise ValueError("Voiceover script cannot be empty")

        chunks = _split_into_chunks(script)
        logger.info(f"[ElevenLabs] Chunked synthesis: {len(chunks)} chunks from {len(script)} chars")

        all_audio      = b''
        all_timings: list = []
        offset_ms      = 0

        for i, chunk_text in enumerate(chunks):
            logger.info(f"[ElevenLabs] Chunk {i+1}/{len(chunks)}: {len(chunk_text)} chars")
            chunk_audio, chunk_timings = self.synthesize_with_timings(chunk_text)

            for wt in chunk_timings:
                all_timings.append({
                    'word':     wt['word'],
                    'start_ms': wt['start_ms'] + offset_ms,
                    'end_ms':   wt['end_ms']   + offset_ms,
                })

            # Use actual MP3 frame-header duration for accurate inter-chunk offset
            offset_ms += _mp3_duration_ms_from_timings(chunk_timings, chunk_audio)
            all_audio += chunk_audio

        # Redistribute any stacked zero-duration runs caused by ElevenLabs
        # alignment breakdown within a chunk.
        all_timings = _redistribute_stacked_timings(all_timings)

        logger.info(
            f"[ElevenLabs] Chunked complete: {len(all_audio)} bytes, "
            f"{len(all_timings)} word timings, ~{offset_ms/1000:.1f}s"
        )
        return all_audio, all_timings

    def synthesize_with_timings(self, script: str) -> tuple[bytes, list]:
        """
        Call ElevenLabs convert_with_timestamps() and return:
          (mp3_bytes, word_timings)

        word_timings: [{word, start_ms, end_ms}] — exact per-word timestamps
                      from ElevenLabs character alignment, not STT.

        Raises ValueError on misconfiguration or empty script.
        """
        if not self._api_key:
            raise ValueError("ELEVENLABS_API_KEY is not set in environment")
        if not self._voice_id:
            raise ValueError("ELEVENLABS_MALAYALAM_VOICE_ID is not set in environment")
        if not script or not script.strip():
            raise ValueError("Voiceover script cannot be empty")

        from elevenlabs.client import ElevenLabs

        client   = ElevenLabs(api_key=self._api_key)
        response = client.text_to_speech.convert_with_timestamps(
            voice_id=self._voice_id,
            text=script,
            model_id="eleven_v3",
            language_code="ml",
        )

        # Decode audio from base64
        audio_bytes = base64.b64decode(response.audio_base_64)

        # Extract word timings from character alignment
        alignment = response.alignment
        word_timings = []
        if alignment and alignment.characters:
            word_timings = _chars_to_word_timings_v2(
                alignment.characters,
                alignment.character_start_times_seconds,
                alignment.character_end_times_seconds,
            )
            logger.info(
                f"[ElevenLabs] {len(word_timings)} word timings extracted "
                f"from {len(alignment.characters)} characters"
            )
        else:
            logger.warning("[ElevenLabs] No alignment data in response — captions will be proportional")

        return audio_bytes, word_timings
