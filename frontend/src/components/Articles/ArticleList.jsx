import { useEffect, useState, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useLocation } from 'react-router-dom'
import { fetchArticles, generateArticle, publishArticle, archiveArticle, deleteArticle, updateArticle, clearError, addGeneratingId, removeGeneratingId, addPublishingId, removePublishingId, fetchArticleStatus, fetchAllFeeds, fetchTrends, fetchArticle } from '../../store/slices/articleSlice'
import { showSuccess, showError } from '../../utils/toast'
import { fetchCategories } from '../../store/slices/categorySlice'
import { format } from 'date-fns'
import { FiEdit, FiPlay, FiCheck, FiArchive, FiRefreshCw, FiMoreVertical, FiEye, FiTrash2, FiClock, FiExternalLink, FiFilter, FiSearch, FiX, FiFilm, FiVideo } from 'react-icons/fi'
import GoogleTrendsWidget from './GoogleTrendsWidget'
import BulkEditModal from './BulkEditModal'
import QuickEditModal from './QuickEditModal'

function ArticleList() {
  const dispatch = useDispatch()
  const location = useLocation()
  const { items, loading, pagination, error, generatingIds = [], publishingIds = [] } = useSelector((state) => state.articles)
  const { categories = [] } = useSelector((state) => state.categories || {})
  const activePolls = useRef(new Set())
  const [activeTab, setActiveTab] = useState('published')

  // Handle category query param from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const category = params.get('category')
    if (category) {
      setActiveTab(category)
    }
  }, [location.search])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [selectedArticles, setSelectedArticles] = useState(new Set())
  const [showQuickActions, setShowQuickActions] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [quickEditArticle, setQuickEditArticle] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const searchDebounceRef = useRef(null)

  // Fetch categories on component mount
  useEffect(() => {
    dispatch(fetchCategories({ is_active: true }))
      .then((result) => {
        if (fetchCategories.fulfilled.match(result)) {
          console.log('Categories loaded:', result.payload)
        } else {
          console.error('Failed to load categories:', result.payload)
        }
      })
  }, [dispatch])

  // Resume polling for generating articles on mount
  useEffect(() => {
    if (generatingIds.length > 0) {
      generatingIds.forEach(id => {
        if (!activePolls.current.has(id)) {
          pollForCompletion(id)
        }
      })
    }
  }, [generatingIds]) // Only run when array reference changes

  // Track component mount status to stop polling on unmount
  const isMounted = useRef(true)
  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  const pollForCompletion = async (articleId) => {
    // Prevent duplicate polling
    if (activePolls.current.has(articleId)) return
    activePolls.current.add(articleId)

    let attempts = 0
    const maxAttempts = 90 // 3 minutes max (2s interval)
    let polling = true

    const checkStatus = async () => {
      // Stop if unmounted or stopped
      if (!isMounted.current || !polling || !activePolls.current.has(articleId)) return

      attempts++
      try {
        // Check article status using the status-only thunk
        // This prevents overwriting the currentArticle (editor state) if user is editing another article
        const fetchResult = await dispatch(fetchArticleStatus(articleId))
        if (fetchArticleStatus.fulfilled.match(fetchResult)) {
          const article = fetchResult.payload
          if (article.status === 'draft' || article.status === 'published') {
            polling = false
            activePolls.current.delete(articleId)
            dispatch(removeGeneratingId(articleId))
            if (isMounted.current) refreshList()
            // Ensure we update the UI immediately
            return
          }
        }
      } catch (e) {
        console.error('Polling error:', e)
      }

      if (attempts >= maxAttempts) {
        polling = false
        activePolls.current.delete(articleId)
        dispatch(removeGeneratingId(articleId))
      } else if (polling && isMounted.current) {
        // Schedule next poll only after current one finishes
        setTimeout(checkStatus, 2000)
      }
    }

    // Start polling
    checkStatus()
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, selectedCategory])

  // Debounce search input — fires query 300ms after user stops typing
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(searchDebounceRef.current)
  }, [searchInput])

  useEffect(() => {
    const params = { page: currentPage, page_size: pageSize }

    if (searchQuery) {
      params.search = searchQuery
    } else if (selectedCategory) {
      params.category = selectedCategory
    } else if (activeTab === 'all') {
      // no filter
    } else if (activeTab === 'reliable_sources' || activeTab === 'trends' || activeTab === 'subscriptions' || activeTab === 'video_project') {
      params.category = activeTab
    } else {
      params.status = activeTab
    }

    dispatch(fetchArticles(params))
      .then((result) => {
        if (fetchArticles.fulfilled.match(result)) {
          console.log('Articles fetched successfully:', result.payload)
        } else {
          console.error('Failed to fetch articles:', result.payload)
        }
      })
      .catch((error) => {
        console.error('Error fetching articles:', error)
      })
  }, [dispatch, activeTab, selectedCategory, currentPage, pageSize])

  // Auto-refresh for Reliable Sources and Trends tabs every 5 minutes
  useEffect(() => {
    if (activeTab === 'reliable_sources' || activeTab === 'trends') {
      const intervalId = setInterval(() => {
        dispatch(fetchArticles({ category: activeTab, page: currentPage, page_size: pageSize }))
      }, 5 * 60 * 1000) // 5 minutes

      return () => clearInterval(intervalId)
    }
  }, [dispatch, activeTab, currentPage, pageSize])

  const handleRefresh = async (e) => {
    e?.preventDefault()
    e?.stopPropagation()

    setRefreshing(true)
    try {
      // Build params based on selected category or active tab
      const params = { page: currentPage, page_size: pageSize }

      // Priority: selectedCategory > activeTab category > status
      if (selectedCategory) {
        params.category = selectedCategory
      } else if (activeTab === 'all') {
        // No additional filters
      } else if (activeTab === 'reliable_sources' || activeTab === 'trends' || activeTab === 'subscriptions') {
        params.category = activeTab
      } else {
        params.status = activeTab
      }

      // If on reliable_sources or trends tab, fetch new feeds first
      if (activeTab === 'reliable_sources' && !selectedCategory) {
        await dispatch(fetchAllFeeds())
        // Wait a moment for feeds to process, then refresh articles
        await new Promise(resolve => setTimeout(resolve, 1000))
      } else if (activeTab === 'trends' && !selectedCategory) {
        await dispatch(fetchTrends())
        // Wait a moment for trends to process, then refresh articles
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      await dispatch(fetchArticles(params))
    } catch (error) {
      console.error('Refresh error:', error)
      showError('Error refreshing articles: ' + (error.message || 'Unknown error'))
    } finally {
      setRefreshing(false)
    }
  }

  const handleGenerate = async (articleId) => {
    dispatch(addGeneratingId(articleId))
    try {
      const result = await dispatch(generateArticle(articleId))
      if (generateArticle.fulfilled.match(result)) {
        // Success - backend accepted the request (202 Accepted)
        // Start polling
        pollForCompletion(articleId)
      } else {
        // Still show error alerts for debugging
        console.error('Error generating article:', result.payload)
        dispatch(removeGeneratingId(articleId))
      }
    } catch (error) {
      // Still show error alerts for debugging
      console.error('Error generating article:', error)
      dispatch(removeGeneratingId(articleId))
    }
  }

  const handlePublish = async (articleId) => {
    dispatch(addPublishingId(articleId))
    try {
      await dispatch(publishArticle(articleId))
      refreshList()
    } catch (error) {
      console.error('Error publishing article:', error)
    } finally {
      dispatch(removePublishingId(articleId))
    }
  }

  const handleArchive = async (articleId) => {
    await dispatch(archiveArticle(articleId))
    refreshList()
  }

  const handleMoveToDraft = async (articleId) => {
    await dispatch(updateArticle({ id: articleId, data: { status: 'draft' } }))
    refreshList()
  }

  const refreshList = useCallback(() => {
    const params = { page: currentPage, page_size: pageSize }
    if (searchQuery) {
      params.search = searchQuery
    } else if (selectedCategory) {
      params.category = selectedCategory
    } else if (activeTab === 'all') {
      // no filter
    } else if (activeTab === 'reliable_sources' || activeTab === 'trends' || activeTab === 'subscriptions' || activeTab === 'video_project') {
      params.category = activeTab
    } else {
      params.status = activeTab
    }
    dispatch(fetchArticles(params))
  }, [dispatch, currentPage, pageSize, searchQuery, selectedCategory, activeTab])

  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value)
    setCurrentPage(1) // Reset to first page when category changes
  }

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePageSizeChange = (e) => {
    const newPageSize = parseInt(e.target.value)
    setPageSize(newPageSize)
    setCurrentPage(1) // Reset to first page when page size changes
  }

  const totalPages = pagination?.count ? Math.ceil(pagination.count / pageSize) : 1
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, pagination?.count || 0)

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedArticles(new Set(items.map(article => article.id)))
    } else {
      setSelectedArticles(new Set())
    }
  }

  const handleSelectArticle = (articleId) => {
    setSelectedArticles(prev => {
      const next = new Set(prev)
      if (next.has(articleId)) {
        next.delete(articleId)
      } else {
        next.add(articleId)
      }
      return next
    })
  }

  const getCategoryLabel = (category) => {
    const labels = {
      reliable_sources: 'Reliable Sources',
      trends: 'Trends',
      subscriptions: 'Subscriptions',
      video_project: 'Video Project',
    }
    return labels[category] || category
  }

  const getStatusBadge = (status) => {
    const badges = {
      fetched: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      draft: 'bg-blue-100 text-blue-800 border-blue-200',
      published: 'bg-green-100 text-green-800 border-green-200',
      archived: 'bg-gray-100 text-gray-800 border-gray-200',
    }
    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded border ${badges[status] || badges.fetched}`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const getReelStatusBadge = (reelStatus) => {
    if (!reelStatus || reelStatus === 'idle') return null
    const map = {
      queued:   { cls: 'bg-blue-50 text-blue-600 border-blue-200',    label: '⏳ Queued' },
      running:  { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: '⚡ Generating' },
      review:   { cls: 'bg-purple-50 text-purple-700 border-purple-200', label: '🎬 Ready' },
      approved: { cls: 'bg-green-50 text-green-700 border-green-200', label: '✅ Rendered' },
      failed:   { cls: 'bg-red-50 text-red-600 border-red-200',       label: '❌ Failed' },
    }
    const badge = map[reelStatus]
    if (!badge) return null
    return (
      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${badge.cls}`}>
        {badge.label}
      </span>
    )
  }

  const getTimeDisplay = (article) => {
    if (article.published_at) {
      return {
        label: 'Published',
        date: format(new Date(article.published_at), 'MMM dd, yyyy HH:mm'),
        relative: format(new Date(article.published_at), 'MMM dd, yyyy')
      }
    } else if (article.status === 'draft') {
      return {
        label: 'Draft',
        date: format(new Date(article.updated_at), 'MMM dd, yyyy HH:mm'),
        relative: format(new Date(article.updated_at), 'MMM dd, yyyy')
      }
    } else {
      return {
        label: 'Created',
        date: format(new Date(article.created_at), 'MMM dd, yyyy HH:mm'),
        relative: format(new Date(article.created_at), 'MMM dd, yyyy')
      }
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <FiRefreshCw className="animate-spin text-primary-600" size={32} />
      </div>
    )
  }

  return (
    <div>
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="text-red-800">
              <strong>Error loading articles:</strong> {typeof error === 'string' ? error : error.message || JSON.stringify(error)}
            </div>
            <button
              onClick={() => dispatch(clearError())}
              className="text-red-600 hover:text-red-800"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Posts</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${refreshing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            <FiRefreshCw className={refreshing ? 'animate-spin' : ''} size={16} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <Link
            to="/articles/create"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            Add New
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search articles…"
            className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); setSearchQuery('') }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <FiX size={14} />
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="mt-1 text-xs text-gray-500">
            Showing results for "<span className="font-medium">{searchQuery}</span>"
          </p>
        )}
      </div>

      {/* Category Filter */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <FiFilter className="text-gray-500" size={18} />
          <label htmlFor="category-filter" className="text-sm font-medium text-gray-700">
            Filter by Category:
          </label>
        </div>
        <select
          id="category-filter"
          value={selectedCategory}
          onChange={handleCategoryChange}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white min-w-[200px]"
        >
          <option value="">All Categories</option>
          {Array.isArray(categories) && categories.length > 0 ? (
            categories
              .filter(cat => cat && cat.is_active !== false)
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
              .map((category) => (
                <option key={category.id} value={category.slug || category.name?.toLowerCase().replace(/\s+/g, '-')}>
                  {category.name}
                </option>
              ))
          ) : (
            <option disabled>Loading categories...</option>
          )}
        </select>
        {selectedCategory && (
          <button
            onClick={() => setSelectedCategory('')}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded border border-gray-300"
          >
            Clear Filter
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-8 -mb-px">
          <button
            onClick={() => setActiveTab('published')}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'published'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Published
          </button>
          <button
            onClick={() => setActiveTab('fetched')}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'fetched'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Fetched
          </button>
          <button
            onClick={() => setActiveTab('draft')}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'draft'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Draft
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'all'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'archived'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Trash
          </button>
            <button
              onClick={() => setActiveTab('video_project')}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'video_project'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Video Projects
            </button>
            <button
              onClick={() => setActiveTab('reliable_sources')}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'reliable_sources'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Reliable Sources
            </button>
            <button
              onClick={() => setActiveTab('trends')}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'trends'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Trends
            </button>
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'subscriptions'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Subscriptions
            </button>
          </div>
        </div>

      {/* Google Trends Widget - Show only on Trends tab */}
      {activeTab === 'trends' && <GoogleTrendsWidget onArticleCreated={refreshList} />}

      {/* Bulk Actions Bar */}
      {selectedArticles.size > 0 && (
        <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            {selectedArticles.size} item{selectedArticles.size > 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowBulkEditModal(true)}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              Edit
            </button>
            <button
              onClick={async () => {
                const ids = Array.from(selectedArticles)
                await Promise.all(ids.map(id => dispatch(updateArticle({ id, data: { status: 'draft' } }))))
                setSelectedArticles(new Set())
                refreshList()
              }}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              Move to Draft
            </button>
            <button
              onClick={async () => {
                const ids = Array.from(selectedArticles)
                await Promise.all(ids.map(id => dispatch(publishArticle(id))))
                setSelectedArticles(new Set())
                refreshList()
              }}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              Publish
            </button>
            <button
              onClick={async () => {
                const isTrash = activeTab === 'archived'
                const actionName = isTrash ? 'delete permanently' : 'move to trash'
                const actionFunc = isTrash ? deleteArticle : archiveArticle

                if (window.confirm(`Are you sure you want to ${actionName} ${selectedArticles.size} article(s)?`)) {
                  const ids = Array.from(selectedArticles)
                  await Promise.all(ids.map(id => dispatch(actionFunc(id))))
                  setSelectedArticles(new Set())
                  refreshList()
                }
              }}
              className="px-3 py-1.5 text-sm bg-white border border-red-300 text-red-600 rounded hover:bg-red-50"
            >
              {activeTab === 'archived' ? 'Delete Permanently' : 'Move to Trash'}
            </button>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      <BulkEditModal
        isOpen={showBulkEditModal}
        onClose={() => setShowBulkEditModal(false)}
        selectedArticleIds={Array.from(selectedArticles)}
        onSuccess={() => {
          setSelectedArticles(new Set())
          refreshList()
        }}
      />

      {/* Quick Edit Modal */}
      <QuickEditModal
        isOpen={!!quickEditArticle}
        onClose={() => setQuickEditArticle(null)}
        article={quickEditArticle}
        onSuccess={() => {
          setQuickEditArticle(null)
          refreshList()
        }}
      />

      {/* Articles Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedArticles.size === items.length && items.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Author
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                  No articles found
                </td>
              </tr>
            ) : (
              items.map((article) => {
                const timeInfo = getTimeDisplay(article)
                return (
                  <tr key={article.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedArticles.has(article.id)}
                        onChange={() => handleSelectArticle(article.id)}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        {article.featured_image_url && (
                          <img
                            src={article.featured_image_url}
                            alt={article.title}
                            className="w-12 h-12 object-cover rounded border border-gray-200 flex-shrink-0"
                            onError={(e) => {
                              e.target.style.display = 'none'
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Link
                              to={`/articles/${article.id}/edit`}
                              className="font-medium text-gray-900 hover:text-primary-600"
                            >
                              {article.title || '(No title)'}
                            </Link>
                            {getStatusBadge(article.status)}
                            {getReelStatusBadge(article.reel_generation_status)}
                            {(article.reel_video_url || article.video_url) && (
                              <a
                                href={article.reel_video_url || article.video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                                title="View rendered reel"
                              >
                                <FiVideo size={10} /> Reel
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <Link
                              to={`/articles/${article.id}/edit`}
                              className="hover:text-primary-600"
                            >
                              Edit
                            </Link>
                            <span>|</span>
                            <button
                              onClick={() => setQuickEditArticle(article)}
                              className="hover:text-primary-600"
                            >
                              Quick Edit
                            </button>
                            {article.category === 'video_project' && (
                              <>
                                <span>|</span>
                                <Link
                                  to={`/video-studio?article=${article.id}`}
                                  className="hover:text-violet-600 flex items-center gap-1 font-medium text-violet-500"
                                  title="Open in Video Studio"
                                >
                                  <FiFilm size={12} /> Studio
                                </Link>
                              </>
                            )}
                            {article.status === 'published' && (
                              <>
                                <span>|</span>
                                <a
                                  href={`https://pavilionend.in/${article.slug}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-primary-600"
                                >
                                  View
                                </a>
                              </>
                            )}
                            {article.source_url && (
                              <>
                                <span>|</span>
                                <a
                                  href={article.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-blue-600 flex items-center gap-1"
                                  title="View source article"
                                >
                                  <FiExternalLink size={12} />
                                  Source
                                </a>
                              </>
                            )}
                            <span>|</span>
                            <button
                              onClick={() => handleArchive(article.id)}
                              className="hover:text-red-600"
                            >
                              Trash
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {article.categories && article.categories.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {article.categories.map((cat, idx) => (
                              <span key={cat.id} className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                                {cat.name}
                                {idx < article.categories.length - 1 && ','}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {article.author_name || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        <div className="font-medium">{timeInfo.relative}</div>
                        <div className="text-xs text-gray-400">{timeInfo.label}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {/* Quick Actions */}
                        {article.status === 'fetched' && (
                          <button
                            onClick={() => handleGenerate(article.id)}
                            disabled={generatingIds.includes(article.id)}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors text-xs font-medium flex items-center gap-1"
                            title="Generate Article"
                          >
                            {generatingIds.includes(article.id) ? (
                              <>
                                <FiRefreshCw className="animate-spin" size={12} />
                                Generating...
                              </>
                            ) : (
                              <>
                                <FiPlay size={12} />
                                Generate
                              </>
                            )}
                          </button>
                        )}
                        {article.status === 'draft' && (
                          <>
                            <button
                              onClick={() => handlePublish(article.id)}
                              disabled={publishingIds.includes(article.id)}
                              className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors text-xs font-medium flex items-center gap-1"
                              title="Publish"
                            >
                              {publishingIds.includes(article.id) ? (
                                <>
                                  <FiRefreshCw className="animate-spin" size={12} />
                                  Publishing...
                                </>
                              ) : (
                                <>
                                  <FiCheck size={12} />
                                  Publish
                                </>
                              )}
                            </button>
                            <Link
                              to={`/articles/${article.id}/edit`}
                              className="px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors text-xs font-medium flex items-center gap-1"
                              title="Edit Article"
                            >
                              <FiEdit size={12} />
                              Edit
                            </Link>
                          </>
                        )}
                        {article.status === 'published' && (
                          <>
                            <Link
                              to={`/articles/${article.id}/edit`}
                              className="px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors text-xs font-medium flex items-center gap-1"
                              title="Edit Article"
                            >
                              <FiEdit size={12} />
                              Edit
                            </Link>
                            <button
                              onClick={() => handleArchive(article.id)}
                              className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-xs font-medium flex items-center gap-1"
                              title="Move to Trash"
                            >
                              <FiTrash2 size={12} />
                              Trash
                            </button>
                          </>
                        )}
                        <div className="relative">
                          <button
                            onClick={() => setShowQuickActions(showQuickActions === article.id ? null : article.id)}
                            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                            title="More actions"
                          >
                            <FiMoreVertical size={16} />
                          </button>
                          {showQuickActions === article.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setShowQuickActions(null)}
                              />
                              <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-20">
                                <div className="py-1">
                                  <Link
                                    to={`/articles/${article.id}/edit`}
                                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    onClick={() => setShowQuickActions(null)}
                                  >
                                    <FiEdit className="inline mr-2" size={14} />
                                    Edit
                                  </Link>
                                  {article.status !== 'published' && article.status !== 'fetched' && (
                                    <button
                                      onClick={() => {
                                        handlePublish(article.id)
                                        setShowQuickActions(null)
                                      }}
                                      disabled={publishingIds.includes(article.id)}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                                    >
                                      {publishingIds.includes(article.id) ? (
                                        <>
                                          <FiRefreshCw className="animate-spin inline mr-2" size={14} />
                                          Publishing...
                                        </>
                                      ) : (
                                        <>
                                          <FiCheck className="inline mr-2" size={14} />
                                          Publish
                                        </>
                                      )}
                                    </button>
                                  )}
                                  {article.status === 'published' && (
                                    <button
                                      onClick={() => {
                                        handleMoveToDraft(article.id)
                                        setShowQuickActions(null)
                                      }}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                      <FiClock className="inline mr-2" size={14} />
                                      Move to Draft
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      handleArchive(article.id)
                                      setShowQuickActions(null)
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                  >
                                    <FiTrash2 className="inline mr-2" size={14} />
                                    Move to Trash
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {pagination && pagination.count > 0 && (
        <div className="mt-6 flex items-center justify-between bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">Show:</label>
              <select
                value={pageSize}
                onChange={handlePageSizeChange}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-sm text-gray-600">per page</span>
            </div>
            <div className="text-sm text-gray-600">
              Showing {startItem} to {endItem} of {pagination.count} articles
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              Previous
            </button>

            <div className="flex items-center gap-1">
              {/* Show page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-1.5 text-sm rounded-lg ${currentPage === pageNum
                      ? 'bg-primary-600 text-white'
                      : 'border border-gray-300 hover:bg-gray-50'
                      }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ArticleList

