import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import {
  fetchWebStories,
  publishWebStory,
  deleteWebStory,
} from '../../store/slices/webstorySlice'
import {
  FiRefreshCw,
  FiPlus,
  FiBookOpen,
  FiImage,
  FiEdit,
  FiTrash2,
  FiCheckCircle,
  FiClock,
} from 'react-icons/fi'
import { format } from 'date-fns'
import { showSuccess, showError } from '../../utils/toast'

const statusTabs = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
]

const buildFetchParams = (status) => {
  if (status && status !== 'all') {
    return { status }
  }
  return {}
}

function WebStoryList() {
  const dispatch = useDispatch()
  const { items, loading } = useSelector((state) => state.webstories)
  const [activeStatus, setActiveStatus] = useState('published')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    dispatch(fetchWebStories(buildFetchParams(activeStatus)))
  }, [dispatch, activeStatus])

  const filteredStories = useMemo(() => {
    if (activeStatus === 'all') return items
    return items.filter((story) => story.status === activeStatus)
  }, [items, activeStatus])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await dispatch(fetchWebStories(buildFetchParams(activeStatus))).unwrap()
    } catch (error) {
      console.error('Failed to refresh web stories:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const handlePublish = async (id) => {
    try {
      await dispatch(publishWebStory(id)).unwrap()
      showSuccess('Story published successfully')
    } catch (error) {
      showError('Failed to publish story. Please try again.')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this story? This cannot be undone.')) return
    try {
      await dispatch(deleteWebStory(id)).unwrap()
      showSuccess('Story deleted')
    } catch (error) {
      showError('Failed to delete story. Please try again.')
    }
  }

  const renderStatusBadge = (status) => {
    const styles = {
      draft: 'bg-blue-50 text-blue-700 border-blue-100',
      scheduled: 'bg-amber-50 text-amber-700 border-amber-100',
      published: 'bg-green-50 text-green-700 border-green-100',
    }
    return (
      <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${styles[status] || styles.draft}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <FiBookOpen />
            Web Stories
          </h1>
          <p className="text-gray-600 mt-1">
            Create immersive stories for Pavilion Theme
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
          >
            <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <Link
            to="/webstories/create"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-semibold flex items-center gap-2"
          >
            <FiPlus />
            Add Web Story
          </Link>
        </div>
      </div>

      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-4 overflow-x-auto">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveStatus(tab.value)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeStatus === tab.value
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <FiRefreshCw className="animate-spin text-primary-600" size={32} />
        </div>
      ) : filteredStories.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center text-primary-600">
            <FiImage size={28} />
          </div>
          <h2 className="text-xl font-semibold text-gray-800">No stories yet</h2>
          <p className="text-gray-500 max-w-md mx-auto">
            Start by creating your first Pavilion web story. Each story can
            include multiple slides with rich imagery.
          </p>
          <Link
            to="/webstories/create"
            className="inline-flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-semibold"
          >
            <FiPlus />
            Create Web Story
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredStories.map((story) => {
            const updatedAt = story.updated_at ? new Date(story.updated_at) : null
            const publishedAt = story.published_at ? new Date(story.published_at) : null
            return (
              <div
                key={story.id}
                className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden"
              >
              <div className="relative">
                {story.cover_image_url ? (
                  <img
                    src={story.cover_image_url}
                    alt={story.title}
                    className="w-full h-48 object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                ) : (
                  <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400">
                    <FiImage size={36} />
                  </div>
                )}
                <div className="absolute top-4 left-4">
                  {renderStatusBadge(story.status)}
                </div>
              </div>

              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-4">
                  <Link
                    to={`/webstories/${story.id}/edit`}
                    className="text-lg font-semibold text-gray-900 hover:text-primary-600 block max-h-[3.5rem] overflow-hidden"
                  >
                    {story.title}
                  </Link>
                  <span className="text-xs text-gray-400">
                    {story.slide_count ?? story.slides?.length ?? 0} slides
                  </span>
                </div>
                {story.summary && (
                  <p className="text-sm text-gray-600 mt-3 max-h-16 overflow-hidden">
                    {story.summary}
                  </p>
                )}

                <div className="mt-4 text-xs text-gray-500 space-y-1">
                  {updatedAt && (
                    <div className="flex items-center gap-2">
                      <FiClock size={12} />
                      <span>Updated {format(updatedAt, 'MMM dd, yyyy HH:mm')}</span>
                    </div>
                  )}
                  {publishedAt && (
                    <div className="flex items-center gap-2 text-green-600">
                      <FiCheckCircle size={12} />
                      <span>Published {format(publishedAt, 'MMM dd, yyyy HH:mm')}</span>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <Link
                    to={`/webstories/${story.id}/edit`}
                    className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    <FiEdit size={14} />
                    Edit
                  </Link>
                  {story.status !== 'published' && (
                    <button
                      onClick={() => handlePublish(story.id)}
                      className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      <FiCheckCircle size={14} />
                      Publish
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(story.id)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                    title="Delete story"
                  >
                    <FiTrash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default WebStoryList

