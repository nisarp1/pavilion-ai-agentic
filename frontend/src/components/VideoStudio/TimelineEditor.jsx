import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { updateClip, selectClip, setCurrentFrame, resetClips, pushHistory, addClip } from '../../store/slices/videoStudioSlice'

const RULER_HEIGHT = 28
const TRACK_HEIGHT = 34
const HANDLE_WIDTH = 8
const FPS = 30

function frameToTime(frame) {
  const s = Math.floor(frame / FPS)
  const f = frame % FPS
  return `${s}s ${String(f).padStart(2, '0')}f`
}

function RulerRow({ zoom, currentFrame, maxFrames, onRulerMouseDown }) {
  const ticks = []
  for (let f = 0; f <= maxFrames; f += FPS) {
    const isMajor = f % (FPS * 2) === 0
    ticks.push({ f, isMajor, label: isMajor ? `${f / FPS}s` : null })
  }
  return (
    <div
      style={{ position: 'sticky', top: 0, zIndex: 15, height: RULER_HEIGHT, background: '#1e293b', borderBottom: '1px solid #334155', cursor: 'col-resize', flexShrink: 0, width: maxFrames * zoom }}
      onMouseDown={onRulerMouseDown}
    >
      {ticks.map(({ f, isMajor, label }) => (
        <div key={f} style={{ position: 'absolute', left: f * zoom, top: 0, bottom: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: isMajor ? 0 : 12, bottom: 0, width: 1, background: isMajor ? '#475569' : '#334155' }} />
          {label && (
            <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 9, color: '#94a3b8', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              {label}
            </span>
          )}
        </div>
      ))}
      {/* Playhead on ruler */}
      <div style={{ position: 'absolute', left: currentFrame * zoom - 1, top: 0, bottom: 0, width: 2, background: '#ef4444', pointerEvents: 'none', zIndex: 5 }} />
    </div>
  )
}

