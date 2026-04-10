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
} from 'react-icons/fi'
import { useState } from 'react'
import TenantSwitcher from '../Auth/TenantSwitcher'

function Dashboard() {
  const { currentRole } = useSelector((state) => state.auth)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
  }

  const navItems = [
    { path: '/articles', label: 'Articles', icon: FiFileText, matchStart: true },
    { path: '/articles/create', label: 'Create Article', icon: FiPlus },
    { path: '/webstories', label: 'Web Stories', icon: FiBookOpen, matchStart: true },
    { path: '/webstories/create', label: 'Create Web Story', icon: FiLayers },
    { path: '/categories', label: 'Categories', icon: FiTag },
    { path: '/rss-feeds', label: 'RSS Feeds', icon: FiRss },
    { path: '/invite', label: 'Invite Member', icon: FiUserPlus },
  ]

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

            <nav className="flex-1 p-4 space-y-2">
              {navItems.map((item) => {
                if (item.path === '/invite' && currentRole !== 'admin') {
                  return null
                }
                const Icon = item.icon
                const isActive = item.matchStart
                  ? location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
                  : location.pathname === item.path
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>

            <div className="p-4 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <FiLogOut size={20} />
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
        <main className="flex-1 lg:ml-0">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default Dashboard

