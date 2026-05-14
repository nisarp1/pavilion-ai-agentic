import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Player } from '@remotion/player'
import { PavilionReelComposition } from './compositions/PavilionReelComposition'
import { AIVideoComposition } from './compositions/AIVideoComposition'
import { setCurrentFrame, selectClip, updateClip, pushHistory } from '../../store/slices/videoStudioSlice'

const SX = 270 / 1080
const SY = 480 / 1920
const COMP_CX = 540   // composition center X (transform-origin)
const COMP_CY = 960   // composition center Y (transform-origin)
const FPS = 30
// Must match INTRO_DURATION in AIVideoComposition.jsx and remotion-renderer/src/lib/constants.ts
const INTRO_FRAMES = 30

// Bounding boxes in 1080×1920 composition space (default/untransformed)
const CLIP_BOXES = {
  'scene1-hero':     { top: 0,    left: 0,  width: 1080, height: 1920 },
  'chrome':          { top: 40,   left: 40, width: 1000, height: 200  },
  'scene1-headline': { top: 1400, left: 70, width: 940,  height: 360  },
  'scene2-bg':       { top: 0,    left: 0,  width: 1080, height: 1920 },
  'scene2-card':     { top: 300,  left: 80, width: 920,  height: 1260 },
  'scene2-headline': { top: 1560, left: 80, width: 920,  height: 260  },
}

// Back-to-front z-order so front elements receive clicks first
const Z_ORDER = ['scene1-hero', 'scene2-bg', 'scene2-card', 'chrome', 'scene1-headline', 'scene2-headline']

const CORNERS = [
  { cx: 0, cy: 0, cursor: 'nw-resize', type: 'resize-nw' },
  { cx: 1, cy: 0, cursor: 'ne-resize', type: 'resize-ne' },
  { cx: 0, cy: 1, cursor: 'sw-resize', type: 'resize-sw' },
  { cx: 1, cy: 1, cursor: 'se-resize', type: 'resize-se' },
]

// Maps a static CLIP_BOX to its actual preview-space position after the clip's CSS transform.
function getTransformedBox(box, clip) {
  const tx = clip.offsetX ?? 0
  const ty = clip.offsetY ?? 0
  const sx = clip.scaleX ?? 1
  const sy = clip.scaleY ?? 1
  return {
    left:   (COMP_CX + (box.left - COMP_CX) * sx + tx) * SX,
    top:    (COMP_CY + (box.top  - COMP_CY) * sy + ty) * SY,
    width:  box.width  * sx * SX,
    height: box.height * sy * SY,
  }
}

