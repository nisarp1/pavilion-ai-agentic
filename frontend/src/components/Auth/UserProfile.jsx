import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import api from '../../services/api'
import { showSuccess, showError } from '../../utils/toast'

export default function UserProfile() {
  const { user } = useSelector(s => s.auth)
  const [profile, setProfile] = useState({ first_name: '', last_name: '', bio: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)

  useEffect(() => {
    api.get('/auth/profile/')
      .then(res => {
        const d = res.data
        setProfile({
          first_name: d.first_name || '',
          last_name: d.last_name || '',
          bio: d.bio || '',
        })
      })
      .catch(() => showError('Failed to load profile'))
      .finally(() => setLoading(false))
  }, [])

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch('/auth/profile/', profile)
      showSuccess('Profile updated')
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (pwForm.new_password !== pwForm.confirm) {
      showError('New passwords do not match')
      return
    }
    setSavingPw(true)
    try {
      await api.post('/auth/change-password/', {
        old_password: pwForm.old_password,
        new_password: pwForm.new_password,
      })
      showSuccess('Password changed successfully')
      setPwForm({ old_password: '', new_password: '', confirm: '' })
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to change password')
    } finally {
      setSavingPw(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-4 max-w-2xl">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-40 bg-gray-200 rounded" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">My Profile</h1>

      {/* Profile form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Personal information</h2>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">First name</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={profile.first_name}
                onChange={e => setProfile(p => ({ ...p, first_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Last name</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={profile.last_name}
                onChange={e => setProfile(p => ({ ...p, last_name: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Email</label>
            <input
              type="email"
              readOnly
              value={user?.email || ''}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Bio</label>
            <textarea
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={profile.bio}
              onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
              placeholder="A short bio about yourself…"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Change password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Current password *</label>
            <input
              type="password"
              required
              value={pwForm.old_password}
              onChange={e => setPwForm(p => ({ ...p, old_password: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">New password *</label>
            <input
              type="password"
              required
              minLength={8}
              value={pwForm.new_password}
              onChange={e => setPwForm(p => ({ ...p, new_password: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Confirm new password *</label>
            <input
              type="password"
              required
              minLength={8}
              value={pwForm.confirm}
              onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={savingPw}
            className="bg-gray-800 hover:bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
          >
            {savingPw ? 'Changing…' : 'Change password'}
          </button>
        </form>
      </div>
    </div>
  )
}