function ClipBar({ clip, zoom, isSelected, onSelect, onMouseDownMove, onMouseDownLeft, onMouseDownRight }) {
  const left = clip.globalStartFrame * zoom
  const width = Math.max(clip.durationFrames * zoom, HANDLE_WIDTH * 2 + 4)
  return (
    <div
      style={{ position: 'absolute', left, top: 3, width, height: TRACK_HEIGHT - 6, borderRadius: 5, background: clip.color, cursor: 'grab', outline: isSelected ? '2px solid white' : '2px solid transparent', outlineOffset: -1, zIndex: 2, overflow: 'hidden', userSelect: 'none' }}
      onMouseDown={e => { e.stopPropagation(); onSelect(); onMouseDownMove(e) }}
      onClick={e => e.stopPropagation()}
    >
      {/* Left resize handle */}
      <div
        style={{ position: 'absolute', left: 0, top: 0, width: HANDLE_WIDTH, height: '100%', cursor: 'w-resize', background: 'rgba(0,0,0,0.25)', zIndex: 3 }}
        onMouseDown={e => { e.stopPropagation(); onSelect(); onMouseDownLeft(e) }}
        onClick={e => e.stopPropagation()}
      />
      <span style={{ position: 'absolute', left: HANDLE_WIDTH + 4, right: HANDLE_WIDTH + 4, top: 0, bottom: 0, display: 'flex', alignItems: 'center', fontSize: 10, color: 'rgba(255,255,255,0.95)', fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {clip.label}
      </span>
      {/* Right resize handle */}
      <div
        style={{ position: 'absolute', right: 0, top: 0, width: HANDLE_WIDTH, height: '100%', cursor: 'e-resize', background: 'rgba(0,0,0,0.25)', zIndex: 3 }}
        onMouseDown={e => { e.stopPropagation(); onSelect(); onMouseDownRight(e) }}
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

function Playhead({ frame, zoom, totalTrackHeight }) {
  return (
    <div style={{ position: 'absolute', left: frame * zoom, top: 0, bottom: 0, width: 2, background: '#ef4444', pointerEvents: 'none', zIndex: 10 }}>
      <div style={{ width: 10, height: 10, background: '#ef4444', borderRadius: '50%', transform: 'translateX(-4px)', marginTop: -2 }} />
    </div>
  )
}

export default function TimelineEditor() {
  const dispatch = useDispatch()
  const { clips = [], selectedClipId, currentFrame } = useSelector(s => s.videoStudio)
  const [zoom, setZoom] = useState(3)
  const [dragState, setDragState] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const scrollRef = useRef(null)
  const isDraggingRef = useRef(false)

  // Track labels column width
  const LABEL_WIDTH = 96

  // Sort clips by track
  const sortedClips = [...clips].sort((a, b) => a.track - b.track)

  const maxFrames = clips.reduce((m, c) => Math.max(m, c.globalStartFrame + c.durationFrames), 420)

  function handleRulerMouseDown(e) {
    const rect = scrollRef.current.getBoundingClientRect()
    const scrollLeft = scrollRef.current.scrollLeft
    const xInCanvas = e.clientX - rect.left - LABEL_WIDTH + scrollLeft
    const frame = Math.max(0, Math.min(maxFrames - 1, Math.round(xInCanvas / zoom)))
    dispatch(setCurrentFrame(frame))
    // Allow dragging playhead along ruler
    const onMove = (moveE) => {
      const x = moveE.clientX - rect.left - LABEL_WIDTH + scrollRef.current.scrollLeft
      dispatch(setCurrentFrame(Math.max(0, Math.min(maxFrames - 1, Math.round(x / zoom)))))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function startDrag(e, clip, type) {
    e.preventDefault()
    dispatch(pushHistory())
    isDraggingRef.current = true
    setDragState({ clipId: clip.id, type, startX: e.clientX, originalStartFrame: clip.globalStartFrame, originalDuration: clip.durationFrames })
  }

  useEffect(() => {
    if (!dragState) return
    const handleMove = (e) => {
      const deltaPx = e.clientX - dragState.startX
      const deltaFrames = Math.round(deltaPx / zoom)
      let changes = {}
      if (dragState.type === 'move') {
        changes = { globalStartFrame: dragState.originalStartFrame + deltaFrames }
      } else if (dragState.type === 'left') {
        changes = { globalStartFrame: dragState.originalStartFrame + deltaFrames, durationFrames: dragState.originalDuration - deltaFrames }
      } else if (dragState.type === 'right') {
        changes = { durationFrames: dragState.originalDuration + deltaFrames }
      }
      dispatch(updateClip({ id: dragState.clipId, changes }))
    }
    const handleUp = () => {
      setDragState(null)
      isDraggingRef.current = false
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragState, zoom, dispatch])

  useEffect(() => {
    if (!addOpen) return
    const close = () => setAddOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [addOpen])

  const totalTrackHeight = sortedClips.length * TRACK_HEIGHT
  const canvasWidth = maxFrames * zoom

  return (
    <div className="flex flex-col bg-gray-900 rounded-xl border border-gray-700 overflow-hidden select-none" style={{ height: '100%' }}>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-gray-700 bg-gray-950 flex-shrink-0">
        <span className="text-xs text-red-400 font-mono w-20">{frameToTime(currentFrame)}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Zoom</span>
          <input
            type="range" min="1" max="8" step="0.5" value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="w-20 h-1 accent-blue-500 cursor-pointer"
          />
          <span className="text-xs text-gray-600 font-mono">{zoom}×</span>
        </div>
        <div className="flex-1" />

        {/* Add Track dropdown */}
        <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
          <button
            onClick={() => setAddOpen(v => !v)}
            className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded border border-gray-700 hover:border-gray-500 transition-colors flex items-center gap-1"
          >
            ＋ Add Track
          </button>
          {addOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, overflow: 'hidden', zIndex: 50, minWidth: 160 }}>
              {[
                { type: 'image', label: 'Image Track' },
                { type: 'video', label: 'Video Track' },
                { type: 'audio', label: 'Audio Track' },
                { type: 'text',  label: 'Text Track'  },
              ].map(({ type, label }) => (
                <button
                  key={label}
                  onClick={() => { dispatch(addClip({ type })); setAddOpen(false) }}
                  className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => dispatch(resetClips())}
          className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded border border-gray-700 hover:border-gray-500 transition-colors"
        >
          Reset clips
        </button>
      </div>

      {/* Main scrollable canvas */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', minHeight: '100%' }}>

          {/* Track label column (sticky left) */}
          <div style={{ width: LABEL_WIDTH, flexShrink: 0, background: '#0f172a', borderRight: '1px solid #1e293b', zIndex: 20, position: 'sticky', left: 0 }}>
            <div style={{ height: RULER_HEIGHT, borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', paddingLeft: 8, position: 'sticky', top: 0, zIndex: 26, background: '#0f172a' }}>
              <span style={{ fontSize: 9, color: '#475569', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Track</span>
            </div>
            {sortedClips.map(clip => (
              <div
                key={clip.id}
                style={{ height: TRACK_HEIGHT, display: 'flex', alignItems: 'center', paddingLeft: 8, borderBottom: '1px solid #1e293b', cursor: 'pointer', background: selectedClipId === clip.id ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                onClick={() => dispatch(selectClip(selectedClipId === clip.id ? null : clip.id))}
              >
                <div style={{ width: 8, height: 8, borderRadius: 2, background: clip.color, flexShrink: 0, marginRight: 6 }} />
                <span style={{ fontSize: 9, color: '#94a3b8', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 68 }}>{clip.label}</span>
              </div>
            ))}
          </div>

          {/* Timeline canvas */}
          <div style={{ position: 'relative', flexShrink: 0, width: canvasWidth }}>
            <RulerRow zoom={zoom} currentFrame={currentFrame} maxFrames={maxFrames} onRulerMouseDown={handleRulerMouseDown} />

            {/* Track rows */}
            {sortedClips.map((clip, idx) => (
              <div
                key={clip.id}
                style={{ position: 'relative', height: TRACK_HEIGHT, borderBottom: '1px solid #1e293b', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}
                onClick={() => dispatch(selectClip(null))}
              >
                <ClipBar
                  clip={clip}
                  zoom={zoom}
                  isSelected={selectedClipId === clip.id}
                  onSelect={() => dispatch(selectClip(clip.id))}
                  onMouseDownMove={e => clip.id !== 'chrome' && clip.id !== 'audio' && startDrag(e, clip, 'move')}
                  onMouseDownLeft={e => clip.id !== 'chrome' && clip.id !== 'audio' && startDrag(e, clip, 'left')}
                  onMouseDownRight={e => clip.id !== 'chrome' && clip.id !== 'audio' && startDrag(e, clip, 'right')}
                />
              </div>
            ))}

            {/* Playhead line across all tracks */}
            <div style={{ position: 'absolute', left: currentFrame * zoom, top: RULER_HEIGHT, bottom: 0, width: 1, background: 'rgba(239,68,68,0.6)', pointerEvents: 'none', zIndex: 10 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
