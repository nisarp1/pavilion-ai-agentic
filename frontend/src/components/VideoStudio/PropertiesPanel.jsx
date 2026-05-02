import { useState, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  updateProps, updateStat, addStat, removeStat, setAudioUrl,
  updateClip, removeClip, copyStyle, pasteStyle, pushHistory,
} from '../../store/slices/videoStudioSlice'
import { FiPlus, FiX, FiRefreshCw, FiCopy, FiClipboard, FiTrash2, FiImage, FiLoader, FiUpload } from 'react-icons/fi'
import MediaLibrary from '../MediaLibrary/MediaLibrary'
import api from '../../services/api'
import { showError } from '../../utils/toast'
import { ENTRY_ANIMATIONS } from './animationPresets'
// Clips with overlay bounding boxes (draggable in preview)
const SPATIAL_CLIPS = new Set(['scene1-hero', 'chrome', 'scene1-headline', 'scene2-bg', 'scene2-card', 'scene2-headline'])

const CLIP_FIELDS = {
  'audio':           ['audioUrl'],
  'chrome':          ['logoSrc', 'brandName', 'accent'],
  'scene1-hero':     ['heroSrc'],
  'scene1-headline': ['scene1Headline', 'headlineStyle1'],
  'scene2-bg':       ['heroSrc'],
  'scene2-card':     ['playerName', 'playerImage', 'cardColor', 'cardAccent', 'stats'],
  'scene2-headline': ['scene2Headline', 'headlineStyle2'],
}

const FONTS = ['Anek Malayalam', 'Manrope', 'Arial', 'Georgia']

function Label({ children }) {
  return <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{children}</label>
}

function Field({ children }) {
  return <div className="mb-4">{children}</div>
}

