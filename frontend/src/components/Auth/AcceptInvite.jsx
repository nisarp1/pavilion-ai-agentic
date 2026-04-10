import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import api from '../../services/api'
import { fetchTenants } from '../../store/slices/authSlice'
import { FiCheckCircle, FiLoader, FiAlertCircle } from 'react-icons/fi'

function AcceptInvite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { isAuthenticated } = useSelector((state) => state.auth)
  const [status_msg, setStatusMsg] = useState('processing')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isAuthenticated) {
      // Store token in session to accept after login
      localStorage.setItem('pending_invite_token', token)
      navigate('/login')
      return
    }

    const acceptInvite = async () => {
      try {
        const response = await api.post('/api/tenants/accept_invitation/', { token })
        setStatusMsg('success')
        // Refresh tenants list in Redux
        dispatch(fetchTenants())
        setTimeout(() => navigate('/'), 3000)
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to accept invitation')
        setStatusMsg('error')
      }
    }

    acceptInvite()
  }, [token, isAuthenticated, navigate, dispatch])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center border border-gray-100">
        {status_msg === 'processing' && (
          <div className="flex flex-col items-center">
            <FiLoader size={48} className="text-primary-600 animate-spin mb-4" />
            <h2 className="text-2xl font-bold text-gray-800">Processing Invitation</h2>
            <p className="text-gray-600 mt-2">Please wait while we join you to the tenant...</p>
          </div>
        )}

        {status_msg === 'success' && (
          <div className="flex flex-col items-center">
            <FiCheckCircle size={48} className="text-green-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-800">Success!</h2>
            <p className="text-gray-600 mt-2">You have successfully joined the organization.</p>
            <p className="text-sm text-gray-500 mt-4 italic text-primary-600">Redirecting to dashboard...</p>
          </div>
        )}

        {status_msg === 'error' && (
          <div className="flex flex-col items-center">
            <FiAlertCircle size={48} className="text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-800">Oops!</h2>
            <p className="text-red-600 mt-2">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="mt-6 text-primary-600 font-semibold hover:underline"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default AcceptInvite
