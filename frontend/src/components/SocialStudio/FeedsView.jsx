import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../services/api'

const POLL_MS = 20_000

function timeAgo(pubDate) {
  if (!pubDate) return ''
  const diff = Date.now() - new Date(pubDate).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function XLogo({ size = 14, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1200 1227" fill="currentColor" className={className} aria-hidden="true">
      <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.163 519.284ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.828Z" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}

// ── Tweet card ─────────────────────────────────────────────────────────────────
function TweetCard({ item, isNew }) {
  return (
    <div className={`bg-gray-900 rounded-lg p-3 mb-2 border transition-all duration-300 ${
      isNew ? 'border-green-500 ring-2 ring-green-400' : 'border-gray-800'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <XLogo size={12} className="text-gray-400 shrink-0" />
          <span className="text-[11px] text-gray-400 truncate">{item.author || 'X'}</span>
        </div>
        <span className="text-[10px] text-gray-600 shrink-0 ml-2">{timeAgo(item.pubDate)}</span>
      </div>

      <p className="text-sm text-gray-100 leading-snug mb-2">{item.text}</p>

      {item.image && (
        <img
          src={item.image}
          alt=""
          className="w-full rounded-lg object-cover mb-2"
          style={{ maxHeight: '192px' }}
          loading="lazy"
          onError={e => { e.target.style.display = 'none' }}
        />
      )}

      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-indigo-400 transition-colors"
        >
          <ExternalLinkIcon />
          View on X
        </a>
      )}
    </div>
  )
}

// ── Feed column ────────────────────────────────────────────────────────────────
function FeedColumn({ handle, label, category, onRemove }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newIds, setNewIds] = useState(new Set())
  const seenIds = useRef(new Set())
  const pollRef = useRef(null)

  const fetchFeed = useCallback(async () => {
    try {
      const r = await fetch(`/api/feeds/rss/?handle=${encodeURIComponent(handle)}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      if (data.error) throw new Error(data.error)

      const incoming = data.items || []
      const freshIds = new Set()
      if (seenIds.current.size > 0) {
        incoming.forEach(item => {
          if (!seenIds.current.has(item.id)) freshIds.add(item.id)
        })
      }
      incoming.forEach(item => seenIds.current.add(item.id))

      setItems(incoming)
      setError('')
      if (freshIds.size > 0) {
        setNewIds(freshIds)
        setTimeout(() => setNewIds(new Set()), 3000)
      }
    } catch {
      setError('Feed unavailable')
    } finally {
      setLoading(false)
    }
  }, [handle])

  useEffect(() => {
    fetchFeed()
    pollRef.current = setInterval(fetchFeed, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [fetchFeed])

  return (
    <div className="flex-none w-[340px] flex flex-col border-r border-gray-800 bg-gray-950 overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-3 py-2.5 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <XLogo size={13} className="text-white shrink-0" />
          <span className="font-semibold text-sm text-white truncate">{label}</span>
          <a
            href={`https://twitter.com/${handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
            title={`Open @${handle} on X`}
          >
            <ExternalLinkIcon />
          </a>
        </div>
        <button
          onClick={() => onRemove(handle, category)}
          className="text-gray-500 hover:text-red-400 transition-colors text-xl leading-none shrink-0 ml-2"
          title={`Remove ${label}`}
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && error && (
          <p className="text-xs text-red-400 text-center py-8">{error}</p>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-8">No tweets yet</p>
        )}
        {!loading && items.map(item => (
          <TweetCard key={item.id} item={item} isNew={newIds.has(item.id)} />
        ))}
      </div>
    </div>
  )
}

// ── Add Feed panel ─────────────────────────────────────────────────────────────
function AddFeedPanel({ category, onAdd }) {
  const [handleInput, setHandleInput] = useState('')
  const [label, setLabel] = useState('')
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr('')
    const handle = handleInput.trim().replace(/^@/, '')
    if (!handle || !/^[A-Za-z0-9_]{1,50}$/.test(handle)) {
      setErr('Enter a valid X handle (letters, numbers, underscores only)')
      return
    }
    setAdding(true)
    try {
      const r = await api.post('feeds/handles/', {
        handle,
        label: label.trim() || `@${handle}`,
        category,
      })
      onAdd(r.data)
      setHandleInput('')
      setLabel('')
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Failed to add feed')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex-none w-72 flex flex-col border-r border-gray-800 bg-gray-900 overflow-hidden">
      <div className="shrink-0 px-3 py-2.5 border-b border-gray-800">
        <span className="text-sm font-semibold text-gray-300">+ Add Feed</span>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <div>
            <label className="block text-[11px] text-gray-400 mb-1 font-medium uppercase tracking-wide">
              X Handle
            </label>
            <input
              type="text"
              value={handleInput}
              onChange={e => setHandleInput(e.target.value)}
              placeholder="@FIFAWorldCup or FIFAWorldCup"
              disabled={adding}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-400 mb-1 font-medium uppercase tracking-wide">
              Column Label
            </label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. FIFA World Cup"
              disabled={adding}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
            />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button
            type="submit"
            disabled={!handleInput.trim() || adding}
            className="w-full px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium"
          >
            {adding ? 'Adding…' : 'Add Column'}
          </button>
        </form>
        <div className="mt-2 text-[11px] text-gray-500 space-y-1">
          <p>Enter any public X account handle.</p>
          <p className="font-mono text-gray-600">twitter.com/@handle</p>
          <p>Polls via RSSHub every 20 seconds.</p>
        </div>
      </div>
    </div>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────────
export default function FeedsView({ category = 'general', title = '⚡ Feeds', subtitle = 'Live · RSSHub' }) {
  const [handles, setHandles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`feeds/handles/?category=${category}`)
      .then(r => setHandles(r.data.handles || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [category])

  const handleAdd = useCallback((newHandle) => {
    setHandles(prev => {
      if (prev.find(h => h.handle === newHandle.handle)) return prev
      return [...prev, newHandle]
    })
  }, [])

  const handleRemove = useCallback(async (handle, cat) => {
    try {
      await api.delete(`feeds/handles/${handle}/?category=${cat}`)
      setHandles(prev => prev.filter(h => !(h.handle === handle && h.category === cat)))
    } catch {
      // ignore
    }
  }, [])

  return (
    <div className="-mx-6 -my-6 flex flex-col bg-gray-950" style={{ height: '100vh' }}>
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-white">{title}</span>
          <span className="text-xs text-gray-400 hidden sm:block">{subtitle}</span>
        </div>
        {!loading && handles.length > 0 && (
          <span className="text-[11px] bg-indigo-900/60 text-indigo-300 px-2.5 py-0.5 rounded-full font-medium">
            {handles.length} {handles.length === 1 ? 'feed' : 'feeds'}
          </span>
        )}
      </div>

      {/* Columns */}
      <div className="flex-1 flex overflow-x-auto overflow-y-hidden">
        {loading && (
          <div className="flex items-center justify-center flex-1">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && handles.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
            <XLogo size={40} className="text-gray-700 mb-4" />
            <h2 className="text-lg font-semibold text-gray-300 mb-2">No feeds yet</h2>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
              Enter an X handle in the panel on the right to add a live feed column.
            </p>
          </div>
        )}

        {!loading && handles.map(h => (
          <FeedColumn
            key={`${h.handle}-${h.category}`}
            handle={h.handle}
            label={h.label}
            category={h.category}
            onRemove={handleRemove}
          />
        ))}

        <AddFeedPanel category={category} onAdd={handleAdd} />
      </div>
    </div>
  )
}
