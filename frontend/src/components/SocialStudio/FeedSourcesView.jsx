import { useState, useEffect, useCallback } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter,
  useDraggable, useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import api from '../../services/api'

const PRESET_COLORS = [
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#22c55e', label: 'Green'  },
  { hex: '#f59e0b', label: 'Amber'  },
  { hex: '#ef4444', label: 'Red'    },
  { hex: '#3b82f6', label: 'Blue'   },
  { hex: '#ec4899', label: 'Pink'   },
]

function XLogo({ size = 12, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1200 1227" fill="currentColor" className={className} aria-hidden="true">
      <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.163 519.284ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.828Z" />
    </svg>
  )
}

// ── Draggable handle row (left panel) ─────────────────────────────────────────
function HandleRow({ handle, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lh-${handle.id}`,
    data: { type: 'left-handle', handle },
  })
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : {}

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
        isDragging ? 'opacity-40 border-indigo-500' : 'border-gray-700 hover:border-gray-600'
      } bg-gray-800 mb-1.5 group`}
    >
      <span
        {...attributes}
        {...listeners}
        className="text-gray-500 cursor-grab active:cursor-grabbing text-base select-none"
        title="Drag to assign to a category"
      >
        ⠿
      </span>
      <XLogo className="text-gray-400 shrink-0" />
      <span className="text-sm text-gray-200 truncate flex-1">@{handle.handle}</span>
      {handle.category_obj && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
          style={{ backgroundColor: handle.category_obj.color + '33', color: handle.category_obj.color }}
        >
          {handle.category_obj.name}
        </span>
      )}
      <button
        onClick={() => onRemove(handle)}
        className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
      >
        ×
      </button>
    </div>
  )
}

// ── Sortable chip inside a category card ──────────────────────────────────────
function HandleChip({ handle, categoryId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `chip-${handle.id}`,
    data: { type: 'chip', handle, categoryId },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 bg-gray-700 border border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-gray-200 cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <XLogo size={10} className="text-gray-400 shrink-0" />
      <span className="truncate">@{handle.handle}</span>
      <span className="text-[10px] text-gray-400 truncate ml-0.5">{handle.label !== `@${handle.handle}` ? handle.label : ''}</span>
    </div>
  )
}

