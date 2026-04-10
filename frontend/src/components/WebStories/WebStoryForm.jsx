import { useEffect, useState } from 'react'
import { FiImage, FiTrash2, FiLink } from 'react-icons/fi'
import MediaLibrary from '../MediaLibrary/MediaLibrary'

function WebStoryForm({ initialData = {}, onSubmit, saving, submitLabel }) {
  const [formData, setFormData] = useState({
    title: initialData.title || '',
    summary: initialData.summary || '',
    status: initialData.status || 'published',
    cover_external_url: initialData.cover_external_url || '',
  })
  const [coverMedia, setCoverMedia] = useState(() => {
    if (initialData.cover_media_id && initialData.cover_image_url) {
      return {
        id: initialData.cover_media_id,
        url: initialData.cover_image_url,
        title: initialData.title,
      }
    }
    return null
  })
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)

  useEffect(() => {
    setFormData({
      title: initialData.title || '',
      summary: initialData.summary || '',
      status: initialData.status || 'published',
      cover_external_url: initialData.cover_external_url || '',
    })
    setCoverMedia(
      initialData.cover_media_id && initialData.cover_image_url
        ? {
            id: initialData.cover_media_id,
            url: initialData.cover_image_url,
            title: initialData.title,
          }
        : null
    )
  }, [initialData])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const openMediaPicker = () => setMediaPickerOpen(true)
  const closeMediaPicker = () => setMediaPickerOpen(false)

  const handleMediaSelect = (media) => {
    setCoverMedia({ id: media.id, url: media.url, title: media.title })
    setFormData((prev) => ({ ...prev, cover_external_url: '' }))
    closeMediaPicker()
  }

  const removeCover = () => {
    setCoverMedia(null)
    setFormData((prev) => ({ ...prev, cover_external_url: '' }))
  }

  const previewImage = coverMedia?.url || formData.cover_external_url
  const canSubmit = formData.title?.trim() && previewImage

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return

    const primaryImage = previewImage
    const slideCaption = formData.summary || formData.title

    const payload = {
      title: formData.title.trim(),
      summary: formData.summary,
      status: formData.status,
      cover_media_id: coverMedia?.id || null,
      cover_external_url: coverMedia ? '' : formData.cover_external_url,
      slides: primaryImage
        ? [
            {
              order: 0,
              caption: slideCaption,
              media_id: coverMedia?.id || null,
              external_image_url: coverMedia ? '' : formData.cover_external_url,
            },
          ]
        : [],
    }

    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <MediaLibrary isOpen={mediaPickerOpen} onClose={closeMediaPicker} onSelect={handleMediaSelect} />

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Story title"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Summary</label>
          <textarea
            name="summary"
            value={formData.summary}
            onChange={handleChange}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Optional summary shown in Pavilion Theme"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="status"
                value="draft"
                checked={formData.status === 'draft'}
                onChange={handleChange}
                className="text-primary-600 focus:ring-primary-500"
              />
              Draft
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="status"
                value="published"
                checked={formData.status === 'published'}
                onChange={handleChange}
                className="text-primary-600 focus:ring-primary-500"
              />
              Publish
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FiImage />
            Cover Image
          </h3>
          {previewImage && (
            <button
              type="button"
              onClick={removeCover}
              className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              <FiTrash2 size={14} />
              Remove
            </button>
          )}
        </div>

        {previewImage ? (
          <div>
            <img
              src={previewImage}
              alt="Cover"
              className="w-full h-64 object-cover rounded-lg border border-gray-200"
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={openMediaPicker}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Change Image
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
              <FiImage size={28} />
            </div>
            <p className="text-sm text-gray-600">Select a cover image or provide an external URL.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                type="button"
                onClick={openMediaPicker}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-semibold"
              >
                Choose from Library
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">External Image URL</label>
          <div className="flex items-center gap-2">
            <FiLink className="text-gray-400" />
            <input
              type="url"
              name="cover_external_url"
              value={formData.cover_external_url}
              onChange={handleChange}
              placeholder="https://example.com/webstory.jpg"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  )
}

export default WebStoryForm

