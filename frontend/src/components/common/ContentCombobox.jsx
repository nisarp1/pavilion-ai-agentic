import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Searchable combobox for any content list.
 *
 * Props:
 *   items        – initial list (shown before the user types); array of { id, title, [status] }
 *   onSearch     – async (query: string) => { id, title, [status] }[]
 *                  called with debounce while the user types; pass null to do client-side filter only
 *   value        – currently selected item (object with id + title) or null
 *   onChange     – (item | null) => void
 *   placeholder  – input placeholder (default "Search…")
 *   allowNone    – show a "None" option that calls onChange(null)
 *   noneLabel    – label for the None option (default "— None (auto-create) —")
 *   renderBadge  – optional (item) => ReactNode shown after the title
 */
export default function ContentCombobox({
  items = [],
  onSearch = null,
  value = null,
  onChange,
  placeholder = 'Search…',
  allowNone = false,
  noneLabel = '— None (auto-create) —',
  renderBadge = null,
}) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState(items)
  const [loading, setLoading]   = useState(false)
  const [open, setOpen]         = useState(false)
  const debounceRef             = useRef(null)
  const containerRef            = useRef(null)
  const inputRef                = useRef(null)

  // Keep results in sync when parent-provided items change (e.g. loaded after mount)
  useEffect(() => {
    if (!query) setResults(items.slice(0, 10))
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search / filter on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query) {
      setResults(items.slice(0, 10))
      return
    }

    if (onSearch) {
      debounceRef.current = setTimeout(async () => {
        setLoading(true)
        try {
          const res = await onSearch(query)
          setResults(res)
        } finally {
          setLoading(false)
        }
      }, 280)
    } else {
      // Client-side filter
      const q = query.toLowerCase()
      setResults(items.filter(it => (it.title || '').toLowerCase().includes(q)).slice(0, 10))
    }

    return () => clearTimeout(debounceRef.current)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = useCallback((item) => {
    onChange(item)
    setQuery('')
    setOpen(false)
  }, [onChange])

  const handleClear = useCallback((e) => {
    e.stopPropagation()
    onChange(null)
    setQuery('')
    setResults(items.slice(0, 10))
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [onChange, items])

  const handleInputChange = (e) => {
    setQuery(e.target.value)
    setOpen(true)
    // Clear selection as soon as user starts typing to search for a new item
    if (value) onChange(null)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* ── Input / selected pill ── */}
      <div
        className={`flex items-center gap-2 w-full border rounded-lg px-3 py-2 text-sm cursor-text transition-colors ${
          open
            ? 'border-indigo-500 ring-2 ring-indigo-200'
            : 'border-gray-300 hover:border-gray-400'
        } bg-white`}
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        {value ? (
          <>
            <span className="flex-1 truncate text-gray-900 font-medium">
              {value.title || `#${value.id}`}
            </span>
            {renderBadge && renderBadge(value)}
            <button
              type="button"
              onMouseDown={handleClear}
              className="flex-shrink-0 text-gray-400 hover:text-gray-700 text-base leading-none"
              tabIndex={-1}
            >
              ×
            </button>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => setOpen(true)}
              placeholder={placeholder}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder-gray-400"
            />
            {loading && (
              <svg className="w-3.5 h-3.5 text-indigo-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
          </>
        )}
      </div>

      {/* ── Dropdown ── */}
      {open && !value && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {allowNone && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(null) }}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 italic hover:bg-gray-50 border-b border-gray-100"
            >
              {noneLabel}
            </button>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-3 text-xs text-gray-400 text-center">
              {query ? 'No results for that search' : 'Nothing here yet'}
            </p>
          )}
          {results.map(item => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(item) }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 flex items-center gap-2 border-b border-gray-50 last:border-0"
            >
              <span className="flex-1 truncate text-gray-800">{item.title || `#${item.id}`}</span>
              {renderBadge && renderBadge(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
