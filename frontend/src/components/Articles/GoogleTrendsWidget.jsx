import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchAgenticTrends, fetchTwitterTrends, fetchGoogleTrendingNow, trackTrendClick } from '../../store/slices/trendsSlice'
import { FiTrendingUp, FiRefreshCw, FiExternalLink, FiPlusCircle, FiCheckCircle, FiChevronDown, FiChevronUp } from 'react-icons/fi'
import api from '../../services/api'
import { showSuccess, showError } from '../../utils/toast'

const SPORT_EMOJI = {
  cricket: '🏏',
  football: '⚽',
  kabaddi: '🤼',
  tennis: '🎾',
  hockey: '🏑',
  badminton: '🏸',
  general: '📰',
}

const HEAT_COLOR = (score) => {
  if (score >= 75) return 'bg-red-100 text-red-700 border-red-200'
  if (score >= 50) return 'bg-orange-100 text-orange-700 border-orange-200'
  if (score >= 25) return 'bg-yellow-100 text-yellow-700 border-yellow-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function EnrichedTrendCard({ trend, index, onTopicClick, fetchingTopic, fetchSuccess, dispatch }) {
  const [expanded, setExpanded] = useState(false)
  const topic = trend.topic || trend
  const isString = typeof trend === 'string'
  const heat = isString ? null : trend.heat_score
  const sport = isString ? 'general' : (trend.sport || 'general')
  const isBreaking = !isString && trend.is_breaking
  const articles = isString ? [] : (trend.articles || [])
  const summary = isString ? '' : (trend.summary || trend.reason || '')
  const reason = isString ? '' : (trend.reason || '')
  const entities = isString ? [] : (trend.entities || [])
  const rank = isString ? index + 1 : (trend.rank || index + 1)
  const velocity = isString ? 0 : (trend.velocity || 0)
  const aiConfidence = isString ? null : trend.ai_confidence
  const editorialAngle = isString ? '' : (trend.editorial_angle || '')

  const confidenceColor = aiConfidence == null ? '' :
    aiConfidence >= 0.7 ? 'bg-green-400' :
    aiConfidence >= 0.4 ? 'bg-yellow-400' : 'bg-red-400'

  const handleExpand = (e) => {
    e.stopPropagation()
    if (!expanded && dispatch) dispatch(trackTrendClick(topic))
    setExpanded(v => !v)
  }

  return (
    <div
      className={`bg-white rounded-xl border transition-all relative ${
        fetchingTopic === topic ? 'opacity-70 cursor-wait border-blue-200' : 'hover:shadow-md cursor-pointer hover:border-blue-300 border-gray-200'
      }`}
    >
      {/* Main card body */}
      <div className="p-4" onClick={() => onTopicClick(trend)}>
        {/* Top row: rank + badges */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              #{rank}
            </span>

            {/* Velocity badge */}
            {velocity > 0 && (
              <span className="text-xs text-green-600 font-bold">↑{velocity}</span>
            )}
            {velocity < 0 && (
              <span className="text-xs text-red-400 font-bold">↓{Math.abs(velocity)}</span>
            )}
            {velocity === 0 && !isString && (
              <span className="text-xs text-gray-300">–</span>
            )}

            {sport && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                {SPORT_EMOJI[sport] || '📰'} {sport}
              </span>
            )}

            {isBreaking && (
              <span className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
                BREAKING
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* AI confidence dot */}
            {confidenceColor && (
              <span
                className={`inline-block w-2 h-2 rounded-full ${confidenceColor} flex-shrink-0`}
                title={`AI confidence: ${Math.round((aiConfidence || 0) * 100)}%`}
              />
            )}
            {heat !== null && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${HEAT_COLOR(heat)}`}>
                🔥 {Math.round(heat)}
              </span>
            )}
          </div>
        </div>

        {/* Topic title */}
        <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-2">{topic}</h3>

        {/* Collapsed preview: reason (1-sentence) */}
        {reason && !expanded && (
          <p className="text-xs text-gray-500 leading-snug line-clamp-1 mb-1">{reason}</p>
        )}

        {/* Article source count */}
        {articles.length > 0 && (
          <p className="text-xs text-gray-400">
            📰 {articles.length} source{articles.length !== 1 ? 's' : ''}
            {entities.length > 0 && (
              <span className="ml-2 text-gray-300">• {entities.slice(0, 2).join(', ')}</span>
            )}
          </p>
        )}

        {/* Fetching/success states */}
        {fetchSuccess === topic && (
          <div className="mt-2 flex items-center gap-1 text-green-700 text-xs font-medium">
            <FiCheckCircle size={13} />
            Articles added to list!
          </div>
        )}
        {fetchingTopic === topic && (
          <div className="mt-2 flex items-center gap-1 text-blue-700 text-xs font-medium">
            <FiRefreshCw className="animate-spin" size={13} />
            Fetching articles…
          </div>
        )}
      </div>

      {/* Expandable summary + article links */}
      {(summary || articles.length > 0) && (
        <>
          <div
            className="px-4 pb-2 flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 cursor-pointer border-t border-gray-50"
            onClick={handleExpand}
          >
            {expanded ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
            {expanded ? 'Hide details' : 'Show details'}
          </div>

          {expanded && (
            <div className="px-4 pb-4 space-y-2" onClick={(e) => e.stopPropagation()}>
              {/* Full summary (2-3 sentences) in expanded view */}
              {summary && (
                <p className="text-xs text-gray-600 leading-relaxed">{summary}</p>
              )}
              {articles.slice(0, 3).map((art, i) => (
                <a
                  key={i}
                  href={art.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline leading-snug"
                >
                  <FiExternalLink size={11} className="mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{art.title}</span>
                </a>
              ))}
              {editorialAngle && (
                <div className="mt-1 text-xs text-indigo-700 italic border-l-2 border-indigo-300 pl-2">
                  📝 {editorialAngle}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Fetch articles button (top-right) */}
      <button
        className="absolute top-3 right-3 text-gray-300 hover:text-green-600 p-1 hover:bg-green-50 rounded transition-colors"
        title="Fetch articles for this topic"
        onClick={(e) => { e.stopPropagation(); onTopicClick(trend) }}
      >
        <FiPlusCircle size={15} />
      </button>
    </div>
  )
}

function GoogleTrendCard({ item, onTopicClick, fetchingTopic, fetchSuccess }) {
  const [expanded, setExpanded] = useState(false)
  const topic = item.topic || item._original_title || ''
  const articles = item._articles || []
  const traffic = item.search_volume || ''
  const isBreaking = item.is_breaking || false
  const picture = item._picture || ''
  const sport = item.sport || 'general'

  const trafficColor =
    traffic.startsWith('100000') ? 'bg-red-100 text-red-700' :
    traffic.startsWith('50000')  ? 'bg-orange-100 text-orange-700' :
    traffic.startsWith('10000')  ? 'bg-yellow-100 text-yellow-700' :
    'bg-gray-100 text-gray-600'

  return (
    <div className={`bg-white rounded-xl border transition-all relative ${
      fetchingTopic === topic ? 'opacity-70 cursor-wait border-blue-200' : 'hover:shadow-md cursor-pointer hover:border-blue-300 border-gray-200'
    }`}>
      <div className="p-4" onClick={() => onTopicClick(item)}>
        <div className="flex gap-3">
          {picture && (
            <img src={picture} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100" onError={e => e.target.style.display='none'} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {isBreaking && (
                <span className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
                  BREAKING
                </span>
              )}
              {sport !== 'general' && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {SPORT_EMOJI[sport] || '📰'} {sport}
                </span>
              )}
              {traffic && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${trafficColor}`}>
                  🔍 {traffic}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-gray-900 text-sm leading-snug">{topic}</h3>
          </div>
        </div>

        {fetchSuccess === topic && (
          <div className="mt-2 flex items-center gap-1 text-green-700 text-xs font-medium">
            <FiCheckCircle size={13} /> Articles added!
          </div>
        )}
        {fetchingTopic === topic && (
          <div className="mt-2 flex items-center gap-1 text-blue-700 text-xs font-medium">
            <FiRefreshCw className="animate-spin" size={13} /> Fetching…
          </div>
        )}
      </div>

      {articles.length > 0 && (
        <>
          <div
            className="px-4 pb-2 flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 cursor-pointer border-t border-gray-50"
            onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          >
            {expanded ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
            {expanded ? 'Hide news' : `${articles.length} news item${articles.length > 1 ? 's' : ''}`}
          </div>
          {expanded && (
            <div className="px-4 pb-4 space-y-1.5" onClick={e => e.stopPropagation()}>
              {articles.map((art, i) => (
                <a key={i} href={art.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-1 text-xs text-blue-600 hover:underline leading-snug">
                  <FiExternalLink size={11} className="mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{art.title}</span>
                </a>
              ))}
            </div>
          )}
        </>
      )}

      <button
        className="absolute top-3 right-3 text-gray-300 hover:text-green-600 p-1 hover:bg-green-50 rounded transition-colors"
        title="Fetch articles for this topic"
        onClick={e => { e.stopPropagation(); onTopicClick(item) }}
      >
        <FiPlusCircle size={15} />
      </button>
    </div>
  )
}

function GoogleTrendsWidget({ onArticleCreated }) {
  const dispatch = useDispatch()
  const {
    trendingTopics,
    enrichedTrends,
    twitterTrendingTopics,
    twitterEnrichedTrends,
    googleTrendingItems,
    agenticLoading,
    twitterLoading,
    googleTrendingLoading,
    agenticError,
    twitterError,
    googleTrendingError,
    agenticLastUpdated,
    twitterLastUpdated,
    googleTrendingLastUpdated,
    cached,
    rssOnly,
  } = useSelector((state) => state.trends)

  const [activeTab, setActiveTab] = useState('google')
  const [fetchingTopic, setFetchingTopic] = useState(null)
  const [fetchSuccess, setFetchSuccess] = useState(null)

  useEffect(() => {
    dispatch(fetchAgenticTrends())
    dispatch(fetchTwitterTrends())
    dispatch(fetchGoogleTrendingNow())
    const interval = setInterval(() => {
      dispatch(fetchAgenticTrends())
      dispatch(fetchTwitterTrends())
      dispatch(fetchGoogleTrendingNow())
    }, 3 * 60 * 1000)
    return () => clearInterval(interval)
  }, [dispatch])

  // When enrichment is pending, poll every 15s until Gemini enrichment is ready
  useEffect(() => {
    if (!rssOnly) return
    const pollTimer = setTimeout(() => {
      dispatch(fetchAgenticTrends())
    }, 15000)
    return () => clearTimeout(pollTimer)
  }, [rssOnly, agenticLastUpdated, dispatch])

  const handleRefresh = () => {
    if (activeTab === 'google') dispatch(fetchAgenticTrends({ forceRefresh: true }))
    else if (activeTab === 'twitter') dispatch(fetchTwitterTrends())
    else dispatch(fetchGoogleTrendingNow())
  }

  const handleTopicClick = async (trendItem) => {
    const topic = typeof trendItem === 'string' ? trendItem : (trendItem?.topic || trendItem)
    if (fetchingTopic) return
    dispatch(trackTrendClick(topic))
    setFetchingTopic(topic)
    setFetchSuccess(null)

    const enrichedData = trendItem && typeof trendItem === 'object' ? {
      articles: trendItem.articles || trendItem._articles || [],
      reason: trendItem.reason || '',
      summary: trendItem.summary || '',
      entities: trendItem.entities || trendItem._entities || [],
      editorial_angle: trendItem.editorial_angle || '',
      sport: trendItem.sport || 'general',
    } : null

    try {
      const response = await api.post('/rss/feeds/fetch-topic-articles/', {
        topic,
        enriched_data: enrichedData,
      })
      if (response.data.success) {
        setFetchSuccess(topic)
        showSuccess(`Article generated for "${topic}" — check the Generated tab`)
        if (onArticleCreated) onArticleCreated()
        setTimeout(() => setFetchSuccess(null), 3000)
      } else {
        showError(response.data.error || 'Failed to fetch articles.')
      }
    } catch (err) {
      showError(err.response?.data?.error?.message || response?.data?.detail || 'Failed to fetch articles for this topic.')
    } finally {
      setFetchingTopic(null)
    }
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Just now'
    const diffMins = Math.floor((Date.now() - new Date(timestamp)) / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return new Date(timestamp).toLocaleString()
  }

  const isGoogleTab = activeTab === 'google_trends'
  const enriched = activeTab === 'google' ? enrichedTrends : twitterEnrichedTrends
  const flatTopics = activeTab === 'google' ? trendingTopics : twitterTrendingTopics
  const displayItems = isGoogleTab ? googleTrendingItems : (enriched.length > 0 ? enriched : flatTopics)
  const currentLoading = isGoogleTab ? googleTrendingLoading : (activeTab === 'google' ? agenticLoading : twitterLoading)
  const currentError = isGoogleTab ? googleTrendingError : (activeTab === 'google' ? agenticError : twitterError)
  const currentLastUpdated = isGoogleTab ? googleTrendingLastUpdated : (activeTab === 'google' ? agenticLastUpdated : twitterLastUpdated)
  const isEnriched = !isGoogleTab && enriched.length > 0

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-md border border-blue-200 mb-6">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <FiTrendingUp className="text-white" size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-800">Live Trends</h2>
                {isEnriched && !rssOnly ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 font-medium">
                    ✦ AI Powered
                  </span>
                ) : rssOnly ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium flex items-center gap-1">
                    <FiRefreshCw size={10} className="animate-spin" />
                    AI Enriching…
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-gray-500">
                Live · {currentLastUpdated ? `enriched ${formatTime(currentLastUpdated)}` : 'loading…'}
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={currentLoading}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            <FiRefreshCw className={currentLoading ? 'animate-spin' : ''} size={14} />
            {currentLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-4 border-b border-blue-200">
          <div className="flex gap-4 -mb-px">
            {[
              { key: 'google', label: 'Agentic Trends' },
              { key: 'twitter', label: 'Sports India' },
              { key: 'google_trends', label: '🔥 Google Trending' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error notice */}
        {currentError && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
            Trend data temporarily unavailable — showing cached or fallback topics.
          </div>
        )}

        {/* Content */}
        {currentLoading && displayItems.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <FiRefreshCw className="animate-spin text-blue-600" size={28} />
          </div>
        ) : displayItems.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <FiTrendingUp size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm">No trending topics available right now</p>
            <p className="text-xs mt-1 text-gray-400">Try refreshing or check back in a few minutes</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayItems.map((item, i) => (
              isGoogleTab ? (
                <GoogleTrendCard
                  key={i}
                  item={item}
                  onTopicClick={handleTopicClick}
                  fetchingTopic={fetchingTopic}
                  fetchSuccess={fetchSuccess}
                />
              ) : (
                <EnrichedTrendCard
                  key={i}
                  trend={item}
                  index={i}
                  onTopicClick={handleTopicClick}
                  fetchingTopic={fetchingTopic}
                  fetchSuccess={fetchSuccess}
                  dispatch={dispatch}
                />
              )
            ))}
          </div>
        )}

        {displayItems.length > 0 && (
          <div className="mt-4 pt-4 border-t border-blue-100 text-center">
            <a
              href={isGoogleTab
                ? 'https://trends.google.com/trending?geo=IN&category=17&hours=24&status=active&sort=recency'
                : 'https://trends.google.com/trends/trendingsearches/daily?geo=IN'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:text-blue-700 inline-flex items-center gap-1"
            >
              {isGoogleTab ? 'View on Google Trends India Sports' : 'View all on Google Trends'}
              <FiExternalLink size={12} />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default GoogleTrendsWidget
