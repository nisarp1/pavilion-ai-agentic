import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FiLink, FiType, FiImage, FiFileText, FiZap,
  FiChevronDown, FiChevronUp, FiX, FiSearch, FiRefreshCw, FiCheck,
} from 'react-icons/fi'
import api from '../../services/api'

const SOURCE_TABS = [
  { key: 'link',    label: 'Link',    icon: FiLink },
  { key: 'text',    label: 'Text',    icon: FiType },
  { key: 'image',   label: 'Image',   icon: FiImage },
  { key: 'article', label: 'Article', icon: FiFileText },
  { key: 'social',  label: 'Social',  icon: FiZap },
]

const STATUS_COLORS = {
  fetched:   'bg-yellow-100 text-yellow-800',
  generated: 'bg-indigo-100 text-indigo-800',
  review:    'bg-purple-100 text-purple-800',
  draft:     'bg-blue-100 text-blue-800',
  published: 'bg-green-100 text-green-800',
}

export default function RefContextPanel({
  editingJob,
  productionPlan,
  videoFormat, setVideoFormat,
  includeAvatar, setIncludeAvatar,
  pipelineRunning,
  onGenerate,
  onDownloadBrief,
}) {
  const [sourceType, setSourceType] = useState('link')
  const [linkUrl, setLinkUrl] = useState('')
  const [textInput, setTextInput] = useState('')
  const [pastedImage, setPastedImage] = useState(null)   // { dataUrl, file }
  const [imageUploading, setImageUploading] = useState(false)
  const [imageUploadedUrl, setImageUploadedUrl] = useState('')
  const [articleSearch, setArticleSearch] = useState('')
  const [articleResults, setArticleResults] = useState([])
  const [articleLoading, setArticleLoading] = useState(false)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [socialResults, setSocialResults] = useState([])
  const [socialLoading, setSocialLoading] = useState(false)
  const [selectedSocial, setSelectedSocial] = useState(null)
  const [collapsed, setCollapsed] = useState(false)

  const articleDebounceRef = useRef(null)
  const dropZoneRef = useRef(null)

  // Auto-collapse when generation completes
  useEffect(() => {
    if (productionPlan) setCollapsed(true)
  }, [productionPlan])

  // Load social posts on tab switch
  useEffect(() => {
    if (sourceType !== 'social' || socialResults.length > 0) return
    setSocialLoading(true)
    api.get('/articles/', { params: { page_size: 50 } })
      .then(res => {
        const items = Array.isArray(res.data) ? res.data : (res.data.results || [])
        setSocialResults(items.filter(a => a.social_post_plan && Object.keys(a.social_post_plan).length > 0))
      })
      .finally(() => setSocialLoading(false))
  }, [sourceType])

  // Load 10 most recent articles on tab switch; then live-search on query change
  useEffect(() => {
    if (sourceType !== 'article') return
    if (articleDebounceRef.current) clearTimeout(articleDebounceRef.current)
    articleDebounceRef.current = setTimeout(() => {
      setArticleLoading(true)
      const params = {}
      if (articleSearch) params.search = articleSearch
      api.get('/articles/', { params })
        .then(res => {
          const all = Array.isArray(res.data) ? res.data : (res.data.results || [])
          setArticleResults(articleSearch ? all : all.slice(0, 10))
        })
        .finally(() => setArticleLoading(false))
    }, articleSearch ? 280 : 0)
  }, [articleSearch, sourceType])

  // Paste handler for image tab
  const handlePaste = useCallback((e) => {
    if (sourceType !== 'image') return
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        const reader = new FileReader()
        reader.onload = (ev) => setPastedImage({ dataUrl: ev.target.result, file })
        reader.readAsDataURL(file)
        setImageUploadedUrl('')
        break
      }
    }
  }, [sourceType])

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file?.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (ev) => setPastedImage({ dataUrl: ev.target.result, file })
    reader.readAsDataURL(file)
    setImageUploadedUrl('')
  }

  const uploadImage = async () => {
    if (!pastedImage) return null
    setImageUploading(true)
    try {
      const form = new FormData()
      form.append('file', pastedImage.file, pastedImage.file.name || 'pasted_image.png')
      const res = await api.post('/media/', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      const url = res.data?.url || res.data?.file || ''
      setImageUploadedUrl(url)
      return url
    } catch {
      return null
    } finally {
      setImageUploading(false)
    }
  }

  const buildPayload = async () => {
    const base = { video_format: videoFormat, include_avatar: includeAvatar }

    switch (sourceType) {
      case 'link':
        return { ...base, url: linkUrl }
      case 'text':
        return { ...base, text_prompt: textInput }
      case 'image': {
        const imageUrl = imageUploadedUrl || await uploadImage()
        const prompt = imageUrl
          ? `Visual reference image: ${imageUrl}${textInput ? `\n\n${textInput}` : ''}`
          : textInput
        return { ...base, text_prompt: prompt }
      }
      case 'article':
        if (!selectedArticle) return null
        return { ...base, article_id: selectedArticle.id }
      case 'social': {
        if (!selectedSocial) return null
        const plan = selectedSocial.social_post_plan || {}
        const postText = [plan.caption, plan.hook, plan.body].filter(Boolean).join('\n')
        return { ...base, text_prompt: `Social post context:\n${postText}\n\nArticle: ${selectedSocial.title || ''}` }
      }
      default:
        return base
    }
  }

  const handleGenerate = async () => {
    const payload = await buildPayload()
    if (!payload) return
    onGenerate(payload)
  }

  const isReady = () => {
    switch (sourceType) {
      case 'link':    return !!linkUrl.trim()
      case 'text':    return !!textInput.trim()
      case 'image':   return !!pastedImage || !!textInput.trim()
      case 'article': return !!selectedArticle
      case 'social':  return !!selectedSocial
      default: return false
    }
  }

  const sourceLabel = () => {
    if (sourceType === 'link' && linkUrl) return linkUrl.slice(0, 60)
    if (sourceType === 'text' && textInput) return textInput.slice(0, 60)
    if (sourceType === 'image') return pastedImage ? 'Image pasted' : 'No image'
    if (sourceType === 'article' && selectedArticle) return selectedArticle.title?.slice(0, 60) || `Article #${selectedArticle.id}`
    if (sourceType === 'social' && selectedSocial) return selectedSocial.title?.slice(0, 60) || `Post #${selectedSocial.id}`
    return 'No source'
  }

  // ── Format + Avatar + Generate controls (reused in both expanded and collapsed) ──
  const Controls = ({ compact = false }) => (
    <div className="flex items-center gap-2 flex-shrink-0">
      <select
        value={videoFormat}
        onChange={e => setVideoFormat(e.target.value)}
        className="bg-white border border-purple-200 rounded-lg px-2 py-1 text-xs font-medium text-purple-700 focus:outline-none"
      >
        <option value="reel">📱 Reel</option>
        <option value="short">🎬 Short</option>
        <option value="long">🖥️ Long</option>
      </select>
      {!compact && (
        <label className="flex items-center gap-1 text-xs text-purple-700 cursor-pointer select-none">
          <input type="checkbox" checked={includeAvatar} onChange={e => setIncludeAvatar(e.target.checked)} className="accent-purple-600" />
          Avatar
        </label>
      )}
      <button
        onClick={handleGenerate}
        disabled={pipelineRunning || !isReady()}
        className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg shadow disabled:opacity-40 whitespace-nowrap transition-colors"
      >
        {pipelineRunning ? '⏳ Running…' : '🪄 Generate'}
      </button>
      {productionPlan && (
        <button onClick={onDownloadBrief} title="Download brief" className="text-xs text-purple-600 hover:text-purple-800 border border-purple-200 rounded px-2 py-1.5">
          📥
        </button>
      )}
    </div>
  )

  // ── Collapsed bar ────────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-xl mt-2 flex-shrink-0">
        <span className="text-xs text-purple-500 font-medium truncate flex-1 min-w-0">
          🪄 {sourceLabel() || 'No source'}
        </span>
        <Controls compact />
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 border border-purple-200 rounded px-2 py-1 flex-shrink-0"
        >
          <FiChevronDown size={12} /> Context
        </button>
      </div>
    )
  }

  // ── Expanded panel ───────────────────────────────────────────────────────────
  return (
    <div className="mt-2 flex-shrink-0 bg-purple-50 border border-purple-100 rounded-xl overflow-hidden">
      {/* Tab row + controls */}
      <div className="flex items-center border-b border-purple-100">
        <div className="flex flex-1 overflow-x-auto">
          {SOURCE_TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setSourceType(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 whitespace-nowrap ${
                  sourceType === tab.key
                    ? 'border-purple-600 text-purple-700 bg-white'
                    : 'border-transparent text-purple-400 hover:text-purple-600 hover:bg-purple-100/50'
                }`}
              >
                <Icon size={12} />
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="px-3 py-1.5 flex items-center gap-2 border-l border-purple-100">
          <Controls />
          <button onClick={() => setCollapsed(true)} className="text-purple-400 hover:text-purple-600 flex-shrink-0">
            <FiChevronUp size={15} />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2">

        {/* ── LINK ── */}
        {sourceType === 'link' && (
          <div className="flex items-center gap-2">
            <FiLink size={14} className="text-purple-400 flex-shrink-0" />
            <input
              type="url"
              placeholder="Paste a YouTube link, news URL, or any reference page…"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && isReady() && handleGenerate()}
              className="flex-1 bg-white border border-purple-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-purple-200"
            />
          </div>
        )}

        {/* ── TEXT ── */}
        {sourceType === 'text' && (
          <textarea
            placeholder="Describe the video you want to create — topic, angle, key points, tone…"
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            rows={3}
            className="w-full bg-white border border-purple-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-purple-200 resize-none"
          />
        )}

        {/* ── IMAGE ── */}
        {sourceType === 'image' && (
          <div className="flex gap-3">
            <div
              ref={dropZoneRef}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              className={`flex-1 flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors cursor-pointer min-h-[76px] ${
                pastedImage ? 'border-purple-300 bg-white' : 'border-purple-200 bg-white hover:border-purple-400'
              }`}
            >
              {pastedImage ? (
                <div className="p-2 w-full flex items-center gap-3">
                  <img src={pastedImage.dataUrl} alt="pasted" className="h-14 w-14 object-cover rounded border border-purple-200 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-purple-700 font-medium truncate">{pastedImage.file?.name || 'Pasted image'}</p>
                    {imageUploading
                      ? <p className="text-[10px] text-purple-400 mt-0.5">Uploading…</p>
                      : imageUploadedUrl
                      ? <p className="text-[10px] text-green-600 mt-0.5">Uploaded ✓</p>
                      : <p className="text-[10px] text-purple-400 mt-0.5">Will upload on Generate</p>}
                  </div>
                  <button onClick={() => { setPastedImage(null); setImageUploadedUrl('') }} className="text-purple-400 hover:text-purple-600 flex-shrink-0">
                    <FiX size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 py-3 px-3 text-center">
                  <FiImage size={18} className="text-purple-300" />
                  <p className="text-xs text-purple-400">
                    <kbd className="px-1.5 py-0.5 bg-purple-100 rounded text-purple-600 font-sans font-semibold">Ctrl+V</kbd> paste · drag & drop
                  </p>
                </div>
              )}
            </div>
            <textarea
              placeholder="Optional extra context for the AI…"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              rows={3}
              className="flex-1 bg-white border border-purple-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-purple-200 resize-none"
            />
          </div>
        )}

        {/* ── ARTICLE ── */}
        {sourceType === 'article' && (
          <div className="space-y-2">
            {/* Selected article card — always visible when an article is chosen */}
            {selectedArticle && (
              <div className="flex items-center gap-3 px-3 py-2 bg-purple-600 text-white rounded-lg">
                <FiCheck size={14} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{selectedArticle.title || `Article #${selectedArticle.id}`}</p>
                  <p className="text-[10px] text-purple-200 mt-0.5">
                    {selectedArticle.status} · ID #{selectedArticle.id}
                    {selectedArticle.summary ? ` · ${selectedArticle.summary.slice(0, 60)}…` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedArticle(null)}
                  className="flex-shrink-0 text-purple-200 hover:text-white"
                  title="Remove selection"
                >
                  <FiX size={14} />
                </button>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <FiSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-300" />
              <input
                type="text"
                placeholder={selectedArticle ? 'Search to change article…' : 'Search your articles…'}
                value={articleSearch}
                onChange={e => setArticleSearch(e.target.value)}
                className="w-full bg-white border border-purple-200 rounded-lg pl-8 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-purple-200"
              />
              {articleLoading
                ? <FiRefreshCw size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400 animate-spin" />
                : articleSearch && (
                  <button onClick={() => setArticleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-300 hover:text-purple-500">
                    <FiX size={12} />
                  </button>
                )
              }
            </div>

            {/* Results list — hidden once an article is selected and user isn't actively searching */}
            {(!selectedArticle || articleSearch) && (
              <div className="max-h-36 overflow-y-auto space-y-0.5">
                {!articleLoading && articleResults.length === 0 && (
                  <p className="text-xs text-purple-300 text-center py-3">
                    {articleSearch ? 'No articles match your search' : 'No articles found'}
                  </p>
                )}
                {articleResults.map(art => {
                  const statusCls = STATUS_COLORS[art.status] || 'bg-gray-100 text-gray-600'
                  return (
                    <button
                      key={art.id}
                      onClick={() => {
                        setSelectedArticle(art)
                        setArticleSearch('')  // clear search → hides results list
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 bg-white text-gray-700 hover:bg-purple-50"
                    >
                      <span className="truncate flex-1">{art.title || '(No title)'}</span>
                      <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${statusCls}`}>
                        {art.status}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SOCIAL ── */}
        {sourceType === 'social' && (
          <div className="space-y-2">
            {/* Selected social card */}
            {selectedSocial && (
              <div className="flex items-center gap-3 px-3 py-2 bg-purple-600 text-white rounded-lg">
                <FiCheck size={14} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{selectedSocial.title || `Post #${selectedSocial.id}`}</p>
                  <p className="text-[10px] text-purple-200 mt-0.5 truncate">
                    {(() => {
                      const plan = selectedSocial.social_post_plan || {}
                      const preview = plan.caption || plan.hook || plan.body || ''
                      return preview.slice(0, 80) || 'Social post'
                    })()}
                  </p>
                </div>
                <button onClick={() => setSelectedSocial(null)} className="flex-shrink-0 text-purple-200 hover:text-white">
                  <FiX size={14} />
                </button>
              </div>
            )}

            {socialLoading && (
              <div className="flex items-center justify-center py-3 gap-2 text-purple-400 text-xs">
                <FiRefreshCw size={13} className="animate-spin" /> Loading…
              </div>
            )}
            {!socialLoading && socialResults.length === 0 && (
              <p className="text-xs text-purple-300 text-center py-3">No social posts with generated content found</p>
            )}
            <div className="max-h-36 overflow-y-auto space-y-0.5">
              {socialResults.map(art => {
                const plan = art.social_post_plan || {}
                const preview = plan.caption || plan.hook || plan.body || ''
                const isSelected = selectedSocial?.id === art.id
                return (
                  <button
                    key={art.id}
                    onClick={() => setSelectedSocial(isSelected ? null : art)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                      isSelected ? 'bg-purple-100 text-purple-800 font-medium' : 'bg-white text-gray-700 hover:bg-purple-50'
                    }`}
                  >
                    {isSelected && <FiCheck size={11} className="text-purple-600 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{art.title || '(No title)'}</div>
                      {preview && <div className="truncate text-gray-400">{preview.slice(0, 70)}</div>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
