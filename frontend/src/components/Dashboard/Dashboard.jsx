import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../../store/slices/authSlice'
import {
  FiLogOut,
  FiMenu,
  FiX,
  FiRss,
  FiTag,
  FiBookOpen,
  FiLayers,
  FiUserPlus,
  FiHome,
  FiUser,
  FiSettings,
  FiVideo,
  FiZap,
  FiActivity,
  FiBookmark,
  FiGlobe,
  FiDownload,
  FiList,
  FiTrash2,
  FiEdit,
  FiFilm,
  FiPlay,
  FiFileText,
  FiPlus,
  FiCheck,
  FiChevronDown,
} from 'react-icons/fi'
import { useState, useRef, useEffect } from 'react'
import TenantSwitcher from '../Auth/TenantSwitcher'

const navSections = [
  {
    items: [
      { path: '/', label: 'Dashboard', icon: FiHome, exact: true },
    ],
  },
  {
    label: 'NEWSROOM AI',
    items: [
      { path: '/articles?view=newsroom', label: 'Trends', icon: FiActivity, matchPath: '/articles', matchView: 'newsroom', matchTab: null },
      { path: '/articles?view=newsroom&tab=reliable_sources', label: 'Preload', icon: FiBookmark, matchPath: '/articles', matchView: 'newsroom', matchTab: 'reliable_sources' },
      { path: '/articles?view=newsroom&tab=generated', label: 'Generated', icon: FiZap, matchPath: '/articles', matchView: 'newsroom', matchTab: 'generated' },
      { path: '/articles?view=newsroom&tab=draft', label: 'Draft', icon: FiEdit, matchPath: '/articles', matchView: 'newsroom', matchTab: 'draft' },
      { path: '/articles?view=newsroom&tab=published', label: 'Published', icon: FiGlobe, matchPath: '/articles', matchView: 'newsroom', matchTab: 'published' },
      { path: '/articles?view=newsroom&tab=fetched', label: 'Fetched', icon: FiDownload, matchPath: '/articles', matchView: 'newsroom', matchTab: 'fetched' },
      { path: '/articles?view=newsroom&tab=archived', label: 'Trash', icon: FiTrash2, matchPath: '/articles', matchView: 'newsroom', matchTab: 'archived' },
      { path: '/articles?view=newsroom&tab=all', label: 'All Posts', icon: FiList, matchPath: '/articles', matchView: 'newsroom', matchTab: 'all' },
    ],
  },
  {
    label: 'VIDEO STUDIO',
    newAction: { path: '/video-studio?new=1', label: 'New Reel', icon: FiFilm },
    items: [
      { path: '/video-studio', label: 'Video Studio', icon: FiVideo, matchStart: true, excludeStart: '/articles' },
      { path: '/articles?view=video&tab=draft', label: 'Draft Reels', icon: FiFilm, matchPath: '/articles', matchView: 'video', matchTab: 'draft' },
      { path: '/articles?view=video&tab=published', label: 'Published', icon: FiPlay, matchPath: '/articles', matchView: 'video', matchTab: 'published' },
      { path: '/articles?view=video&tab=all', label: 'All Videos', icon: FiLayers, matchPath: '/articles', matchView: 'video', matchTab: 'all' },
    ],
  },
  {
    label: 'SOCIAL STUDIO',
    items: [
      { path: '/social-studio', label: 'Social Studio', icon: FiZap, matchStart: true, excludeStart: '/feeds' },
      { path: '/feeds', label: 'Feeds', icon: FiRss, matchStart: true },
    ],
  },
  {
    label: 'WEBSTORIES',
    items: [
      { path: '/webstories', label: 'Web Stories', icon: FiBookOpen, matchStart: true, excludeStart: '/webstories/create' },
      { path: '/webstories/create', label: 'Create Story', icon: FiPlus },
    ],
  },
  {
    label: 'CUSTOMISATION',
    items: [
      { path: '/categories', label: 'Categories', icon: FiTag },
      { path: '/rss-feeds', label: 'RSS Feeds', icon: FiRss },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { path: '/profile', label: 'My Profile', icon: FiUser },
      { path: '/settings', label: 'Settings', icon: FiSettings, adminOnly: true },
      { path: '/invite', label: 'Invite Member', icon: FiUserPlus, adminOnly: true },
    ],
  },
]

