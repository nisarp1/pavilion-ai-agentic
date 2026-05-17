import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import ContentCombobox from '../common/ContentCombobox'

const POLL_INTERVAL_MS = 3000

const CONTENT_TYPES = [
  { key: 'article',   label: 'Article' },
  { key: 'video',     label: 'Video' },
  { key: 'webstory',  label: 'Web Story' },
]

const VIBE_SUGGESTIONS = ['celebratory', 'urgent', 'analytical', 'aggressive', 'emotional', 'factual']

const STATUS_LABELS = {
  idle:    'Ready',
  queued:  'Queued…',
  running: 'Generating…',
  done:    'Done',
  failed:  'Failed',
}

const STATUS_COLORS = {
  idle:    'bg-gray-100 text-gray-600',
  queued:  'bg-yellow-100 text-yellow-700',
  running: 'bg-blue-100 text-blue-700',
  done:    'bg-green-100 text-green-700',
  failed:  'bg-red-100 text-red-700',
}

function sheetUrl(template) {
  if (!template?.google_sheet_id) return ''
  // Accepts bare ID or full URL — extract bare ID portion
  const match = template.google_sheet_id.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  const id = match ? match[1] : template.google_sheet_id
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : ''
}

export default function SocialPostGenerator() {
  const [searchParams] = useSearchParams()
  const articleIdParam = searchParams.get('article')

  // ── Content source type ────────────────────────────────────────────────────
  const [contentType, setContentType]       = useState('article')

  // ── Form state ─────────────────────────────────────────────────────────────
  const [articleId, setArticleId]           = useState(articleIdParam || '')
  const [articles, setArticles]             = useState([])
  const [videos, setVideos]                 = useState([])
  const [webStories, setWebStories]         = useState([])
  // Combobox selection objects { id, title }
  const [selectedArticle, setSelectedArticle]   = useState(null)
  const [selectedVideo, setSelectedVideo]       = useState(null)
  const [selectedWebStory, setSelectedWebStory] = useState(null)
  const [sourceUrl, setSourceUrl]           = useState('')
  const [plainText, setPlainText]           = useState('')
  const [vibeOverride, setVibeOverride]     = useState('')
  const [canvaTemplates, setCanvaTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [saEmail, setSaEmail]               = useState('')
  const [sheetUrlInput, setSheetUrlInput]   = useState('')
  const [linkingSheet, setLinkingSheet]     = useState(false)
  const [sheetLinkError, setSheetLinkError] = useState('')
  const [pastedImage, setPastedImage]       = useState(null)  // { file, preview }
  const inputZoneRef = useRef(null)

  // ── Pipeline state ─────────────────────────────────────────────────────────
  const [status, setStatus]         = useState('idle')
  const [plan, setPlan]             = useState(null)
  const [log, setLog]               = useState([])
  const [error, setError]           = useState('')
  const [generating, setGenerating] = useState(false)
  const pollRef = useRef(null)

  // ── Load templates + articles + SA email on mount ─────────────────────────
  useEffect(() => {
    api.get('canva-templates/').then(r => setCanvaTemplates(r.data.results || r.data)).catch(() => {})
    // Articles: most recently updated first (default PAGE_SIZE=20)
    api.get('articles/').then(r => setArticles(r.data.results || r.data)).catch(() => {})
    // Videos: lightweight picker, no pagination (pagination_class=None on backend)
    api.get('/video/jobs/?picker=1').then(r => setVideos(r.data.results || r.data)).catch(e => console.warn('Video jobs load failed:', e))
    // Web stories: newest first
    api.get('webstories/').then(r => setWebStories(r.data.results || r.data)).catch(() => {})
    api.get('canva-templates/service-account-email/').then(r => setSaEmail(r.data.email || '')).catch(() => {})
    return () => clearInterval(pollRef.current)
  }, [])

  useEffect(() => {
    if (articleIdParam) setArticleId(articleIdParam)
  }, [articleIdParam])

  // ── Search helpers for comboboxes ──────────────────────────────────────────
  const searchArticles = useCallback(async (q) => {
    const r = await api.get('articles/', { params: { search: q } })
    return Array.isArray(r.data) ? r.data : (r.data.results || [])
  }, [])

  // Derive string IDs from selected objects
  const selectedVideoId   = selectedVideo?.id   ? String(selectedVideo.id)   : ''
  const selectedWebStoryId = selectedWebStory?.id ? String(selectedWebStory.id) : ''

  // ── Polling ────────────────────────────────────────────────────────────────
  const startPolling = useCallback((aid) => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.get(`articles/${aid}/social_post_status/`)
        const d = r.data
        setStatus(d.status)
        setLog(d.log || [])
        if (d.status === 'done') {
          setPlan(d.plan)
          setGenerating(false)
          clearInterval(pollRef.current)
        } else if (d.status === 'failed') {
          setError('Pipeline failed. Check logs below.')
          setGenerating(false)
          clearInterval(pollRef.current)
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }, POLL_INTERVAL_MS)
  }, [])

  // ── Image paste / drop ─────────────────────────────────────────────────────
  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setPastedImage({ file, preview: URL.createObjectURL(file) })
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items || []
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        handleImageFile(item.getAsFile())
        break
      }
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    handleImageFile(file)
  }

  // ── Generate ───────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    const effectiveArticleId = selectedArticle ? String(selectedArticle.id) : articleId
    if (contentType === 'video' && !selectedVideoId) {
      setError('Select a video to generate from.')
      return
    }
    if (contentType === 'webstory' && !selectedWebStoryId) {
      setError('Select a web story to generate from.')
      return
    }
    if (contentType === 'article' && !effectiveArticleId && !sourceUrl && !plainText && !pastedImage) {
      setError('Select an article or add a URL / text / image.')
      return
    }
    setError('')
    setPlan(null)
    setLog([])
    setGenerating(true)
    setStatus('queued')

    try {
      let resp
      if (pastedImage?.file) {
        const fd = new FormData()
        if (contentType === 'article' && effectiveArticleId) fd.append('article_id', effectiveArticleId)
        if (contentType === 'video')                  fd.append('video_job_id', selectedVideoId)
        if (contentType === 'webstory')               fd.append('webstory_id',  selectedWebStoryId)
        if (sourceUrl)      fd.append('source_url',        sourceUrl)
        if (plainText)      fd.append('plain_text',        plainText)
        if (vibeOverride)   fd.append('vibe_override',     vibeOverride)
        if (selectedTemplateId) fd.append('canva_template_id', selectedTemplateId)
        fd.append('image', pastedImage.file, pastedImage.file.name || 'image.jpg')
        resp = await api.post('social-studio/generate/', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else {
        resp = await api.post('social-studio/generate/', {
          article_id:        contentType === 'article' ? (effectiveArticleId || undefined) : undefined,
          video_job_id:      contentType === 'video'   ? selectedVideoId : undefined,
          webstory_id:       contentType === 'webstory'? selectedWebStoryId : undefined,
          source_url:        sourceUrl || undefined,
          plain_text:        plainText || undefined,
          vibe_override:     vibeOverride || undefined,
          canva_template_id: selectedTemplateId ? parseInt(selectedTemplateId) : undefined,
        })
      }

      const aid = resp.data.article_id
      if (aid) {
        setArticleId(String(aid))
        setArticles(prev => {
          if (prev.find(a => String(a.id) === String(aid))) return prev
          return [{ id: aid, title: resp.data.article_title || `Post #${aid}` }, ...prev]
        })
      }
      startPolling(aid)
    } catch (err) {
      setError('Failed to start pipeline: ' + (err.response?.data?.error || err.message))
      setGenerating(false)
      setStatus('idle')
    }
  }

  const _articleTitle = () => {
    let raw = plan?.Headline || plan?.headline
    if (!raw) {
      if (contentType === 'video')        raw = selectedVideo?.title
      else if (contentType === 'webstory') raw = selectedWebStory?.title
      else                                 raw = selectedArticle?.title
    }
    raw = raw || `post_${Date.now()}`
    return raw.replace(/[^a-zA-Z0-9ഀ-ൿ\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 80)
  }

  const handleDownloadCSV = async (customFilename) => {
    try {
      const resp = await api.get(`articles/${articleId}/export_canva_csv/`, {
        responseType: 'blob',
      })
      const url  = window.URL.createObjectURL(new Blob([resp.data]))
      const link = document.createElement('a')
      link.href  = url
      link.setAttribute('download', customFilename || `${_articleTitle()}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSV download failed:', err)
    }
  }

  const handleOpenInCanva = (canvaUrl) => {
    // Open window first (must be synchronous in the click handler — browsers block popups after async)
    window.open(canvaUrl, '_blank', 'noopener,noreferrer')
    // Download CSV in the background after
    handleDownloadCSV(`${_articleTitle()}.csv`)
  }

  const handleLinkSheet = async () => {
    if (!sheetUrlInput.trim() || !selectedTemplateId) return
    setLinkingSheet(true)
    setSheetLinkError('')
    try {
      await api.patch(`canva-templates/${selectedTemplateId}/`, {
        google_sheet_id: sheetUrlInput.trim(),
      })
      // Reload templates so the UI reflects the new sheet_id
      const r = await api.get('canva-templates/')
      setCanvaTemplates(r.data.results || r.data)
      setSheetUrlInput('')
    } catch (err) {
      setSheetLinkError(err.response?.data?.detail || 'Failed to save sheet URL.')
    } finally {
      setLinkingSheet(false)
    }
  }

  // ── Derive selected template object ───────────────────────────────────────
  const selectedTemplate = canvaTemplates.find(t => String(t.id) === String(selectedTemplateId))
    || (plan?._template_pk ? canvaTemplates.find(t => t.id === plan._template_pk) : null)

  const templateSheetUrl = sheetUrl(selectedTemplate)

  // ── Find sheet push log entry ─────────────────────────────────────────────
  const sheetLogEntry = log.find(e => e.stage === 'sheets')

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Left panel: inputs ── */}
      <div className="w-96 min-w-80 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-900">Social Studio</h1>
          <p className="text-xs text-gray-500 mt-0.5">Generate Canva-ready posts from any source</p>
        </div>

        <div className="px-6 py-4 space-y-4 flex-1">

          {/* Content Source selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Content Source</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {CONTENT_TYPES.map(ct => (
                <button
                  key={ct.key}
                  type="button"
                  onClick={() => {
                    setContentType(ct.key)
                    setArticleId('')
                    setSelectedArticle(null)
                    setSelectedVideo(null)
                    setSelectedWebStory(null)
                  }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    contentType === ct.key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {ct.label}
                </button>
              ))}
            </div>

            {/* Article picker */}
            {contentType === 'article' && (
              <div className="mt-2">
                <ContentCombobox
                  items={articles}
                  onSearch={searchArticles}
                  value={selectedArticle}
                  onChange={setSelectedArticle}
                  placeholder="Search articles by title…"
                  allowNone
                  noneLabel="— None (auto-create draft) —"
                  renderBadge={a => a.status ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">{a.status}</span>
                  ) : null}
                />
              </div>
            )}

            {/* Video picker */}
            {contentType === 'video' && (
              <div className="mt-2">
                <ContentCombobox
                  items={videos}
                  value={selectedVideo}
                  onChange={setSelectedVideo}
                  placeholder="Search videos by title…"
                  renderBadge={v => v.status ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                      v.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>{v.status}</span>
                  ) : null}
                />
              </div>
            )}

            {/* Web Story picker */}
            {contentType === 'webstory' && (
              <div className="mt-2">
                <ContentCombobox
                  items={webStories}
                  value={selectedWebStory}
                  onChange={setSelectedWebStory}
                  placeholder="Search web stories by title…"
                />
              </div>
            )}
          </div>

          {/* Source URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL <span className="text-gray-400 font-normal">(tweet, Instagram, article link…)</span>
            </label>
            <input
              type="url"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="https://x.com/…  or  https://…"
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
            />
          </div>

          {/* Plain text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Text</label>
            <textarea
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Paste raw news text, stats, match result…"
              value={plainText}
              onChange={e => setPlainText(e.target.value)}
            />
          </div>

          {/* Image — paste or upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
            <div
              ref={inputZoneRef}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              tabIndex={0}
              className={`relative border-2 border-dashed rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                pastedImage ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-gray-50 hover:border-indigo-300'
              }`}
            >
              {pastedImage ? (
                <div className="relative">
                  <img src={pastedImage.preview} alt="preview" className="w-full max-h-40 object-cover rounded-lg" />
                  <button
                    onClick={() => setPastedImage(null)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black"
                  >✕</button>
                </div>
              ) : (
                <div className="py-4 px-3 text-center">
                  <p className="text-xs text-gray-500">Paste image (Ctrl+V) or drag &amp; drop</p>
                  <label className="mt-2 inline-block text-xs text-indigo-600 font-medium cursor-pointer hover:underline">
                    or browse
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handleImageFile(e.target.files?.[0])}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Vibe override */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vibe / Tone</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="celebratory · urgent · analytical…"
              value={vibeOverride}
              onChange={e => setVibeOverride(e.target.value)}
            />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {VIBE_SUGGESTIONS.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVibeOverride(v)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    vibeOverride === v
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Template selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Canva Template</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
            >
              <option value="">Auto-detect from content</option>
              {canvaTemplates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.content_type_display || t.content_type})
                  {t.google_sheet_id ? ' ✓' : ''}
                </option>
              ))}
            </select>

            {/* Sheet status / link form for selected template */}
            {selectedTemplate && (
              <div className="mt-2">
                {selectedTemplate.google_sheet_id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-600 font-medium">Sheet linked</span>
                    <a
                      href={sheetUrl(selectedTemplate)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 underline"
                    >
                      Open sheet
                    </a>
                    <button
                      type="button"
                      onClick={() => setSheetUrlInput('change')}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-2">
                    <p className="text-xs text-amber-700 font-medium">No sheet linked — posts won't auto-push to Canva</p>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Paste Google Sheet URL…"
                        value={sheetUrlInput === 'change' ? '' : sheetUrlInput}
                        onChange={e => setSheetUrlInput(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={handleLinkSheet}
                        disabled={linkingSheet || !sheetUrlInput.trim() || sheetUrlInput === 'change'}
                        className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-3 py-1.5 rounded font-medium transition-colors"
                      >
                        {linkingSheet ? 'Saving…' : 'Link'}
                      </button>
                    </div>
                    {sheetLinkError && <p className="text-xs text-red-600">{sheetLinkError}</p>}
                    <p className="text-xs text-gray-500">
                      Share your sheet with <span className="font-mono select-all">{saEmail}</span> (Editor)
                    </p>
                  </div>
                )}
                {/* Change sheet form */}
                {selectedTemplate.google_sheet_id && sheetUrlInput === 'change' && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="url"
                      className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500"
                      placeholder="New Google Sheet URL…"
                      onChange={e => setSheetUrlInput(e.target.value === 'change' ? '' : e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleLinkSheet}
                      disabled={linkingSheet}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-3 py-1.5 rounded font-medium"
                    >
                      {linkingSheet ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setSheetUrlInput('')} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  </div>
                )}
              </div>
            )}

            {canvaTemplates.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No templates yet — add one in Settings → Social Studio.
              </p>
            )}
          </div>

          {/* SA email hint */}
          {saEmail && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 font-medium mb-0.5">Share sheets with:</p>
              <p className="text-xs font-mono text-gray-700 break-all select-all">{saEmail}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className={`w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors ${
              generating
                ? 'bg-indigo-300 text-white cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {generating ? 'Generating…' : '⚡ Generate Social Post'}
          </button>

          {/* Status badge */}
          {status !== 'idle' && (
            <div className={`text-center text-xs font-medium px-3 py-1 rounded-full ${STATUS_COLORS[status]}`}>
              {STATUS_LABELS[status]}
            </div>
          )}
        </div>

        {/* Log panel */}
        {log.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Pipeline Log</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {[...log].reverse().map((entry, i) => (
                <div key={i} className="text-xs text-gray-600">
                  <span className={`font-mono mr-1 ${entry.stage === 'sheets' ? 'text-green-600' : 'text-indigo-500'}`}>
                    [{entry.stage}]
                  </span>
                  {entry.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel: result ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {!plan && status !== 'running' && status !== 'queued' && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <div className="text-6xl mb-4">⚡</div>
            <p className="text-lg font-medium">No post generated yet</p>
            <p className="text-sm mt-1">Fill in the form and click Generate</p>
          </div>
        )}

        {(status === 'queued' || status === 'running') && !plan && (
          <div className="flex flex-col items-center justify-center h-full text-indigo-500">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="font-medium">{status === 'queued' ? 'Queued — starting shortly…' : 'Running CrewAI pipeline…'}</p>
            <p className="text-sm text-gray-500 mt-1">This usually takes 30–90 seconds</p>
          </div>
        )}

        {plan && (
          <div className="max-w-3xl mx-auto space-y-6">

            {/* Template header + action buttons */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{plan._template_name}</h2>
                {plan._canva_template_id && (
                  <span className="inline-block mt-1 text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    Template ID: {plan._canva_template_id}
                  </span>
                )}
                {/* Sheet push result */}
                {sheetLogEntry && (
                  <p className={`text-xs mt-1 ${sheetLogEntry.message.startsWith('Row') ? 'text-green-600' : 'text-amber-600'}`}>
                    {sheetLogEntry.message.startsWith('Row') ? '✓ ' : '⚠ '}{sheetLogEntry.message}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                {/* Open Generated Post — highest priority, shown when Canva autofill succeeded */}
                {plan._canva_design_url && (
                  <button
                    onClick={() => handleOpenInCanva(plan._canva_design_url)}
                    className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    Open Generated Post
                  </button>
                )}
                {/* Open base template — auto-downloads CSV then opens Canva */}
                {plan._canva_template_id && !plan._canva_design_url && (
                  <button
                    onClick={() => handleOpenInCanva(`https://www.canva.com/design/${plan._canva_template_id}/edit`)}
                    className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    Open in Canva
                  </button>
                )}
                {/* Open Sheet — shown if sheet push succeeded */}
                {templateSheetUrl && sheetLogEntry?.message.startsWith('Row') && (
                  <a
                    href={templateSheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    Open Sheet
                  </a>
                )}
                {/* CSV download — always available */}
                <button
                  onClick={handleDownloadCSV}
                  className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 transition-colors"
                >
                  Download CSV
                </button>
              </div>
            </div>

            {/* Slot cards — rendered from template schema */}
            {selectedTemplate?.slots ? (
              <SlotCards slots={selectedTemplate.slots} plan={plan} />
            ) : (
              <GenericPlanCards plan={plan} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Slot cards (template-driven) ──────────────────────────────────────────────

function SlotCards({ slots, plan }) {
  const textSlots  = slots.text  || []
  const imageSlots = slots.image || []
  const colorSlots = slots.color || []

  return (
    <div className="space-y-4">
      {textSlots.length > 0 && (
        <Section title="Text Slots">
          {textSlots.map(s => (
            <SlotCard key={s.key} label={s.key} canvaName={s.canva_name} value={plan[s.key]} type="text" />
          ))}
        </Section>
      )}
      {imageSlots.length > 0 && (
        <Section title="Image Slots">
          {imageSlots.map(s => (
            <SlotCard
              key={s.key}
              label={s.key}
              canvaName={s.canva_name}
              value={plan[s.key]}
              type="image"
              needsCutout={s.needs_cutout}
            />
          ))}
        </Section>
      )}
      {colorSlots.length > 0 && (
        <Section title="Color Slots">
          {colorSlots.map(s => (
            <SlotCard key={s.key} label={s.key} canvaName={s.canva_name} value={plan[s.key]} type="color" />
          ))}
        </Section>
      )}
    </div>
  )
}

// ── Generic fallback cards (no template) ─────────────────────────────────────

function GenericPlanCards({ plan }) {
  const skip = new Set(['_template_pk', '_template_name', '_canva_template_id', '_canva_design_url', '_canva_design_id'])
  const entries = Object.entries(plan).filter(([k]) => !skip.has(k))
  return (
    <div className="grid grid-cols-1 gap-3">
      {entries.map(([key, value]) => (
        <SlotCard
          key={key}
          label={key}
          canvaName={key}
          value={value}
          type={
            key.toLowerCase().includes('image') || key.toLowerCase().includes('cutout')
              ? 'image'
              : key.toLowerCase().includes('color')
              ? 'color'
              : 'text'
          }
        />
      ))}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{title}</h3>
      <div className="grid grid-cols-1 gap-2">{children}</div>
    </div>
  )
}

// ── Individual slot card ──────────────────────────────────────────────────────

function SlotCard({ label, canvaName, value, type, needsCutout }) {
  const isImage = type === 'image'
  const isColor = type === 'color'
  const isUrl   = typeof value === 'string' && value.startsWith('http')

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm text-gray-800">{label}</span>
          {needsCutout && (
            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
              cutout
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Canva element: <span className="font-mono">{canvaName}</span>
        </p>

        {isColor ? (
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full border-2 border-white shadow"
              style={{ backgroundColor: value || '#ccc' }}
            />
            <span className="text-sm font-mono text-gray-700">{value || '—'}</span>
          </div>
        ) : isImage && isUrl ? (
          <img
            src={value}
            alt={label}
            className="h-24 w-auto object-cover rounded-lg border border-gray-200"
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <p className={`text-sm ${value ? 'text-gray-900' : 'text-gray-400 italic'} break-words whitespace-pre-line`}>
            {value || '(empty)'}
          </p>
        )}
      </div>
    </div>
  )
}