// ── Category card (droppable zone) ───────────────────────────────────────────
function CategoryCard({ category, handles, onEditCategory, onDeleteCategory }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cz-${category.id}` })
  const chipIds = handles.map(h => `chip-${h.id}`)

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden mb-4">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-700">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: category.color }}
        />
        <span className="font-semibold text-sm text-white flex-1">{category.name}</span>
        <button
          onClick={() => onEditCategory(category)}
          className="text-gray-500 hover:text-gray-300 transition-colors text-xs px-1.5"
          title="Edit"
        >
          ✎
        </button>
        <button
          onClick={() => onDeleteCategory(category)}
          className="text-gray-500 hover:text-red-400 transition-colors"
          title="Delete category"
        >
          ×
        </button>
      </div>

      {/* Droppable body */}
      <div
        ref={setNodeRef}
        className={`p-3 min-h-[60px] transition-colors ${
          isOver ? 'bg-indigo-950/40' : ''
        }`}
      >
        {handles.length === 0 && (
          <p className="text-[11px] text-gray-600 text-center py-2">
            Drop handles here to assign
          </p>
        )}
        <SortableContext items={chipIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5">
            {handles.map(h => (
              <HandleChip key={h.id} handle={h} categoryId={category.id} />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

// ── Inline add handle form ────────────────────────────────────────────────────
function AddHandleForm({ onAdded }) {
  const [open, setOpen] = useState(false)
  const [handleInput, setHandleInput] = useState('')
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const h = handleInput.trim().replace(/^@/, '')
    if (!h || !/^[A-Za-z0-9_]{1,50}$/.test(h)) {
      setErr('Invalid handle')
      return
    }
    setAdding(true)
    try {
      const r = await api.post('feeds/handles/', {
        handle: h, label: label.trim() || `@${h}`, category: 'general',
      })
      onAdded(r.data)
      setHandleInput('')
      setLabel('')
      setOpen(false)
      setErr('')
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Failed')
    } finally {
      setAdding(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2 text-sm text-indigo-400 hover:text-indigo-300 border border-dashed border-gray-700 hover:border-indigo-600 rounded-lg transition-colors"
      >
        + New Handle
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="border border-indigo-700 rounded-lg p-3 bg-gray-800 space-y-2">
      <input
        autoFocus
        type="text"
        value={handleInput}
        onChange={e => setHandleInput(e.target.value)}
        placeholder="@handle"
        className="w-full px-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <input
        type="text"
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="Label (optional)"
        className="w-full px-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={adding}
          className="flex-1 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Inline add / edit category form ──────────────────────────────────────────
function CategoryForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [color, setColor] = useState(initial?.color || '#6366f1')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { setErr('Name required'); return }
    setSaving(true)
    try {
      let r
      if (initial?.id) {
        r = await api.patch(`feed-categories/${initial.id}/`, { name, color })
      } else {
        r = await api.post('feed-categories/', { name, color })
      }
      onSave(r.data)
      setErr('')
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="border border-indigo-700 rounded-xl p-4 bg-gray-800 space-y-3 mb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {initial?.id ? 'Edit Category' : 'New Category'}
      </p>
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Category name"
        className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <div>
        <p className="text-[11px] text-gray-500 mb-2">Color</p>
        <div className="flex gap-2">
          {PRESET_COLORS.map(p => (
            <button
              key={p.hex}
              type="button"
              onClick={() => setColor(p.hex)}
              className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                color === p.hex ? 'border-white scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: p.hex }}
              title={p.label}
            />
          ))}
        </div>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving ? 'Saving…' : (initial?.id ? 'Save' : 'Create')}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Uncategorized drop zone ───────────────────────────────────────────────────
function UncategorizedZone({ handles }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'cz-null' })
  return (
    <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-400">Uncategorized</span>
      </div>
      <div
        ref={setNodeRef}
        className={`p-3 min-h-[60px] transition-colors ${isOver ? 'bg-gray-800' : ''}`}
      >
        {handles.length === 0
          ? <p className="text-[11px] text-gray-600 text-center py-2">No uncategorized handles</p>
          : <div className="flex flex-wrap gap-1.5">
              {handles.map(h => (
                <span key={h.id} className="text-[11px] bg-gray-700 text-gray-300 px-2 py-1 rounded-lg">
                  @{h.handle}
                </span>
              ))}
            </div>
        }
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FeedSourcesView() {
  const [handles, setHandles] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeItem, setActiveItem] = useState(null)
  const [addingCategory, setAddingCategory] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const load = useCallback(async () => {
    try {
      const [hRes, cRes] = await Promise.all([
        api.get('feeds/handles/'),
        api.get('feed-categories/'),
      ])
      setHandles(hRes.data.handles || [])
      setCategories(cRes.data.categories || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Partition handles by category
  const byCategory = (catId) => handles.filter(h => h.category_obj?.id === catId)
  const uncategorized = handles.filter(h => !h.category_obj)

  const handleDragStart = (event) => setActiveItem(event.active)

  const handleDragEnd = useCallback(async (event) => {
    const { active, over } = event
    setActiveItem(null)
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // ── Cross-container: left panel handle dropped on category zone ───────────
    if (activeId.startsWith('lh-') && overId.startsWith('cz-')) {
      const h = active.data.current?.handle
      if (!h) return
      const categoryId = overId === 'cz-null' ? null : parseInt(overId.replace('cz-', ''), 10)
      // Optimistic update
      setHandles(prev => prev.map(x =>
        x.id === h.id
          ? { ...x, category_obj: categoryId ? (categories.find(c => c.id === categoryId) || null) : null }
          : x
      ))
      try { await api.patch(`feeds/handles/${h.handle}/?category=${h.category}`, { category_id: categoryId }) }
      catch { load() }
      return
    }

    // ── Within-category chip drag → reorder ───────────────────────────────────
    if (activeId.startsWith('chip-') && overId.startsWith('chip-')) {
      const activeCatId = active.data.current?.categoryId
      const overCatId = over.data.current?.categoryId

      if (activeCatId === overCatId) {
        // Reorder within same category
        const catHandles = byCategory(activeCatId)
        const oldIdx = catHandles.findIndex(h => `chip-${h.id}` === activeId)
        const newIdx = catHandles.findIndex(h => `chip-${h.id}` === overId)
        if (oldIdx === newIdx) return
        const reordered = arrayMove(catHandles, oldIdx, newIdx)
        setHandles(prev => {
          const others = prev.filter(h => h.category_obj?.id !== activeCatId)
          return [...others, ...reordered]
        })
        try {
          await api.patch('feeds/handles/reorder/', {
            items: reordered.map((h, pos) => ({ id: h.id, position: pos, category_id: activeCatId })),
          })
        } catch { load() }
      } else {
        // Move chip to different category
        const h = active.data.current?.handle
        if (!h) return
        const cat = categories.find(c => c.id === overCatId) || null
        setHandles(prev => prev.map(x => x.id === h.id ? { ...x, category_obj: cat } : x))
        try { await api.patch(`feeds/handles/${h.handle}/?category=${h.category}`, { category_id: overCatId }) }
        catch { load() }
      }
      return
    }

    // ── Chip dropped on category zone ─────────────────────────────────────────
    if (activeId.startsWith('chip-') && overId.startsWith('cz-')) {
      const h = active.data.current?.handle
      if (!h) return
      const categoryId = overId === 'cz-null' ? null : parseInt(overId.replace('cz-', ''), 10)
      const cat = categoryId ? (categories.find(c => c.id === categoryId) || null) : null
      setHandles(prev => prev.map(x => x.id === h.id ? { ...x, category_obj: cat } : x))
      try { await api.patch(`feeds/handles/${h.handle}/?category=${h.category}`, { category_id: categoryId }) }
      catch { load() }
    }
  }, [categories, handles, load])

  const removeHandle = async (handle) => {
    setHandles(prev => prev.filter(h => h.id !== handle.id))
    try { await api.delete(`feeds/handles/${handle.handle}/?category=${handle.category}`) }
    catch { load() }
  }

  const deleteCategory = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"? Handles will become uncategorized.`)) return
    setCategories(prev => prev.filter(c => c.id !== cat.id))
    setHandles(prev => prev.map(h => h.category_obj?.id === cat.id ? { ...h, category_obj: null } : h))
    try { await api.delete(`feed-categories/${cat.id}/`) }
    catch { load() }
  }

  const onCategorySaved = (cat) => {
    setCategories(prev => {
      const idx = prev.findIndex(c => c.id === cat.id)
      return idx >= 0 ? prev.map(c => c.id === cat.id ? cat : c) : [...prev, cat]
    })
    setAddingCategory(false)
    setEditingCategory(null)
  }

  const renderDragOverlay = () => {
    if (!activeItem) return null
    const activeId = String(activeItem.id)
    if (activeId.startsWith('lh-')) {
      const h = activeItem.data.current?.handle
      return h ? (
        <div className="flex items-center gap-2 bg-gray-700 border border-indigo-500 rounded-lg px-3 py-2 shadow-xl text-sm text-gray-200">
          <XLogo className="text-gray-300 shrink-0" />@{h.handle}
        </div>
      ) : null
    }
    if (activeId.startsWith('chip-')) {
      const h = activeItem.data.current?.handle
      return h ? (
        <div className="flex items-center gap-1.5 bg-gray-600 border border-indigo-400 rounded-lg px-2.5 py-1.5 shadow-xl text-sm text-gray-100">
          <XLogo size={10} className="text-gray-300 shrink-0" />@{h.handle}
        </div>
      ) : null
    }
    return null
  }

  if (loading) {
    return (
      <div className="-mx-6 -my-6 flex items-center justify-center bg-gray-950" style={{ height: '100vh' }}>
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="-mx-6 -my-6 flex bg-gray-950" style={{ height: '100vh' }}>

        {/* ── Left panel: all handles ────────────────────────────── */}
        <div className="flex-none w-72 flex flex-col border-r border-gray-800 bg-gray-900 overflow-hidden">
          <div className="shrink-0 px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-bold text-white">Feed Sources</span>
            <p className="text-[11px] text-gray-500 mt-0.5">Drag handles to assign categories</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-0">
            {handles.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-6">No handles yet</p>
            )}
            {handles.map(h => (
              <HandleRow key={h.id} handle={h} onRemove={removeHandle} />
            ))}
          </div>
          <div className="shrink-0 p-3 border-t border-gray-800">
            <AddHandleForm onAdded={h => setHandles(prev => [h, ...prev])} />
          </div>
        </div>

        {/* ── Right panel: categories ────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-white">Categories</span>
            <button
              onClick={() => { setAddingCategory(true); setEditingCategory(null) }}
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              + New Category
            </button>
          </div>

          {addingCategory && (
            <CategoryForm
              onSave={onCategorySaved}
              onCancel={() => setAddingCategory(false)}
            />
          )}

          {categories.map(cat => (
            editingCategory?.id === cat.id ? (
              <CategoryForm
                key={cat.id}
                initial={cat}
                onSave={onCategorySaved}
                onCancel={() => setEditingCategory(null)}
              />
            ) : (
              <CategoryCard
                key={cat.id}
                category={cat}
                handles={byCategory(cat.id)}
                onEditCategory={setEditingCategory}
                onDeleteCategory={deleteCategory}
              />
            )
          ))}

          <UncategorizedZone handles={uncategorized} />
        </div>
      </div>

      <DragOverlay>{renderDragOverlay()}</DragOverlay>
    </DndContext>
  )
}
