import { Routes, Route, Navigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { useEffect } from 'react'
import Login from './components/Auth/Login'
import Dashboard from './components/Dashboard/Dashboard'
import ArticleList from './components/Articles/ArticleList'
import ArticleEdit from './components/Articles/ArticleEdit'
import ArticleCreate from './components/Articles/ArticleCreate'
import RSSFeedManager from './components/RSSFeeds/RSSFeedManager'
import CategoryManager from './components/Categories/CategoryManager'
import ProtectedRoute from './components/ProtectedRoute'
import WebStoryList from './components/WebStories/WebStoryList'
import WebStoryCreate from './components/WebStories/WebStoryCreate'
import WebStoryEdit from './components/WebStories/WebStoryEdit'
import InviteUser from './components/Auth/InviteUser'
import AcceptInvite from './components/Auth/AcceptInvite'
import {
  fetchBrandingRequest,
  fetchBrandingSuccess,
  fetchBrandingFailure,
} from './store/slices/brandingSlice'
import { loadBrandingForTenant, setTenantContext } from './utils/brandingLoader'

function App() {
  const { isAuthenticated } = useSelector((state) => state.auth)
  const dispatch = useDispatch()

  // Load branding configuration on app mount
  useEffect(() => {
    const loadBranding = async () => {
      try {
        await loadBrandingForTenant(dispatch, {
          fetchBrandingRequest,
          fetchBrandingSuccess,
          fetchBrandingFailure,
        })
      } catch (error) {
        console.warn('Failed to load branding, using defaults:', error)
      }
    }

    loadBranding()

    // Set tenant context if authenticated
    if (isAuthenticated) {
      const tenantId = localStorage.getItem('tenant_id')
      if (tenantId) {
        setTenantContext(tenantId)
      }
    }
  }, [dispatch, isAuthenticated])

  // Debug log to confirm deployment
  console.log('Pavilion AI Frontend - Branding & OAuth Initialized')


  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" /> : <Login />}
      />
      <Route path="/accept-invite/:token" element={<AcceptInvite />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      >
        <Route index element={<ArticleList />} />
        <Route path="articles" element={<ArticleList />} />
        <Route path="articles/create" element={<ArticleCreate />} />
        <Route path="articles/:id/edit" element={<ArticleEdit />} />
        <Route path="rss-feeds" element={<RSSFeedManager />} />
        <Route path="categories" element={<CategoryManager />} />
        <Route path="webstories" element={<WebStoryList />} />
        <Route path="webstories/create" element={<WebStoryCreate />} />
        <Route path="webstories/:id/edit" element={<WebStoryEdit />} />
        <Route path="invite" element={<InviteUser />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default App

