import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import api from '../../services/api'

const POLL_INTERVAL_MS = 60_000
const LIVE_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes

const TIER_COLORS = {
  1: 'border-blue-500 text-blue-600 bg-blue-50',
  2: 'border-amber-500 text-amber-600 bg-amber-50',
  3: 'border-gray-400 text-gray-500 bg-gray-50',
}

const TIER_HEADER = {
  1: '#3B82F6',
  2: '#F59E0B',
  3: '#9CA3AF',
}

const VERDICT_STYLES = {
  CONFIRMED:    'bg-green-100 text-green-700',
  UNCONFIRMED:  'bg-yellow-100 text-yellow-700',
  CONTRADICTED: 'bg-red-100 text-red-700',
  PENDING:      'bg-gray-100 text-gray-500',
}

const VERDICT_ICONS = {
  CONFIRMED:    '✅',
  UNCONFIRMED:  '⚠️',
  CONTRADICTED: '❌',
  PENDING:      '⏳',
}

function timeAgo(isoStr) {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  return `${Math.floor(h / 24)} days ago`
}

function isLive(lastPolledAt) {
  if (!lastPolledAt) return false
  return Date.now() - new Date(lastPolledAt).getTime() < LIVE_THRESHOLD_MS
}

// ── Tweet embed modal ──────────────────────────────────────────────────────────
function TweetModal({ article, onClose }) {
  const embedRef = useRef(null)

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Load Twitter widget script and render embed
  useEffect(() => {
    if (!embedRef.current) return

    const render = () => {
      if (window.twttr?.widgets) {
        window.twttr.widgets.load(embedRef.current)
      }
    }

    if (window.twttr?.widgets) {
      render()
    } else {
      const existing = document.querySelector('script[src="https://platform.twitter.com/widgets.js"]')
      if (existing) {
        existing.addEventListener('load', render)
      } else {
        const script = document.createElement('script')
        script.src = 'https://platform.twitter.com/widgets.js'
        script.async = true
        script.onload = render
        document.body.appendChild(script)
      }
    }
  }, [article.source_url])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
        <div ref={embedRef} className="flex justify-center">
          <blockquote className="twitter-tweet" data-theme="light">
            <a href={article.source_url}>{article.source_url}</a>
          </blockquote>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Cowork handoff modal ───────────────────────────────────────────────────────
function CoworkHandoffModal({ data, onClose }) {
  const [caption, setCaption] = useState(data.caption_draft || '')
  const [copied, setCopied] = useState(false)
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.cowork_prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const handleMarkDone = async () => {
    setMarking(true)
    try {
      await api.patch('cowork/complete/', { article_id: data.article_id, caption })
      onClose()
    } catch { /* ignore */ } finally {
      setMarking(false)
    }
  }

  const fc = data.fact_check

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-sm text-gray-800 truncate">
              ⚡ {data.event_type?.toUpperCase()} — {data.template?.design_name}
            </span>
            {fc && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${VERDICT_STYLES[fc.verdict] || VERDICT_STYLES.PENDING}`}>
                {VERDICT_ICONS[fc.verdict]} {fc.confidence}%
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg shrink-0 ml-2"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">Source Tweet</p>
            <p className="text-sm text-gray-600 line-clamp-3 leading-snug">{data.tweet_text}</p>
          </div>

          <div>
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">Caption Draft</p>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={4}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            />
          </div>

          <hr className="border-gray-100" />

          <div>
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">Paste into Claude Cowork</p>
            <textarea
              readOnly
              value={data.cowork_prompt}
              rows={8}
              className="w-full text-[11px] font-mono border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 resize-none focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {copied ? '✅ Copied!' : '📋 Copy Cowork Prompt'}
          </button>
          <button
            onClick={handleMarkDone}
            disabled={marking}
            className="ml-auto px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {marking ? 'Saving…' : 'Mark Done'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Tweet card ─────────────────────────────────────────────────────────────────
function TweetCard({ article, onViewPost, onCoworkReady }) {
  const [expanded, setExpanded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(false)
  const isBreaking = article.urgency === 'breaking'
  const fc = article.fact_check

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError(false)
    try {
      const r = await api.post('cowork/generate/', { article_id: article.id })
      onCoworkReady(r.data)
    } catch {
      setGenError(true)
      setTimeout(() => setGenError(false), 3000)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      className={`bg-white rounded border border-gray-200 p-3 mb-2 hover:border-gray-300 transition-colors ${
        isBreaking ? 'border-l-[3px] border-l-red-500' : ''
      }`}
    >
      {/* Tweet text */}
      <p
        className={`text-sm text-gray-800 leading-snug mb-2 ${
          expanded ? '' : 'line-clamp-3'
        }`}
      >
        {article.title}
      </p>
      {article.title && article.title.length > 160 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-[11px] text-blue-500 hover:text-blue-700 mb-2"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {/* Fact-check badge */}
      {fc && (
        <div className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full mb-2 ${VERDICT_STYLES[fc.verdict] || VERDICT_STYLES.PENDING}`}>
          <span>{VERDICT_ICONS[fc.verdict] || '⏳'}</span>
          <span>{fc.verdict}</span>
          {fc.confidence > 0 && <span className="opacity-70">{fc.confidence}%</span>}
        </div>
      )}
      {!fc && (
        <div className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 mb-2">
          ⏳ Checking…
        </div>
      )}

      {/* Traction + time */}
      <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
        <span>
          {article.traction_score > 500 && <span className="mr-1">🔥</span>}
          {article.traction_score > 0 && (
            <span>{article.traction_score >= 1000
              ? `${(article.traction_score / 1000).toFixed(1)}K`
              : article.traction_score} pts</span>
          )}
        </span>
        <span>🕐 {article.time_ago || timeAgo(article.created_at)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors disabled:opacity-60 ${
            genError
              ? 'bg-red-50 text-red-500'
              : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
          }`}
        >
          {generating ? '⏳ Generating…' : genError ? '✗ Failed — retry' : '⚡ Generate Post'}
        </button>
        {article.source_url && (
          <button
            onClick={() => onViewPost(article)}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            👁 View Post
          </button>
        )}
        {article.source_url && (
          <a
            href={article.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            ↗ Source
          </a>
        )}
      </div>
    </div>
  )
}

// ── Feed column ────────────────────────────────────────────────────────────────
function FeedColumn({ handle, onRemove, onViewPost, onCoworkReady }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState(null)
  const [live, setLive] = useState(false)
  const timerRef = useRef(null)

  const fetchArticles = useCallback(async () => {
    try {
      const r = await api.get(`feeds/${handle.x_handle}/articles/?limit=30`)
      setArticles(r.data.articles || [])
      setError(null)
    } catch {
      setError('Failed to load')
    } finally {
      setLoading(false)
    }
  }, [handle.x_handle])

  useEffect(() => {
    fetchArticles()
    timerRef.current = setInterval(fetchArticles, POLL_INTERVAL_MS)
    return () => clearInterval(timerRef.current)
  }, [fetchArticles])

  // Update live indicator every 30s
  useEffect(() => {
    const tick = () => setLive(isLive(handle.last_polled_at))
    tick()
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [handle.last_polled_at])

  const handlePoll = async () => {
    setPolling(true)
    try {
      await api.post(`feeds/${handle.x_handle}/poll/`)
      await new Promise(r => setTimeout(r, 1500))
      await fetchArticles()
    } catch {
      // ignore
    } finally {
      setPolling(false)
    }
  }

  const stale = handle.last_polled_at &&
    (Date.now() - new Date(handle.last_polled_at).getTime()) > 30 * 60 * 1000

  const tierColor = TIER_HEADER[handle.credibility_tier] || TIER_HEADER[3]

  return (
    <div className="flex-none w-72 flex flex-col border-r border-gray-200 bg-gray-50 overflow-hidden">
      {/* Column header */}
      <div
        className="shrink-0 px-3 py-2.5 bg-white border-b border-gray-200"
        style={{ borderTop: `3px solid ${tierColor}` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-sm text-gray-800 truncate">@{handle.x_handle}</span>
            {live && (
              <span className="flex items-center gap-0.5 text-[10px] text-green-600 font-medium shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <button
            onClick={() => onRemove(handle.x_handle)}
            className="text-gray-300 hover:text-red-400 transition-colors text-sm shrink-0 ml-1"
            title="Remove feed"
          >
            ×
          </button>
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">
          {handle.name} · Tier {handle.credibility_tier}
        </div>
        {handle.last_polled_at && (
          <div className="text-[10px] text-gray-300 mt-0.5">
            Polled {handle.last_polled_ago || timeAgo(handle.last_polled_at)}
          </div>
        )}
      </div>

      {/* Article list */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <p className="text-xs text-red-400 text-center py-4">{error}</p>
        )}

        {!loading && !error && articles.length === 0 && (
          <div className="text-center py-8 px-3">
            {!handle.last_polled_at ? (
              <>
                <p className="text-xs text-gray-400 mb-3">Waiting for tweets…</p>
                <p className="text-[11px] text-gray-300">Celery polls every 5 min</p>
                <div className="flex justify-center mt-3">
                  <div className="flex gap-1">
                    {[0, 0.15, 0.3].map((d, i) => (
                      <div
                        key={i}
                        className="w-1 h-1 rounded-full bg-gray-300 animate-bounce"
                        style={{ animationDelay: `${d}s` }}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : stale ? (
              <>
                <p className="text-xs text-gray-400 mb-3">No recent activity</p>
                <button
                  onClick={handlePoll}
                  disabled={polling}
                  className="text-[11px] px-3 py-1.5 rounded-full border border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
                >
                  {polling ? 'Checking…' : '↻ Refresh now'}
                </button>
              </>
            ) : (
              <p className="text-xs text-gray-400 py-4">No tweets yet · check back soon</p>
            )}
          </div>
        )}

        {!loading && articles.map(a => (
          <TweetCard key={a.id} article={a} onViewPost={onViewPost} onCoworkReady={onCoworkReady} />
        ))}

        {/* Stale + has articles: show refresh button at bottom */}
        {!loading && articles.length > 0 && stale && (
          <div className="pt-1 pb-2 text-center">
            <button
              onClick={handlePoll}
              disabled={polling}
              className="text-[11px] px-3 py-1 rounded-full border border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors disabled:opacity-50"
            >
              {polling ? 'Checking…' : '↻ Force refresh'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Add Feed column ────────────────────────────────────────────────────────────
function AddFeedColumn({ onAdd }) {
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const clean = input.trim().replace(/^@/, '')
    if (!clean) return
    setAdding(true)
    setErr('')
    try {
      const r = await api.post('feeds/add/', { x_handle: clean, name: clean })
      onAdd(r.data)
      setInput('')
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Failed to add feed')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex-none w-64 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
      <div
        className="shrink-0 px-3 py-2.5 bg-white border-b border-gray-200"
        style={{ borderTop: '3px solid #E5E7EB' }}
      >
        <span className="text-sm font-semibold text-gray-500">+ Add Feed</span>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter X handle…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
            disabled={adding}
          />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <button
            type="submit"
            disabled={adding || !input.trim()}
            className="w-full px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium"
          >
            {adding ? 'Adding…' : 'Add Feed'}
          </button>
        </form>
        <div className="text-[11px] text-gray-300 space-y-1 mt-2">
          <p>Tier 1 — polls every run</p>
          <p>Tier 2 — polls every 10 min</p>
          <p>Tier 3 — polls every 20 min</p>
        </div>
      </div>
    </div>
  )
}

// ── Main FeedsView ─────────────────────────────────────────────────────────────
export default function FeedsView() {
  const [handles, setHandles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [coworkData, setCoworkData] = useState(null)

  const fetchHandles = async () => {
    try {
      const r = await api.get('feeds/')
      setHandles(r.data.handles || [])
    } catch {
      // silently degrade
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHandles()
  }, [])

  const handleAdd = (newHandle) => {
    setHandles(prev => {
      if (prev.find(h => h.x_handle === newHandle.x_handle)) {
        return prev.map(h => h.x_handle === newHandle.x_handle ? newHandle : h)
      }
      return [...prev, newHandle]
    })
  }

  const handleRemove = async (x_handle) => {
    try {
      await api.post(`feeds/${x_handle}/remove/`)
      setHandles(prev => prev.filter(h => h.x_handle !== x_handle))
    } catch {
      // ignore
    }
  }

  return (
    // Escape Dashboard's p-6 wrapper so we can go edge-to-edge
    <div className="-mx-6 -my-6 flex flex-col bg-gray-50" style={{ height: '100vh' }}>
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-gray-800">⚡ Feeds</span>
          <span className="text-xs text-gray-400 hidden sm:block">FIFA World Cup 2026 Intelligence</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-300">Auto-refresh · 60s per column</span>
          {handles.length > 0 && (
            <span className="text-[11px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
              {handles.length} feeds
            </span>
          )}
        </div>
      </div>

      {/* Columns area */}
      <div className="flex-1 flex overflow-x-auto overflow-y-hidden">
        {loading && (
          <div className="flex items-center justify-center w-full">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && handles.map(h => (
          <FeedColumn
            key={h.x_handle}
            handle={h}
            onRemove={handleRemove}
            onViewPost={setSelectedArticle}
            onCoworkReady={setCoworkData}
          />
        ))}

        {!loading && handles.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
            <div className="text-4xl mb-4">📡</div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">No feeds yet</h2>
            <p className="text-sm text-gray-400 max-w-xs">
              Add an X/Twitter handle to start monitoring it. Celery will poll it every 5 minutes and fact-check each tweet with Gemini.
            </p>
          </div>
        )}

        <AddFeedColumn onAdd={handleAdd} />
      </div>

      {selectedArticle && (
        <TweetModal article={selectedArticle} onClose={() => setSelectedArticle(null)} />
      )}
      {coworkData && (
        <CoworkHandoffModal data={coworkData} onClose={() => setCoworkData(null)} />
      )}
    </div>
  )
}
