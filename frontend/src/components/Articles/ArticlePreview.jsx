import React from 'react'
import { FiX, FiExternalLink } from 'react-icons/fi'

export default function ArticlePreview({ article, formData, onClose }) {
  if (!onClose) return null

  const title = formData?.title || article?.title || '(No title)'
  const summary = formData?.summary || article?.summary || ''
  const body = formData?.body || article?.body || ''
  const metaTitle = formData?.meta_title || article?.meta_title || title
  const metaDesc = formData?.meta_description || article?.meta_description || summary
  const featuredImage = article?.featured_image_url || null
  const slug = formData?.slug || article?.slug || ''

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-hidden">
      {/* Preview toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">Article Preview</span>
          <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded">Draft</span>
        </div>
        <div className="flex items-center gap-3">
          {slug && (
            <span className="text-xs text-gray-400 font-mono truncate max-w-xs">
              /{slug}/
            </span>
          )}
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <FiX size={16} />
            Close preview
          </button>
        </div>
      </div>

      {/* Two-pane layout: article preview + SEO preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main article content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-10">
            {featuredImage && (
              <img
                src={featuredImage}
                alt={title}
                className="w-full h-64 object-cover rounded-xl mb-8 shadow"
              />
            )}
            <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">{title}</h1>
            {summary && (
              <p className="text-lg text-gray-500 mb-8 border-l-4 border-blue-400 pl-4 italic leading-relaxed">
                {summary}
              </p>
            )}
            {body ? (
              <div
                className="prose prose-lg max-w-none text-gray-800"
                dangerouslySetInnerHTML={{ __html: body }}
              />
            ) : (
              <p className="text-gray-400 italic">No content yet.</p>
            )}
          </div>
        </div>

        {/* SEO sidebar */}
        <div className="w-80 border-l border-gray-200 overflow-y-auto bg-gray-50 flex-shrink-0">
          <div className="p-5 space-y-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">SEO Preview</h2>

            {/* Google snippet */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-1">
              <p className="text-xs text-gray-400 mb-2">Google search result</p>
              <p className="text-base text-blue-700 font-medium leading-tight truncate">
                {metaTitle || title}
              </p>
              <p className="text-xs text-green-700 truncate">
                pavilion.app/{slug || 'article-slug'}/
              </p>
              <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                {metaDesc || summary || 'No meta description set.'}
              </p>
            </div>

            {/* Open Graph */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
              <p className="text-xs text-gray-400 mb-2">Open Graph (social share)</p>
              {featuredImage && (
                <img src={featuredImage} alt="OG" className="w-full h-28 object-cover rounded" />
              )}
              <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
                {formData?.og_title || metaTitle || title}
              </p>
              <p className="text-xs text-gray-500 line-clamp-2">
                {formData?.og_description || metaDesc || summary || 'No description.'}
              </p>
              <p className="text-xs text-gray-300 uppercase">pavilion.app</p>
            </div>

            {/* Word count */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Reading stats</p>
              <div className="space-y-1 text-sm text-gray-700">
                {(() => {
                  const wordCount = body.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length
                  const readTime = Math.max(1, Math.ceil(wordCount / 200))
                  return (
                    <>
                      <p><span className="font-medium">{wordCount.toLocaleString()}</span> words</p>
                      <p><span className="font-medium">~{readTime} min</span> read</p>
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
