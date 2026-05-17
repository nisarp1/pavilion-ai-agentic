import { useState, useEffect, useRef, useCallback } from 'react'
import { FiLink, FiType, FiImage, FiFileText, FiZap, FiChevronDown, FiChevronUp, FiUpload, FiX, FiSearch, FiRefreshCw } from 'react-icons/fi'
import api from '../../services/api'

const SOURCE_TABS = [
  { key: 'link',    label: 'Link',    icon: FiLink },
  { key: 'text',    label: 'Text',    icon: FiType },
  { key: 'image',   label: 'Image',   icon: FiImage },
  { key: 'article', label: 'Article', icon: FiFileText },
  { key: 'social',  label: 'Social',  icon: FiZap },
]

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
    api.get('/articles/', { params: { social_post_status: 'done', page_size: 30 } })
      .then(res => {
        const items = Array.isArray(res.data) ? res.data : (res.data.results || [])
        setSocialResults(items.filter(a => a.social_post_plan && Object.keys(a.social_post_plan).length > 0))
      })
      .finally(() => setSocialLoading(false))
  }, [sourceType])

  // Search articles with debounce
  useEffect(() => {
    if (sourceType !== 'article') return
    if (articleDebounceRef.current) clearTimeout(articleDebounceRef.current)
    articleDebounceRef.current = setTimeout(() => {
      setArticleLoading(true)
      const params = { page_size: 20, exclude_category: 'video_project' }
      if (articleSearch) params.search = articleSearch
      api.get('/articles/', { params })
        .then(res => setArticleResults(Array.isArray(res.data) ? res.data : (res.data.results || [])))
        .finally(() => setArticleLoading(false))
    }, 300)
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

  // Drop handler for image tab
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
    if (editingJob?.id && editingJob?.kind === 'project') base.article_id = editingJob.id

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
      case 'social':
        if (!selectedSocial) return null
        const plan = selectedSocial.social_post_plan || {}
        const postText = [plan.caption, plan.hook, plan.body].filter(Boolean).join('\n')
        return { ...base, text_prompt: `Social post context:\n${postText}\n\nArticle: ${selectedSocial.title || ''}` }
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
    if (sourceType === 'link' && linkUrl) return linkUrl.slice(0, 50)
    if (sourceType === 'text' && textInput) return textInput.slice(0, 50)
    if (sourceType === 'image') return pastedImage ? 'Image pasted' : 'No image'
    if (sourceType === 'article' && selectedArticle) return selectedArticle.title?.slice(0, 50)
    if (sourceType === 'social' && selectedSocial) return selectedSocial.title?.slice(0, 50)
    return 'No source'
  }

  // ── Collapsed bar (shown after generation) ──────────────────────────────────
  if (collapsed) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-xl mt-2 flex-shrink-0">
        <span className="text-xs text-purple-500 font-medium truncate flex-1">
          🪄 Generated from {sourceType} — {sourceLabel()}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={videoFormat}
            onChange={e => setVideoFormat(e.target.value)}
            className="bg-white border border-purple-200 rounded-lg px-2 py-1 text-xs font-medium text-purple-700 focus:outline-none"
          >
            <option value="reel">📱 Reel</option>
            <option value="short">🎬 Short</option>
            <option value="long">🖥️ Long</option>
          </select>
          <button
            onClick={handleGenerate}
            disabled={pipelineRunning || !isReady()}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg shadow disabled:opacity-40"
          >
            {pipelineRunning ? '⏳…' : '🪄 Regen'}
          </button>
          {productionPlan && (
            <button onClick={onDownloadBrief} title="Download brief" className="text-purple-500 hover:text-purple-700 text-xs border border-purple-200 rounded px-2 py-1">
              📥
            </button>
          )}
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 border border-purple-200 rounded px-2 py-1"
          >
            <FiChevronDown size={12} /> Context
          </button>
        </div>
      </div>
    )
  }

  // ── Expanded panel ───────────────────────────────────────────────────────────
  return (
    <div className="mt-2 flex-shrink-0 bg-purple-50 border border-purple-100 rounded-xl overflow-hidden">
      {/* Tab row */}
      <div className="flex items-center border-b border-purple-100">
        <div className="flex flex-1">
          {SOURCE_TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setSourceType(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
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
        <div className="flex items-center gap-2 px-3 py-1.5">
          <select
            value={videoFormat}
            onChange={e => setVideoFormat(e.target.value)}
            className="bg-white border border-purple-200 rounded-lg px-2 py-1 text-xs font-medium text-purple-700 focus:outline-none"
          >
            <option value="reel">📱 Reel</option>
            <option value="short">🎬 Short</option>
            <option value="long">🖥️ Long</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-purple-700 cursor-pointer select-none">
            <input type="checkbox" checked={includeAvatar} onChange={e => setIncludeAvatar(e.target.checked)} className="accent-purple-600" />
            Avatar
          </label>
          <button
            onClick={handleGenerate}
            disabled={pipelineRunning || !isReady()}
            className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg shadow disabled:opacity-40 whitespace-nowrap"
          >
            {pipelineRunning ? '⏳ Running…' : '🪄 Generate'}
          </button>
          {productionPlan && (
            <button onClick={onDownloadBrief} title="Download brief" className="text-xs text-purple-600 hover:text-purple-800 border border-purple-200 rounded px-2 py-1.5">
              📥 Brief
            </button>
          )}
          <button onClick={() => setCollapsed(true)} className="text-purple-400 hover:text-purple-600">
            <FiChevronUp size={15} />
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-3">

        {/* LINK */}
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

        {/* TEXT */}
        {sourceType === 'text' && (
          <textarea
            placeholder="Describe the video you want to create — topic, angle, key points, tone…"
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            rows={3}
            className="w-full bg-white border border-purple-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-purple-200 resize-none"
          />
        )}

        {/* IMAGE */}
        {sourceType === 'image' && (
          <div className="flex gap-3">
            <div
              ref={dropZoneRef}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              className={`flex-1 flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors cursor-pointer min-h-[80px] ${
                pastedImage ? 'border-purple-300 bg-purple-50' : 'border-purple-200 bg-white hover:border-purple-400'
              }`}
            >
              {pastedImage ? (
                <div className="relative p-2 w-full flex items-center gap-3">
                  <img src={pastedImage.dataUrl} alt="pasted" className="h-16 w-16 object-cover rounded border border-purple-200 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-purple-700 font-medium truncate">{pastedImage.file?.name || 'Pasted image'}</p>
                    {imageUploadedUrl
                      ? <p className="text-[10px] text-green-600 mt-0.5">Uploaded ✓</p>
                      : <p className="text-[10px] text-purple-400 mt-0.5">Will upload on Generate</p>}
                  </div>
                  <button
                    onClick={() => { setPastedImage(null); setImageUploadedUrl('') }}
                    className="text-purple-400 hover:text-purple-600 flex-shrink-0"
                  >
                    <FiX size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 py-4 px-3 text-center">
                  <FiImage size={20} className="text-purple-300" />
                  <p className="text-xs text-purple-400">
                    <kbd className="px-1.5 py-0.5 bg-purple-100 rounded text-purple-600 font-sans font-semibold">Ctrl+V</kbd> to paste · or drag & drop
                  </p>
                  <p className="text-[10px] text-purple-300">PNG, JPG, WebP</p>
                </div>
              )}
            </div>
            <div className="flex-1">
              <textarea
                placeholder="Optional: describe what the image shows or add extra context for the AI…"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                rows={3}
                className="w-full bg-white border border-purple-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-purple-200 resize-none h-full"
              />
            </div>
          </div>
        )}

        {/* ARTICLE */}
        {sourceType === 'article' && (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <FiSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-300" />
              <input
                type="text"
                placeholder="Search your articles…"
                value={articleSearch}
                onChange={e => setArticleSearch(e.target.value)}
                className="w-full bg-white border border-purple-200 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-purple-200"
              />
              {articleLoading && <FiRefreshCw size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400 animate-spin" />}
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1">
              {articleResults.length === 0 && !articleLoading && (
                <p className="text-xs text-purple-300 text-center py-3">No articles found</p>
              )}
              {articleResults.map(art => (
                <button
                  key={art.id}
                  onClick={() => setSelectedArticle(selectedArticle?.id === art.id ? null : art)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    selectedArticle?.id === art.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-purple-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{art.title || '(No title)'}</span>
                    <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${
                      selectedArticle?.id === art.id ? 'bg-purple-500 border-purple-400 text-white' : 'bg-gray-100 border-gray-200 text-gray-500'
                    }`}>
                      {art.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SOCIAL */}
        {sourceType === 'social' && (
          <div className="flex flex-col gap-2">
            {socialLoading && (
              <div className="flex items-center justify-center py-4 gap-2 text-purple-400 text-xs">
                <FiRefreshCw size={14} className="animate-spin" /> Loading social posts…
              </div>
            )}
            {!socialLoading && socialResults.length === 0 && (
              <p className="text-xs text-purple-300 text-center py-3">No social posts with generated content found</p>
            )}
            <div className="max-h-40 overflow-y-auto space-y-1">
              {socialResults.map(art => {
                const plan = art.social_post_plan || {}
                const preview = plan.caption || plan.hook || plan.body || ''
                return (
                  <button
                    key={art.id}
                    onClick={() => setSelectedSocial(selectedSocial?.id === art.id ? null : art)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                      selectedSocial?.id === art.id
                        ? 'bg-purple-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-purple-100'
                    }`}
                  >
                    <div className="font-medium truncate">{art.title || '(No title)'}</div>
                    {preview && (
                      <div className={`mt-0.5 truncate ${selectedSocial?.id === art.id ? 'text-purple-200' : 'text-gray-400'}`}>
                        {preview.slice(0, 80)}
                      </div>
                    )}
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
