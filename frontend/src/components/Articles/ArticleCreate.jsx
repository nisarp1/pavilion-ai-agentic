import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { createArticle, fetchArticle } from '../../store/slices/articleSlice'
import ArticleForm from './ArticleForm'
import api from '../../services/api'
import MediaLibrary from '../MediaLibrary/MediaLibrary'
import { FiCpu, FiEdit3, FiImage, FiCheck, FiRefreshCw } from 'react-icons/fi'

function ArticleCreate() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState('manual') // 'manual' or 'ai'

  // AI Form State
  const [aiTopic, setAiTopic] = useState('')
  const [aiContext, setAiContext] = useState('')
  const [aiImage, setAiImage] = useState(null)
  const [showMediaLibrary, setShowMediaLibrary] = useState(false)

  const handleSubmit = async (formData) => {
    setSaving(true)
    try {
      const result = await dispatch(createArticle(formData)).unwrap()
      navigate(`/articles/${result.id}/edit`)
    } catch (error) {
      console.error('Error creating article:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleAiGenerate = async (e) => {
    e.preventDefault()
    if (!aiTopic) return alert("Please enter a topic or headline keywords")

    setSaving(true)
    try {
      // 1. Create a "Stub" article
      const articleData = {
        title: aiTopic,
        // Pass context in trend_data JSON field since summary_english doesn't exist in model
        trend_data: { user_context: aiContext || '' },
        status: 'fetched', // Use 'fetched' to allow generation
        source_feed: 'Trends Stub', // Trigger the Research Logic
        source_url: aiContext.includes('http') ? aiContext.match(/https?:\/\/[^\s]+/)[0] : `https://google.com/search?q=${encodeURIComponent(aiTopic)}`,
        featured_media_id: aiImage?.id || null
      }

      const article = await dispatch(createArticle(articleData)).unwrap()

      // 2. Trigger Generation Task
      await api.post(`/articles/${article.id}/generate/`)

      // 3. Navigate to Edit (where it will likely show "Generating..." status if logic exists, or users see it pop in)
      // We might want to wait a second or just go there.
      navigate(`/articles/${article.id}/edit`)

    } catch (error) {
      console.error("AI Generation failed:", error)
      let errorMessage = "Unknown error"

      if (error.response && error.response.data) {
        // Backend validation error (Django DRF)
        errorMessage = typeof error.response.data === 'object'
          ? JSON.stringify(error.response.data, null, 2)
          : error.response.data
      } else if (error.message) {
        // Standard JS Error or Axios error message
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      } else {
        // Fallback for non-enumerable Error objects
        errorMessage = JSON.stringify(error)
      }

      alert(`Failed to start AI generation:\n${errorMessage}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Create Article</h1>
          <p className="text-gray-600 mt-1">
            {mode === 'ai' ? 'Generate new content using Gemini AI' : 'Manually create a new article'}
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setMode('manual')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === 'manual'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
              }`}
          >
            <FiEdit3 />
            Manual
          </button>
          <button
            onClick={() => setMode('ai')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === 'ai'
              ? 'bg-white text-purple-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
              }`}
          >
            <FiCpu />
            Smart AI
          </button>
        </div>
      </div>

      {mode === 'manual' ? (
        <ArticleForm
          initialData={{}}
          onSubmit={handleSubmit}
          saving={saving}
          submitLabel="Create Article"
        />
      ) : (
        <div className="max-w-3xl">
          <div className="bg-white rounded-lg shadow-md p-8 border border-purple-100">

            <form onSubmit={handleAiGenerate} className="space-y-6">

              {/* Topic Input */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Topic / Headline Keywords *
                </label>
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="e.g. Manchester City vs Liverpool Match Report"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">This will be used to search for latest facts and news.</p>
              </div>

              {/* Context Input */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Context / Links / Paste Content
                </label>
                <textarea
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  rows={6}
                  placeholder="Paste article links, social media posts, or raw text here. Gemini will use this as ground truth/context."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional. If provided, Gemini will prioritize facts from here.
                </p>
              </div>

              {/* Image Input */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Featured Image (Optional)
                </label>

                {aiImage ? (
                  <div className="relative group inline-block">
                    <img
                      src={aiImage.url}
                      alt="Selected"
                      className="h-40 w-auto object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => setAiImage(null)}
                      className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full shadow hover:bg-red-600"
                    >
                      <span className="sr-only">Remove</span>
                      ×
                    </button>
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                      Selected
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowMediaLibrary(true)}
                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors"
                  >
                    <FiImage className="text-gray-400 mb-2" size={24} />
                    <span className="text-sm text-gray-600 font-medium">Select Image from Library / Google</span>
                  </button>
                )}
              </div>

              {/* Submit Action */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <div className="text-sm text-gray-500 italic">
                  Creates a drafted article and starts background generation.
                </div>
                <button
                  type="submit"
                  disabled={saving || !aiTopic}
                  className="flex items-center gap-2 px-8 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-bold shadow-md transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <FiRefreshCw className="animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <FiCpu /> Generate Article
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      <MediaLibrary
        isOpen={showMediaLibrary}
        onClose={() => setShowMediaLibrary(false)}
        onSelect={(media) => {
          setAiImage(media)
          setShowMediaLibrary(false)
        }}
      />
    </div>
  )
}

export default ArticleCreate