// Global + New dropdown options
const CREATE_OPTIONS = [
  { label: 'Article', icon: FiFileText, path: '/articles/create' },
  { label: 'Video Reel', icon: FiFilm, path: '/video-studio?new=1' },
  { label: 'Social Post', icon: FiZap, path: '/social-studio' },
  { label: 'Web Story', icon: FiBookOpen, path: '/webstories/create' },
]

function Dashboard() {
  const { currentRole, generatingIds = [] } = useSelector((state) => ({
    currentRole: state.auth.currentRole,
    generatingIds: state.articles?.generatingIds || [],
  }))
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const createRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!createOpen) return
    const handler = (e) => {
      if (createRef.current && !createRef.current.contains(e.target)) setCreateOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [createOpen])

  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
  }

  const isActive = (item) => {
    if (item.exact) return location.pathname === item.path

    if (item.matchPath) {
      if (location.pathname !== item.matchPath) return false
      const sp = new URLSearchParams(location.search)
      const currentView = sp.get('view')
      const currentTab = sp.get('tab')
      if (item.matchView && currentView !== item.matchView) return false
      if (item.matchTab === null) return !currentTab
      if (item.matchTab) return currentTab === item.matchTab
      return true
    }

    if (item.matchStart) {
      const itemBase = item.path.split('?')[0]
      if (item.excludeStart && location.pathname.startsWith(item.excludeStart)) return false
      return location.pathname === itemBase || location.pathname.startsWith(`${itemBase}/`)
    }

    return location.pathname === item.path.split('?')[0]
  }

  const renderNavItem = (item) => {
    if (item.adminOnly && currentRole !== 'admin') return null
    const Icon = item.icon
    const active = isActive(item)
    const isSubItem = item.matchPath !== undefined || (item.path !== '/' && item.path !== '/social-studio')
    return (
      <Link
        key={item.path + (item.matchTab ?? '')}
        to={item.path}
        onClick={() => setSidebarOpen(false)}
        className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
          isSubItem ? 'ml-2 text-[13px]' : 'text-sm'
        } ${
          active
            ? 'bg-primary-50 text-primary-700 font-medium'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
        }`}
      >
        <Icon size={15} />
        <span className="flex-1">{item.label}</span>
        {item.path === '/articles?view=newsroom' && generatingIds.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs text-blue-600 font-medium">{generatingIds.length}</span>
          </span>
        )}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <div className="lg:hidden bg-white shadow-sm border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold text-gray-800">PavilionEnd</h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            {sidebarOpen ? <FiX size={24} /> : <FiMenu size={24} />}
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transition-transform duration-300 ease-in-out`}
        >
          <div className="h-full flex flex-col">
            <div className="p-5 border-b border-gray-200 hidden lg:block">
              <h1 className="text-2xl font-bold text-gray-800">PavilionEnd</h1>
              <p className="text-sm text-gray-600">CMS Platform</p>
            </div>

            <TenantSwitcher />

            {/* Global + New Button */}
            <div className="px-3 pt-3 pb-1" ref={createRef}>
              <button
                onClick={() => setCreateOpen(v => !v)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-semibold shadow-sm"
              >
                <FiPlus size={16} />
                New
                <FiChevronDown size={13} className={`transition-transform ${createOpen ? 'rotate-180' : ''}`} />
              </button>
              {createOpen && (
                <div className="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-30 relative">
                  {CREATE_OPTIONS.map(opt => {
                    const Icon = opt.icon
                    return (
                      <Link
                        key={opt.path}
                        to={opt.path}
                        onClick={() => { setCreateOpen(false); setSidebarOpen(false) }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                      >
                        <Icon size={15} />
                        {opt.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            <nav className="flex-1 p-3 overflow-y-auto">
              {navSections.map((section, sIdx) => (
                <div key={sIdx} className={sIdx > 0 ? 'mt-4' : ''}>
                  {section.label && (
                    <div className="px-3 py-1 mb-1 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                        {section.label}
                      </span>
                      {section.newAction && (
                        <Link
                          to={section.newAction.path}
                          onClick={() => setSidebarOpen(false)}
                          title={section.newAction.label}
                          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-primary-600 hover:bg-primary-50 rounded transition-colors"
                        >
                          <FiPlus size={11} />
                          {section.newAction.label}
                        </Link>
                      )}
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {section.items.map(renderNavItem)}
                  </div>
                </div>
              ))}
            </nav>

            <div className="p-4 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm"
              >
                <FiLogOut size={15} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 lg:ml-0 min-w-0">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default Dashboard
