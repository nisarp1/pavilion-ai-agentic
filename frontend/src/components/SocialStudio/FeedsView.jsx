import { useState, useEffect, useRef, useCallback } from 'react'

const STORAGE_KEY = 'pavilion_x_lists'

function loadLists() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveLists(lists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists))
}

function XLogo({ size = 14, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1200 1227"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.163 519.284ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.828Z" />
    </svg>
  )
}

function ColumnSkeleton() {
  return (
    <div className="p-3 space-y-3">
      {[120, 90, 140, 100].map((h, i) => (
        <div
          key={i}
          className="rounded-lg bg-gray-800 animate-pulse"
          style={{ height: h }}
        />
      ))}
    </div>
  )
}

function ListColumn({ list, onRemove }) {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Clear skeleton on "rendered" event; 8 s fallback checks if iframe was injected
  useEffect(() => {
    const onRendered = () => setLoading(false)
    window.twttr?.ready?.(() => {
      window.twttr.events.bind('rendered', onRendered)
    })
    const timer = setTimeout(() => {
      if (containerRef.current?.querySelector('a.twitter-timeline')) {
        setError('X could not load this list. Check that it is a public list.')
      }
      setLoading(false)
    }, 8000)
    return () => {
      clearTimeout(timer)
      window.twttr?.events?.unbind('rendered', onRendered)
    }
  }, [list.id])

  // Delay load by one rAF so flex layout has settled before X measures container
  useEffect(() => {
    if (!containerRef.current) return
    requestAnimationFrame(() => {
      if (window.twttr?.widgets) {
        window.twttr.widgets.load(containerRef.current)
      } else {
        window.twttr = window.twttr || {}
        window.twttr._e = window.twttr._e || []
        window.twttr._e.push(() => window.twttr.widgets.load(containerRef.current))
      }
    })
  }, [list.id])

  return (
    <div className="flex-none w-[340px] flex flex-col border-r border-gray-800 bg-gray-950 overflow-hidden">
      {/* Column header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2.5 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <XLogo size={13} className="text-white shrink-0" />
          <span className="font-semibold text-sm text-white truncate">{list.label}</span>
        </div>
        <button
          onClick={() => onRemove(list.id)}
          className="text-gray-500 hover:text-red-400 transition-colors text-xl leading-none shrink-0 ml-2"
          title={`Remove ${list.label}`}
          aria-label={`Remove ${list.label}`}
        >
          ×
        </button>
      </div>

      {/* Tweet stream */}
      {error && (
        <div className="p-4 text-sm text-red-400">{error}</div>
      )}
      <div
        ref={containerRef}
        style={{ minHeight: '400px', height: '100%' }}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
      >
        {loading && (
          <div className="absolute inset-0 bg-gray-950 z-10 pointer-events-none">
            <ColumnSkeleton />
          </div>
        )}
        <a
          className="twitter-timeline"
          data-tweet-limit="20"
          data-chrome="noheader nofooter noborders"
          data-theme="light"
          data-height="800"
          data-aria-polite="assertive"
          href={`https://twitter.com/i/lists/${list.id}`}
        >Tweets from list</a>
      </div>
    </div>
  )
}

function AddListPanel({ onAdd }) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [err, setErr] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    setErr('')
    const match = url.trim().match(/lists\/(\d+)/)
    if (!match) {
      setErr('Paste a valid X List URL (must contain /lists/<id>)')
      return
    }
    const id = match[1]
    const name = label.trim() || `List …${id.slice(-6)}`
    onAdd({ id, label: name, addedAt: new Date().toISOString() })
    setUrl('')
    setLabel('')
  }

  return (
    <div className="flex-none w-72 flex flex-col border-r border-gray-800 bg-gray-900 overflow-hidden">
      <div className="shrink-0 px-3 py-2.5 bg-gray-900 border-b border-gray-800">
        <span className="text-sm font-semibold text-gray-300">+ Add List</span>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <div>
            <label className="block text-[11px] text-gray-400 mb-1 font-medium uppercase tracking-wide">
              X List URL
            </label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://twitter.com/i/lists/…"
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
              placeholder="e.g. FIFA WC 2026"
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button
            type="submit"
            disabled={!url.trim()}
            className="w-full px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium"
          >
            Add Column
          </button>
        </form>
        <div className="mt-2 text-[11px] text-gray-500 space-y-1">
          <p>Paste a public X List URL.</p>
          <p className="font-mono text-gray-600 break-all">twitter.com/i/lists/&lt;id&gt;</p>
          <p>Tweets are rendered live by X.</p>
        </div>
      </div>
    </div>
  )
}

export default function FeedsView() {
  const [lists, setLists] = useState(loadLists)

  // Load twitter widget.js once — official async snippet with twttr.ready() queue
  useEffect(() => {
    window.twttr = (function(d, s, id) {
      const t = window.twttr || {}
      if (d.getElementById(id)) return t
      const js = d.createElement(s)
      js.id = id
      js.src = 'https://platform.twitter.com/widgets.js'
      d.head.appendChild(js)
      t._e = []
      t.ready = function(f) { t._e.push(f) }
      return t
    }(document, 'script', 'twitter-wjs'))
  }, [])

  // Persist to localStorage on every change
  useEffect(() => {
    saveLists(lists)
  }, [lists])

  const handleAdd = useCallback((newList) => {
    setLists(prev => {
      if (prev.find(l => l.id === newList.id)) return prev
      return [...prev, newList]
    })
  }, [])

  const handleRemove = useCallback((id) => {
    setLists(prev => prev.filter(l => l.id !== id))
  }, [])

  return (
    <div className="-mx-6 -my-6 flex flex-col bg-gray-950" style={{ height: '100vh' }}>
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-white">⚡ Feeds</span>
          <span className="text-xs text-gray-400 hidden sm:block">Live · X Lists</span>
        </div>
        {lists.length > 0 && (
          <span className="text-[11px] bg-indigo-900/60 text-indigo-300 px-2.5 py-0.5 rounded-full font-medium">
            {lists.length} {lists.length === 1 ? 'list' : 'lists'}
          </span>
        )}
      </div>

      {/* Columns area — TweetDeck-style horizontal scroll */}
      <div className="flex-1 flex overflow-x-auto overflow-y-hidden">
        {lists.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
            <XLogo size={40} className="text-gray-700 mb-4" />
            <h2 className="text-lg font-semibold text-gray-300 mb-2">No lists yet</h2>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
              Paste an X List URL in the panel on the right to add a live embedded feed column.
            </p>
          </div>
        )}

        {lists.map(list => (
          <ListColumn key={list.id} list={list} onRemove={handleRemove} />
        ))}

        <AddListPanel onAdd={handleAdd} />
      </div>
    </div>
  )
}
