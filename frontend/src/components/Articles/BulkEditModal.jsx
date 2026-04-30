import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { FiX, FiTag } from 'react-icons/fi'
import { bulkUpdateArticles } from '../../store/slices/articleSlice'
import { fetchCategoryTree } from '../../store/slices/categorySlice'
import { showSuccess, showError } from '../../utils/toast'

function BulkEditModal({ isOpen, onClose, selectedArticleIds, onSuccess }) {
  const dispatch = useDispatch()
  const { categoryTree } = useSelector((state) => state.categories)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    category_ids: [],
    status: '',
    category: '',
  })

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchCategoryTree())
      // Reset form when modal opens
      setFormData({
        category_ids: [],
        status: '',
        category: '',
      })
    }
  }, [isOpen, dispatch])

  const handleCategoryToggle = (categoryId) => {
    setFormData(prev => {
      const newIds = prev.category_ids.includes(categoryId)
        ? prev.category_ids.filter(id => id !== categoryId)
        : [...prev.category_ids, categoryId]
      return { ...prev, category_ids: newIds }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      // Build updates object with only provided fields
      const updates = {}
      if (formData.category_ids.length > 0) {
        updates.category_ids = formData.category_ids
      }
      if (formData.status) {
        updates.status = formData.status
      }
      if (formData.category) {
        updates.category = formData.category
      }

      if (Object.keys(updates).length === 0) {
        showError('Please select at least one field to update')
        setSaving(false)
        return
      }

      await dispatch(bulkUpdateArticles({
        article_ids: selectedArticleIds,
        updates
      })).unwrap()

      showSuccess(`${selectedArticleIds.length} article(s) updated`)
      if (onSuccess) onSuccess()
      onClose()
    } catch (error) {
      console.error('Error updating articles:', error)
      showError('Error updating articles: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const categoryOptions = [
    { value: 'reliable_sources', label: 'Reliable Sources' },
    { value: 'trends', label: 'Trends' },
    { value: 'subscriptions', label: 'Subscriptions' },
  ]

  const statusOptions = [
    { value: 'draft', label: 'Draft' },
    { value: 'published', label: 'Published' },
    { value: 'archived', label: 'Archived' },
  ]

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-xl font-semibold text-gray-800">
              Bulk Edit Articles
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            >
              <FiX size={20} />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <strong>{selectedArticleIds.length}</strong> article{selectedArticleIds.length > 1 ? 's' : ''} selected
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">No change</option>
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Change status for all selected articles
              </p>
            </div>

            {/* Source Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Source Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">No change</option>
                {categoryOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Change source category for all selected articles
              </p>
            </div>

            {/* Content Categories */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <FiTag size={16} />
                Content Categories
              </label>
              <div className="border border-gray-300 rounded-lg p-4 max-h-64 overflow-y-auto bg-gray-50">
                {categoryTree.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No categories available
                  </p>
                ) : (
                  <div className="space-y-2">
                    {categoryTree.map((parentCategory) => (
                      <div key={parentCategory.id} className="space-y-1">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.category_ids.includes(parentCategory.id)}
                            onChange={() => handleCategoryToggle(parentCategory.id)}
                            className="w-4 h-4 text-primary-600 focus:ring-primary-500 rounded"
                          />
                          <span className="ml-2 text-sm font-medium text-gray-900">
                            {parentCategory.name}
                          </span>
                        </label>
                        {parentCategory.children && parentCategory.children.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {parentCategory.children.map((childCategory) => (
                              <label key={childCategory.id} className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={formData.category_ids.includes(childCategory.id)}
                                  onChange={() => handleCategoryToggle(childCategory.id)}
                                  className="w-4 h-4 text-primary-600 focus:ring-primary-500 rounded"
                                />
                                <span className="ml-2 text-sm text-gray-700">
                                  {childCategory.name}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Selected categories will be added to existing categories for all selected articles
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Apply Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default BulkEditModal