export default function RemotionPreview({ props }) {
  const playerRef = useRef(null)
  const audioRef  = useRef(null)   // native <audio> element — bypasses Remotion audio pipeline
  const dispatch  = useDispatch()
  const { clips, currentFrame, audioUrl, selectedClipId, assets } = useSelector(s => s.videoStudio)
  const isSyncingRef        = useRef(false)  // kept for safety; isPlaying() guard is the real fix
  const waitingForIntroRef  = useRef(false)  // true while player is in the intro card, audio held
  const isTimelinePipelineRef = useRef(false) // mirror of isTimelinePipeline for use in closures
  const seekDebounceRef     = useRef(null)    // debounce timer for scrub seekTo
  const currentFrameRef     = useRef(currentFrame) // latest frame, readable inside timeout closure
  const [overlayDrag,      setOverlayDrag]      = useState(null)
  const [audioReady,       setAudioReady]       = useState(false)
  const [audioError,       setAudioError]       = useState(false)
  const [audioDurationMs,  setAudioDurationMs]  = useState(null)

  // ── Resolve audio URL to absolute ──────────────────────────────────────────
  // Relative Django media paths (/media/...) go through the Vite proxy at localhost:3001.
  // Reject non-servable schemes like gcs:// or s3:// which would produce a malformed URL.
  const resolvedAudioUrl = audioUrl && (audioUrl.startsWith('http') || audioUrl.startsWith('/'))
    ? (audioUrl.startsWith('/') ? `${window.location.origin}${audioUrl}` : audioUrl)
    : null

  // ── Detect pipeline mode ───────────────────────────────────────────────────
  // Must be declared BEFORE any useEffect that references it in its dependency
  // array — const is not hoisted past its declaration (temporal dead zone).
  const isTimelinePipeline = Boolean(props?.timeline)
  isTimelinePipelineRef.current = isTimelinePipeline

  // ── Native audio element: load & buffer whenever URL changes ───────────────
  // In timeline pipeline mode, audio lives inside <Audio> in AIVideoComposition,
  // so Remotion Player handles scrubbing sync natively. Skip native audio there.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isTimelinePipeline || !resolvedAudioUrl) {
      audio.src = ''
      setAudioReady(false)
      setAudioError(false)
      setAudioDurationMs(null)
      return
    }

    setAudioReady(false)
    setAudioError(false)
    setAudioDurationMs(null)
    audio.src = resolvedAudioUrl
    audio.preload = 'auto'
    audio.load()
  }, [resolvedAudioUrl, isTimelinePipeline])

  // ── Sync native audio with Remotion Player events ──────────────────────────
  useEffect(() => {
    const player = playerRef.current
    const audio  = audioRef.current
    if (!player || !audio) return

    // introOffset is read from a ref so event callbacks always see the latest value
    // without needing to re-subscribe on every render.
    const introOffset = () => isTimelinePipelineRef.current ? INTRO_FRAMES : 0
    const toAudioTime = (frame) => (frame - introOffset()) / FPS

    const setPitchPreserving = () => {
      audio.preservesPitch = true
      audio.mozPreservesPitch = true  // Firefox
      audio.webkitPreservesPitch = true  // older Safari
    }

    const onPlay = () => {
      if (!resolvedAudioUrl) return
      const frame = player.getCurrentFrame()
      const t = toAudioTime(frame)
      setPitchPreserving()
      if (t < 0) {
        audio.currentTime = 0
        audio.pause()
        waitingForIntroRef.current = true
      } else {
        audio.currentTime = t
        audio.playbackRate = 1.0
        waitingForIntroRef.current = false
        audio.play().catch(() => {})
      }
    }

    const onPause = () => {
      audio.pause()
      audio.playbackRate = 1.0
      waitingForIntroRef.current = false
    }

    const onSeeked = ({ detail }) => {
      const t = toAudioTime(detail.frame)
      audio.playbackRate = 1.0
      if (t < 0) {
        audio.currentTime = 0
        audio.pause()
        if (player.isPlaying()) waitingForIntroRef.current = true
      } else {
        audio.currentTime = t
        waitingForIntroRef.current = false
        // Always resume audio after seek if player is playing —
        // the browser may pause the audio element internally during a seek.
        if (player.isPlaying()) {
          audio.play().catch(() => {})
        }
      }
    }

    const onEnded = () => {
      // Guard: if the audio element still has content remaining, the player ran out
      // of frames before the audio finished (stale timeline duration in DB).
      // Let the audio play through to its natural end instead of cutting it off.
      const remaining = audio.duration - audio.currentTime
      if (isFinite(remaining) && remaining > 0.3) {
        waitingForIntroRef.current = false
        return
      }
      audio.pause()
      audio.playbackRate = 1.0
      waitingForIntroRef.current = false
    }

    const onRateChange = ({ detail }) => {
      if (detail?.playbackRate) audio.playbackRate = detail.playbackRate
    }

    // Drift correction via playbackRate — never seek mid-playback.
    // Remotion's RAF clock and the audio hardware clock diverge ~2-4ms/s.
    // We nudge playbackRate proportionally: 1% rate change per 0.15s of drift,
    // capped at ±3%.  At 3% the pitch shift is inaudible (well below 1 semitone).
    // This closes a 150ms gap in ~5 seconds with no audible break.
    const onFrameUpdate = ({ detail }) => {
      if (waitingForIntroRef.current) {
        if (detail.frame >= introOffset() && player.isPlaying()) {
          setPitchPreserving()
          audio.currentTime = toAudioTime(detail.frame)
          audio.playbackRate = 1.0
          audio.play().catch(() => {})
          waitingForIntroRef.current = false
        }
        return
      }

      if (player.isPlaying() && !audio.paused && resolvedAudioUrl) {
        const expected = toAudioTime(detail.frame)
        if (expected >= 0) {
          const driftS = expected - audio.currentTime
          // Proportional rate: 1% per 0.15s drift, clamped ±3%
          const rate = 1.0 + Math.max(-0.03, Math.min(0.03, driftS / 0.15))
          audio.playbackRate = rate
        }
      }
    }

    player.addEventListener('play',        onPlay)
    player.addEventListener('pause',       onPause)
    player.addEventListener('seeked',      onSeeked)
    player.addEventListener('ended',       onEnded)
    player.addEventListener('ratechange',  onRateChange)
    player.addEventListener('frameupdate', onFrameUpdate)

    return () => {
      player.removeEventListener('play',        onPlay)
      player.removeEventListener('pause',       onPause)
      player.removeEventListener('seeked',      onSeeked)
      player.removeEventListener('ended',       onEnded)
      player.removeEventListener('ratechange',  onRateChange)
      player.removeEventListener('frameupdate', onFrameUpdate)
    }
  }, [resolvedAudioUrl])

  // ── Global spacebar → play/pause ───────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== 'Space') return
      const tag = document.activeElement?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (document.activeElement?.isContentEditable) return
      e.preventDefault()
      const player = playerRef.current
      if (!player) return
      if (player.isPlaying()) {
        player.pause()
      } else {
        player.play()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Keep a ref so the debounce timeout always reads the latest frame value.
  currentFrameRef.current = currentFrame

  // ── Timeline playhead → Player seek ────────────────────────────────────────
  // IMPORTANT: Only seek when the player is PAUSED (user scrubbing the ruler).
  // During playback, frameupdate already updates Redux state. Calling seekTo()
  // here during playback creates a 30fps feedback loop that re-seeks the player
  // every single frame, interrupting audio playback and causing the garbled sound.
  //
  // The debounce (1 video frame = 33ms) collapses rapid mouse-drag events into a
  // single seekTo() call per settled position.  Without it, dozens of seeks queue
  // up faster than the browser can process them, leaving the audio element's
  // currentTime lagging behind the visual playhead.
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    if (player.isPlaying()) return   // ← breaks the feedback loop

    clearTimeout(seekDebounceRef.current)
    seekDebounceRef.current = setTimeout(() => {
      const p = playerRef.current
      if (p && !p.isPlaying()) p.seekTo(currentFrameRef.current)
    }, Math.ceil(1000 / FPS))  // 33ms — one frame at 30fps
  }, [currentFrame])

  // ── Force composition re-render when assets or brand props change ──────────
  // @remotion/player doesn't always re-render the composition when inputProps
  // change on a paused player. Seeking to the current frame forces it.
  useEffect(() => {
    const player = playerRef.current
    if (!player || player.isPlaying()) return
    const timer = setTimeout(() => player.seekTo(player.getCurrentFrame()), 50)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, props?.logoSrc, props?.brandName, props?.accent])

  // ── Player frame → Redux currentFrame (during playback) ────────────────────
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    const handler = ({ detail }) => {
      if (!isSyncingRef.current) {
        dispatch(setCurrentFrame(detail.frame))
      }
    }
    player.addEventListener('frameupdate', handler)
    return () => player.removeEventListener('frameupdate', handler)
  }, [dispatch])

  // ── Overlay drag → update clip offsetX/offsetY or scale ────────────────────
  useEffect(() => {
    if (!overlayDrag) return
    const { clipId, type, startX, startY, origOffsetX, origOffsetY, origScaleX, origScaleY } = overlayDrag
    const handleMove = (e) => {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (type === 'move') {
        dispatch(updateClip({ id: clipId, changes: {
          offsetX: origOffsetX + dx / SX,
          offsetY: origOffsetY + dy / SY,
        }}))
      } else if (type.startsWith('resize')) {
        const ds = dx / 200
        dispatch(updateClip({ id: clipId, changes: {
          scaleX: Math.max(0.2, origScaleX + ds),
          scaleY: Math.max(0.2, origScaleY + ds),
        }}))
      }
    }
    const handleUp = () => setOverlayDrag(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [overlayDrag, dispatch])

  function handleOverlayMouseDown(e, clip, type) {
    e.preventDefault()
    e.stopPropagation()
    dispatch(pushHistory())
    dispatch(selectClip(clip.id))
    setOverlayDrag({
      clipId: clip.id, type,
      startX: e.clientX, startY: e.clientY,
      origOffsetX: clip.offsetX ?? 0,
      origOffsetY: clip.offsetY ?? 0,
      origScaleX: clip.scaleX ?? 1,
      origScaleY: clip.scaleY ?? 1,
    })
  }

  function handleOverlayDoubleClick(e, clip) {
    e.stopPropagation()
    dispatch(updateClip({ id: clip.id, changes: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 } }))
  }

  function resolveSceneComponent(sceneClips) {
    const firstClip = sceneClips[0]
    if (!firstClip) return 'hero_headline'
    const tplId = firstClip.templateClipId || firstClip.id || ''
    
    if (tplId.startsWith('scoreboard')) return 'scoreboard'
    if (tplId.startsWith('comparison')) return 'stat_comparison'
    if (tplId.startsWith('quote')) return 'quote_card'
    if (tplId.startsWith('ticker')) return 'ticker_headline'
    if (tplId.includes('breaking')) return 'breaking_news'
    if (tplId.includes('timeline')) return 'match_analysis_timeline'
    if (tplId.includes('poll')) return 'prediction_poll'
    if (tplId.includes('scene2') || tplId.includes('card')) return 'player_card'
    
    return 'hero_headline'
  }

  // ── Timeline pipeline: use AIVideoComposition ─────────────────────────────
  const timelineTotalFrames = (() => {
    if (!isTimelinePipeline || !props.timeline) return 300 + 30
    const tl = props.timeline
    const candidates = []
    if (tl.elements?.length)     candidates.push(Math.max(...tl.elements.map(e => e.endMs)))
    if (tl.audio?.length)        candidates.push(Math.max(...tl.audio.map(a => a.endMs)))
    if (tl.wordCaptions?.length) candidates.push(Math.max(...tl.wordCaptions.map(c => c.endMs)))
    if (tl.text?.length)         candidates.push(Math.max(...tl.text.map(t => t.endMs)))
    // Read actual audio duration directly from the DOM element — this is the ground truth.
    // audioDurationMs state causes re-render after loadedmetadata so this value is fresh.
    const elDur = audioRef.current?.duration
    if (elDur && isFinite(elDur) && elDur > 0) candidates.push(Math.ceil(elDur * 1000))
    if (!candidates.length) return 300 + 30
    const lastEndMs = Math.max(...candidates)
    // Must mirror calculateAIVideoMetadata in Root.tsx exactly:
    // contentFrames + INTRO_DURATION + TAIL_BUFFER_FRAMES
    return Math.ceil((lastEndMs / 1000) * FPS) + INTRO_FRAMES + 90
  })()

  // ── Legacy pipeline: convert clips to scenes for PavilionReelComposition ──
  const sceneNumbers = [...new Set(clips.filter(c => c.scene > 0).map(c => c.scene))].sort((a, b) => a - b)
  const scenes = sceneNumbers.map(num => {
    const sClips = clips.filter(c => c.scene === num)
    const start = Math.min(...sClips.map(c => c.globalStartFrame))
    const end = Math.max(...sClips.map(c => c.globalStartFrame + c.durationFrames))
    const customProps = sClips.reduce((acc, c) => ({ ...acc, ...(c.customProps || {}) }), {})
    return {
      scene_number: num,
      template_id: resolveSceneComponent(sClips),
      start_frame: start,
      duration_frames: end - start,
      props: customProps
    }
  })

  const legacyInputProps = { ...props, audioSrc: undefined, scenes, suppressCaptions: true }
  const timelineInputProps = {
    timeline:  props?.timeline  ?? null,
    logoSrc:   props?.logoSrc   ?? '',
    brandName: props?.brandName ?? '',
    accent:    props?.accent    ?? '',
  }

  const inputProps     = isTimelinePipeline ? timelineInputProps : legacyInputProps
  const activeComp     = isTimelinePipeline ? AIVideoComposition : PavilionReelComposition

  // Visible clips at current frame (legacy mode only), ordered back-to-front
  const visibleClips = isTimelinePipeline ? [] : [...clips]
    .filter(c => CLIP_BOXES[c.templateClipId || c.id] &&
      currentFrame >= c.globalStartFrame &&
      currentFrame < c.globalStartFrame + c.durationFrames)
    .sort((a, b) => {
      const aZ = Z_ORDER.indexOf(a.templateClipId || a.id)
      const bZ = Z_ORDER.indexOf(b.templateClipId || b.id)
      return (aZ === -1 ? 999 : aZ) - (bZ === -1 ? 999 : bZ)
    })

  const selectedClip = clips.find(c => c.id === selectedClipId)
  const totalFrames  = isTimelinePipeline
    ? timelineTotalFrames
    : clips.reduce((m, c) => Math.max(m, c.globalStartFrame + c.durationFrames), 420)

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
        Live Preview (1080 × 1920 · {Math.round(totalFrames / FPS)} s)
        {isTimelinePipeline && <span className="ml-1 text-indigo-500">· AI Video</span>}
      </p>

      {/* ── Native audio element (hidden) — drives the voiceover ── */}
      {/* This is outside the Remotion Player and uses the browser's native audio engine */}
      <audio
        ref={audioRef}
        preload="auto"
        style={{ display: 'none' }}
        onLoadedMetadata={(e) => { const d = e.target.duration; if (isFinite(d) && d > 0) setAudioDurationMs(Math.ceil(d * 1000)) }}
        onDurationChange={(e) => { const d = e.target.duration; if (isFinite(d) && d > 0) setAudioDurationMs(Math.ceil(d * 1000)) }}
        onCanPlayThrough={() => { setAudioReady(true); setAudioError(false) }}
        onError={() => { setAudioError(true); setAudioReady(false) }}
        onLoadStart={() => { setAudioReady(false); setAudioError(false) }}
      />

      <div style={{ position: 'relative', width: 270, height: 480, borderRadius: 12, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #e5e7eb' }}>
        <Player
          ref={playerRef}
          component={activeComp}
          inputProps={inputProps}
          durationInFrames={totalFrames}
          fps={FPS}
          compositionWidth={1080}
          compositionHeight={1920}
          style={{ width: 270, height: 480 }}
          controls
          loop={false}
          autoPlay={false}
          showVolumeControls={isTimelinePipeline}
          acknowledgeRemotionLicense
        />

        {/* Interaction overlay — leaves bottom 40px free for Player controls */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 40, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>

          {/* Clip hotspots (back-to-front so front elements are on top in DOM) */}
          {visibleClips.map(clip => {
            const clipType = clip.templateClipId || clip.id
            const tbox = getTransformedBox(CLIP_BOXES[clipType], clip)
            const isSelected = clip.id === selectedClipId
            return (
              <div
                key={clip.id}
                style={{
                  position: 'absolute',
                  top: tbox.top,
                  left: tbox.left,
                  width: tbox.width,
                  height: tbox.height,
                  pointerEvents: 'all',
                  cursor: overlayDrag?.clipId === clip.id ? 'grabbing' : (isSelected ? 'grab' : 'pointer'),
                  outline: isSelected ? `2px solid ${clip.color}` : 'none',
                  outlineOffset: -1,
                  boxSizing: 'border-box',
                }}
                onMouseDown={e => handleOverlayMouseDown(e, clip, 'move')}
                onDoubleClick={e => handleOverlayDoubleClick(e, clip)}
              />
            )
          })}

          {/* Corner resize handles for selected clip (rendered last = on top) */}
          {selectedClip && CLIP_BOXES[selectedClip.templateClipId || selectedClip.id] && (() => {
            const clipType = selectedClip.templateClipId || selectedClip.id
            const tbox = getTransformedBox(CLIP_BOXES[clipType], selectedClip)
            return CORNERS.map(({ cx, cy, cursor, type }) => (
              <div
                key={type}
                style={{
                  position: 'absolute',
                  left: tbox.left + cx * tbox.width - 5,
                  top:  tbox.top  + cy * tbox.height - 5,
                  width: 10, height: 10,
                  background: selectedClip.color,
                  border: '2px solid white',
                  borderRadius: 2,
                  cursor,
                  pointerEvents: 'all',
                }}
                onMouseDown={e => handleOverlayMouseDown(e, selectedClip, type)}
              />
            ))
          })()}

        </div>
      </div>

      <p className="text-xs text-gray-400">
        Click element to select · Drag to move · Corner to resize · Double-click to reset
      </p>

      {/* ── Voiceover status badge ── */}
      {isTimelinePipeline ? (
        /* Timeline mode: audio is inside Remotion composition — Player handles sync */
        (() => {
          const tlAudio = props?.timeline?.audio?.[0]
          return tlAudio?.audioUrl ? (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded-lg">
              <span style={{ fontSize: 11 }}>🔊</span>
              <span className="text-[10px] text-green-700 font-mono truncate max-w-[200px]" title={tlAudio.audioUrl}>
                {tlAudio.audioUrl.split('/').pop()}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg">
              <span style={{ fontSize: 11 }}>🔇</span>
              <span className="text-[10px] text-gray-400">No voiceover</span>
            </div>
          )
        })()
      ) : resolvedAudioUrl ? (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] transition-all ${
          audioError
            ? 'bg-red-50 border-red-200 text-red-600'
            : audioReady
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'
        }`}>
          <span style={{ fontSize: 11 }}>
            {audioError ? '❌' : audioReady ? '🔊' : '⏳'}
          </span>
          <span className="font-mono truncate max-w-[200px]" title={resolvedAudioUrl}>
            {audioError
              ? 'Audio load failed — check URL'
              : audioReady
                ? resolvedAudioUrl.split('/').pop()
                : 'Buffering voiceover…'}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg">
          <span style={{ fontSize: 11 }}>🔇</span>
          <span className="text-[10px] text-gray-400">No voiceover</span>
        </div>
      )}
    </div>
  )
}
