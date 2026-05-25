import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import ContentCombobox from '../common/ContentCombobox'

const POLL_INTERVAL_MS = 3000

const POST_TYPES = [
  { key: 'breaking',        label: '🚨 Breaking',     hint: 'Urgent announcement — player dropped, injured, or selected' },
  { key: 'fact_check',      label: '✅ Fact Check',   hint: 'Verify or debunk a claim or viral statement' },
  { key: 'quote',           label: '💬 Quote Card',   hint: 'A notable quote or statement from a player / pundit' },
  { key: 'predicted_xi',    label: '📋 Predicted XI', hint: 'Pre-match predicted lineup (before toss)' },
  { key: 'stat_comparison', label: '📊 Stats',        hint: 'Head-to-head stats or player comparison' },
  { key: 'general',         label: '🎯 General',      hint: 'General news — milestone, transfer, profile, match update' },
]

const CONTENT_TYPES = [
  { key: 'article',  label: 'Article' },
  { key: 'video',    label: 'Video' },
  { key: 'webstory', label: 'Web Story' },
]

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

const PROMPT_PLACEHOLDERS = {
  breaking:        'e.g. "India drops Sanju Samson from the Afghanistan T20 squad"',
  fact_check:      'e.g. "Ricky Ponting said India never accepts defeat — is this true?"',
  quote:           'e.g. "Rohit Sharma: We are playing our best cricket right now"',
  predicted_xi:    'e.g. "Predicted XI for India vs Australia 1st T20I at Wankhede"',
  stat_comparison: 'e.g. "Compare Kohli vs Babar Azam in ICC tournaments 2023–2025"',
  general:         'e.g. "Hardik Pandya returns to Mumbai Indians after IPL trade"',
  default:         'Describe what to create, or paste a URL, screenshot, quote, or raw facts…',
}

function sheetUrl(template) {
  if (!template?.google_sheet_id) return ''
  const match = template.google_sheet_id.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  const id = match ? match[1] : template.google_sheet_id
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : ''
}

