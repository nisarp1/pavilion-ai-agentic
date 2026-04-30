import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { showSuccess, showError } from '../../utils/toast'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/auth/password-reset/', { email })
      setSent(true)
      showSuccess('Reset link sent — check your email')
    } catch {
      showError('Could not send reset link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Forgot password</h2>
        {sent ? (
          <>
            <p className="text-gray-600 mb-6">
              If that email exists in our system, you'll receive a reset link shortly.
            </p>
            <Link to="/login" className="block text-center text-sm text-blue-600 hover:underline">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-6">
              Enter your email address and we'll send you a link to reset your password.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="you@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium text-sm disabled:opacity-60 transition-colors"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <p className="text-center text-sm text-gray-500 mt-4">
              Remember your password?{' '}
              <Link to="/login" className="text-blue-600 hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
