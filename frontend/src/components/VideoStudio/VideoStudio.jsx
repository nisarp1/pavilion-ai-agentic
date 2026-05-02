import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useSearchParams } from 'react-router-dom'
import { FiCloud, FiPackage, FiRefreshCw, FiRotateCcw, FiRotateCw, FiArrowLeft, FiChevronDown, FiChevronUp } from 'react-icons/fi'
import { showSuccess, showError } from '../../utils/toast'
import {
  submitRenderJob,
  submitFallbackExport,
  resetProps,
  setVideoData,
  undo,
  redo,
  removeClip,
  duplicateClip,
  selectClip,
} from '../../store/slices/videoStudioSlice'
import JobStatusPanel from './JobStatusPanel'
import TimelineEditor from './TimelineEditor'
import PropertiesPanel from './PropertiesPanel'
import ProductionPlanPanel from './ProductionPlanPanel'
import VideoList from './VideoList'
import api from '../../services/api'

const RemotionPreview = lazy(() => import('./RemotionPreview'))

// ── VIEW MODES ────────────────────────────────────────────────────────────────
// URL drives the mode:
//   /video-studio            → list view
//   /video-studio?article=ID → editor loading that article
// The ?article= param is the single source of truth for "which reel is open".

export default function VideoStudio() {
  const dispatch    = useDispatch()
  const videoStudioState = useSelector(s => s.videoStudio)
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Local UI state ──────────────────────────────────────────────────────────
  // viewMode is derived from searchParams; the param IS the URL state.
  const articleIdParam = searchParams.get('article')  // string | null
  const viewMode = articleIdParam ? 'editor' : 'list'

  const [editingJob,    setEditingJob]    = useState(null)
  const [loadingArticle, setLoadingArticle] = useState(false)
  const [referenceUrl,  setReferenceUrl]  = useState('')
  const [videoFormat,   setVideoFormat]   = useState('reel')
  const [includeAvatar, setIncludeAvatar] = useState(false)
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [productionPlan,  setProductionPlan]  = useState(null)
  const [showGenPanel,    setShowGenPanel]    = useState(false)

  // ── MUST come before any early returns – React Rules of Hooks ───────────────

  // Load article whenever ?article= param changes
  useEffect(() => {
    if (!articleIdParam) {
      // Navigated back to list – clear editor state
      setEditingJob(null)
      setProductionPlan(null)
      return
    }

    // Avoid redundant fetches when we already have this article open
    if (editingJob?.id === Number(articleIdParam)) return

    setLoadingArticle(true)
    api.get(`/articles/${articleIdParam}/`)
      .then(res => {
        const article = res.data
        const plan    = article.video_production_plan || null

        const clips    = plan?.clips?.length    ? plan.clips    : []
        const propsData = plan?.modular_props || plan?.props || {}
        // Audio URL: prefer plan.audio_url, then article reel_audio_url, then article audio_url.
        // Normalize to absolute — relative /media/... paths only work from localhost
        // but the render service (Cloud Run) needs a fully-qualified URL.
        const rawAudioUrl = plan?.audio_url
          || article.reel_audio_url
          || article.audio_url
          || ''
        // Only accept http(s):// or relative /media/... URLs — filter out gcs://, s3://, etc.
        const isServableUrl = rawAudioUrl.startsWith('http://') ||
          rawAudioUrl.startsWith('https://') ||
          rawAudioUrl.startsWith('/')
        const audioUrlVal = isServableUrl
          ? (rawAudioUrl.startsWith('/') ? `${window.location.origin}${rawAudioUrl}` : rawAudioUrl)
          : ''

        // Captions — word-level ML + sentence-level EN from the production plan
        const captions = plan?.captions || null

        setEditingJob({ ...article, kind: 'project', production_plan: plan })
        setProductionPlan(plan)
        setShowGenPanel(false)

        dispatch(setVideoData({
          // Merge captions into props so they flow into Remotion inputProps
          props:    Object.keys(propsData).length
            ? { ...propsData, ...(captions ? { captions } : {}) }
            : (captions ? { captions } : undefined),
          clips:    clips.length ? clips : undefined,   // undefined → keep DEFAULT_CLIPS
          audioUrl: audioUrlVal,
        }))
      })
      .catch(() => {
        showError(`Could not load article #${articleIdParam}`)
        setSearchParams({})   // drop invalid param → go back to list
      })
      .finally(() => setLoadingArticle(false))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleIdParam])

  // Keyboard shortcuts (editor mode only)
  useEffect(() => {
    if (viewMode !== 'editor') return
    const { selectedClipId } = videoStudioState || {}
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (document.activeElement?.isContentEditable) return

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch(undo()) }
        if (e.key === 'z' &&  e.shiftKey) { e.preventDefault(); dispatch(redo()) }
        if (e.key === 'y')                { e.preventDefault(); dispatch(redo()) }
        if (e.key === 'd') {
          e.preventDefault()
          if (selectedClipId) dispatch(duplicateClip(selectedClipId))
        }
      } else {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedClipId) { e.preventDefault(); dispatch(removeClip(selectedClipId)) }
        }
        if (e.key === 'Escape') {
          if (selectedClipId) { e.preventDefault(); dispatch(selectClip(null)) }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, videoStudioState, viewMode])

  // ── Early return guard (after all hooks) ────────────────────────────────────
  if (!videoStudioState) {
    return (
      <div className="p-8 mt-10 max-w-lg mx-auto text-center bg-red-50 rounded-xl border border-red-200 shadow-sm">
        <h2 className="text-xl font-bold text-red-700 mb-2">Redux Configuration Missing!</h2>
        <p className="text-red-600 text-sm">The <code>videoStudio</code> slice is not found in your Redux store.</p>
      </div>
    )
  }

  const { props, audioUrl, assetUrls, loading, error, past, future, selectedClipId } = videoStudioState

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleNew = () => {
    dispatch(resetProps())
    setProductionPlan(null)
    setReferenceUrl('')
    setShowGenPanel(true)
    setSearchParams({})   // clear ?article= → list view (but we switch immediately below)
    // We still want to go to editor for a blank project — use a special marker
    // Since no article ID exists for a new blank project, manage via a transient flag.
    // Simplest: set a fake "new" param so viewMode becomes 'editor'.
    // We'll use ?new=1 for blank new videos.
    setSearchParams({ new: '1' })
  }

  // Called from VideoList when user clicks Edit on any item.
  // For article projects  → update URL (triggers useEffect which fetches & loads).
  // For render video jobs → load directly (no article ID).
  const handleEdit = useCallback((job) => {
    if (job.id && (job.kind === 'project' || job.category)) {
      // Article-based project: set URL param → useEffect does the rest
      setSearchParams({ article: String(job.id) })
    } else {
      // Video render job: load directly into editor
      const plan = job.production_plan || null
      const clips    = job.clips?.length    ? job.clips    : (plan?.clips || [])
      const propsData = (job.props && Object.keys(job.props).length > 0)
        ? job.props
        : (plan?.modular_props || plan?.props || {})
      const audioUrlVal = job.audio_url || plan?.audio_url || ''

      setEditingJob(job)
      setProductionPlan(plan)
      setShowGenPanel(false)
      dispatch(setVideoData({
        props:    Object.keys(propsData).length ? propsData : undefined,
        clips:    clips.length ? clips : undefined,
        audioUrl: audioUrlVal,
      }))
      // Reflect in URL too (use job id if available)
      if (job.id) setSearchParams({ article: String(job.id) })
    }
  }, [dispatch, setSearchParams])

  const handleBackToList = () => {
    setSearchParams({})   // clear all params → URL becomes /video-studio → list view
  }

  const handleRender = async () => {
    const { clips } = videoStudioState
    const result = await dispatch(submitRenderJob({ props, clips, audio_url: audioUrl }))
    if (submitRenderJob.fulfilled.match(result)) {
      showSuccess('Render queued on GCP!')
    } else {
      showError('Render failed: ' + (result.payload?.error?.message || 'Unknown error'))
    }
  }

  const handleFallbackExport = async () => {
    const { clips } = videoStudioState
    const result = await dispatch(submitFallbackExport({ props, clips, audio_url: audioUrl, asset_urls: assetUrls }))
    if (submitFallbackExport.fulfilled.match(result)) {
      showSuccess('Export queued — building ZIP with audio + assets + .aep template.')
    } else {
      showError('Export failed: ' + (result.payload?.error?.message || 'Unknown error'))
    }
  }

  const handleAgenticRecreation = async () => {
    if (!referenceUrl) { showError('Please provide a reference URL or topic'); return }
    setPipelineRunning(true)
    showSuccess(`AI Pipeline started (${videoFormat})! Analyzing context, writing script, planning scenes...`)
    try {
      const isUrl = referenceUrl.startsWith('http')
      const payload = {
        ...(isUrl ? { url: referenceUrl } : { text_prompt: referenceUrl }),
        video_format: videoFormat,
        include_avatar: includeAvatar,
      }
      const response = await api.post('/articles/recreate_reel_agentic/', payload)
      if (response.data.status === 'success') {
        const plan = response.data
        setProductionPlan(plan)
        dispatch(setVideoData({
          props:    plan.modular_props || plan.props,
          clips:    plan.clips,
          audioUrl: plan.audio_url || '',
        }))
        // If a new article was saved, update URL to reflect it
        if (plan.article_id) {
          setSearchParams({ article: String(plan.article_id) })
        }
        const savedMsg = plan.article_id ? ` Saved as draft #${plan.article_id}.` : ''
        showSuccess(`✅ Pipeline complete! ${plan.assets_needed?.length || 0} assets needed.${savedMsg}`)
      }
    } catch (err) {
      showError('Pipeline failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setPipelineRunning(false)
    }
  }

  const handleDownloadBrief = () => {
    if (!productionPlan?.downloadable) return
    const md = productionPlan.downloadable.timeline_script_md || '# No data'
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `production_brief_${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  // viewMode is 'list' when there is no ?article= or ?new= param
  const isNewBlank = searchParams.get('new') === '1'
  if (viewMode === 'list' && !isNewBlank) {
    return (
      <VideoList
        onNew={handleNew}
        onEdit={handleEdit}
      />
    )
  }

  // ── EDITOR VIEW ────────────────────────────────────────────────────────────
  const titleLabel = loadingArticle
    ? 'Loading…'
    : (editingJob?.title || editingJob?.props?.scene1Headline || (isNewBlank ? 'New Video' : `Video #${editingJob?.id ?? ''}`))

  return (
    <div className="flex flex-col gap-0" style={{ height: 'calc(100vh - 88px)', minHeight: 600 }}>

      {/* ── Row 1: Nav + Title + Actions ── */}
      <div className="flex items-center gap-2 px-1 pb-2 flex-shrink-0 border-b border-gray-100">
        <button
          onClick={handleBackToList}
          className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"
          title="Back to Video List"
        >
          <FiArrowLeft size={13} />
          <span className="hidden sm:inline">Videos</span>
        </button>

        {/* Title */}
        <h1
          className="flex-1 min-w-0 text-base font-bold text-gray-800 truncate"
          title={titleLabel}
        >
          {loadingArticle
            ? <span className="text-gray-400 animate-pulse">Loading reel…</span>
            : titleLabel}
        </h1>

        {/* Undo / Redo / Reset */}
        <button onClick={() => dispatch(undo())} disabled={!past?.length} title="Undo (Ctrl+Z)" className="p-1.5 text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 flex-shrink-0">
          <FiRotateCcw size={14} />
        </button>
        <button onClick={() => dispatch(redo())} disabled={!future?.length} title="Redo (Ctrl+Shift+Z)" className="p-1.5 text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 flex-shrink-0">
          <FiRotateCw size={14} />
        </button>
        <button onClick={() => dispatch(resetProps())} title="Reset" className="p-1.5 text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 flex-shrink-0">
          <FiRefreshCw size={14} />
        </button>

        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        {/* AI Generate toggle */}
        <button
          onClick={() => setShowGenPanel(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex-shrink-0 ${
            showGenPanel
              ? 'bg-purple-600 text-white border-purple-600'
              : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
          }`}
        >
          🪄 AI Generate
          {showGenPanel ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />}
        </button>

        <button onClick={handleRender} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white font-semibold text-xs rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm flex-shrink-0">
          <FiCloud size={13} /> Render
        </button>
        <button onClick={handleFallbackExport} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 font-semibold text-xs rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm flex-shrink-0">
          <FiPackage size={13} /> AEP
        </button>
      </div>

      {/* ── Row 2: AI Generation panel (collapsible) ── */}
      {showGenPanel && (
        <div className="flex items-center gap-2 px-1 py-2 flex-shrink-0 bg-purple-50 border border-purple-100 rounded-xl mt-2">
          <input
            type="text"
            placeholder="Paste reference URL or topic…"
            className="flex-1 min-w-0 bg-white border border-purple-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-purple-300"
            value={referenceUrl}
            onChange={e => setReferenceUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAgenticRecreation()}
          />
          <select
            value={videoFormat}
            onChange={e => setVideoFormat(e.target.value)}
            className="bg-white border border-purple-200 rounded-lg px-2 py-1.5 text-xs font-medium text-purple-700 focus:outline-none flex-shrink-0"
          >
            <option value="reel">📱 Reel</option>
            <option value="short">🎬 Short</option>
            <option value="long">🖥️ Long</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-purple-700 cursor-pointer flex-shrink-0 select-none">
            <input type="checkbox" checked={includeAvatar} onChange={e => setIncludeAvatar(e.target.checked)} className="accent-purple-600" />
            Avatar
          </label>
          <button
            onClick={handleAgenticRecreation}
            disabled={pipelineRunning}
            className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg shadow transition-colors whitespace-nowrap flex-shrink-0 disabled:opacity-50"
          >
            {pipelineRunning ? '⏳ Running…' : '🪄 Generate'}
          </button>
          {productionPlan && (
            <button
              onClick={handleDownloadBrief}
              title="Download production brief"
              className="px-2 py-1.5 text-purple-600 hover:text-purple-800 text-xs font-medium border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors flex-shrink-0"
            >
              📥 Brief
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="px-1 pb-2 flex-shrink-0">
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">{error}</div>
        </div>
      )}

      {/* ── Middle: Preview + Properties + Plan ── */}
      <div className="flex gap-4 flex-shrink-0" style={{ height: 560 }}>

        {/* Left: Preview + job status */}
        <div className="flex flex-col gap-3 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex-1 flex flex-col items-center justify-start">
            <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading preview…</div>}>
              <RemotionPreview props={props} />
            </Suspense>
          </div>
          <JobStatusPanel />
        </div>

        {/* Center: Properties panel */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden" style={{ minWidth: 0 }}>
          <PropertiesPanel />
        </div>

        {/* Right: Production Plan panel */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden" style={{ width: 380, flexShrink: 0 }}>
          <ProductionPlanPanel plan={productionPlan} />
        </div>

      </div>

      {/* ── Bottom: Timeline ── */}
      <div className="flex flex-col flex-1 mt-4" style={{ minHeight: 220 }}>
        <div className="flex-1 min-h-0">
          <TimelineEditor />
        </div>
        <div className="flex items-center justify-center gap-6 mt-2 text-[11px] text-gray-400">
          <span><kbd className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-500 font-sans">Space</kbd> Play/Pause</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-500 font-sans">Ctrl+D</kbd> Duplicate</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-500 font-sans">Del</kbd> Remove</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-500 font-sans">Esc</kbd> Deselect</span>
        </div>
      </div>

    </div>
  )
}
