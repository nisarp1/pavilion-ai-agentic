/**
 * Google OAuth Login Component
 *
 * Handles Google authentication flow:
 * 1. User clicks "Sign in with Google"
 * 2. Google OAuth dialog opens
 * 3. User authenticates with their Google account
 * 4. Frontend receives ID token
 * 5. Frontend sends token to backend /api/auth/google/callback/
 * 6. Backend verifies token and issues JWT tokens
 * 7. User is authenticated and redirected to dashboard
 */

import React, { useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { Card, Button, Spinner, Alert } from '@blueprintjs/core'
import api from '../../services/api'
import { setActiveTenant, fetchTenants } from '../../store/slices/authSlice'

export function GoogleLoginComponent({ tenantId, onLoginSuccess }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSuccess = async (credentialResponse) => {
    setLoading(true)
    setError(null)

    try {
      // Send credential to backend for verification and JWT generation
      const payload = {
        credential: credentialResponse.credential,
      }

      // If tenant is known, include it
      if (tenantId) {
        payload.tenant_id = tenantId
      }

      const response = await api.post('/auth/google/callback/', payload, {
        // Don't include auth header for this request (user not authenticated yet)
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const { access, refresh, user, tenant } = response.data

      // Store tokens in localStorage
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
      localStorage.setItem('tenant_id', tenant.id)

      // Update Redux state with active tenant
      dispatch(setActiveTenant({ id: tenant.id, name: tenant.name, role: tenant.role }))

      // Fetch all user's tenants
      await dispatch(fetchTenants())

      // Redirect to dashboard
      if (onLoginSuccess) {
        onLoginSuccess(user, tenant)
      } else {
        navigate('/dashboard')
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
    <div className="google-login-container">
      {error && <Alert intent="danger" title="Login Error">{error}</Alert>}

      <div className="google-login-button-wrapper">
        {loading ? (
          <Spinner size={40} />
        ) : (
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            useOneTap
            locale="en"
            theme="outline"
            size="large"
            text="signin"
          />
        )}
      </div>

      <style>{`
        .google-login-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          align-items: center;
        }

        .google-login-button-wrapper {
          display: flex;
          justify-content: center;
          min-height: 50px;
          align-items: center;
        }

        .bp5-alert {
          width: 100%;
        }
      `}</style>
    </div>
  )
}

export default GoogleLoginComponent