function ImagePasteField({ value, onChange, onPickFromLibrary }) {
  const [uploading, setUploading] = useState(false)

  async function handlePaste(e) {
    const file = Array.from(e.clipboardData?.items || [])
      .map(i => i.type.startsWith('image/') ? i.getAsFile() : null)
      .find(Boolean)
    if (!file) return
    e.preventDefault()
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', 'pasted-image')
      const res = await api.post('/media/', fd)
      let url = res.data.url || ''
      try { url = new URL(url).pathname } catch {}
      onChange(url)
    } catch {
      showError('Image upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex gap-2" onPaste={handlePaste}>
      {uploading ? (
        <div className="flex-1 px-3 py-2 border border-blue-200 rounded-lg text-sm text-blue-500 bg-blue-50 flex items-center gap-2">
          <FiLoader size={13} className="animate-spin" /> Uploading…
        </div>
      ) : (
        <input
          type="url"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Paste image or enter URL…"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      )}
      <button
        onClick={onPickFromLibrary}
        title="Pick from media library"
        className="px-2 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors flex-shrink-0"
      >
        <FiImage size={14} />
      </button>
    </div>
  )
}

function UploadField({ value, onChange, accept, placeholder }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  async function handleFile(file) {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', file.name)
      const res = await api.post('/media/', fd)
      let url = res.data.url || ''
      try { url = new URL(url).pathname } catch {}
      onChange(url)
    } catch {
      showError('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex gap-2">
      <input
        type="url"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'https://…'}
        disabled={uploading}
        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
      />
      {uploading ? (
        <div className="px-2 py-1.5 border border-blue-200 rounded-lg text-blue-500 bg-blue-50 flex items-center">
          <FiLoader size={14} className="animate-spin" />
        </div>
      ) : (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            title="Upload file"
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors flex-shrink-0"
          >
            <FiUpload size={14} />
          </button>
          <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
        </>
      )}
    </div>
  )
}

export default function PropertiesPanel() {
  const dispatch = useDispatch()
  const { selectedClipId, clips, props, audioUrl, copiedStyle } = useSelector(s => s.videoStudio)
  const clip = clips?.find(c => c.id === selectedClipId)
  const [mediaPicker, setMediaPicker] = useState(null)

  function handleMediaSelect(item) {
    if (!mediaPicker) return
    // Strip the backend origin so the URL becomes a relative path
    // that goes through the Vite proxy (e.g. http://pavilion-django-dev:8000/media/x.webp → /media/x.webp)
    let url = item.url || ''
    try { url = new URL(url).pathname } catch { /* already relative */ }

    if (mediaPicker.target === 'heroSrc') {
      dispatch(updateProps({ heroSrc: url }))
    } else if (mediaPicker.target === 'playerImage') {
      dispatch(updateProps({ playerImage: url }))
    } else if (mediaPicker.target === 'logoSrc') {
      dispatch(updateProps({ logoSrc: url }))
    } else {
      dispatch(updateClip({ id: mediaPicker.target, changes: { src: url } }))
    }
    setMediaPicker(null)
  }

  if (!clip) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
        </div>
        <p className="text-sm font-medium text-gray-500">Select a clip</p>
        <p className="text-xs text-gray-400 mt-1">Click any clip on the timeline or in the preview.</p>
      </div>
    )
  }

  const clipType = clip.templateClipId || clip.id
  const fields = CLIP_FIELDS[clipType] || []
  const startSec = (clip.globalStartFrame / 30).toFixed(1)
  const endSec = ((clip.globalStartFrame + clip.durationFrames) / 30).toFixed(1)
  const hasSpatial = SPATIAL_CLIPS.has(clipType)
  const isDynamic = Boolean(clip.type)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Clip header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: clip.color }} />
        <span className="text-sm font-bold text-gray-700 flex-1 truncate">{clip.label}</span>
        <span className="text-xs text-gray-400 font-mono flex-shrink-0">{startSec}s – {endSec}s</span>

        <button
          onClick={() => dispatch(copyStyle(clip.id))}
          title="Copy style"
          className="p-1 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
        >
          <FiCopy size={13} />
        </button>

        {copiedStyle && (
          <button
            onClick={() => dispatch(pasteStyle(clip.id))}
            title="Paste style"
            className="p-1 text-gray-400 hover:text-green-600 transition-colors flex-shrink-0"
          >
            <FiClipboard size={13} />
          </button>
        )}

        {isDynamic && (
          <button
            onClick={() => dispatch(removeClip(clip.id))}
            title="Remove track"
            className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
          >
            <FiTrash2 size={13} />
          </button>
        )}
      </div>

      {/* Fields — push history when user finishes editing (blur = text, mouseup = sliders/colors) */}
      <div
        className="flex-1 overflow-y-auto p-4"
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) dispatch(pushHistory()) }}
        onMouseUp={() => dispatch(pushHistory())}
      >

        {/* ── Dynamic image clip ── */}
        {clip.type === 'image' && (
          <>
            <Field>
              <Label>Image</Label>
              <ImagePasteField
                value={clip.src || ''}
                onChange={url => dispatch(updateClip({ id: clip.id, changes: { src: url } }))}
                onPickFromLibrary={() => setMediaPicker({ target: clip.id })}
              />
            </Field>
            <Field>
              <Label>Opacity</Label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max="1" step="0.01" value={clip.opacity ?? 1} onChange={e => dispatch(updateClip({ id: clip.id, changes: { opacity: Number(e.target.value) } }))} className="flex-1 h-1.5 accent-blue-500 cursor-pointer" />
                <span className="text-xs text-gray-500 font-mono w-10 text-right">{Math.round((clip.opacity ?? 1) * 100)}%</span>
              </div>
            </Field>
          </>
        )}

        {/* ── Dynamic video clip ── */}
        {clip.type === 'video' && (
          <>
            <Field>
              <Label>Video</Label>
              <UploadField
                value={clip.src || ''}
                onChange={url => dispatch(updateClip({ id: clip.id, changes: { src: url } }))}
                accept="video/*"
                placeholder="Upload or enter video URL…"
              />
            </Field>
            <Field>
              <Label>Opacity</Label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max="1" step="0.01" value={clip.opacity ?? 1} onChange={e => dispatch(updateClip({ id: clip.id, changes: { opacity: Number(e.target.value) } }))} className="flex-1 h-1.5 accent-blue-500 cursor-pointer" />
                <span className="text-xs text-gray-500 font-mono w-10 text-right">{Math.round((clip.opacity ?? 1) * 100)}%</span>
              </div>
            </Field>
          </>
        )}

        {/* ── Dynamic text clip ── */}
        {clip.type === 'text' && (
          <>
            <Field>
              <Label>Text</Label>
              <textarea
                rows={3}
                value={clip.text || ''}
                onChange={e => dispatch(updateClip({ id: clip.id, changes: { text: e.target.value } }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
              />
            </Field>
            <Field>
              <Label>Text Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={clip.textColor || '#ffffff'} onChange={e => dispatch(updateClip({ id: clip.id, changes: { textColor: e.target.value } }))} className="h-8 w-12 rounded cursor-pointer border border-gray-200" />
                <span className="text-xs text-gray-500 font-mono">{clip.textColor || '#ffffff'}</span>
              </div>
            </Field>
            <Field>
              <Label>Font Size</Label>
              <div className="flex items-center gap-2">
                <input type="range" min="24" max="200" value={clip.fontSize || 72} onChange={e => dispatch(updateClip({ id: clip.id, changes: { fontSize: Number(e.target.value) } }))} className="flex-1 h-1.5 accent-blue-500 cursor-pointer" />
                <span className="text-xs text-gray-500 font-mono w-10 text-right">{clip.fontSize || 72}px</span>
              </div>
            </Field>
            <Field>
              <Label>Font</Label>
              <select value={clip.fontFamily || 'Anek Malayalam'} onChange={e => dispatch(updateClip({ id: clip.id, changes: { fontFamily: e.target.value } }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white">
                {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field>
              <Label>Opacity</Label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max="1" step="0.01" value={clip.opacity ?? 1} onChange={e => dispatch(updateClip({ id: clip.id, changes: { opacity: Number(e.target.value) } }))} className="flex-1 h-1.5 accent-blue-500 cursor-pointer" />
                <span className="text-xs text-gray-500 font-mono w-10 text-right">{Math.round((clip.opacity ?? 1) * 100)}%</span>
              </div>
            </Field>
          </>
        )}

        {/* ── Dynamic audio clip ── */}
        {clip.type === 'audio' && (
          <>
            <Field>
              <Label>Audio Track</Label>
              <UploadField
                value={clip.src || ''}
                onChange={url => dispatch(updateClip({ id: clip.id, changes: { src: url } }))}
                accept="audio/*"
                placeholder="Upload or enter audio URL…"
              />
            </Field>
            <Field>
              <Label>Volume</Label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max="1" step="0.01" value={clip.opacity ?? 1} onChange={e => dispatch(updateClip({ id: clip.id, changes: { opacity: Number(e.target.value) } }))} className="flex-1 h-1.5 accent-blue-500 cursor-pointer" />
                <span className="text-xs text-gray-500 font-mono w-10 text-right">{Math.round((clip.opacity ?? 1) * 100)}%</span>
              </div>
            </Field>
          </>
        )}

        {/* ── Built-in clip fields ── */}
        {fields.includes('scene1Headline') && (
          <Field>
            <Label>Scene 1 Headline</Label>
            <textarea
              rows={3}
              value={clip.customProps?.scene1Headline !== undefined ? clip.customProps.scene1Headline : props.scene1Headline}
              onChange={e => dispatch(updateClip({ id: clip.id, changes: { customProps: { ...clip.customProps, scene1Headline: e.target.value } } }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </Field>
        )}

        {fields.includes('headlineStyle1') && (
          <>
            <Field>
              <Label>Text Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={props.scene1HeadlineColor || '#ffffff'} onChange={e => dispatch(updateProps({ scene1HeadlineColor: e.target.value }))} className="h-8 w-12 rounded cursor-pointer border border-gray-200" />
                <span className="text-xs text-gray-500 font-mono">{props.scene1HeadlineColor || '#ffffff'}</span>
              </div>
            </Field>
            <Field>
              <Label>Font Size</Label>
              <div className="flex items-center gap-2">
                <input type="range" min="32" max="120" value={props.scene1HeadlineFontSize || 78} onChange={e => dispatch(updateProps({ scene1HeadlineFontSize: Number(e.target.value) }))} className="flex-1 h-1.5 accent-blue-500 cursor-pointer" />
                <span className="text-xs text-gray-500 font-mono w-10 text-right">{props.scene1HeadlineFontSize || 78}px</span>
              </div>
            </Field>
            <Field>
              <Label>Font</Label>
              <select value={props.scene1HeadlineFont || 'Anek Malayalam'} onChange={e => dispatch(updateProps({ scene1HeadlineFont: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white">
                {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
          </>
        )}

        {fields.includes('scene2Headline') && (
          <Field>
            <Label>Scene 2 Headline</Label>
            <textarea
              rows={3}
              value={clip.customProps?.scene2Headline !== undefined ? clip.customProps.scene2Headline : props.scene2Headline}
              onChange={e => dispatch(updateClip({ id: clip.id, changes: { customProps: { ...clip.customProps, scene2Headline: e.target.value } } }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </Field>
        )}

        {fields.includes('headlineStyle2') && (
          <>
            <Field>
              <Label>Text Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={props.scene2HeadlineColor || '#ffffff'} onChange={e => dispatch(updateProps({ scene2HeadlineColor: e.target.value }))} className="h-8 w-12 rounded cursor-pointer border border-gray-200" />
                <span className="text-xs text-gray-500 font-mono">{props.scene2HeadlineColor || '#ffffff'}</span>
              </div>
            </Field>
            <Field>
              <Label>Font Size</Label>
              <div className="flex items-center gap-2">
                <input type="range" min="32" max="120" value={props.scene2HeadlineFontSize || 64} onChange={e => dispatch(updateProps({ scene2HeadlineFontSize: Number(e.target.value) }))} className="flex-1 h-1.5 accent-blue-500 cursor-pointer" />
                <span className="text-xs text-gray-500 font-mono w-10 text-right">{props.scene2HeadlineFontSize || 64}px</span>
              </div>
            </Field>
            <Field>
              <Label>Font</Label>
              <select value={props.scene2HeadlineFont || 'Anek Malayalam'} onChange={e => dispatch(updateProps({ scene2HeadlineFont: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white">
                {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
          </>
        )}

        {fields.includes('heroSrc') && (
          <Field>
            <Label>Hero Image</Label>
            <ImagePasteField
              value={clip.customProps?.heroSrc !== undefined ? clip.customProps.heroSrc : props.heroSrc}
              onChange={url => dispatch(updateClip({ id: clip.id, changes: { customProps: { ...clip.customProps, heroSrc: url } } }))}
              onPickFromLibrary={() => setMediaPicker({ target: 'heroSrc' })}
            />
          </Field>
        )}

        {fields.includes('playerName') && (
          <Field>
            <Label>Player Name</Label>
            <input
              type="text"
              value={clip.customProps?.playerName !== undefined ? clip.customProps.playerName : props.playerName}
              onChange={e => dispatch(updateClip({ id: clip.id, changes: { customProps: { ...clip.customProps, playerName: e.target.value.toUpperCase() } } }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none uppercase"
            />
          </Field>
        )}

        {fields.includes('playerImage') && (
          <Field>
            <Label>Player Image</Label>
            <ImagePasteField
              value={clip.customProps?.playerImage !== undefined ? clip.customProps.playerImage : props.playerImage}
              onChange={url => dispatch(updateClip({ id: clip.id, changes: { customProps: { ...clip.customProps, playerImage: url } } }))}
              onPickFromLibrary={() => setMediaPicker({ target: 'playerImage' })}
            />
          </Field>
        )}

        {fields.includes('logoSrc') && (
          <Field>
            <Label>Logo Image</Label>
            <ImagePasteField
              value={props.logoSrc || ''}
              onChange={url => dispatch(updateProps({ logoSrc: url }))}
              onPickFromLibrary={() => setMediaPicker({ target: 'logoSrc' })}
            />
          </Field>
        )}

        {fields.includes('brandName') && (
          <Field>
            <Label>Brand Name</Label>
            <input
              type="text"
              value={props.brandName}
              onChange={e => dispatch(updateProps({ brandName: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </Field>
        )}

        {fields.includes('accent') && (
          <Field>
            <Label>Accent / Live Dot Color</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={props.accent} onChange={e => dispatch(updateProps({ accent: e.target.value }))} className="h-8 w-12 rounded cursor-pointer border border-gray-200" />
              <span className="text-xs text-gray-500 font-mono">{props.accent}</span>
            </div>
          </Field>
        )}

        {fields.includes('cardColor') && (
          <Field>
            <Label>Card Color</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={props.cardColor} onChange={e => dispatch(updateProps({ cardColor: e.target.value }))} className="h-8 w-12 rounded cursor-pointer border border-gray-200" />
              <span className="text-xs text-gray-500 font-mono">{props.cardColor}</span>
            </div>
          </Field>
        )}

        {fields.includes('cardAccent') && (
          <Field>
            <Label>Card Accent Stripe</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={props.cardAccent} onChange={e => dispatch(updateProps({ cardAccent: e.target.value }))} className="h-8 w-12 rounded cursor-pointer border border-gray-200" />
              <span className="text-xs text-gray-500 font-mono">{props.cardAccent}</span>
            </div>
          </Field>
        )}

        {fields.includes('audioUrl') && (
          <Field>
            <Label>Voiceover</Label>
            <UploadField
              value={audioUrl}
              onChange={url => dispatch(setAudioUrl(url))}
              accept="audio/*"
              placeholder="Upload or enter audio URL…"
            />
          </Field>
        )}

        {fields.includes('stats') && (() => {
          const stats = clip.customProps?.stats !== undefined ? clip.customProps.stats : props.stats;
          return (
            <Field>
              <Label>Stats (max 6)</Label>
              <div className="space-y-2">
                {stats.map((stat, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={stat.value}
                      onChange={e => {
                        const newStats = [...stats];
                        newStats[i] = { ...stat, value: e.target.value };
                        dispatch(updateClip({ id: clip.id, changes: { customProps: { ...clip.customProps, stats: newStats } } }))
                      }}
                      placeholder="12"
                      className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={stat.label}
                      onChange={e => {
                        const newStats = [...stats];
                        newStats[i] = { ...stat, label: e.target.value };
                        dispatch(updateClip({ id: clip.id, changes: { customProps: { ...clip.customProps, stats: newStats } } }))
                      }}
                      placeholder="Goals"
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button onClick={() => {
                        const newStats = stats.filter((_, idx) => idx !== i);
                        dispatch(updateClip({ id: clip.id, changes: { customProps: { ...clip.customProps, stats: newStats } } }))
                      }} className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                      <FiX size={14} />
                    </button>
                  </div>
                ))}
                {stats.length < 6 && (
                  <button onClick={() => {
                      const newStats = [...stats, { label: '', value: '' }];
                      dispatch(updateClip({ id: clip.id, changes: { customProps: { ...clip.customProps, stats: newStats } } }))
                    }} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium mt-1">
                    <FiPlus size={12} /> Add stat
                  </button>
                )}
              </div>
            </Field>
          );
        })()}

        {isDynamic && clip.type !== 'audio' && (
          <div className="border-t border-gray-100 pt-4 mb-4">
            <Field>
              <Label>Entry Animation</Label>
              <select value={clip.entryAnimation || 'none'} onChange={e => dispatch(updateClip({ id: clip.id, changes: { entryAnimation: e.target.value } }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white">
                {ENTRY_ANIMATIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </Field>
          </div>
        )}

        {/* Spatial transform controls (built-in draggable clips + all dynamic clips) */}
        {(hasSpatial || (isDynamic && clip.type !== 'audio')) && (
          <div className="border-t border-gray-100 pt-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Transform</span>
              <button
                onClick={() => dispatch(updateClip({ id: clip.id, changes: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 } }))}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
              >
                <FiRefreshCw size={10} /> Reset
              </button>
            </div>
            <Field>
              <Label>Position Offset (px)</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    value={Math.round(clip.offsetX ?? 0)}
                    onChange={e => dispatch(updateClip({ id: clip.id, changes: { offsetX: Number(e.target.value) } }))}
                    placeholder="X"
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <span className="block text-center text-xs text-gray-400 mt-0.5">X</span>
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    value={Math.round(clip.offsetY ?? 0)}
                    onChange={e => dispatch(updateClip({ id: clip.id, changes: { offsetY: Number(e.target.value) } }))}
                    placeholder="Y"
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <span className="block text-center text-xs text-gray-400 mt-0.5">Y</span>
                </div>
              </div>
            </Field>
            <Field>
              <Label>Scale</Label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min="0.2" max="2" step="0.01"
                  value={clip.scaleX ?? 1}
                  onChange={e => {
                    const v = Number(e.target.value)
                    dispatch(updateClip({ id: clip.id, changes: { scaleX: v, scaleY: v } }))
                  }}
                  className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
                />
                <span className="text-xs text-gray-500 font-mono w-10 text-right">{Math.round((clip.scaleX ?? 1) * 100)}%</span>
              </div>
            </Field>
          </div>
        )}

      </div>

      <MediaLibrary
        isOpen={!!mediaPicker}
        onClose={() => setMediaPicker(null)}
        onSelect={handleMediaSelect}
        initialUrl={
          mediaPicker?.target === 'heroSrc' ? props.heroSrc :
          mediaPicker?.target === 'playerImage' ? props.playerImage :
          mediaPicker?.target === 'logoSrc' ? props.logoSrc :
          clips.find(c => c.id === mediaPicker?.target)?.src
        }
      />
    </div>
  )
}
