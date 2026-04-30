import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { fetchBrandingRequest, fetchBrandingSuccess, fetchBrandingFailure } from './store/slices/brandingSlice'
import { loadBrandingForTenant, setTenantContext } from './utils/brandingLoader'
import Login from './components/Auth/Login'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'

const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'))
const DashboardHome = lazy(() => import('./components/Dashboard/DashboardHome'))
const ArticleList = lazy(() => import('./components/Articles/ArticleList'))
const ArticleEdit = lazy(() => import('./components/Articles/ArticleEdit'))
const ArticleCreate = lazy(() => import('./components/Articles/ArticleCreate'))
const RSSFeedManager = lazy(() => import('./components/RSSFeeds/RSSFeedManager'))
const CategoryManager = lazy(() => import('./components/Categories/CategoryManager'))
const WebStoryList = lazy(() => import('./components/WebStories/WebStoryList'))
const WebStoryCreate = lazy(() => import('./components/WebStories/WebStoryCreate'))
const WebStoryEdit = lazy(() => import('./components/WebStories/WebStoryEdit'))
const InviteUser = lazy(() => import('./components/Auth/InviteUser'))
const AcceptInvite = lazy(() => import('./components/Auth/AcceptInvite'))
const ForgotPassword = lazy(() => import('./components/Auth/ForgotPassword'))
const ResetPassword = lazy(() => import('./components/Auth/ResetPassword'))
const UserProfile = lazy(() => import('./components/Auth/UserProfile'))
const TenantSettings = lazy(() => import('./components/Settings/TenantSettings'))
const OnboardingWizard = lazy(() => import('./components/Onboarding/OnboardingWizard'))
const VideoStudio = lazy(() => import('./components/VideoStudio/VideoStudio'))

function App() {
  const { isAuthenticated } = useSelector((state) => state.auth)
  const dispatch = useDispatch()

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

    if (isAuthenticated) {
      const tenantId = localStorage.getItem('tenant_id')
      if (tenantId) {
        setTenantContext(tenantId)
      }
    }
  }, [dispatch, isAuthenticated])

  return (
    <ErrorBoundary>
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading…</div>}>
        <Routes>
          <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
          <Route path="/onboarding" element={<OnboardingWizard />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
          <Route path="/accept-invite/:token" element={<AcceptInvite />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardHome />} />
            <Route path="articles" element={<ArticleList />} />
            <Route path="articles/create" element={<ArticleCreate />} />
            <Route path="articles/:id/edit" element={<ArticleEdit />} />
            <Route path="rss-feeds" element={<RSSFeedManager />} />
            <Route path="categories" element={<CategoryManager />} />
            <Route path="webstories" element={<WebStoryList />} />
            <Route path="webstories/create" element={<WebStoryCreate />} />
            <Route path="webstories/:id/edit" element={<WebStoryEdit />} />
            <Route path="invite" element={<InviteUser />} />
            <Route path="profile" element={<UserProfile />} />
            <Route path="settings" element={<TenantSettings />} />
            <Route path="video-studio" element={<VideoStudio />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default App
