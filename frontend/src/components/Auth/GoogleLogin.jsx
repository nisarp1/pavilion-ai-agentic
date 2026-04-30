import React, { useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import api from '../../services/api'
import { loginWithGoogle, fetchTenants } from '../../store/slices/authSlice'

export function GoogleLoginComponent({ tenantId, onLoginSuccess }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSuccess = async (credentialResponse) => {
    setLoading(true)
    setError(null)

    try {
      const payload = {
        credential: credentialResponse.credential,
      }

      if (tenantId) {
        payload.tenant_id = tenantId
      }

      const response = await api.post('/auth/google/callback/', payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const { access, refresh, user, tenant } = response.data

      dispatch(loginWithGoogle({ access, refresh, tenant }))

      await dispatch(fetchTenants())

      if (onLoginSuccess) {
        onLoginSuccess(user, tenant)
      } else {
        navigate('/')
      }
    } catch (err) {
      console.error('Google login failed:', err)
      setError(err.response?.data?.error || 'Failed to authenticate with Google. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleError = () => {
    console.log('Google login failed')
    setError('Google authentication failed. Please try again.')
  }

  return (
    <div className="flex flex-col gap-4 items-center">
      {error && (
        <div className="w-full bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}
      <div className="flex justify-center items-center min-h-[50px]">
        {loading ? (
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        ) : (
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            locale="en"
            theme="outline"
            size="large"
            text="signin_with"
          />
        )}
      </div>
    </div>
  )
}

export default GoogleLoginComponent
