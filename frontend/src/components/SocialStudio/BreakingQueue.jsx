import { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'

const POLL_MS = 90_000

const VERDICT_STYLES = {
  CONFIRMED:    'bg-green-100 text-green-700 border-green-200',
  UNCONFIRMED:  'bg-yellow-100 text-yellow-700 border-yellow-200',
  CONTRADICTED: 'bg-red-100 text-red-700 border-red-200',
  PENDING:      'bg-gray-100 text-gray-500 border-gray-200',
}
const VERDICT_ICONS = {
  CONFIRMED: '✅', UNCONFIRMED: '⚠️', CONTRADICTED: '❌', PENDING: '⏳',
}

function cleanTitle(raw) {
  if (!raw) return ''
  return raw.replace(/https?:\/\/t\.co\/\S+/g, '').trim()
}

function flames(score) {
  if (score > 5000) return '🔥🔥🔥'
  if (score > 1000) return '🔥🔥'
  if (score > 0)    return '🔥'
  return ''
}

function tractionTooltip(article) {
  const rt = article.retweet_count || 0
  const fav = article.favorite_count || 0
  const rep = article.reply_count || 0
  const score = article.traction_score || 0
  if (rt === 0 && fav === 0 && rep === 0) {
    return `Traction score: ${score.toLocaleString()}`
  }
  return `Traction = (Retweets × 3) + Likes + Replies = (${rt} × 3) + ${fav} + ${rep} = ${score.toLocaleString()}`
}

const TABS = [
  { id: 'all',      label: 'All' },
  { id: 'trending', label: '📈 Trending' },
  { id: 'football', label: '⚽ Football' },
  { id: 'cricket',  label: '🏏 Cricket' },
]

// ── DNA Packet Modal ──────────────────────────────────────────────────────────
function CoworkModal({ data, onClose }) {
  const [copied, setCopied] = useState(false)

  const copyPrompt = async () => {
    const text = data.cowork_prompt || ''
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for HTTP (non-secure) contexts where clipboard API is blocked
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-orange-500 to-red-500">
          <div>
            <h2 className="text-white font-bold text-lg">⚡ Cowork DNA Packet</h2>
            <p className="text-orange-100 text-sm capitalize">
              {data.event_type} · {data.source_handle}
              {data.fact_check && (
                <span className="ml-2 opacity-80">
                  · {VERDICT_ICONS[data.fact_check.verdict]} {data.fact_check.verdict} ({data.fact_check.confidence}%)
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-white hover:text-orange-200 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Template</p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700 font-mono">
              {data.template?.design_name} <span className="text-gray-400">({data.template?.design_id})</span>
            </div>
          </div>

          {data.template?.slots && Object.keys(data.template.slots).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Slots to fill</p>
              <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1">
                {Object.entries(data.template.slots).map(([eid, val]) => (
                  <div key={eid} className="text-sm">
                    <span className="font-mono text-gray-400 text-xs">{eid}: </span>
                    <span className="text-gray-800">{val || <span className="italic text-gray-400">—</span>}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Caption Draft</p>
            <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {data.caption_draft || '—'}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cowork Prompt</p>
              <button onClick={copyPrompt} className="text-xs text-blue-600 hover:underline">
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <pre className="bg-gray-900 text-green-300 rounded-lg px-4 py-3 text-xs overflow-x-auto whitespace-pre-wrap font-mono">
              {data.cowork_prompt}
            </pre>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Close</button>
          <button
            onClick={copyPrompt}
            className="px-5 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium"
          >
            {copied ? '✓ Copied!' : '📋 Copy Prompt'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Article Card ──────────────────────────────────────────────────────────────
function ArticleCard({ article, onGenerate, generating, onToggleBreaking }) {
  const fc = article.fact_check
  const verdictStyle = VERDICT_STYLES[fc?.verdict] || VERDICT_STYLES.PENDING
  const verdictIcon  = VERDICT_ICONS[fc?.verdict]  || '⏳'
  const isBreaking   = article.urgency === 'breaking'
  const flameStr     = flames(article.traction_score)
  const hasEngagement = (article.retweet_count || 0) > 0
                     || (article.favorite_count || 0) > 0
                     || (article.reply_count || 0) > 0

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow px-5 py-4 flex gap-4">
      {/* Left */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {/* Fact-check badge */}
          {fc ? (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${verdictStyle}`}>
              {verdictIcon} {fc.verdict}
              {fc.confidence > 0 && <span className="opacity-70">· {fc.confidence}%</span>}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border bg-gray-100 text-gray-400 border-gray-200">
              ⏳ PENDING
            </span>
          )}

          {/* Manual BREAKING toggle */}
          <button
            onClick={() => onToggleBreaking(article)}
            title={isBreaking ? 'Click to unmark as Breaking' : 'Click to mark as Breaking'}
            className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border transition-colors ${
              isBreaking
                ? 'bg-red-500 text-white border-red-500 hover:bg-red-600'
                : 'bg-white text-gray-400 border-gray-200 hover:border-red-300 hover:text-red-400'
            }`}
          >
            🔴 BREAKING
          </button>

          {/* Flame indicator with tooltip */}
          {flameStr && (
            <span
              className="text-sm cursor-help relative group"
              title={tractionTooltip(article)}
            >
              {flameStr}
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-xs
                               bg-gray-900 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100
                               transition-opacity whitespace-nowrap z-10 shadow-lg">
                {tractionTooltip(article)}
              </span>
            </span>
          )}

          {/* Traction number */}
          {article.traction_score > 0 && (
            <span className="text-xs text-gray-400 font-mono">
              {article.traction_score.toLocaleString()}
            </span>
          )}
        </div>

        {/* Headline */}
        {(() => {
          const clean = cleanTitle(article.title)
          if (clean.length >= 10) {
            return <p className="text-sm text-gray-800 leading-snug line-clamp-3 mb-2">{clean}</p>
          }
          return (
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-500 hover:underline mb-2 inline-block"
            >
              View tweet →
            </a>
          )
        })()}

        {/* Engagement breakdown */}
        {hasEngagement && (
          <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
            <span title="Retweets">🔁 {(article.retweet_count || 0).toLocaleString()}</span>
            <span>·</span>
            <span title="Likes">❤️ {(article.favorite_count || 0).toLocaleString()}</span>
            <span>·</span>
            <span title="Replies">💬 {(article.reply_count || 0).toLocaleString()}</span>
          </div>
        )}

        {/* Source + time */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="font-medium text-gray-500">{article.source_handle || article.source_feed}</span>
          <span>·</span>
          <span>{article.time_ago}</span>
          {article.source_url && (
            <>
              <span>·</span>
              <a
                href={article.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-500 underline"
              >
                source ↗
              </a>
            </>
          )}
        </div>
      </div>

      {/* Right: Generate button */}
      <div className="flex-shrink-0 flex items-center">
        <button
          onClick={() => onGenerate(article)}
          disabled={generating === article.id}
          className={`
            flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
            ${generating === article.id
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-sm hover:shadow-md'
            }
          `}
        >
          {generating === article.id ? (
            <><span className="animate-spin inline-block">⏳</span> Generating…</>
          ) : (
            <>⚡ Generate Post</>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BreakingQueue() {
  const [articles, setArticles]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [activeTab, setActiveTab]   = useState('all')
  const [generating, setGenerating] = useState(null)
  const [coworkData, setCoworkData] = useState(null)

  const fetchQueue = useCallback(async (tab) => {
    try {
      const params = {}
      if (tab === 'football') params.sport = 'football'
      if (tab === 'cricket')  params.sport = 'cricket'
      const res = await api.get('/breaking-queue/', { params })
      let results = res.data.results || []
      if (tab === 'trending') {
        results = results.filter(a => (a.traction_score || 0) > 1000)
      }
      setArticles(results)
      setError(null)
    } catch {
      setError('Failed to load breaking queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchQueue(activeTab)
    const timer = setInterval(() => fetchQueue(activeTab), POLL_MS)
    return () => clearInterval(timer)
  }, [activeTab, fetchQueue])

  const handleGenerate = async (article) => {
    setGenerating(article.id)
    try {
      const res = await api.post('/cowork/generate/', { article_id: article.id })
      setCoworkData(res.data)
    } catch {
      alert('Cowork generation failed. Check Django logs.')
    } finally {
      setGenerating(null)
    }
  }

  const handleToggleBreaking = async (article) => {
    const newUrgency = article.urgency === 'breaking' ? 'standard' : 'breaking'
    // Optimistic update
    setArticles(prev =>
      prev.map(a => a.id === article.id ? { ...a, urgency: newUrgency } : a)
    )
    try {
      await api.patch(`/breaking-queue/${article.id}/urgency/`, { urgency: newUrgency })
    } catch {
      // Revert on failure
      setArticles(prev =>
        prev.map(a => a.id === article.id ? { ...a, urgency: article.urgency } : a)
      )
      alert('Failed to update urgency.')
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">⚡ Traction Queue</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Top verified stories by traction — pick one to generate a Canva post
            </p>
          </div>
          <button
            onClick={() => { setLoading(true); fetchQueue(activeTab) }}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            Loading…
          </div>
        ) : error ? (
          <div className="text-center text-red-500 py-10">{error}</div>
        ) : articles.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-medium">No stories in queue</p>
            <p className="text-sm mt-1">Fetch more articles or switch tabs</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl mx-auto">
            {articles.map(article => (
              <ArticleCard
                key={article.id}
                article={article}
                onGenerate={handleGenerate}
                generating={generating}
                onToggleBreaking={handleToggleBreaking}
              />
            ))}
          </div>
        )}
      </div>

      {coworkData && (
        <CoworkModal data={coworkData} onClose={() => setCoworkData(null)} />
      )}
    </div>
  )
}
