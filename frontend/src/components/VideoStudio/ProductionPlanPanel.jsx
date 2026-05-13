import { useState, useRef, useCallback, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, rectSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { updateAssetUrl, reorderAssets, setAssets, setAudioUrl, setVideoData } from '../../store/slices/videoStudioSlice'
import {
  FiMic, FiFilm, FiPackage, FiCopy, FiCheck, FiUpload, FiLink,
  FiX, FiMenu, FiImage, FiVideo, FiList, FiPlus, FiEdit3, FiSave,
} from 'react-icons/fi'
import api from '../../services/api'
import { showSuccess, showError } from '../../utils/toast'

const TABS = [
  { id: 'voiceover', label: 'Voiceover', icon: FiMic },
  { id: 'scenes',    label: 'Scenes',    icon: FiFilm },
  { id: 'needed',   label: 'Needed',    icon: FiList },
  { id: 'assets',   label: 'Assets',    icon: FiPackage },
]

// ── Utilities ─────────────────────────────────────────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
      title="Copy"
    >
      {copied ? <FiCheck size={13} className="text-green-500" /> : <FiCopy size={13} />}
    </button>
  )
}

function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = e => res(e.target.result)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

// ── Voiceover tab ─────────────────────────────────────────────────────────────

function VoiceoverTab({ plan }) {
  const dispatch = useDispatch()
  const audioUrl = useSelector(s => s.videoStudio.audioUrl)

  const [elLoading,   setElLoading]   = useState(false)
  const [gtLoading,   setGtLoading]   = useState(false)
  const [elError,     setElError]     = useState('')
  const [elUrl,       setElUrl]       = useState('')
  const [editing,     setEditing]     = useState(false)
  const [editedScript, setEditedScript] = useState('')

  const vo     = plan.voiceover || {}
  const script = vo.script_plain || ''

  const activeScript = editing ? editedScript : script

  const isElevenLabsActive = plan.audio_source === 'elevenlabs' || !!elUrl
  const isGoogleTTSActive  = plan.audio_source === 'google_tts'

  const resolveAudioUrl = (raw) =>
    raw.startsWith('/') ? `${window.location.origin}${raw}` : raw

  const refreshPlan = useCallback(async (url) => {
    const articleRes = await api.get(`/articles/${plan.article_id}/`)
    const freshPlan  = articleRes.data.video_production_plan || {}
    const freshProps = freshPlan.modular_props || freshPlan.props || {}
    dispatch(setVideoData({
      props:    Object.keys(freshProps).length ? freshProps : undefined,
      audioUrl: url,
    }))
  }, [plan.article_id, dispatch])

  const handleGenerateElevenLabs = useCallback(async () => {
    if (!plan.article_id) { setElError('Run the pipeline on an article first'); return }
    setElLoading(true); setElError('')
    try {
      const res = await api.post(`/articles/${plan.article_id}/generate_elevenlabs_audio/`, {
        script: activeScript || undefined,
      })
      if (res.data.status === 'success') {
        const url = resolveAudioUrl(res.data.audio_url)
        setElUrl(url)
        await refreshPlan(url)
        setEditing(false)
        showSuccess('ElevenLabs audio ready — render will use this track')
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'ElevenLabs generation failed'
      setElError(msg); showError(msg)
    } finally { setElLoading(false) }
  }, [plan.article_id, activeScript, refreshPlan])

  const handleGenerateGoogleTTS = useCallback(async () => {
    if (!plan.article_id) { showError('Run the pipeline on an article first'); return }
    setGtLoading(true); setElError('')
    try {
      const res = await api.post(`/articles/${plan.article_id}/generate_google_tts_audio/`, {
        script: activeScript || undefined,
      })
      if (res.data.status === 'success') {
        const url = resolveAudioUrl(res.data.audio_url)
        await refreshPlan(url)
        setElUrl('')  // clear ElevenLabs session flag
        setEditing(false)
        showSuccess('Google TTS audio ready')
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Google TTS generation failed'
      showError(msg)
    } finally { setGtLoading(false) }
  }, [plan.article_id, activeScript, refreshPlan])

  const handleEditToggle = () => {
    if (!editing) setEditedScript(script)
    setEditing(v => !v)
  }

  const anyLoading = elLoading || gtLoading

  return (
    <div className="space-y-4">
      {/* Script */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Script (Malayalam)</h4>
          <div className="flex items-center gap-1">
            <CopyButton text={activeScript} />
            <button
              onClick={handleEditToggle}
              className={`p-1 rounded transition-colors ${editing ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-blue-600'}`}
              title={editing ? 'Cancel edit' : 'Edit script'}
            >
              {editing ? <FiX size={13} /> : <FiEdit3 size={13} />}
            </button>
          </div>
        </div>

        {editing ? (
          <textarea
            value={editedScript}
            onChange={e => setEditedScript(e.target.value)}
            className="w-full bg-white rounded-xl p-3 text-sm text-gray-700 leading-relaxed border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            rows={8}
            dir="auto"
            autoFocus
          />
        ) : (
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border border-gray-100 max-h-48 overflow-y-auto">
            {script || <span className="text-gray-400 italic">No script generated</span>}
          </div>
        )}

        {editing && (
          <p className="text-[10px] text-blue-500 mt-1">
            Edited script will be used for the next generation and saved back to the plan.
          </p>
        )}

        <div className="flex gap-4 mt-2 text-xs text-gray-400">
          <span>⏱ ~{vo.estimated_duration_seconds || vo.duration_seconds || '?'}s</span>
          <span>🌐 {vo.language || 'ml-IN'}</span>
          <span>🎤 {vo.voice_used || vo.voice_id || 'Default'}</span>
        </div>
      </div>

      {/* Audio Source Panel */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
        {/* Header: source badge */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Audio Track</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            isElevenLabsActive ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'
          }`}>
            {isElevenLabsActive ? '🎙️ ElevenLabs' : '☁️ Google TTS'}
          </span>
        </div>

        {/* Native audio player */}
        {audioUrl && (
          <audio key={audioUrl} controls src={audioUrl} className="w-full" style={{ height: 32 }} />
        )}

        {elError && <p className="text-[10px] text-red-500 leading-snug">{elError}</p>}

        {/* Google TTS — playground / testing */}
        <button
          onClick={handleGenerateGoogleTTS}
          disabled={anyLoading || !activeScript}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-40 ${
            isGoogleTTSActive && !isElevenLabsActive
              ? 'bg-sky-100 text-sky-700 border border-sky-200 hover:bg-sky-200'
              : 'bg-gradient-to-r from-sky-500 to-blue-500 text-white hover:from-sky-600 hover:to-blue-600'
          }`}
        >
          {gtLoading
            ? <><span className="animate-spin inline-block">⏳</span> Generating…</>
            : isGoogleTTSActive && !isElevenLabsActive
            ? '☁️ Regenerate (Google TTS)'
            : '☁️ Generate (Google TTS)'
          }
        </button>
        <p className="text-[9px] text-gray-400 text-center -mt-1">Free · for playground & testing</p>

        {/* ElevenLabs — production */}
        <button
          onClick={handleGenerateElevenLabs}
          disabled={anyLoading || !activeScript}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-40 ${
            isElevenLabsActive
              ? 'bg-violet-100 text-violet-700 border border-violet-200 hover:bg-violet-200'
              : 'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700'
          }`}
        >
          {elLoading
            ? <><span className="animate-spin inline-block">⏳</span> Generating…</>
            : isElevenLabsActive
            ? '🎙️ Regenerate (ElevenLabs)'
            : '🎙️ Generate (ElevenLabs)'
          }
        </button>
        <p className="text-[9px] text-gray-400 text-center -mt-1">Paid API · for final approved reels only</p>

        {isElevenLabsActive && (
          <p className="text-[9px] text-violet-500 text-center font-medium">
            ✓ ElevenLabs audio active — render will use this track
          </p>
        )}
      </div>
    </div>
  )
}

// ── Scenes tab ────────────────────────────────────────────────────────────────

function ScenesTab({ plan }) {
  const scenes = plan.scenes || []
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
        Scene Breakdown ({scenes.length})
      </h4>
      {scenes.length === 0 && (
        <p className="text-sm text-gray-400 italic">No scenes — timeline auto-generated from audio.</p>
      )}
      {scenes.map((scene, i) => {
        const startSec = ((scene.start_frame || 0) / 30).toFixed(1)
        const endSec   = (((scene.start_frame || 0) + (scene.duration_frames || 0)) / 30).toFixed(1)
        return (
          <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-gray-700">
                Scene {scene.scene_number || i + 1}
                <span className="text-gray-400 font-normal ml-1.5">{scene.template_id}</span>
              </span>
              <span className="text-xs font-mono text-gray-400">{startSec}s – {endSec}s</span>
            </div>
            <p className="text-sm text-gray-600">{scene.description}</p>
          </div>
        )
      })}
    </div>
  )
}

// ── Assets Needed tab (read-only checklist) ───────────────────────────────────

function AssetsNeededTab({ assets }) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
        <FiList size={28} className="mb-2 opacity-40" />
        <p className="text-sm font-medium text-gray-500">No assets required yet</p>
        <p className="text-xs mt-1">Run the AI pipeline to generate the asset list</p>
      </div>
    )
  }

  const ready = assets.filter(a => a.url).length
  const total = assets.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Required Assets</h4>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          ready === total ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {ready}/{total} filled
        </span>
      </div>

      <div className="space-y-1.5">
        {assets.map((asset, i) => {
          const isVideo = asset.type === 'video'
          const isFilled = !!asset.url
          return (
            <div
              key={asset.id}
              className={`flex items-start gap-2.5 rounded-lg px-3 py-2 border transition-colors ${
                isFilled ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
              }`}
            >
              <div className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                isFilled ? 'bg-green-200 text-green-700' : 'bg-gray-100 text-gray-400'
              }`}>
                {i + 1}
              </div>
              <div className="flex-shrink-0 mt-0.5">
                {isVideo
                  ? <FiVideo size={12} className={isFilled ? 'text-blue-500' : 'text-gray-400'} />
                  : <FiImage size={12} className={isFilled ? 'text-purple-500' : 'text-gray-400'} />
                }
              </div>
              <p className="flex-1 text-xs text-gray-600 leading-snug">{asset.description}</p>
              <div className="flex-shrink-0 mt-0.5">
                {isFilled
                  ? <FiCheck size={12} className="text-green-500" />
                  : <div className="w-2 h-2 rounded-full bg-amber-400" />
                }
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-gray-400 text-center pt-1">
        Upload assets in the <strong>Assets</strong> tab to fill these slots.
      </p>
    </div>
  )
}

// ── Media Library Picker ──────────────────────────────────────────────────────

function MediaLibraryPicker({ onSelect, onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/media/?page_size=40')
      .then(r => setItems(r.data?.results || r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[70vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-bold text-sm text-gray-700">Media Library</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><FiX size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading && <p className="text-sm text-gray-400 text-center py-8">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No media found</p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {items.map((item, i) => {
              const url = item.file || item.url || item.image || item.featured_image || ''
              if (!url) return null
              return (
                <button
                  key={i}
                  onClick={() => { onSelect(url); onClose() }}
                  className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-purple-500 transition-all"
                >
                  <img src={url} alt={item.title || ''} className="w-full h-full object-cover" />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sortable asset card (grid item) ──────────────────────────────────────────

function SortableAssetCard({ asset, index, onReplace, onRemove }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: asset.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  }

  const fileRef = useRef()
  const isVideo = asset.type === 'video'
  const hasUrl  = !!asset.url

  const handleFileInput = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = await readFileAsDataURL(file)
      onReplace(asset.id, url, file)
    }
    e.target.value = ''
  }, [asset.id, onReplace])

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-xl border-2 overflow-hidden group transition-all bg-white ${
        isDragging
          ? 'shadow-2xl border-purple-400'
          : hasUrl
          ? 'border-green-300 shadow-sm'
          : 'border-dashed border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Thumbnail area */}
      <div className="w-full aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
        {hasUrl ? (
          isVideo
            ? (
              <video
                src={asset.url}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
            )
            : <img src={asset.url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-300">
            {isVideo ? <FiVideo size={22} /> : <FiImage size={22} />}
            <span className="text-[9px] font-medium">{isVideo ? 'Video' : 'Image'}</span>
          </div>
        )}
      </div>

      {/* Slot number badge */}
      <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded bg-black/50 text-white text-[9px] font-bold flex items-center justify-center backdrop-blur-sm">
        {index + 1}
      </div>

      {/* Drag handle — visible on hover */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded bg-black/50 text-white flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
        title="Drag to reorder"
      >
        <FiMenu size={10} />
      </div>

      {/* Remove button — only when filled */}
      {hasUrl && (
        <button
          onClick={() => onRemove(asset.id)}
          className="absolute top-1.5 right-7 w-5 h-5 rounded bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 backdrop-blur-sm"
          title="Remove"
        >
          <FiX size={9} />
        </button>
      )}

      {/* Footer */}
      <div className="px-2 py-1.5 bg-white border-t border-gray-100">
        <p className="text-[9px] text-gray-400 leading-snug line-clamp-1 mb-1" title={asset.description}>
          {asset.description || (isVideo ? 'Video slot' : 'Image slot')}
        </p>
        <div className="flex gap-1">
          <input
            ref={fileRef}
            type="file"
            accept={isVideo ? 'video/*,image/*' : 'image/*,video/*'}
            className="hidden"
            onChange={handleFileInput}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1 text-[9px] py-0.5 rounded bg-gray-100 hover:bg-purple-100 hover:text-purple-700 text-gray-500 transition-colors font-medium"
          >
            <FiUpload size={8} />
            {hasUrl ? 'Replace' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Assets tab (Drive-like) ───────────────────────────────────────────────────

function AssetsGridTab() {
  const dispatch = useDispatch()
  const assets   = useSelector(s => s.videoStudio.assets)

  const [activeId,      setActiveId]      = useState(null)
  const [isDroppingOn,  setIsDroppingOn]  = useState(false)
  const [showPaste,     setShowPaste]     = useState(false)
  const [pasteUrl,      setPasteUrl]      = useState('')
  const [showLibrary,   setShowLibrary]   = useState(false)
  const [libraryTarget, setLibraryTarget] = useState(null)
  const [busyMsg,       setBusyMsg]       = useState('')

  const bulkFileRef = useRef()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // ── helpers ────────────────────────────────────────────────────────────────

  const saveToLibrary = useCallback(async (file) => {
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('title', file.name)
      await api.post('/media/', form)
    } catch { /* best effort */ }
  }, [])

  const saveUrlToLibrary = useCallback(async (url) => {
    try {
      await api.post('/media/save_external/', { image_url: url, title: 'Pasted URL' })
    } catch { /* best effort */ }
  }, [])

  // Fill slots with uploaded files in order. Extra files extend the asset list.
  // Builds the full new array locally then dispatches ONE setAssets to avoid stale closures.
  const assignFilesToSlots = useCallback(async (files) => {
    const accepted = Array.from(files).filter(
      f => f.type.startsWith('image/') || f.type.startsWith('video/')
    )
    if (!accepted.length) return

    setBusyMsg(`Processing ${accepted.length} file${accepted.length > 1 ? 's' : ''}…`)

    // Read all data URLs in parallel
    const urls = await Promise.all(accepted.map(readFileAsDataURL))

    // Build the complete new assets array locally
    const newAssets = assets.map(a => ({ ...a }))
    let emptySearchFrom = 0

    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i]
      const url  = urls[i]
      const type = file.type.startsWith('video/') ? 'video' : 'image'

      // Find next empty slot in our LOCAL copy (avoids stale closure)
      let emptyIdx = -1
      for (let j = emptySearchFrom; j < newAssets.length; j++) {
        if (!newAssets[j].url) { emptyIdx = j; break }
      }

      if (emptyIdx >= 0) {
        newAssets[emptyIdx] = { ...newAssets[emptyIdx], url, status: 'uploaded' }
        emptySearchFrom = emptyIdx + 1
      } else {
        // Extend the asset list
        newAssets.push({
          id:          `asset-user-${Date.now()}-${i}`,
          description: file.name,
          sceneIndex:  newAssets.length,
          type,
          status:      'uploaded',
          url,
        })
      }

      // Fire-and-forget library save
      saveToLibrary(file)
    }

    dispatch(setAssets(newAssets))
    setBusyMsg('')
  }, [assets, dispatch, saveToLibrary])

  // ── event handlers ────────────────────────────────────────────────────────

  const handleBulkFileInput = useCallback((e) => {
    assignFilesToSlots(e.target.files)
    e.target.value = ''
  }, [assignFilesToSlots])

  const handleDropOnZone = useCallback(async (e) => {
    e.preventDefault()
    setIsDroppingOn(false)
    assignFilesToSlots(e.dataTransfer.files)
  }, [assignFilesToSlots])

  const handlePasteUrlSubmit = useCallback(async (e) => {
    e?.preventDefault()
    const url = pasteUrl.trim()
    if (!url) return

    const isVideo = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url)
    const type    = isVideo ? 'video' : 'image'

    const emptySlot = assets.find(a => !a.url)
    if (emptySlot) {
      dispatch(updateAssetUrl({ id: emptySlot.id, url }))
    } else {
      dispatch(setAssets([...assets, {
        id:          `asset-url-${Date.now()}`,
        description: 'Pasted URL',
        sceneIndex:  assets.length,
        type,
        status:      'uploaded',
        url,
      }]))
    }

    if (!isVideo) saveUrlToLibrary(url)

    setPasteUrl('')
    setShowPaste(false)
  }, [pasteUrl, assets, dispatch, saveUrlToLibrary])

  // Global Ctrl+V paste handler — fills next empty slot with clipboard image
  useEffect(() => {
    const onPaste = async (e) => {
      const items = e.clipboardData?.items || []
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            const url = await readFileAsDataURL(file)
            const emptySlot = assets.find(a => !a.url)
            if (emptySlot) {
              dispatch(updateAssetUrl({ id: emptySlot.id, url }))
              saveToLibrary(file)
            }
          }
          return
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [assets, dispatch, saveToLibrary])

  const handleReplace = useCallback(async (assetId, url, file) => {
    dispatch(updateAssetUrl({ id: assetId, url }))
    if (file) saveToLibrary(file)
  }, [dispatch, saveToLibrary])

  const handleRemove = useCallback((assetId) => {
    dispatch(updateAssetUrl({ id: assetId, url: '' }))
  }, [dispatch])

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveId(null)
    if (!over || active.id === over.id) return
    const from = assets.findIndex(a => a.id === active.id)
    const to   = assets.findIndex(a => a.id === over.id)
    if (from >= 0 && to >= 0) dispatch(reorderAssets({ fromIndex: from, toIndex: to }))
  }, [assets, dispatch])

  const handleLibrarySelect = useCallback((url) => {
    if (libraryTarget) {
      dispatch(updateAssetUrl({ id: libraryTarget, url }))
      setLibraryTarget(null)
    } else {
      const emptySlot = assets.find(a => !a.url)
      if (emptySlot) dispatch(updateAssetUrl({ id: emptySlot.id, url }))
    }
  }, [libraryTarget, assets, dispatch])

  // ── counts ────────────────────────────────────────────────────────────────

  const ready = assets.filter(a => a.url).length
  const total = assets.length
  const activeAsset = assets.find(a => a.id === activeId)

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Assets</h4>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          total === 0
            ? 'bg-gray-100 text-gray-400'
            : ready === total
            ? 'bg-green-100 text-green-700'
            : 'bg-amber-100 text-amber-700'
        }`}>
          {ready}/{total} ready
        </span>
      </div>

      {/* Action bar */}
      <div className="flex gap-1.5 flex-wrap">
        <input
          ref={bulkFileRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={handleBulkFileInput}
        />
        <button
          onClick={() => bulkFileRef.current?.click()}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold shadow-sm"
        >
          <FiUpload size={11} /> Upload
        </button>
        <button
          onClick={() => setShowPaste(v => !v)}
          className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-colors font-semibold ${
            showPaste
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
          }`}
        >
          <FiLink size={11} /> Paste URL
        </button>
        <button
          onClick={() => { setLibraryTarget(null); setShowLibrary(true) }}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-semibold"
        >
          📚 Library
        </button>
        {total > 0 && (
          <button
            onClick={() => {
              const newAsset = {
                id:          `asset-blank-${Date.now()}`,
                description: 'New slot',
                sceneIndex:  total,
                type:        'image',
                status:      'needed',
                url:         '',
              }
              dispatch(setAssets([...assets, newAsset]))
            }}
            className="flex items-center gap-1 text-[11px] px-2 py-1 bg-white text-gray-400 border border-dashed border-gray-300 rounded-lg hover:text-gray-600 hover:border-gray-400 transition-colors"
            title="Add empty slot"
          >
            <FiPlus size={11} />
          </button>
        )}
      </div>

      {/* Paste URL panel */}
      {showPaste && (
        <form
          onSubmit={handlePasteUrlSubmit}
          className="flex gap-1.5 p-2 bg-blue-50 rounded-xl border border-blue-100"
        >
          <input
            autoFocus
            type="url"
            value={pasteUrl}
            onChange={e => setPasteUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="flex-1 text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white min-w-0"
          />
          <button
            type="submit"
            disabled={!pasteUrl.trim()}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 font-semibold"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setShowPaste(false); setPasteUrl('') }}
            className="text-xs px-2 py-1.5 text-gray-500 hover:text-gray-700"
          >
            <FiX size={13} />
          </button>
        </form>
      )}

      {/* Busy indicator */}
      {busyMsg && (
        <p className="text-[10px] text-purple-600 text-center animate-pulse">{busyMsg}</p>
      )}

      {/* Empty state with drop zone */}
      {total === 0 ? (
        <div
          className={`rounded-2xl border-2 border-dashed transition-all py-14 text-center cursor-pointer ${
            isDroppingOn
              ? 'border-purple-400 bg-purple-50'
              : 'border-gray-200 bg-gray-50 hover:border-purple-300 hover:bg-purple-50/40'
          }`}
          onDragOver={e => { e.preventDefault(); setIsDroppingOn(true) }}
          onDragLeave={() => setIsDroppingOn(false)}
          onDrop={handleDropOnZone}
          onClick={() => bulkFileRef.current?.click()}
        >
          <FiUpload size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm font-medium text-gray-400">
            Drop images & videos here
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">or click to browse · supports bulk select</p>
          <p className="text-[10px] text-gray-300 mt-2">Run the AI pipeline first to auto-generate slots,<br/>or upload directly here.</p>
        </div>
      ) : (
        /* Drive-like grid with drop zone overlay */
        <div
          className="relative"
          onDragOver={e => { e.preventDefault(); setIsDroppingOn(true) }}
          onDragLeave={e => {
            // Only clear if leaving the container (not entering a child)
            if (!e.currentTarget.contains(e.relatedTarget)) setIsDroppingOn(false)
          }}
          onDrop={handleDropOnZone}
        >
          {/* Drop overlay */}
          {isDroppingOn && (
            <div className="absolute inset-0 z-20 rounded-xl bg-purple-50/90 border-2 border-purple-400 border-dashed flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <FiUpload size={24} className="mx-auto mb-1 text-purple-500" />
                <p className="text-sm font-bold text-purple-600">Drop to add</p>
              </div>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => setActiveId(active.id)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext items={assets.map(a => a.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-2">
                {assets.map((asset, i) => (
                  <SortableAssetCard
                    key={asset.id}
                    asset={asset}
                    index={i}
                    onReplace={handleReplace}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeAsset && (
                <div className="rounded-xl border-2 border-purple-400 shadow-2xl bg-white overflow-hidden w-40 opacity-90">
                  <div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                    {activeAsset.url
                      ? activeAsset.type === 'video'
                        ? <video src={activeAsset.url} className="w-full h-full object-cover" muted />
                        : <img src={activeAsset.url} alt="" className="w-full h-full object-cover" />
                      : <FiImage size={20} className="text-gray-300" />
                    }
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-center">
        Drag cards to reorder · order matches video timeline · Ctrl+V to paste image
      </p>

      {showLibrary && (
        <MediaLibraryPicker
          onSelect={handleLibrarySelect}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ProductionPlanPanel({ plan }) {
  const [tab, setTab] = useState('voiceover')
  const assets = useSelector(s => s.videoStudio.assets)

  const neededCount = assets.filter(a => !a.url).length

  if (!plan) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
        <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mb-3 text-2xl">🪄</div>
        <p className="text-sm font-medium text-gray-500">No production plan yet</p>
        <p className="text-xs text-gray-400 mt-1">Paste a URL and click Generate to create one.</p>
      </div>
    )
  }

  const meta = plan.metadata || {}

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-gray-700 truncate flex-1">{meta.title || 'Production Plan'}</h3>
          <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium flex-shrink-0 ml-2">
            {meta.video_format || 'reel'} · {meta.duration_seconds || '?'}s
          </span>
        </div>
        <div className="text-[10px] text-gray-400">
          {meta.resolution?.w}×{meta.resolution?.h} · {meta.fps || 30}fps
          {meta.pipeline_elapsed_seconds && <span className="ml-2">⏱ {meta.pipeline_elapsed_seconds}s</span>}
        </div>
        {plan.article_id && (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded font-medium">
              📝 Draft #{plan.article_id}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors border-b-2 ${
              tab === t.id
                ? 'text-purple-700 border-purple-500 bg-purple-50/50'
                : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <t.icon size={11} />
            {t.label}
            {t.id === 'needed' && neededCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[8px] font-bold flex items-center justify-center">
                {neededCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'voiceover' && <VoiceoverTab plan={plan} />}
        {tab === 'scenes'    && <ScenesTab    plan={plan} />}
        {tab === 'needed'   && <AssetsNeededTab assets={assets} />}
        {tab === 'assets'   && <AssetsGridTab />}
      </div>
    </div>
  )
}

// exported for paste handler
export { readFileAsDataURL }
