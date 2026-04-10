import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  fetchCategoryTree,
  createCategory,
  updateCategory,
  deleteCategory,
  batchUpdateCategories,
} from '../../store/slices/categorySlice'
import {
  FiPlus,
  FiEdit,
  FiTrash2,
  FiChevronDown,
  FiChevronRight,
  FiTag,
  FiMove,
} from 'react-icons/fi'

// Sortable Category Item Component
function SortableCategoryItem({ category, level, onEdit, onDelete, onToggle, isExpanded }) {
  if (!category || !category.id) {
    return null
  }

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const hasChildren = category.children && Array.isArray(category.children) && category.children.length > 0
  const indent = level * 24

  return (
    <div ref={setNodeRef} style={style} className="border-b border-gray-200" data-id={category.id}>
      <div
        className="flex items-center gap-3 py-3 px-4 hover:bg-gray-50 group relative"
        style={{ paddingLeft: `${16 + indent}px` }}
      >
        <div className="flex items-center gap-2 flex-1">
          {/* Drag Handle */}
          <button
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
            title="Drag to reorder"
          >
            <FiMove size={18} />
          </button>

          {hasChildren ? (
            <button
              onClick={() => onToggle(category.id)}
              className="text-gray-400 hover:text-gray-600"
            >
              {isExpanded ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <FiTag size={16} className="text-gray-400" />
          <div className="flex-1">
            <div className="font-medium text-gray-900">{category.name}</div>
            {category.description && (
              <div className="text-sm text-gray-500">{category.description}</div>
            )}
          </div>
          <div className="text-sm text-gray-500">
            {category.article_count || 0} articles
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(category)}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="Edit"
            >
              <FiEdit size={16} />
            </button>
            <button
              onClick={() => onDelete(category.id)}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
              title="Delete"
            >
              <FiTrash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CategoryManager() {
  const dispatch = useDispatch()
  const { categoryTree = [], loading } = useSelector((state) => state.categories || {})
  const [expandedCategories, setExpandedCategories] = useState(new Set())
  const [editingCategory, setEditingCategory] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parent: null,
    order: 0,
    is_active: true,
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    dispatch(fetchCategoryTree())
  }, [dispatch])

  // Flatten categories for quick access
  const getAllCategoriesFlat = (categories, result = []) => {
    if (!categories || !Array.isArray(categories)) return result
    categories.forEach((cat) => {
      if (cat) {
        result.push(cat)
        if (cat.children && Array.isArray(cat.children) && cat.children.length > 0) {
          getAllCategoriesFlat(cat.children, result)
        }
      }
    })
    return result
  }

  const allCategoriesFlat = getAllCategoriesFlat(categoryTree)
  const parentCategories = (categoryTree || []).filter((cat) => cat && !cat.parent)

  const toggleCategory = (categoryId) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId)
    } else {
      newExpanded.add(categoryId)
    }
    setExpandedCategories(newExpanded)
  }

  const handleEdit = (category) => {
    setEditingCategory(category)
    setFormData({
      name: category.name || '',
      description: category.description || '',
      parent: category.parent || null,
      order: category.order || 0,
      is_active: category.is_active !== false,
    })
    setShowAddForm(true)
  }

  const handleDelete = async (categoryId) => {
    if (window.confirm('Are you sure you want to delete this category?')) {
      try {
        await dispatch(deleteCategory(categoryId))
        dispatch(fetchCategoryTree())
      } catch (error) {
        console.error('Error deleting category:', error)
      }
    }
  }

  const [isShiftPressed, setIsShiftPressed] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true)
      }
    }
    const handleKeyUp = (e) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const handleDragStart = (event) => {
    setActiveId(event.active.id)
  }

  const handleDragOver = (event) => {
    const { active, over } = event
    if (!over) return
    
    // Check if dragging over a category item (not just between items)
    const overElement = event.over?.data?.current
    if (overElement?.type === 'category') {
      // Visual feedback for making it a subcategory
      // This is handled by CSS classes
    }
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) {
      return
    }

    try {
      // Recompute these values in case categoryTree changed
      const currentFlat = getAllCategoriesFlat(categoryTree || [])
      const currentParents = (categoryTree || []).filter((cat) => cat && !cat.parent)

      // Find the categories being moved
      const activeCategory = currentFlat.find((cat) => cat && cat.id === active.id)
      const overCategory = currentFlat.find((cat) => cat && cat.id === over.id)

      if (!activeCategory || !overCategory) {
        return
      }

      // Prevent making a category its own parent or ancestor
      const isDescendant = (category, ancestorId) => {
        if (!category || !category.parent) return false
        if (category.parent === ancestorId) return true
        const parent = currentFlat.find(c => c && c.id === category.parent)
        return parent ? isDescendant(parent, ancestorId) : false
      }

      if (isDescendant(overCategory, active.id)) {
        alert('Cannot make a category a subcategory of its own descendant.')
        return
      }

      // Get parent IDs
      const activeParentId = activeCategory.parent || null
      const overParentId = overCategory.parent || null

      // Check if we're dragging to make it a subcategory
      // Use Shift key to explicitly create subcategory, or if dragging top-level onto top-level
      const isTopLevelDrag = activeParentId === null && overParentId === null
      const isDifferentLevel = activeParentId !== overParentId
      
      // Determine if this should be a subcategory move
      // Shift+drag = always make subcategory
      // Top-level onto top-level = make subcategory
      // Top-level onto any category = make subcategory (when Shift is pressed)
      const shouldMakeSubcategory = 
        isShiftPressed || // Shift key pressed = make subcategory
        (isTopLevelDrag && active.id !== over.id) // Top-level onto top-level = make subcategory

      // Prevent making a category its own parent
      if (shouldMakeSubcategory && over.id === active.id) {
        return
      }

      // Prevent making a category a child of its own child
      if (shouldMakeSubcategory && overCategory.parent === active.id) {
        return
      }

      // Prepare batch updates
      const updates = []

      if (shouldMakeSubcategory && overCategory.id !== activeCategory.parent) {
        // Making it a subcategory of the over category
        const targetSiblings = currentFlat.filter(
          (cat) => cat && (cat.parent || null) === over.id && cat.id !== active.id
        )

        // Add to end of children
        const newOrder = targetSiblings.length

        // Update moved category to be child of over category
        updates.push({
          id: active.id,
          order: newOrder,
          parent: over.id,
        })

        // Update old siblings' orders
        const oldSiblings = activeParentId
          ? currentFlat.filter((cat) => cat && (cat.parent || null) === activeParentId && cat.id !== active.id)
          : currentParents.filter((cat) => cat && cat.id !== active.id)

        oldSiblings.forEach((cat, index) => {
          if (cat) {
            updates.push({
              id: cat.id,
              order: index,
              parent: cat.parent || null,
            })
          }
        })

        // Update new siblings' orders (if any)
        targetSiblings.forEach((cat, index) => {
          if (cat) {
            updates.push({
              id: cat.id,
              order: index,
              parent: cat.parent || null,
            })
          }
        })
      } else {
        // Reordering within same parent level
        const targetSiblings = overParentId
          ? currentFlat.filter((cat) => cat && (cat.parent || null) === overParentId && cat.id !== active.id)
          : currentParents.filter((cat) => cat && cat.id !== active.id)

        // Find insertion position
        const targetIndex = targetSiblings.findIndex((cat) => cat && cat.id === over.id)
        const insertIndex = targetIndex >= 0 ? targetIndex : targetSiblings.length

        // Update target siblings' orders
        targetSiblings.forEach((cat, index) => {
          if (cat) {
            const newOrder = index >= insertIndex ? index + 1 : index
            updates.push({
              id: cat.id,
              order: newOrder,
              parent: cat.parent || null,
            })
          }
        })

        // Update moved category
        updates.push({
          id: active.id,
          order: insertIndex,
          parent: overParentId,
        })

        // Update old siblings' orders if parent changed
        if (activeParentId !== overParentId) {
          const oldSiblings = activeParentId
            ? currentFlat.filter((cat) => cat && (cat.parent || null) === activeParentId && cat.id !== active.id)
            : currentParents.filter((cat) => cat && cat.id !== active.id)

          oldSiblings.forEach((cat, index) => {
            if (cat) {
              updates.push({
                id: cat.id,
                order: index,
                parent: cat.parent || null,
              })
            }
          })
        }
      }

      if (updates.length > 0) {
        await dispatch(batchUpdateCategories(updates)).unwrap()
        await dispatch(fetchCategoryTree())
        // Expand the parent if we made it a subcategory
        if (shouldMakeSubcategory && overCategory.id !== activeCategory.parent) {
          setExpandedCategories((prev) => new Set([...prev, over.id]))
        }
      }
    } catch (error) {
      console.error('Error updating category order:', error)
      alert('Error updating category order: ' + (error?.payload || error?.message || 'Unknown error'))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Prepare data - convert empty string parent to null
    const submitData = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      order: parseInt(formData.order) || 0,
      is_active: formData.is_active,
    }

    // Explicitly set parent to null if not provided, so DRF knows to clear it
    submitData.parent = formData.parent || null

    try {
      if (editingCategory) {
        await dispatch(updateCategory({ id: editingCategory.id, data: submitData })).unwrap()
      } else {
        await dispatch(createCategory(submitData)).unwrap()
      }

      // Reset form
      setShowAddForm(false)
      setEditingCategory(null)
      setFormData({
        name: '',
        description: '',
        parent: null,
        order: 0,
        is_active: true,
      })

      // Refresh category tree
      await dispatch(fetchCategoryTree())
    } catch (error) {
      console.error('Error saving category:', error)
      let errorMessage = 'Unknown error'
      const errorData = error?.payload || error?.response?.data || error

      if (errorData) {
        if (typeof errorData === 'object' && !errorData.message && !errorData.detail) {
          const errors = []
          for (const [field, messages] of Object.entries(errorData)) {
            if (Array.isArray(messages)) {
              errors.push(`${field}: ${messages.join(', ')}`)
            } else if (typeof messages === 'object') {
              errors.push(`${field}: ${JSON.stringify(messages)}`)
            } else {
              errors.push(`${field}: ${messages}`)
            }
          }
          errorMessage = errors.join('\n')
        } else {
          errorMessage =
            errorData.detail ||
            errorData.message ||
            (typeof errorData === 'string' ? errorData : JSON.stringify(errorData))
        }
      } else if (error?.message) {
        errorMessage = error.message
      }

      alert('Error saving category:\n' + errorMessage)
    }
  }

  const handleCancel = () => {
    setShowAddForm(false)
    setEditingCategory(null)
    setFormData({
      name: '',
      description: '',
      parent: null,
      order: 0,
      is_active: true,
    })
  }

  const renderCategory = (category, level = 0) => {
    if (!category || !category.id) return null
    const hasChildren = category.children && Array.isArray(category.children) && category.children.length > 0
    const isExpanded = expandedCategories.has(category.id)

    return (
      <div key={category.id}>
        <SortableCategoryItem
          category={category}
          level={level}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggle={toggleCategory}
          isExpanded={isExpanded}
        />
        {hasChildren && isExpanded && (
          <SortableContext
            items={category.children.filter(c => c && c.id).map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div>
              {category.children.filter(c => c).map((child) => renderCategory(child, level + 1))}
            </div>
          </SortableContext>
        )}
      </div>
    )
  }

  // Get all categories for parent selection (flat list)
  const getAllCategories = (categories) => {
    if (!categories || !Array.isArray(categories)) return []
    let all = []
    categories.forEach((cat) => {
      if (cat) {
        all.push(cat)
        if (cat.children && Array.isArray(cat.children)) {
          all = all.concat(getAllCategories(cat.children))
        }
      }
    })
    return all
  }

  const allCategories = getAllCategories(categoryTree)
  const activeCategory = activeId ? allCategoriesFlat.find((cat) => cat && cat.id === activeId) : null

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex justify-between items-center border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Categories</h1>
          <p className="text-gray-600 mt-1">Manage categories and subcategories</p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true)
            setEditingCategory(null)
            setFormData({
              name: '',
              description: '',
              parent: null,
              order: 0,
              is_active: true,
            })
          }}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
        >
          <FiPlus size={18} />
          Add Category
        </button>
      </div>

      {/* Quick Categories Section */}
      {parentCategories.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <FiTag size={20} />
            Quick Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {parentCategories.map((category) => (
              <div
                key={category.id}
                className="group relative px-4 py-2 bg-gray-100 hover:bg-primary-50 rounded-lg border border-gray-200 hover:border-primary-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FiTag size={16} className="text-gray-500 group-hover:text-primary-600" />
                  <span className="font-medium text-gray-700 group-hover:text-primary-700">
                    {category.name}
                  </span>
                  {category.article_count > 0 && (
                    <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded">
                      {category.article_count}
                    </span>
                  )}
                </div>
                {category.children && category.children.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-2 min-w-[200px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-2 px-2">
                      Subcategories
                    </div>
                    {category.children.map((child) => (
                      <div
                        key={child.id}
                        className="px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 rounded"
                      >
                        {child.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            {editingCategory ? 'Edit Category' : 'Add New Category'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Category name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Category description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Parent Category
                </label>
                <select
                  value={formData.parent || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      parent: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">None (Top Level)</option>
                  {allCategories
                    .filter((cat) => !editingCategory || cat.id !== editingCategory.id)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Display Order</label>
                <input
                  type="number"
                  value={formData.order}
                  onChange={(e) =>
                    setFormData({ ...formData, order: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
                Active
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                {editingCategory ? 'Update' : 'Create'} Category
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Categories List with Drag and Drop */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">All Categories</h2>
          <p className="text-sm text-gray-500 mt-1">
            Drag to reorder. Hold Shift and drag a category onto another to make it a subcategory, or drag a top-level category onto another top-level category.
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : !categoryTree || categoryTree.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            <FiTag size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No categories yet. Create your first category!</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={parentCategories.map((cat) => cat.id)}
              strategy={verticalListSortingStrategy}
            >
              <div>
                {categoryTree.map((category) => renderCategory(category))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeCategory ? (
                <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-4">
                  <div className="font-medium text-gray-900">{activeCategory.name}</div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  )
}

export default CategoryManager
