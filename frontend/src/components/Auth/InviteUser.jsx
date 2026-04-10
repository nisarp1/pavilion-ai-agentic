import React, { useState } from 'react'
import { useSelector } from 'react-redux'
import api from '../../services/api'
import { FiSend, FiUserPlus, FiCheckCircle, FiAlertCircle } from 'react-icons/fi'

function InviteUser() {
  const { activeTenant } = useSelector((state) => state.auth)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!activeTenant) return

    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const response = await api.post(`/api/tenants/${activeTenant}/invite_user/`, {
        email,
        role,
      })
      setMessage(response.data.message)
      setEmail('')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send invitation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800 flex items-center">
            <FiUserPlus className="mr-2 text-primary-600" />
            Invite Member to Tenant
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Send an invitation to join your current active tenant.
          </p>
        </div>

        <form onSubmit={handleInvite} className="p-6 space-y-4">
          {message && (
            <div className="p-4 bg-green-50 text-green-700 rounded-lg flex items-center">
              <FiCheckCircle className="mr-2" />
              {message}
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center">
              <FiAlertCircle className="mr-2" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
            >
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading || !activeTenant}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
          >
            {loading ? (
              'Sending...'
            ) : (
              <>
                <FiSend className="mr-2" /> Send Invitation
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default InviteUser
