import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Player } from '@remotion/player'
import { PavilionReelComposition } from './compositions/PavilionReelComposition'
import { setCurrentFrame, selectClip, updateClip, pushHistory } from '../../store/slices/videoStudioSlice'

const SX = 270 / 1080
const SY = 480 / 1920
const COMP_CX = 540   // composition center X (transform-origin)
const COMP_CY = 960   // composition center Y (transform-origin)
const FPS = 30

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
  const { clips, currentFrame, audioUrl, selectedClipId } = useSelector(s => s.videoStudio)
  const isSyncingRef  = useRef(false)  // kept for safety; isPlaying() guard is the real fix
  const [overlayDrag, setOverlayDrag] = useState(null)
  const [audioReady,  setAudioReady]  = useState(false)
  const [audioError,  setAudioError]  = useState(false)

  // ── Resolve audio URL to absolute ──────────────────────────────────────────
  // Relative Django media paths (/media/...) go through the Vite proxy at localhost:3001.
  // Reject non-servable schemes like gcs:// or s3:// which would produce a malformed URL.
  const resolvedAudioUrl = audioUrl && (audioUrl.startsWith('http') || audioUrl.startsWith('/'))
    ? (audioUrl.startsWith('/') ? `${window.location.origin}${audioUrl}` : audioUrl)
    : null

  // ── Native audio element: load & buffer whenever URL changes ───────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (!resolvedAudioUrl) {
      audio.src = ''
      setAudioReady(false)
      setAudioError(false)
      return
    }

    setAudioReady(false)
    setAudioError(false)
    audio.src = resolvedAudioUrl
    audio.preload = 'auto'
    audio.load()
  }, [resolvedAudioUrl])

  // ── Sync native audio with Remotion Player events ──────────────────────────
  // This is the KEY FIX: instead of relying on Remotion's Web Audio pipeline
  // (which has CORS, timing, and buffering issues), we drive a plain <audio>
  // element directly. The result is rock-solid, gap-free audio playback.
  useEffect(() => {
    const player = playerRef.current
    const audio  = audioRef.current
    if (!player || !audio) return

    const onPlay = () => {
      if (!resolvedAudioUrl) return
      // Sync position first, then play
      audio.currentTime = player.getCurrentFrame() / FPS
      audio.play().catch(() => {
        // Autoplay blocked — browser needs a user gesture first.
        // The user already clicked play on the Remotion Player, so this
        // should not happen in practice, but we catch it just in case.
      })
    }

    const onPause = () => {
      audio.pause()
    }

    const onSeeked = ({ detail }) => {
      // Remotion fires 'seeked' when the user drags the timeline playhead
      audio.currentTime = detail.frame / FPS
    }

    const onEnded = () => {
      audio.pause()
      audio.currentTime = 0
    }

    const onRateChange = ({ detail }) => {
      if (detail?.playbackRate) audio.playbackRate = detail.playbackRate
    }

    player.addEventListener('play',        onPlay)
    player.addEventListener('pause',       onPause)
    player.addEventListener('seeked',      onSeeked)
    player.addEventListener('ended',       onEnded)
    player.addEventListener('ratechange',  onRateChange)

    return () => {
      player.removeEventListener('play',       onPlay)
      player.removeEventListener('pause',      onPause)
      player.removeEventListener('seeked',     onSeeked)
      player.removeEventListener('ended',      onEnded)
      player.removeEventListener('ratechange', onRateChange)
    }
  // Re-subscribe whenever the audio URL changes so we're always in sync
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

  // ── Timeline playhead → Player seek ────────────────────────────────────────
  // IMPORTANT: Only seek when the player is PAUSED (user scrubbing the ruler).
  // During playback, frameupdate already updates Redux state. Calling seekTo()
  // here during playback creates a 30fps feedback loop that re-seeks the player
  // every single frame, interrupting audio playback and causing the garbled sound.
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    if (player.isPlaying()) return   // ← breaks the feedback loop
    player.seekTo(currentFrame)
  }, [currentFrame])

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

  // ── inputProps: DO NOT pass audioSrc to Remotion ───────────────────────────
  // Audio is handled 100% by the native <audio> element above.
  // Passing audioSrc to Remotion would double-play (native + Web Audio API).
  const inputProps = { ...props, audioSrc: undefined, clips }

  // Visible clips at current frame, ordered back-to-front
  const visibleClips = [...clips]
    .filter(c => CLIP_BOXES[c.templateClipId || c.id] &&
      currentFrame >= c.globalStartFrame &&
      currentFrame < c.globalStartFrame + c.durationFrames)
    .sort((a, b) => {
      const aZ = Z_ORDER.indexOf(a.templateClipId || a.id)
      const bZ = Z_ORDER.indexOf(b.templateClipId || b.id)
      return (aZ === -1 ? 999 : aZ) - (bZ === -1 ? 999 : bZ)
    })

  const selectedClip = clips.find(c => c.id === selectedClipId)
  const totalFrames  = clips.reduce((m, c) => Math.max(m, c.globalStartFrame + c.durationFrames), 420)

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
        Live Preview (1080 × 1920 · {Math.round(totalFrames / FPS)} s)
      </p>

      {/* ── Native audio element (hidden) — drives the voiceover ── */}
      {/* This is outside the Remotion Player and uses the browser's native audio engine */}
      <audio
        ref={audioRef}
        preload="auto"
        style={{ display: 'none' }}
        onCanPlayThrough={() => { setAudioReady(true); setAudioError(false) }}
        onError={() => { setAudioError(true); setAudioReady(false) }}
        onLoadStart={() => { setAudioReady(false); setAudioError(false) }}
      />

      <div style={{ position: 'relative', width: 270, height: 480, borderRadius: 12, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #e5e7eb' }}>
        <Player
          ref={playerRef}
          component={PavilionReelComposition}
          inputProps={inputProps}
          durationInFrames={totalFrames}
          fps={FPS}
          compositionWidth={1080}
          compositionHeight={1920}
          style={{ width: 270, height: 480 }}
          controls
          loop
          autoPlay={false}
          // No volume controls needed — audio is handled natively, not by Remotion
          showVolumeControls={false}
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
      {resolvedAudioUrl ? (
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
