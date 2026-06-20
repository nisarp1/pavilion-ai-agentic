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

const CATEGORY_META = {
  football: { color: '#22c55e', label: '⚽ Football' },
  cricket:  { color: '#f59e0b', label: '🏏 Cricket'  },
}

function CategoryBadge({ category, categoryObj, variant = 'pill' }) {
  let color, label
  if (categoryObj) {
    color = categoryObj.color || '#6366f1'
    label = categoryObj.name || ''
  } else {
    const meta = CATEGORY_META[category]
    if (!meta) return null
    color = meta.color
    label = meta.label
  }
  if (!label) return null

  if (variant === 'dot') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        {label.replace(/^[^ ]+ /, '')}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
      style={{ backgroundColor: `${color}26`, color }}
    >
      {label}
    </span>
  )
}

// ── View Post Modal ────────────────────────────────────────────────────────────
function ViewPostModal({ url, onClose }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!url || !containerRef.current) return
    const load = () => {
      if (window.twttr?.widgets) window.twttr.widgets.load(containerRef.current)
    }
    if (window.twttr?.widgets) {
      load()
    } else {
      window.twttr = window.twttr || { _e: [], ready: (f) => window.twttr._e.push(f) }
      if (!document.getElementById('twitter-wjs')) {
        const s = document.createElement('script')
        s.id = 'twitter-wjs'
        s.src = 'https://platform.twitter.com/widgets.js'
        s.onload = load
        document.head.appendChild(s)
      } else {
        window.twttr.ready(load)
      }
    }
  }, [url])

  if (!url) return null

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-end mb-2">
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xl rounded-full hover:bg-gray-100 transition-colors"
          >
            ×
          </button>
        </div>
        <div ref={containerRef} className="flex justify-center min-h-[120px]">
          <blockquote className="twitter-tweet" data-theme="light">
            <a href={url}></a>
          </blockquote>
        </div>
      </div>
    </div>
  )
}

// ── Generate Result Panel ──────────────────────────────────────────────────────
const EVENT_TYPE_COLORS = {
  transfer_news: { bg: '#6366f126', color: '#818cf8' },
  match_result:  { bg: '#22c55e26', color: '#4ade80' },
  breaking:      { bg: '#ef444426', color: '#f87171' },
  player_quote:  { bg: '#f59e0b26', color: '#fbbf24' },
  milestone:     { bg: '#ec489926', color: '#f472b6' },
  general:       { bg: '#6b728026', color: '#9ca3af' },
}

