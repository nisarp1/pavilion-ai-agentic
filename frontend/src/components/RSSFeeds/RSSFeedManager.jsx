import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  fetchRSSFeeds,
  createRSSFeed,
  updateRSSFeed,
  deleteRSSFeed,
  fetchRSSFeed,
  fetchAllRSSFeeds,
  clearError,
} from '../../store/slices/rssSlice'
import { FiPlus, FiTrash2, FiRefreshCw, FiCheck, FiX, FiPlay } from 'react-icons/fi'

function RSSFeedManager() {
  const dispatch = useDispatch()
  const { feeds, loading, error, fetching } = useSelector((state) => state.rss)
  const [feedInputs, setFeedInputs] = useState([
    { name: '', url: '', is_active: true, fetch_interval: 60 },
  ])
  const [showAddForm, setShowAddForm] = useState(false)
  const [fetchingFeedId, setFetchingFeedId] = useState(null)

  useEffect(() => {
    dispatch(fetchRSSFeeds())
  }, [dispatch])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        dispatch(clearError())
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, dispatch])

  const handleAddInput = () => {
    setFeedInputs([
      ...feedInputs,
      { name: '', url: '', is_active: true, fetch_interval: 60 },
    ])
  }

  const handleRemoveInput = (index) => {
    if (feedInputs.length > 1) {
      setFeedInputs(feedInputs.filter((_, i) => i !== index))
    }
  }

  const handleInputChange = (index, field, value) => {
    const newInputs = [...feedInputs]
    if (field === 'is_active') {
      newInputs[index][field] = !newInputs[index][field]
    } else if (field === 'fetch_interval') {
      newInputs[index][field] = parseInt(value) || 60
    } else {
      newInputs[index][field] = value
    }
    setFeedInputs(newInputs)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validate inputs
    const validInputs = feedInputs.filter(
      (input) => input.name.trim() && input.url.trim()
    )

    if (validInputs.length === 0) {
      alert('Please add at least one valid feed with name and URL')
      return
    }

    // Create feeds one by one
    const results = []
    for (const input of validInputs) {
      try {
        const result = await dispatch(createRSSFeed(input))
        if (createRSSFeed.fulfilled.match(result)) {
          results.push(result.payload)
        } else {
          alert(`Error adding feed "${input.name}": ${result.payload?.error || result.payload?.url?.[0] || 'Unknown error'}`)
        }
      } catch (err) {
        alert(`Error adding feed "${input.name}": ${err.message}`)
      }
    }

    if (results.length > 0) {
      // Reset form
      setFeedInputs([{ name: '', url: '', is_active: true, fetch_interval: 60 }])
      setShowAddForm(false)
      // Refresh feeds list
      dispatch(fetchRSSFeeds())
      alert(`Successfully added ${results.length} feed(s)!`)
    }
  }

  const handleDeleteFeed = async (feedId, feedName) => {
    if (window.confirm(`Are you sure you want to delete "${feedName}"?`)) {
      await dispatch(deleteRSSFeed(feedId))
      dispatch(fetchRSSFeeds())
    }
  }

  const handleFetchFeed = async (feedId) => {
    setFetchingFeedId(feedId)
    try {
      const result = await dispatch(fetchRSSFeed(feedId))
      if (fetchRSSFeed.fulfilled.match(result)) {
        alert(
          `Feed fetched successfully! ${result.payload.articles_created || 0} article(s) created.`
        )
      } else {
        alert(`Error fetching feed: ${result.payload?.error || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Error fetching feed: ${err.message}`)
    } finally {
      setFetchingFeedId(null)
    }
  }

  const handleFetchAll = async () => {
    try {
      const result = await dispatch(fetchAllRSSFeeds())
      if (fetchAllRSSFeeds.fulfilled.match(result)) {
        alert(
          `All feeds fetched successfully! ${result.payload.articles_created || 0} article(s) created.`
        )
      } else {
        alert(`Error fetching feeds: ${result.payload?.error || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Error fetching feeds: ${err.message}`)
    }
  }

  const toggleFeedActive = async (feed) => {
    await dispatch(
      updateRSSFeed({
        id: feed.id,
        data: { is_active: !feed.is_active },
      })
    )
    dispatch(fetchRSSFeeds())
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">RSS Feeds</h1>
          <p className="text-gray-600 mt-1">Manage your RSS feed sources</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleFetchAll}
            disabled={fetching}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiRefreshCw className={fetching ? 'animate-spin' : ''} />
            Fetch All Feeds
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <FiPlus />
            Add Feed(s)
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error?.error || error?.url?.[0] || error?.message || 'An error occurred'}
        </div>
      )}

      {showAddForm && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Add New RSS Feeds</h2>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              {feedInputs.map((input, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-4 items-start p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="col-span-12 md:col-span-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Feed Name *
                    </label>
                    <input
                      type="text"
                      value={input.name}
                      onChange={(e) => handleInputChange(index, 'name', e.target.value)}
                      placeholder="e.g., BBC News"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div className="col-span-12 md:col-span-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      RSS URL *
                    </label>
                    <input
                      type="url"
                      value={input.url}
                      onChange={(e) => handleInputChange(index, 'url', e.target.value)}
                      placeholder="https://feeds.bbci.co.uk/news/rss.xml"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div className="col-span-12 md:col-span-2 flex items-end gap-2">
                    {feedInputs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveInput(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove this feed"
                      >
                        <FiTrash2 />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleAddInput}
                      className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Add another feed"
                    >
                      <FiPlus />
                    </button>
                  </div>
                  <div className="col-span-12 grid grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={input.is_active}
                          onChange={(e) => handleInputChange(index, 'is_active', e.target.checked)}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">Active</span>
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Fetch Interval (minutes)
                      </label>
                      <input
                        type="number"
                        value={input.fetch_interval}
                        onChange={(e) => handleInputChange(index, 'fetch_interval', e.target.value)}
                        min="1"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Adding...' : 'Add Feed(s)'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false)
                  setFeedInputs([{ name: '', url: '', is_active: true, fetch_interval: 60 }])
                }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Existing Feeds</h2>
        </div>
        {loading && feeds.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Loading feeds...</div>
        ) : feeds.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No RSS feeds found. Add your first feed above!
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className="px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{feed.name}</h3>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          feed.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {feed.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2 break-all">{feed.url}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>Articles: {feed.articles_count || 0}</span>
                      <span>Interval: {feed.fetch_interval} min</span>
                      {feed.last_fetched_at && (
                        <span>
                          Last fetched: {new Date(feed.last_fetched_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => toggleFeedActive(feed)}
                      className={`p-2 rounded-lg transition-colors ${
                        feed.is_active
                          ? 'text-green-600 hover:bg-green-50'
                          : 'text-gray-400 hover:bg-gray-100'
                      }`}
                      title={feed.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {feed.is_active ? <FiCheck /> : <FiX />}
                    </button>
                    <button
                      onClick={() => handleFetchFeed(feed.id)}
                      disabled={fetchingFeedId === feed.id || fetching}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Fetch articles from this feed"
                    >
                      <FiPlay className={fetchingFeedId === feed.id ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={() => handleDeleteFeed(feed.id, feed.name)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete feed"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default RSSFeedManager

