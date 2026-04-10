import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { FiX, FiTag } from 'react-icons/fi'
import { updateArticle } from '../../store/slices/articleSlice'
import { fetchCategoryTree } from '../../store/slices/categorySlice'

function QuickEditModal({ isOpen, onClose, article, onSuccess }) {
    const dispatch = useDispatch()
    const { categoryTree } = useSelector((state) => state.categories)
    const [saving, setSaving] = useState(false)
    const [formData, setFormData] = useState({
        title: '',
        slug: '',
        status: '',
        category_ids: []
    })

    useEffect(() => {
        if (isOpen && article) {
            dispatch(fetchCategoryTree())
            setFormData({
                title: article.title || '',
                slug: article.slug || '',
                status: article.status || 'draft',
                category_ids: article.categories ? article.categories.map(c => c.id) : []
            })
        }
    }, [isOpen, article, dispatch])

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
            await dispatch(updateArticle({
                id: article.id,
                data: {
                    title: formData.title,
                    slug: formData.slug,
                    status: formData.status,
                    category_ids: formData.category_ids
                }
            })).unwrap()

            if (onSuccess) {
                onSuccess()
            }
            onClose()
        } catch (error) {
            console.error('Error updating article:', error)
            alert('Error updating article: ' + (error.message || 'Unknown error'))
        } finally {
            setSaving(false)
        }
    }

    if (!isOpen || !article) return null

    const statusOptions = [
        { value: 'draft', label: 'Draft' },
        { value: 'published', label: 'Published' },
        { value: 'archived', label: 'Trash' },
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
                            Quick Edit
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
                        {/* Title */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Title
                            </label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                required
                            />
                        </div>

                        {/* Slug */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Slug
                            </label>
                            <input
                                type="text"
                                value={formData.slug}
                                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                            />
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
                                {statusOptions.map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Categories */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                <FiTag size={16} />
                                Categories
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
                                {saving ? 'Saving...' : 'Update Article'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default QuickEditModal