function GenerateResultPanel({ state, onClose }) {
  const [captionText, setCaptionText] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    if (state?.result?.malayalam_caption) setCaptionText(state.result.malayalam_caption)
  }, [state?.result?.malayalam_caption])

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(''), 2000)
    })
  }

  if (!state) return null

  const r = state.result || {}

  return (
    <div className="fixed top-0 right-0 h-screen w-[420px] bg-gray-900 border-l border-gray-800 z-50 flex flex-col shadow-2xl">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="font-bold text-white text-sm">⚡ Generated Post</span>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white text-xl rounded-full hover:bg-gray-800 transition-colors"
        >
          ×
        </button>
      </div>

      {state.loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Generating with Claude…</p>
          <p className="text-[11px] text-gray-600 text-center max-w-[220px] leading-relaxed">
            Analysing tweet · writing caption · building creative brief…
          </p>
        </div>
      ) : state.error ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-red-400 text-center">{state.error}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {r.event_type && (() => {
            const c = EVENT_TYPE_COLORS[r.event_type] || EVENT_TYPE_COLORS.general
            return (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 font-semibold">Event Type</p>
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: c.bg, color: c.color }}
                >
                  {r.event_type.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
            )
          })()}

          {r.english_headline && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 font-semibold">Headline</p>
              <p className="text-lg font-bold text-white leading-tight">{r.english_headline}</p>
            </div>
          )}

          {r.malayalam_caption && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Malayalam Caption</p>
                <button
                  onClick={() => copy(captionText, 'caption')}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  {copied === 'caption' ? '✅ Copied' : '📋 Copy'}
                </button>
              </div>
              <textarea
                value={captionText}
                onChange={e => setCaptionText(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-gray-100 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          {r.hashtags?.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Hashtags</p>
                <button
                  onClick={() => copy(r.hashtags.join(' '), 'hashtags')}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  {copied === 'hashtags' ? '✅ Copied' : '📋 Copy all'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.hashtags.map((tag, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 bg-indigo-900/40 text-indigo-300 rounded-full font-medium">
                    {tag.startsWith('#') ? tag : `#${tag}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          {r.visual_format && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 font-semibold">Visual Format</p>
              <span className="text-[11px] px-2.5 py-1 bg-purple-900/40 text-purple-300 rounded-full font-medium">
                {r.visual_format.replace(/_/g, ' ')}
              </span>
            </div>
          )}

          {r.creative_brief && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 font-semibold">Creative Brief</p>
              <p className="text-sm text-gray-400 italic leading-relaxed">{r.creative_brief}</p>
            </div>
          )}

          {r.cowork_prompt && (
            <div className="space-y-2 pt-1">
              <button
                onClick={() => copy(r.cowork_prompt, 'cowork')}
                className={`w-full px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  copied === 'cowork'
                    ? 'bg-green-700 text-white'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {copied === 'cowork' ? '✅ Copied! Paste into Claude Cowork' : '📋 Copy Cowork Prompt'}
              </button>
              <p className="text-[10px] text-gray-600 text-center leading-relaxed pb-2">
                Paste the Cowork prompt into Claude Cowork to create the Canva design
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tweet card ─────────────────────────────────────────────────────────────────
function TweetCard({ item, isNew, category, categoryObj, handle, onShowResult, onViewPost }) {
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    setGenerating(true)
    onShowResult({ loading: true })
    try {
      const r = await api.post('generate-post/', {
        tweet_text: item.text,
        tweet_url: item.link || '',
        handle,
        category,
      })
      onShowResult({ loading: false, result: r.data })
    } catch (e) {
      onShowResult({ loading: false, error: e.response?.data?.error || 'Generation failed. Check ANTHROPIC_API_KEY.' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className={`bg-gray-900 rounded-lg p-3 mb-2 border transition-all duration-300 ${
      isNew ? 'border-green-500 ring-2 ring-green-400' : 'border-gray-800'
    }`}>
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <XLogo size={12} className="text-gray-400 shrink-0" />
          <span className="text-[11px] text-gray-400 truncate">{item.author || 'X'}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <CategoryBadge category={category} categoryObj={categoryObj} variant="dot" />
          <span className="text-[10px] text-gray-600">{timeAgo(item.pubDate)}</span>
        </div>
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

      <div className="flex items-center gap-2 flex-wrap mt-1">
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
        {item.link && (
          <button
            onClick={() => onViewPost(item.link)}
            className="text-[11px] text-gray-500 hover:text-blue-400 transition-colors"
          >
            👁 View Post
          </button>
        )}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className={`text-[11px] font-medium transition-colors ml-auto ${
            generating ? 'text-gray-500 cursor-not-allowed' : 'text-indigo-400 hover:text-indigo-300'
          }`}
        >
          {generating ? (
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 border border-indigo-400 border-t-transparent rounded-full animate-spin inline-block" />
              Generating…
            </span>
          ) : '⚡ Generate'}
        </button>
      </div>
    </div>
  )
}

// ── Feed column ────────────────────────────────────────────────────────────────
function FeedColumn({ handle, label, category, categoryObj, onRemove, onShowResult }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newIds, setNewIds] = useState(new Set())
  const [viewPostUrl, setViewPostUrl] = useState(null)
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
    <>
      <ViewPostModal url={viewPostUrl} onClose={() => setViewPostUrl(null)} />
      <div className="flex-none w-[340px] flex flex-col border-r border-gray-800 bg-gray-950 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-3 py-2.5 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-2 min-w-0">
            <XLogo size={13} className="text-white shrink-0" />
            <span className="font-semibold text-sm text-white truncate">{label}</span>
            <CategoryBadge category={category} categoryObj={categoryObj} variant="pill" />
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
            <TweetCard
              key={item.id}
              item={item}
              isNew={newIds.has(item.id)}
              category={category}
              categoryObj={categoryObj}
              handle={handle}
              onShowResult={onShowResult}
              onViewPost={setViewPostUrl}
            />
          ))}
        </div>
      </div>
    </>
  )
}

// ── Add Feed panel ─────────────────────────────────────────────────────────────
function AddFeedPanel({ defaultCategory, onAdd }) {
  const [handleInput, setHandleInput] = useState('')
  const [label, setLabel] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory || 'general')
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
        category: selectedCategory,
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
          <div>
            <label className="block text-[11px] text-gray-400 mb-1 font-medium uppercase tracking-wide">
              Category
            </label>
            <div className="flex gap-1.5">
              {[
                { value: 'general',  label: 'General' },
                { value: 'football', label: '⚽ Football' },
                { value: 'cricket',  label: '🏏 Cricket' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedCategory(opt.value)}
                  className={`flex-1 py-1.5 text-[11px] rounded-lg border font-medium transition-colors ${
                    selectedCategory === opt.value
                      ? opt.value === 'football' ? 'bg-green-900/60 border-green-700 text-green-300'
                        : opt.value === 'cricket' ? 'bg-amber-900/60 border-amber-700 text-amber-300'
                        : 'bg-indigo-900/60 border-indigo-700 text-indigo-300'
                      : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
  const [generatePanel, setGeneratePanel] = useState(null)

  useEffect(() => {
    const url = category === 'general'
      ? 'feeds/handles/'
      : `feeds/handles/?category=${category}`
    api.get(url)
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
      <GenerateResultPanel state={generatePanel} onClose={() => setGeneratePanel(null)} />

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

        {!loading && [...handles].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(h => (
          <FeedColumn
            key={`${h.handle}-${h.category}`}
            handle={h.handle}
            label={h.label}
            category={h.category}
            categoryObj={h.category_obj || null}
            onRemove={handleRemove}
            onShowResult={setGeneratePanel}
          />
        ))}

        <AddFeedPanel defaultCategory={category} onAdd={handleAdd} />
      </div>
    </div>
  )
}
