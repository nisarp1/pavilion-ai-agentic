import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../../store/slices/authSlice'
import {
  FiFileText,
  FiPlus,
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
} from 'react-icons/fi'
import { useState } from 'react'
import TenantSwitcher from '../Auth/TenantSwitcher'

function Dashboard() {
  const { currentRole, generatingIds = [] } = useSelector((state) => ({
    currentRole: state.auth.currentRole,
    generatingIds: state.articles?.generatingIds || [],
  }))
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
  }

  const navItems = [
    { path: '/', label: 'Dashboard', icon: FiHome, exact: true },
    { path: '/articles', label: 'Articles', icon: FiFileText, matchStart: true },
    { path: '/articles/create', label: 'Create Article', icon: FiPlus },
    { path: '/webstories', label: 'Web Stories', icon: FiBookOpen, matchStart: true },
    { path: '/webstories/create', label: 'Create Web Story', icon: FiLayers },
    { path: '/categories', label: 'Categories', icon: FiTag },
    { path: '/rss-feeds', label: 'RSS Feeds', icon: FiRss },
    { path: '/video-studio', label: 'Video Studio', icon: FiVideo },
    { path: '/invite', label: 'Invite Member', icon: FiUserPlus, adminOnly: true },
    { path: '/profile', label: 'My Profile', icon: FiUser },
    { path: '/settings', label: 'Settings', icon: FiSettings, adminOnly: true },
  ]

  const isActive = (item) => {
    if (item.exact) return location.pathname === item.path
    if (item.matchStart) return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
    return location.pathname === item.path
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
            <div className="p-6 border-b border-gray-200 hidden lg:block">
              <h1 className="text-2xl font-bold text-gray-800">PavilionEnd</h1>
              <p className="text-sm text-gray-600">CMS Platform</p>
            </div>

            <TenantSwitcher />

            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                if (item.adminOnly && currentRole !== 'admin') return null
                const Icon = item.icon
                const active = isActive(item)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-colors ${
                      active
                        ? 'bg-primary-50 text-primary-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="flex-1">{item.label}</span>
                    {item.path === '/articles' && generatingIds.length > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-xs text-blue-600 font-medium">{generatingIds.length}</span>
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>

            <div className="p-4 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <FiLogOut size={18} />
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