export default function SocialPostGenerator() {
  const [searchParams, setSearchParams] = useSearchParams()
  const articleIdParam = searchParams.get('article')

  // ── Prompt ────────────────────────────────────────────────────────────────────
  const [userPrompt, setUserPrompt]         = useState('')
  const [selectedPostType, setSelectedPostType] = useState(null)
  const [attachedImage, setAttachedImage]   = useState(null) // { file, preview }
  const fileInputRef = useRef(null)

  // ── Source context ─────────────────────────────────────────────────────────────
  const [sourceOpen, setSourceOpen]         = useState(false)
  const [contentType, setContentType]       = useState('article')
  const [articleId, setArticleId]           = useState(articleIdParam || '')
  const [articles, setArticles]             = useState([])
  const [videos, setVideos]                 = useState([])
  const [webStories, setWebStories]         = useState([])
  const [selectedArticle, setSelectedArticle]   = useState(null)
  const [selectedVideo, setSelectedVideo]       = useState(null)
  const [selectedWebStory, setSelectedWebStory] = useState(null)

  // ── Advanced ──────────────────────────────────────────────────────────────────
  const [advancedOpen, setAdvancedOpen]     = useState(false)
  const [canvaTemplates, setCanvaTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [saEmail, setSaEmail]               = useState('')
  const [sheetUrlInput, setSheetUrlInput]   = useState('')
  const [linkingSheet, setLinkingSheet]     = useState(false)
  const [sheetLinkError, setSheetLinkError] = useState('')

  // ── Pipeline state ────────────────────────────────────────────────────────────
  const [status, setStatus]         = useState('idle')
  const [plan, setPlan]             = useState(null)
  const [log, setLog]               = useState([])
  const [error, setError]           = useState('')
  const [generating, setGenerating] = useState(false)
  const pollRef = useRef(null)

  // ── Edit state ────────────────────────────────────────────────────────────────
  const [editedPlan, setEditedPlan]         = useState(null)  // null = unmodified
  const [editedCaption, setEditedCaption]   = useState(null)  // null = unmodified
  const [savingEdits, setSavingEdits]       = useState(false)
  const [saveStatus, setSaveStatus]         = useState(null)  // null | 'saved' | 'error'

  const isDirty = editedPlan !== null || editedCaption !== null

  const handleSlotEdit = (key, value) => {
    setEditedPlan(prev => ({ ...(prev || plan), [key]: value }))
    setSaveStatus(null)
  }

  const handleCaptionEdit = (value) => {
    setEditedCaption(value)
    setSaveStatus(null)
  }

  const handleSaveEdits = async () => {
    if (!articleId || !plan) return
    setSavingEdits(true)
    setSaveStatus(null)
    try {
      const payload = {
        article_id: parseInt(articleId),
        plan:       editedPlan || plan,
        caption:    editedCaption !== null ? editedCaption : (plan.social_media_caption || ''),
      }
      await api.post('social-studio/save-edits/', payload)
      // Merge edits back into canonical plan
      if (editedPlan) setPlan(prev => ({ ...prev, ...editedPlan }))
      if (editedCaption !== null) setPlan(prev => ({ ...prev, social_media_caption: editedCaption }))
      setEditedPlan(null)
      setEditedCaption(null)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (e) {
      console.error('Save edits error:', e)
      setSaveStatus('error')
    } finally {
      setSavingEdits(false)
    }
  }

  // ── Load data on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('canva-templates/').then(r => setCanvaTemplates(r.data.results || r.data)).catch(() => {})
    api.get('articles/').then(r => setArticles(r.data.results || r.data)).catch(() => {})
    api.get('/video/jobs/?picker=1').then(r => setVideos(r.data.results || r.data)).catch(() => {})
    api.get('webstories/').then(r => setWebStories(r.data.results || r.data)).catch(() => {})
    api.get('canva-templates/service-account-email/').then(r => setSaEmail(r.data.email || '')).catch(() => {})
    return () => clearInterval(pollRef.current)
  }, [])

  // ── Polling ───────────────────────────────────────────────────────────────────
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
          setEditedPlan(null)
          setEditedCaption(null)
          setSaveStatus(null)
          setGenerating(false)
          clearInterval(pollRef.current)
        } else if (d.status === 'failed') {
          setError('Pipeline failed. Check the log below.')
          setGenerating(false)
          clearInterval(pollRef.current)
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }, POLL_INTERVAL_MS)
  }, [])

  useEffect(() => {
    if (!articleIdParam) {
      // "+New Social Post" navigated here without an article — reset everything
      clearInterval(pollRef.current)
      // Source / prompt
      setArticleId('')
      setSelectedArticle(null)
      setSelectedVideo(null)
      setSelectedWebStory(null)
      setContentType('article')
      setUserPrompt('')
      setSelectedPostType(null)
      setAttachedImage(null)
      setExtractedContext(null)
      setExtractError('')
      setImageContentTypeHint('')
      setImageSpeakers([])
      // Pipeline
      setStatus('idle')
      setPlan(null)
      setLog([])
      setError('')
      setGenerating(false)
      // Edits
      setEditedPlan(null)
      setEditedCaption(null)
      setSaveStatus(null)
      // Advanced
      setSelectedTemplateId('')
      setSheetUrlInput('')
      setSheetLinkError('')
      setAdvancedOpen(false)
      setSourceOpen(true)
      return
    }
    setArticleId(articleIdParam)

    api.get(`articles/${articleIdParam}/social_post_status/`).then(r => {
      const d = r.data
      setStatus(d.status)
      setLog(d.log || [])
      if (d.status === 'done' && d.plan) {
        setPlan(d.plan)
        setEditedPlan(null)
        setEditedCaption(null)
      } else if (d.status === 'running' || d.status === 'queued') {
        setGenerating(true)
        startPolling(articleIdParam)
      } else {
        setSourceOpen(true)
      }
    }).catch(() => setSourceOpen(true))
  }, [articleIdParam, startPolling])

  const searchArticles = useCallback(async (q) => {
    const r = await api.get('articles/', { params: { search: q } })
    return Array.isArray(r.data) ? r.data : (r.data.results || [])
  }, [])

  const selectedVideoId    = selectedVideo?.id    ? String(selectedVideo.id)    : ''
  const selectedWebStoryId = selectedWebStory?.id ? String(selectedWebStory.id) : ''

  // ── Image attach + auto-extract ───────────────────────────────────────────────
  const [extracting, setExtracting]                     = useState(false)
  const [extractedContext, setExtractedContext]         = useState(null) // null = not yet run
  const [extractError, setExtractError]                 = useState('')
  const [imageContentTypeHint, setImageContentTypeHint] = useState('')
  const [imageSpeakers, setImageSpeakers]               = useState([])

  const CONTENT_TYPE_LABELS = {
    stat_comparison: 'Two-player quote',
    quote_card:      'Single quote',
    playing_xi:      'Playing XI',
    predicted_xi:    'Predicted XI',
    match_result:    'Match result',
    fact_check:      'Fact check',
    ticker:          'Breaking news',
    general:         'General',
  }

  const handleImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setAttachedImage({ file, preview: URL.createObjectURL(file) })
    setExtractedContext(null)
    setExtractError('')
    setImageContentTypeHint('')
    setImageSpeakers([])
    setExtracting(true)
    try {
      const fd = new FormData()
      fd.append('image', file, file.name || 'image.jpg')
      const r = await api.post('social-studio/extract-image-context/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setExtractedContext(r.data.extracted || '')
      setImageContentTypeHint(r.data.content_type_hint || '')
      setImageSpeakers(r.data.speakers || [])
    } catch (e) {
      console.warn('Image context extraction failed:', e)
      const msg = e.response?.data?.error?.message || e.response?.data?.detail || e.message || 'Vision API error'
      setExtractError(msg)
      setExtractedContext('')
    } finally {
      setExtracting(false)
    }
  }

  const handleTextareaPaste = (e) => {
    const items = e.clipboardData?.items || []
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        handleImageFile(item.getAsFile())
        return
      }
    }
    // Text pastes (including URLs) fall through to default textarea behaviour
  }

  // ── Post type chip ────────────────────────────────────────────────────────────
  const handleChipClick = (typeKey) => {
    setSelectedPostType(prev => prev === typeKey ? null : typeKey)
  }

  // ── Generate ──────────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    const effectiveArticleId = selectedArticle ? String(selectedArticle.id) : articleId

    if (!userPrompt && !extractedContext && !attachedImage && !effectiveArticleId && !selectedVideoId && !selectedWebStoryId) {
      setError('Type a prompt, attach a source, or paste an image to get started.')
      return
    }

    setError('')
    setPlan(null)
    setEditedPlan(null)
    setEditedCaption(null)
    setSaveStatus(null)
    setLog([])
    setGenerating(true)
    setStatus('queued')

    try {
      let resp
      const hasImage = !!attachedImage?.file
      // Combine user prompt + confirmed image context into a single plain_text string
      const combinedText = [extractedContext, userPrompt].filter(Boolean).join('\n\n')

      if (hasImage) {
        const fd = new FormData()
        if (combinedText)                                          fd.append('plain_text',                combinedText)
        if (userPrompt)                                            fd.append('prompt',                    userPrompt)
        if (selectedPostType)                                      fd.append('post_type_hint',            selectedPostType)
        if (!selectedPostType && imageContentTypeHint)             fd.append('image_content_type_hint',   imageContentTypeHint)
        if (contentType === 'article' && effectiveArticleId)       fd.append('article_id',               effectiveArticleId)
        if (contentType === 'video'   && selectedVideoId)          fd.append('video_job_id',             selectedVideoId)
        if (contentType === 'webstory'&& selectedWebStoryId)       fd.append('webstory_id',              selectedWebStoryId)
        if (selectedTemplateId)                                    fd.append('canva_template_id',         selectedTemplateId)
        fd.append('image', attachedImage.file, attachedImage.file.name || 'image.jpg')
        resp = await api.post('social-studio/generate/', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else {
        resp = await api.post('social-studio/generate/', {
          prompt:                   combinedText || userPrompt || undefined,
          post_type_hint:           selectedPostType || undefined,
          image_content_type_hint:  (!selectedPostType && imageContentTypeHint) ? imageContentTypeHint : undefined,
          article_id:               contentType === 'article'  ? (effectiveArticleId || undefined) : undefined,
          video_job_id:             contentType === 'video'    ? selectedVideoId                   : undefined,
          webstory_id:              contentType === 'webstory' ? selectedWebStoryId               : undefined,
          canva_template_id:        selectedTemplateId ? parseInt(selectedTemplateId) : undefined,
        })
      }

      const aid = resp.data.article_id
      if (aid) {
        setArticleId(String(aid))
        setArticles(prev => {
          if (prev.find(a => String(a.id) === String(aid))) return prev
          return [{ id: aid, title: resp.data.article_title || `Post #${aid}` }, ...prev]
        })
        setSearchParams({ article: String(aid) }, { replace: true })
      }
      startPolling(aid)
    } catch (err) {
      setError('Failed to start: ' + (err.response?.data?.error?.message || err.response?.data?.detail || err.message))
      setGenerating(false)
      setStatus('idle')
    }
  }

  // ── CSV / Canva helpers ───────────────────────────────────────────────────────
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
      const resp = await api.get(`articles/${articleId}/export_canva_csv/`, { responseType: 'blob' })
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
    window.open(canvaUrl, '_blank', 'noopener,noreferrer')
    handleDownloadCSV(`${_articleTitle()}.csv`)
  }

  const handleLinkSheet = async () => {
    if (!sheetUrlInput.trim() || !selectedTemplateId) return
    setLinkingSheet(true)
    setSheetLinkError('')
    try {
      await api.patch(`canva-templates/${selectedTemplateId}/`, { google_sheet_id: sheetUrlInput.trim() })
      const r = await api.get('canva-templates/')
      setCanvaTemplates(r.data.results || r.data)
      setSheetUrlInput('')
    } catch (err) {
      setSheetLinkError(err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to save sheet URL.')
    } finally {
      setLinkingSheet(false)
    }
  }

  const selectedTemplate = canvaTemplates.find(t => String(t.id) === String(selectedTemplateId))
    || (plan?._template_pk ? canvaTemplates.find(t => t.id === plan._template_pk) : null)
  const templateSheetUrl = sheetUrl(selectedTemplate)
  const sheetLogEntry    = log.find(e => e.stage === 'sheets')

  const placeholder = PROMPT_PLACEHOLDERS[selectedPostType] || PROMPT_PLACEHOLDERS.default
  const hasSource   = !!(selectedArticle || selectedVideoId || selectedWebStoryId)

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Left panel ── */}
      <div className="w-96 min-w-80 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-900">Social Studio</h1>
          <p className="text-xs text-gray-400 mt-0.5">Prompt anything — create Canva-ready posts in seconds</p>
        </div>

        <div className="flex-1 flex flex-col px-5 py-4 gap-4">

          {/* ── Composer ── */}
          <div>
            <div className="border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-shadow">

              {/* Textarea */}
              <textarea
                rows={5}
                className="w-full px-4 pt-3 pb-2 text-sm resize-none focus:outline-none placeholder-gray-400 leading-relaxed bg-white"
                placeholder={placeholder}
                value={userPrompt}
                onChange={e => setUserPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate()
                }}
                onPaste={handleTextareaPaste}
              />

              {/* Attached image chip */}
              {attachedImage && (
                <div className="px-3 pb-1">
                  <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1 max-w-full">
                    <img
                      src={attachedImage.preview}
                      alt="attached"
                      className="h-6 w-6 object-cover rounded flex-shrink-0"
                    />
                    <span className="text-xs text-indigo-700 font-medium truncate">Image attached</span>
                    <button
                      type="button"
                      onClick={() => { setAttachedImage(null); setExtractedContext(null); setExtractError(''); setImageContentTypeHint(''); setImageSpeakers([]) }}
                      className="text-indigo-300 hover:text-indigo-600 flex-shrink-0 ml-0.5"
                      title="Remove image"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Extracted context preview — shown while extracting or after completion */}
              {attachedImage && (extracting || extractedContext !== null) && (
                <div className="mx-3 mb-2 rounded-lg border border-indigo-100 bg-indigo-50/60 overflow-hidden">
                  <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-indigo-100">
                    <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide flex items-center gap-1.5">
                      {extracting ? (
                        <>
                          <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Reading image…
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Extracted context
                          {extractedContext && <span className="text-indigo-400 font-normal normal-case tracking-normal">(editable)</span>}
                          {imageContentTypeHint && (
                            <span className="bg-purple-100 text-purple-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full normal-case tracking-normal ml-1">
                              {CONTENT_TYPE_LABELS[imageContentTypeHint] || imageContentTypeHint}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                    {!extracting && extractedContext && (
                      <button
                        type="button"
                        onClick={() => setExtractedContext('')}
                        className="text-indigo-300 hover:text-indigo-600 text-[10px]"
                      >clear</button>
                    )}
                  </div>
                  {extracting ? (
                    <div className="px-2.5 py-2 text-xs text-indigo-400 italic">Analysing image with Gemini Vision…</div>
                  ) : extractError ? (
                    <div className="px-2.5 py-2 text-xs text-red-500">Vision error: {extractError}</div>
                  ) : extractedContext ? (
                    <textarea
                      rows={4}
                      className="w-full px-2.5 py-2 text-xs text-gray-800 bg-transparent resize-none focus:outline-none leading-relaxed"
                      value={extractedContext}
                      onChange={e => setExtractedContext(e.target.value)}
                    />
                  ) : (
                    <div className="px-2.5 py-2 text-xs text-amber-600 italic">
                      No text found — Vision could not read the image. You can still type context manually in the prompt above.
                    </div>
                  )}
                </div>
              )}

              {/* Toolbar */}
              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50/60">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image (or paste with Ctrl+V)"
                  className="text-gray-400 hover:text-indigo-600 transition-colors p-1 rounded-lg hover:bg-indigo-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handleImageFile(e.target.files?.[0])}
                />
                <p className="text-[11px] text-gray-400">⌘ Enter to generate</p>
              </div>
            </div>
          </div>

          {/* ── Post type chips ── */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Post type</p>
            <div className="flex flex-wrap gap-1.5">
              {POST_TYPES.map(pt => (
                <button
                  key={pt.key}
                  type="button"
                  title={pt.hint}
                  onClick={() => handleChipClick(pt.key)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                    selectedPostType === pt.key
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                  }`}
                >
                  {pt.label}
                </button>
              ))}
            </div>
            {selectedPostType && (
              <p className="text-[11px] text-indigo-500 mt-1.5">
                {POST_TYPES.find(p => p.key === selectedPostType)?.hint}
              </p>
            )}
          </div>

          {/* ── Source (collapsible) ── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setSourceOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span>Source</span>
                {hasSource && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">
                    linked
                  </span>
                )}
              </span>
              <span className="text-gray-400 text-xs">{sourceOpen ? '▲' : '▼'}</span>
            </button>

            {sourceOpen && (
              <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50/50">

                {/* Source type toggle */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Type</p>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    {CONTENT_TYPES.map(ct => (
                      <button
                        key={ct.key}
                        type="button"
                        onClick={() => {
                          setContentType(ct.key)
                          setSelectedArticle(null)
                          setSelectedVideo(null)
                          setSelectedWebStory(null)
                        }}
                        className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                          contentType === ct.key
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {ct.label}
                      </button>
                    ))}
                  </div>
                </div>

                {contentType === 'article' && (
                  <ContentCombobox
                    items={articles}
                    onSearch={searchArticles}
                    value={selectedArticle}
                    onChange={setSelectedArticle}
                    placeholder="Search articles…"
                    allowNone
                    noneLabel="— None (auto-create) —"
                    renderBadge={a => a.status ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">{a.status}</span>
                    ) : null}
                  />
                )}

                {contentType === 'video' && (
                  <ContentCombobox
                    items={videos}
                    value={selectedVideo}
                    onChange={setSelectedVideo}
                    placeholder="Search videos…"
                    renderBadge={v => v.status ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                        v.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>{v.status}</span>
                    ) : null}
                  />
                )}

                {contentType === 'webstory' && (
                  <ContentCombobox
                    items={webStories}
                    value={selectedWebStory}
                    onChange={setSelectedWebStory}
                    placeholder="Search web stories…"
                  />
                )}

              </div>
            )}
          </div>

          {/* ── Advanced (collapsible) ── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setAdvancedOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span>Advanced</span>
                {selectedTemplateId && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                    template set
                  </span>
                )}
              </span>
              <span className="text-gray-400 text-xs">{advancedOpen ? '▲' : '▼'}</span>
            </button>

            {advancedOpen && (
              <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50/50">

                {/* Template selector */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Force template</p>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                    value={selectedTemplateId}
                    onChange={e => setSelectedTemplateId(e.target.value)}
                  >
                    <option value="">Auto-detect from prompt</option>
                    {canvaTemplates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.content_type_display || t.content_type}){t.google_sheet_id ? ' ✓' : ''}
                      </option>
                    ))}
                  </select>
                  {canvaTemplates.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No templates — add one in Settings → Social Studio.</p>
                  )}
                </div>

                {/* Sheet linking */}
                {selectedTemplate && (
                  <div>
                    {selectedTemplate.google_sheet_id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-600 font-medium">Sheet linked ✓</span>
                        <a href={sheetUrl(selectedTemplate)} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 underline">Open</a>
                        <button type="button" onClick={() => setSheetUrlInput('change')} className="text-xs text-gray-400 hover:text-gray-600 underline">Change</button>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-2">
                        <p className="text-xs text-amber-700 font-medium">No Google Sheet linked</p>
                        <div className="flex gap-2">
                          <input
                            type="url"
                            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500"
                            placeholder="Paste Google Sheet URL…"
                            value={sheetUrlInput === 'change' ? '' : sheetUrlInput}
                            onChange={e => setSheetUrlInput(e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={handleLinkSheet}
                            disabled={linkingSheet || !sheetUrlInput.trim() || sheetUrlInput === 'change'}
                            className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-3 py-1.5 rounded font-medium"
                          >
                            {linkingSheet ? 'Saving…' : 'Link'}
                          </button>
                        </div>
                        {sheetLinkError && <p className="text-xs text-red-600">{sheetLinkError}</p>}
                        {saEmail && <p className="text-xs text-gray-500">Share with <span className="font-mono select-all">{saEmail}</span></p>}
                      </div>
                    )}
                    {selectedTemplate.google_sheet_id && sheetUrlInput === 'change' && (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="url"
                          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500"
                          placeholder="New Google Sheet URL…"
                          onChange={e => setSheetUrlInput(e.target.value === 'change' ? '' : e.target.value)}
                        />
                        <button type="button" onClick={handleLinkSheet} disabled={linkingSheet} className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-3 py-1.5 rounded font-medium">
                          {linkingSheet ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" onClick={() => setSheetUrlInput('')} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all ${
              generating
                ? 'bg-indigo-300 text-white cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-sm'
            }`}
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Generating…
              </span>
            ) : '⚡ Generate Post'}
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
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Pipeline</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {[...log].reverse().map((entry, i) => (
                <div key={i} className="text-xs text-gray-600 flex gap-1.5">
                  <span className={`font-mono flex-shrink-0 ${entry.stage === 'sheets' ? 'text-green-600' : 'text-indigo-500'}`}>
                    [{entry.stage}]
                  </span>
                  <span className="truncate">{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel: result ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {!plan && status !== 'running' && status !== 'queued' && (
          <div className="flex flex-col items-center justify-center h-full text-gray-300">
            <div className="text-7xl mb-4 select-none">⚡</div>
            <p className="text-lg font-semibold text-gray-400">Ready to generate</p>
            <p className="text-sm text-gray-400 mt-1">Type a prompt and hit Generate</p>
            <div className="mt-8 grid grid-cols-2 gap-3 max-w-md w-full">
              {POST_TYPES.map(pt => (
                <button
                  key={pt.key}
                  type="button"
                  onClick={() => {
                    setSelectedPostType(pt.key)
                    document.querySelector('textarea')?.focus()
                  }}
                  className="text-left bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors group"
                >
                  <div className="text-sm font-medium text-gray-700 group-hover:text-indigo-700">{pt.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5 leading-snug">{pt.hint}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {(status === 'queued' || status === 'running') && !plan && (
          <div className="flex flex-col items-center justify-center h-full text-indigo-500">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4" />
            <p className="font-semibold">{status === 'queued' ? 'Queued — starting shortly…' : 'Running pipeline…'}</p>
            <p className="text-sm text-gray-400 mt-1">Usually takes 30–90 seconds</p>
            {selectedPostType && (
              <p className="text-xs text-indigo-400 mt-2">
                {POST_TYPES.find(p => p.key === selectedPostType)?.label} post
              </p>
            )}
          </div>
        )}

        {plan && (
          <div className="max-w-3xl mx-auto space-y-6">

            {/* Template header + action buttons */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{plan._template_name}</h2>
                {plan._canva_template_id && (
                  <span className="inline-block mt-1 text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                    {plan._canva_template_id}
                  </span>
                )}
                {sheetLogEntry && (
                  <p className={`text-xs mt-1 ${sheetLogEntry.message.startsWith('Row') ? 'text-green-600' : 'text-amber-600'}`}>
                    {sheetLogEntry.message.startsWith('Row') ? '✓ ' : '⚠ '}{sheetLogEntry.message}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                {/* Save edits button — shown when edits are pending */}
                {isDirty && (
                  <button
                    onClick={handleSaveEdits}
                    disabled={savingEdits}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {savingEdits ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Saving…
                      </>
                    ) : 'Save Edits'}
                  </button>
                )}
                {saveStatus === 'saved' && !isDirty && (
                  <span className="text-sm text-emerald-600 font-medium px-3 py-2">✓ Saved &amp; learned</span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-sm text-red-600 font-medium px-3 py-2">Save failed</span>
                )}
                <CopyLinkButton articleId={articleId} />
                {plan._canva_design_url && (
                  <button
                    onClick={() => handleOpenInCanva(plan._canva_design_url)}
                    className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open Generated Post
                  </button>
                )}
                {plan._canva_template_id && !plan._canva_design_url && (
                  <button
                    onClick={() => handleOpenInCanva(`https://www.canva.com/design/${plan._canva_template_id}/edit`)}
                    className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    Open in Canva
                  </button>
                )}
                {templateSheetUrl && sheetLogEntry?.message.startsWith('Row') && (
                  <a href={templateSheetUrl} target="_blank" rel="noopener noreferrer"
                    className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                    Open Sheet
                  </a>
                )}
                <button
                  onClick={handleDownloadCSV}
                  className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 transition-colors"
                >
                  Download CSV
                </button>
              </div>
            </div>

            {/* Social media caption */}
            {(plan.social_media_caption || editedCaption !== null) && (
              <SocialCaptionCard
                caption={editedCaption !== null ? editedCaption : (plan.social_media_caption || '')}
                onChange={handleCaptionEdit}
              />
            )}

            {/* Slot cards */}
            {selectedTemplate?.slots ? (
              <SlotCards
                slots={selectedTemplate.slots}
                plan={editedPlan ? { ...plan, ...editedPlan } : plan}
                onSlotEdit={handleSlotEdit}
              />
            ) : (
              <GenericPlanCards
                plan={editedPlan ? { ...plan, ...editedPlan } : plan}
                onSlotEdit={handleSlotEdit}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Copy link button ──────────────────────────────────────────────────────────

function CopyLinkButton({ articleId }) {
  const [copied, setCopied] = useState(false)
  if (!articleId) return null

  const handleCopy = () => {
    const url = `${window.location.origin}/social-studio?article=${articleId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy shareable link to this post"
      className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors flex items-center gap-1.5 ${
        copied
          ? 'bg-green-50 text-green-700 border-green-300'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {copied ? (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Copy link
        </>
      )}
    </button>
  )
}

// ── Social caption card ───────────────────────────────────────────────────────

function SocialCaptionCard({ caption, onChange }) {
  const [copied, setCopied]   = useState(false)
  const [editing, setEditing] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(caption).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
          📱 Social Media Caption
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setEditing(e => !e)}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
              editing
                ? 'bg-indigo-200 text-indigo-800'
                : 'bg-white/60 text-indigo-600 hover:bg-indigo-100 border border-indigo-200'
            }`}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
          <button
            onClick={handleCopy}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
              copied
                ? 'bg-green-100 text-green-700'
                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
            }`}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
      {editing ? (
        <textarea
          className="w-full text-sm text-gray-800 leading-relaxed bg-white/80 border border-indigo-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          rows={Math.max(4, caption.split('\n').length + 1)}
          value={caption}
          onChange={e => onChange(e.target.value)}
          autoFocus
        />
      ) : (
        <p
          className="text-sm text-gray-800 leading-relaxed whitespace-pre-line cursor-text hover:bg-white/40 rounded px-1 -mx-1 transition-colors"
          onClick={() => setEditing(true)}
          title="Click to edit"
        >
          {caption}
        </p>
      )}
      {editing && (
        <p className="text-xs text-indigo-400 mt-1.5">
          Edits teach the AI — hit "Save Edits" to apply &amp; learn
        </p>
      )}
    </div>
  )
}

// ── Slot cards (template-driven) ──────────────────────────────────────────────

function SlotCards({ slots, plan, onSlotEdit }) {
  const textSlots  = slots.text  || []
  const imageSlots = slots.image || []
  const colorSlots = slots.color || []

  return (
    <div className="space-y-4">
      {textSlots.length > 0 && (
        <Section title="Text Slots">
          {textSlots.map(s => (
            <SlotCard
              key={s.key}
              label={s.key}
              canvaName={s.canva_name}
              value={plan[s.key]}
              type="text"
              onEdit={v => onSlotEdit(s.key, v)}
            />
          ))}
        </Section>
      )}
      {imageSlots.length > 0 && (
        <Section title="Image Slots">
          {imageSlots.map(s => (
            <SlotCard key={s.key} label={s.key} canvaName={s.canva_name} value={plan[s.key]} type="image" needsCutout={s.needs_cutout} />
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

// ── Generic fallback cards ────────────────────────────────────────────────────

function GenericPlanCards({ plan, onSlotEdit }) {
  const skip = new Set(['_template_pk', '_template_name', '_canva_template_id', '_canva_design_url', '_canva_design_id', 'social_media_caption'])
  const entries = Object.entries(plan).filter(([k]) => !skip.has(k))
  return (
    <div className="grid grid-cols-1 gap-3">
      {entries.map(([key, value]) => {
        const type = key.toLowerCase().includes('image') || key.toLowerCase().includes('cutout') ? 'image'
          : key.toLowerCase().includes('color') ? 'color'
          : 'text'
        return (
          <SlotCard
            key={key}
            label={key}
            canvaName={key}
            value={value}
            type={type}
            onEdit={type === 'text' ? v => onSlotEdit(key, v) : undefined}
          />
        )
      })}
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

function SlotCard({ label, canvaName, value, type, needsCutout, onEdit }) {
  const isImage   = type === 'image'
  const isColor   = type === 'color'
  const isText    = type === 'text'
  const isUrl     = typeof value === 'string' && value.startsWith('http')
  const [editing, setEditing] = useState(false)

  const lineCount = typeof value === 'string' ? value.split('\n').length : 1

  return (
    <div className={`bg-white rounded-xl border p-4 flex items-start gap-3 transition-colors ${editing ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-200'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm text-gray-800">{label}</span>
          {needsCutout && (
            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">cutout</span>
          )}
          {isText && onEdit && (
            <button
              onClick={() => setEditing(e => !e)}
              className={`ml-auto text-xs px-2 py-0.5 rounded font-medium transition-all ${
                editing
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
              }`}
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Canva element: <span className="font-mono">{canvaName}</span>
        </p>

        {isColor ? (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full border-2 border-white shadow" style={{ backgroundColor: value || '#ccc' }} />
            <span className="text-sm font-mono text-gray-700">{value || '—'}</span>
          </div>
        ) : isImage && isUrl ? (
          <img src={value} alt={label} className="h-24 w-auto object-cover rounded-lg border border-gray-200" onError={e => { e.target.style.display = 'none' }} />
        ) : isText && editing && onEdit ? (
          <textarea
            className="w-full text-sm text-gray-900 bg-indigo-50/40 border border-indigo-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none leading-relaxed"
            rows={Math.max(2, lineCount + 1)}
            value={value || ''}
            onChange={e => onEdit(e.target.value)}
            autoFocus
          />
        ) : (
          <p
            className={`text-sm ${value ? 'text-gray-900' : 'text-gray-400 italic'} break-words whitespace-pre-line ${isText && onEdit ? 'cursor-text hover:bg-gray-50 rounded px-1 -mx-1 transition-colors' : ''}`}
            onClick={isText && onEdit ? () => setEditing(true) : undefined}
            title={isText && onEdit ? 'Click to edit' : undefined}
          >
            {value || '(empty)'}
          </p>
        )}
      </div>
    </div>
  )
}
