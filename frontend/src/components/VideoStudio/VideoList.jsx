import { useEffect, useState, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { format } from 'date-fns'
import {
  FiEdit, FiRefreshCw, FiTrash2, FiMoreVertical, FiEye,
  FiSearch, FiX, FiVideo, FiPlus, FiPlay, FiDownload,
  FiFilm, FiCheck, FiClock,
} from 'react-icons/fi'
import { fetchVideoJobs } from '../../store/slices/videoStudioSlice'

const STATUS_TABS = [
  { id: 'all',       label: 'All' },
  { id: 'draft',     label: 'Drafts' },
  { id: 'pending',   label: 'Pending' },
  { id: 'rendering', label: 'Rendering' },
  { id: 'done',      label: 'Done' },
  { id: 'failed',    label: 'Failed' },
]

const STATUS_BADGES = {
  draft:     { cls: 'bg-gray-100 text-gray-800 border-gray-200',    label: 'Draft' },
  pending:   { cls: 'bg-blue-100 text-blue-800 border-blue-200',    label: 'Pending' },
  rendering: { cls: 'bg-amber-100 text-amber-800 border-amber-200',  label: 'Rendering' },
  uploading: { cls: 'bg-purple-100 text-purple-800 border-purple-200', label: 'Uploading' },
  done:      { cls: 'bg-green-100 text-green-800 border-green-200',  label: 'Done' },
  failed:    { cls: 'bg-red-100 text-red-800 border-red-200',        label: 'Failed' },
  default:   { cls: 'bg-gray-100 text-gray-700 border-gray-200',    label: 'Queued' },
}

function StatusBadge({ status }) {
  const b = STATUS_BADGES[status] || STATUS_BADGES.default
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${b.cls}`}>
      {b.label}
    </span>
  )
}

export default function VideoList({ onNew, onEdit }) {
  const dispatch = useDispatch()
  const { jobs = [], loading } = useSelector(s => s.videoStudio)

  const [activeTab, setActiveTab] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showActions, setShowActions] = useState(null)
  const searchDebounceRef = useRef(null)

  const [articles, setArticles] = useState([])
  const [loadingArticles, setLoadingArticles] = useState(false)

  const fetchAll = useCallback(() => {
    dispatch(fetchVideoJobs())
    setLoadingArticles(true)
    // Fetch draft video projects
    import('../../services/api').then(({ default: api }) => {
      api.get('/articles/?category=video_project').then(res => {
        setArticles(Array.isArray(res.data) ? res.data : (res.data.results || []))
      }).finally(() => setLoadingArticles(false))
    })
  }, [dispatch])

  // Fetch jobs and projects on mount
  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Debounce search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput)
    }, 300)
    return () => clearTimeout(searchDebounceRef.current)
  }, [searchInput])

  const handleRefresh = () => fetchAll()

  // Merge and Filter
  const mergedList = [
    ...jobs.map(j => ({ ...j, kind: 'job' })),
    ...articles.map(a => ({
      ...a,
      kind: 'project',
      // Keep production_plan so VideoStudio can fetch clips/audio from it directly
      production_plan: a.video_production_plan || null,
      props: a.video_production_plan?.modular_props || a.video_production_plan?.props || {},
      clips: a.video_production_plan?.clips || [],
      audio_url: a.video_production_plan?.audio_url || a.audio_url || '',
      video_format: a.video_format === 'portrait' ? 'reel' : 'long',
      title: a.title,
    }))
  ].sort((a, b) => new Date(b.created_at || b.updated_at) - new Date(a.created_at || a.updated_at))

  const filteredItems = mergedList.filter(item => {
    const matchesTab = activeTab === 'all' || item.status === activeTab
    const titleStr = (item.title || item.props?.scene1Headline || '').toLowerCase()
    const matchesSearch = !searchQuery || titleStr.includes(searchQuery.toLowerCase())
    return matchesTab && matchesSearch
  })

  const getTimeDisplay = (item) => {
    const ts = item.updated_at || item.created_at
    if (!ts) return { label: 'Created', relative: '—' }
    return {
      label: item.status === 'done' ? 'Published' : item.status === 'draft' ? 'Draft saved' : 'Updated',
      relative: format(new Date(ts), 'MMM dd, yyyy HH:mm'),
    }
  }

  if ((loading || loadingArticles) && mergedList.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <FiRefreshCw className="animate-spin text-purple-600" size={32} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Video Studio</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your video projects — drafts, generated clips & published reels</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRefresh}
            disabled={loading || loadingArticles}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              (loading || loadingArticles)
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <FiRefreshCw className={(loading || loadingArticles) ? 'animate-spin' : ''} size={16} />
            {(loading || loadingArticles) ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={onNew}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <FiPlus size={16} />
            New Video
          </button>
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
            placeholder="Search videos…"
            className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-6 -mb-px">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Video / Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Format
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
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
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-gray-400">
                    <FiVideo size={40} className="text-gray-300" />
                    <div>
                      <p className="font-medium text-gray-500">No video projects yet</p>
                      <p className="text-sm mt-1">Click <strong>New Video</strong> to generate your first reel or short.</p>
                    </div>
                    <button
                      onClick={onNew}
                      className="mt-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium flex items-center gap-2"
                    >
                      <FiPlus size={14} /> New Video
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredItems.map(item => {
                const timeInfo = getTimeDisplay(item)
                const title = item.title || item.props?.scene1Headline || `Video #${item.id}`
                const format_label = item.video_format || item.props?.videoFormat || 'reel'
                const thumbnail = item.thumbnail_url || null

                return (
                  <tr key={`${item.kind}-${item.id}`} className="hover:bg-gray-50">
                    {/* Title + thumbnail */}
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        {/* Thumbnail or placeholder */}
                        <div
                          className="w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer"
                          onClick={() => onEdit(item)}
                          title="Preview video"
                        >
                          {thumbnail ? (
                            <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
                          ) : (
                            <FiFilm size={22} className="text-purple-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <button
                              onClick={() => onEdit(item)}
                              className="font-medium text-gray-900 hover:text-purple-600 text-left truncate max-w-xs"
                            >
                              {title}
                            </button>
                            <StatusBadge status={item.status} />
                            {item.kind === 'project' && (
                               <span className="text-[10px] px-1 bg-purple-50 text-purple-600 border border-purple-100 rounded">Project</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <button
                              onClick={() => onEdit(item)}
                              className="hover:text-purple-600"
                            >
                              Edit / Preview
                            </button>
                            {item.output_url && (
                              <>
                                <span>|</span>
                                <a
                                  href={item.output_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-purple-600 flex items-center gap-1"
                                >
                                  <FiDownload size={11} /> Download
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Format */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600 capitalize flex items-center gap-1">
                        {format_label === 'reel' && '📱'}
                        {format_label === 'short' && '🎬'}
                        {format_label === 'long' && '🖥️'}
                        {format_label}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={item.status} />
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        <div className="font-medium">{timeInfo.relative}</div>
                        <div className="text-xs text-gray-400">{timeInfo.label}</div>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit / Preview button */}
                        <button
                          onClick={() => onEdit(item)}
                          className="px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-xs font-medium flex items-center gap-1"
                          title="Edit / Preview"
                        >
                          <FiEdit size={12} />
                          Edit
                        </button>

                        {/* Download if done */}
                        {item.output_url && (
                          <a
                            href={item.output_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-xs font-medium flex items-center gap-1"
                            title="Download rendered video"
                          >
                            <FiDownload size={12} />
                            Download
                          </a>
                        )}

                        {/* More actions */}
                        <div className="relative">
                          <button
                            onClick={() => setShowActions(showActions === item.id ? null : item.id)}
                            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                            title="More actions"
                          >
                            <FiMoreVertical size={16} />
                          </button>
                          {showActions === item.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setShowActions(null)}
                              />
                              <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-20">
                                <div className="py-1">
                                  <button
                                    onClick={() => { onEdit(item); setShowActions(null) }}
                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                  >
                                    <FiEdit className="inline mr-2" size={14} />
                                    Edit / Preview
                                  </button>
                                  {item.output_url && (
                                    <a
                                      href={item.output_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                      onClick={() => setShowActions(null)}
                                    >
                                      <FiDownload className="inline mr-2" size={14} />
                                      Download Video
                                    </a>
                                  )}
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
    </div>
  )
}
