import { lazy, Suspense, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { FiCloud, FiPackage, FiRefreshCw } from 'react-icons/fi'
import { showSuccess, showError } from '../../utils/toast'
import {
  submitRenderJob,
  submitFallbackExport,
  resetProps,
  updateProps
} from '../../store/slices/videoStudioSlice'
import ReelForm from './ReelForm'
import api from '../../services/api'
import JobStatusPanel from './JobStatusPanel'

// Lazily import the Remotion player
const RemotionPreview = lazy(() => import('./RemotionPreview'))

export default function VideoStudio() {
  const dispatch = useDispatch()
  const videoStudioState = useSelector(s => s.videoStudio)
  const [referenceUrl, setReferenceUrl] = useState('')

  // Prevent crash if reducer is not yet added to store
  if (!videoStudioState) {
    return (
      <div className="p-8 mt-10 max-w-lg mx-auto text-center bg-red-50 rounded-xl border border-red-200 shadow-sm">
        <h2 className="text-xl font-bold text-red-700 mb-2">Redux Configuration Missing!</h2>
        <p className="text-red-600 text-sm">The <code>videoStudio</code> slice is not found in your Redux store.</p>
      </div>
    )
  }

  const { props, audioUrl, assetUrls, loading, error } = videoStudioState

  const handleRender = async () => {
    const result = await dispatch(submitRenderJob({ props, audio_url: audioUrl }))
    if (submitRenderJob.fulfilled.match(result)) {
      showSuccess('Render queued on GCP!')
    } else {
      showError('Render failed: ' + (result.payload?.error?.message || 'Unknown error'))
    }
  }

  const handleFallbackExport = async () => {
    const result = await dispatch(submitFallbackExport({
      props,
      audio_url: audioUrl,
      asset_urls: assetUrls,
    }))
    if (submitFallbackExport.fulfilled.match(result)) {
      showSuccess('Export queued — building ZIP with audio + assets + .aep template.')
    } else {
      showError('Export failed: ' + (result.payload?.error?.message || 'Unknown error'))
    }
  }

  const handleAgenticRecreation = async () => {
    if (!referenceUrl) {
      showError('Please provide a reference URL')
      return
    }
    showSuccess('Agentic Pipeline Started! AI is deconstructing the reference reel...')

    try {
      const response = await api.post('/articles/recreate_reel_agentic/', { url: referenceUrl })

      if (response.data.status === 'success') {
        showSuccess('Ready! Live preview updated with Pavilion branding.')
        dispatch(updateProps(response.data.modular_props))
      }
    } catch (error) {
      console.error(error)
      showError('Pipeline failed: ' + (error.response?.data?.error || error.message))
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Video Studio</h1>
        <button
          onClick={() => dispatch(resetProps())}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <FiRefreshCw size={14} /> Reset
        </button>
      </div>

      <JobStatusPanel />

      {error && (
        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">
          {error}
        </div>
      )}

      {/* Agentic Recreation Input */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex flex-col md:flex-row items-center gap-3 shadow-sm">
        <div className="flex-1 w-full">
          <input
            type="url"
            placeholder="Paste reference Instagram/Twitter Reel URL here..."
            className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
          />
        </div>
        <button onClick={handleAgenticRecreation} className="w-full md:w-auto px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-lg shadow transition-colors whitespace-nowrap">
          🪄 AI Recreate Reel
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleRender}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-semibold text-sm rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <FiCloud size={18} /> Render Video (GCP)
        </button>
        <button
          onClick={handleFallbackExport}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 font-semibold text-sm rounded-xl border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <FiPackage size={18} /> Export AEP + Assets
        </button>
      </div>

      {/* Two-pane layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: Input Form */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <ReelForm />
        </div>

        {/* Right: live Remotion preview */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sticky top-6">
          <Suspense fallback={
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
              Loading preview…
            </div>
          }>
            <RemotionPreview props={{ ...props, audioSrc: audioUrl || undefined }} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
