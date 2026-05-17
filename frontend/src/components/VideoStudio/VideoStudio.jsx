import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useSearchParams } from 'react-router-dom'
import { FiCloud, FiPackage, FiRefreshCw, FiRotateCcw, FiRotateCw, FiArrowLeft } from 'react-icons/fi'
import RefContextPanel from './RefContextPanel'
import { showSuccess, showError } from '../../utils/toast'
import {
  submitRenderJob,
  submitFallbackExport,
  resetProps,
  setVideoData,
  setAssets,
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

// RemotionPreview is lazy-loaded separately — @remotion/player is large and only needed in editor
const RemotionPreview = lazy(() => import('./RemotionPreview'))

// ── VIEW MODES ────────────────────────────────────────────────────────────────
// URL drives the mode:
//   /video-studio            → list view
//   /video-studio?article=ID → editor loading that article
// The ?article= param is the single source of truth for "which reel is open".

export default function VideoStudio() {
  const dispatch    = useDispatch()
  const videoStudioState = useSelector(s => s.videoStudio)
  const assets = useSelector(s => s.videoStudio.assets)
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Local UI state ──────────────────────────────────────────────────────────
  // viewMode is derived from searchParams; the param IS the URL state.
  const articleIdParam = searchParams.get('article')  // string | null
  const viewMode = articleIdParam ? 'editor' : 'list'

  const [editingJob,    setEditingJob]    = useState(null)
  const [loadingArticle, setLoadingArticle] = useState(false)
  const [videoFormat,   setVideoFormat]   = useState('reel')
  const [includeAvatar, setIncludeAvatar] = useState(false)
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [productionPlan,  setProductionPlan]  = useState(null)

  // ── MUST come before any early returns – React Rules of Hooks ───────────────

  // Persist assets to localStorage whenever they change (keyed by article ID)
  useEffect(() => {
    if (!articleIdParam || !assets.length) return
    try {
      localStorage.setItem(`pavilion_assets_${articleIdParam}`, JSON.stringify(assets))
    } catch {}
  }, [assets, articleIdParam])

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
        // Audio URL priority: ElevenLabs (premium, manually triggered) > plan.audio_url (Google TTS) > fallbacks.
        // elevenlabs_audio_url is set on the article when ElevenLabs has been triggered for this reel.
        // plan.audio_url is also updated to the ElevenLabs URL by the backend on generation,
        // so this explicit check handles edge cases where plan JSON is stale.
        const rawAudioUrl = article.elevenlabs_audio_url
          || plan?.audio_url
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

        // Restore asset URLs: DB is the primary source (after save_plan_assets),
        // localStorage is a secondary fallback for unsaved changes.
        const baseAssets = plan?.assets_needed || []
        let assetsToLoad = baseAssets.map(a =>
          a.url ? { ...a, status: 'uploaded' } : a
        )
        try {
          const stored = localStorage.getItem(`pavilion_assets_${articleIdParam}`)
          if (stored && baseAssets.length) {
            const storedAssets = JSON.parse(stored)
            assetsToLoad = baseAssets.map(a => {
              // DB URL wins (it was explicitly saved)
              if (a.url) return { ...a, status: 'uploaded' }
              // Fall back to localStorage for unsaved uploads
              const sa = storedAssets.find(s => s.id === a.id)
              return sa?.url ? { ...a, url: sa.url, status: 'uploaded' } : a
            })
          }
        } catch {}

        setEditingJob({ ...article, kind: 'project', production_plan: plan })
        setProductionPlan(plan)
        setShowGenPanel(false)

        // Restore saved brand settings (logoSrc, brandName, accent) from DB
        const brand = plan?.brand || {}

        dispatch(setVideoData({
          props:    Object.keys(propsData).length
            ? { ...propsData, ...(captions ? { captions } : {}), ...brand }
            : (captions ? { captions, ...brand } : (Object.keys(brand).length ? brand : undefined)),
          clips:    clips.length ? clips : undefined,
          audioUrl: audioUrlVal,
          assets:   assetsToLoad,
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
    setShowGenPanel(true)
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

  const handleAgenticRecreation = async (payload) => {
    setPipelineRunning(true)
    showSuccess(`AI Pipeline started (${payload.video_format || videoFormat})! Analyzing context…`)
    try {
      const response = await api.post('/articles/recreate_reel_agentic/', payload)
      if (response.data.status === 'success') {
        const plan = response.data
        setProductionPlan(plan)
        // Clear stale localStorage assets for this article — fresh pipeline run
        try {
          const aid = plan.article_id || articleIdParam
          if (aid) localStorage.removeItem(`pavilion_assets_${aid}`)
        } catch {}
        dispatch(setVideoData({
          props:    plan.modular_props || plan.props,
          clips:    plan.clips,
          audioUrl: plan.audio_url || '',
          assets:   plan.assets_needed || [],
        }))
        if (plan.article_id) {
          setSearchParams({ article: String(plan.article_id) })
        }
        const neededCount = (plan.assets_needed || []).filter(a => a.status === 'needed').length
        const savedMsg = plan.article_id ? ` Saved as draft #${plan.article_id}.` : ''
        showSuccess(`✅ Pipeline complete! Upload ${neededCount} asset${neededCount !== 1 ? 's' : ''} in the Assets tab.${savedMsg}`)
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
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <FiRefreshCw className="animate-spin text-purple-500" size={28} />
      </div>
    }>
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

        <button onClick={handleRender} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white font-semibold text-xs rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm flex-shrink-0">
          <FiCloud size={13} /> Render
        </button>
        <button onClick={handleFallbackExport} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 font-semibold text-xs rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm flex-shrink-0">
          <FiPackage size={13} /> AEP
        </button>
      </div>

      {/* ── Row 2: Reference / context panel ── */}
      <RefContextPanel
        editingJob={editingJob}
        productionPlan={productionPlan}
        videoFormat={videoFormat}
        setVideoFormat={setVideoFormat}
        includeAvatar={includeAvatar}
        setIncludeAvatar={setIncludeAvatar}
        pipelineRunning={pipelineRunning}
        onGenerate={handleAgenticRecreation}
        onDownloadBrief={handleDownloadBrief}
      />

      {error && (
        <div className="px-1 pb-2 flex-shrink-0">
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">{error}</div>
        </div>
      )}

      {/* ── Middle: Preview + Properties + Plan ── */}
      <div className="flex gap-4 flex-shrink-0" style={{ height: 560 }}>

        {/* Left: Preview */}
        <div className="flex flex-col gap-3 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex-1 flex flex-col items-center justify-start">
            <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading preview…</div>}>
              <RemotionPreview props={props} />
            </Suspense>
          </div>
        </div>

        {/* Center: Properties panel */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden" style={{ minWidth: 0 }}>
          <PropertiesPanel />
        </div>

        {/* Right: Production Plan panel */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden" style={{ width: 380, flexShrink: 0 }}>
          <ProductionPlanPanel plan={productionPlan} onPlanRefresh={setProductionPlan} />
        </div>

      </div>

      {/* ── Render status: fixed floating panel (bottom-right) ── */}
      <div className="fixed bottom-6 right-6 z-50 w-80 pointer-events-none">
        <div className="pointer-events-auto">
          <JobStatusPanel />
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
    </Suspense>
  )
}
