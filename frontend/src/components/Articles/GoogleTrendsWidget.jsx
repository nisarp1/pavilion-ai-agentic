import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchRealtimeTrends, fetchTwitterTrends } from '../../store/slices/trendsSlice'
import { FiTrendingUp, FiRefreshCw, FiExternalLink, FiPlusCircle, FiCheckCircle } from 'react-icons/fi'
import api from '../../services/api'

function GoogleTrendsWidget({ onArticleCreated }) {
  const dispatch = useDispatch()
  const {
    trendingTopics,
    twitterTrendingTopics,
    loading,
    twitterLoading,
    error,
    twitterError,
    lastUpdated,
    twitterLastUpdated
  } = useSelector((state) => state.trends)
  const [activeTab, setActiveTab] = useState('google') // 'google' or 'twitter'
  const [fetchingTopic, setFetchingTopic] = useState(null)
  const [fetchSuccess, setFetchSuccess] = useState(null)

  useEffect(() => {
    // Fetch Google trends on mount
    dispatch(fetchRealtimeTrends())
    // Fetch Twitter trends on mount
    dispatch(fetchTwitterTrends())

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      dispatch(fetchRealtimeTrends())
      dispatch(fetchTwitterTrends())
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [dispatch])

  const handleRefresh = () => {
    if (activeTab === 'google') {
      dispatch(fetchRealtimeTrends())
    } else {
      dispatch(fetchTwitterTrends())
    }
  }

  const handleTopicClick = async (topic) => {
    if (fetchingTopic) return

    setFetchingTopic(topic)
    setFetchSuccess(null)

    try {
      const response = await api.post('/rss/feeds/fetch-topic-articles/', { topic })
      if (response.data.success) {
        setFetchSuccess(topic)
        // Trigger article list refresh
        if (onArticleCreated) {
          onArticleCreated()
        }
        // Clear success message after 3 seconds
        setTimeout(() => setFetchSuccess(null), 3000)
      } else {
        // Handle case where API returns 200 but explicitly says success: false
        const errorMsg = response.data.error || "Failed to fetch articles (Unknown error)."
        alert(errorMsg)
      }
    } catch (err) {
      console.error("Error fetching articles for topic:", err)
      const errorMsg = err.response?.data?.error || "Failed to fetch articles for this topic."
      alert(errorMsg)
    } finally {
      setFetchingTopic(null)
    }
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Just now'
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    return date.toLocaleString()
  }

  const currentTopics = activeTab === 'google' ? trendingTopics : twitterTrendingTopics
  const currentLoading = activeTab === 'google' ? loading : twitterLoading
  const currentError = activeTab === 'google' ? error : twitterError
  const currentLastUpdated = activeTab === 'google' ? lastUpdated : twitterLastUpdated

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-md border border-blue-200 mb-6">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <FiTrendingUp className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Trends - Real Time</h2>
              <p className="text-sm text-gray-600">
                {activeTab === 'google' ? 'Current trending sports topics' : 'Twitter trends for sports in India'}
                {currentLastUpdated && (
                  <span className="ml-2 text-gray-500">• Updated {formatTime(currentLastUpdated)}</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={currentLoading}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiRefreshCw className={currentLoading ? 'animate-spin' : ''} size={16} />
            {currentLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-4 border-b border-blue-200">
          <div className="flex gap-4 -mb-px">
            <button
              onClick={() => setActiveTab('google')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'google'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Google Trends
            </button>
            <button
              onClick={() => setActiveTab('twitter')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'twitter'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Twitter Trends (Sports India)
            </button>
          </div>
        </div>

        {currentError && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
            <p className="font-medium mb-1">
              Note: {activeTab === 'google' ? 'Google Trends API unavailable' : 'Twitter Trends API unavailable'}
            </p>
            <p className="text-xs">Showing fallback trending topics</p>
          </div>
        )}

        {currentLoading && currentTopics.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <FiRefreshCw className="animate-spin text-blue-600" size={32} />
          </div>
        ) : currentTopics.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FiTrendingUp size={48} className="mx-auto mb-3 text-gray-300" />
            <p>No trending topics available at the moment</p>
            <p className="text-xs mt-2">Try refreshing or check back later</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {currentTopics.map((topic, index) => (
              <div
                key={index}
                onClick={() => handleTopicClick(topic)}
                className={`bg-white rounded-lg border border-gray-200 p-4 transition-all relative ${fetchingTopic === topic ? 'opacity-70 cursor-wait' : 'hover:shadow-md cursor-pointer hover:border-blue-300'
                  }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${activeTab === 'google'
                        ? 'text-blue-600 bg-blue-100'
                        : 'text-sky-600 bg-sky-100'
                        }`}>
                        #{index + 1}
                      </span>
                      <span className="text-xs text-gray-500">Trending</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">{topic}</h3>

                    {fetchSuccess === topic && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-center">
                        <div className="flex items-center justify-center gap-1 text-green-700 text-sm font-medium">
                          <FiCheckCircle size={16} />
                          <span>Success!</span>
                        </div>
                        <p className="text-green-600 text-xs mt-1">Articles added to list below.</p>
                      </div>
                    )}

                    {(fetchingTopic === topic) && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-center">
                        <div className="flex items-center justify-center gap-1 text-blue-700 text-sm font-medium">
                          <FiRefreshCw className="animate-spin" size={16} />
                          <span>Fetching...</span>
                        </div>
                        <p className="text-blue-600 text-xs mt-1">Searching Google News...</p>
                      </div>
                    )}

                  </div>

                  <div className="flex flex-col items-center gap-2">
                    {activeTab === 'google' ? (
                      <a
                        href={`https://trends.google.com/trends/explore?q=${encodeURIComponent(topic)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-600 hover:text-blue-700 flex-shrink-0 p-1 hover:bg-blue-50 rounded"
                        title="View on Google Trends"
                      >
                        <FiExternalLink size={16} />
                      </a>
                    ) : (
                      <a
                        href={`https://twitter.com/search?q=${encodeURIComponent(topic)}&src=trend_click`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-sky-600 hover:text-sky-700 flex-shrink-0 p-1 hover:bg-sky-50 rounded"
                        title="View on Twitter"
                      >
                        <FiExternalLink size={16} />
                      </a>
                    )}

                    <button
                      className="text-gray-400 hover:text-green-600 p-1 hover:bg-green-50 rounded transition-colors"
                      title="Fetch articles for this topic"
                    >
                      <FiPlusCircle size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {currentTopics.length > 0 && (
          <div className="mt-4 pt-4 border-t border-blue-200 text-center">
            {activeTab === 'google' ? (
              <a
                href="https://trends.google.com/trends/trendingsearches/daily"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                View all trending searches on Google Trends
                <FiExternalLink size={14} />
              </a>
            ) : (
              <a
                href="https://twitter.com/explore/tabs/trending"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-sky-600 hover:text-sky-700 inline-flex items-center gap-1"
              >
                View all trending topics on Twitter
                <FiExternalLink size={14} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default GoogleTrendsWidget

