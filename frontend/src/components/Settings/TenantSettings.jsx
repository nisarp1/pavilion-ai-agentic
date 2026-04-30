import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import api from '../../services/api'
import { showSuccess, showError } from '../../utils/toast'
import { FiCopy, FiTrash2, FiKey } from 'react-icons/fi'

export default function TenantSettings() {
  const { activeTenant, currentRole } = useSelector(s => s.auth)
  const [settings, setSettings] = useState({ name: '', subdomain: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [apiKeys, setApiKeys] = useState([])
  const [creatingKey, setCreatingKey] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [revealedKey, setRevealedKey] = useState(null)

  const tenantId = activeTenant?.id || localStorage.getItem('tenant_id')

  useEffect(() => {
    if (!tenantId) { setLoading(false); return }
    api.get(`/tenants/${tenantId}/`)
      .then(res => {
        setSettings({ name: res.data.name || '', subdomain: res.data.subdomain || '' })
        setApiKeys(res.data.api_keys || [])
      })
      .catch(() => showError('Failed to load tenant settings'))
      .finally(() => setLoading(false))
  }, [tenantId])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch(`/tenants/${tenantId}/update_settings/`, settings)
      showSuccess('Settings saved')
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateKey = async (e) => {
    e.preventDefault()
    if (!newKeyName.trim()) { showError('Key name is required'); return }
    setCreatingKey(true)
    try {
      const res = await api.post(`/tenants/${tenantId}/manage_api_keys/`, { name: newKeyName.trim() })
      setRevealedKey(res.data.key)
      setApiKeys(prev => [...prev, { id: res.data.id, name: res.data.name, created_at: res.data.created_at }])
      setNewKeyName('')
      showSuccess('API key created — copy it now, it won\'t be shown again')
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to create key')
    } finally {
      setCreatingKey(false)
    }
  }

  const handleDeleteKey = async (keyId) => {
    if (!window.confirm('Delete this API key? This cannot be undone.')) return
    try {
      await api.delete(`/tenants/${tenantId}/manage_api_keys/`, { data: { key_id: keyId } })
      setApiKeys(prev => prev.filter(k => k.id !== keyId))
      showSuccess('API key deleted')
    } catch {
      showError('Failed to delete key')
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => showSuccess('Copied to clipboard'))
  }

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-4 max-w-2xl">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-40 bg-gray-200 rounded" />
      </div>
    )
  }

  if (currentRole !== 'admin') {
    return (
      <div className="p-6 text-gray-500">Only admins can view newsroom settings.</div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">Newsroom Settings</h1>

      {/* General settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">General</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Newsroom name *</label>
            <input
              required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={settings.name}
              onChange={e => setSettings(s => ({ ...s, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Subdomain *</label>
            <div className="flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
              <input
                required
                className="flex-1 px-3 py-2 text-sm outline-none"
                value={settings.subdomain}
                onChange={e => setSettings(s => ({
                  ...s,
                  subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                }))}
              />
              <span className="px-3 py-2 bg-gray-50 text-xs text-gray-400 border-l">.pavilion.app</span>
            </div>
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

      {/* API Keys */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-1 flex items-center gap-2">
          <FiKey size={16} /> API Keys
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Use API keys to authenticate programmatic access to your newsroom's API.
          Keys are shown only once at creation.
        </p>

        {revealedKey && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-xs text-green-700 font-medium mb-1">New API key — copy it now:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-green-800 bg-green-100 px-2 py-1 rounded break-all">
                {revealedKey}
              </code>
              <button
                onClick={() => copyToClipboard(revealedKey)}
                className="p-1.5 text-green-700 hover:bg-green-100 rounded"
                title="Copy"
              >
                <FiCopy size={14} />
              </button>
            </div>
            <button
              onClick={() => setRevealedKey(null)}
              className="text-xs text-green-600 hover:underline mt-2"
            >
              I've saved it, dismiss
            </button>
          </div>
        )}

        {apiKeys.length > 0 && (
          <div className="divide-y divide-gray-100 mb-4">
            {apiKeys.map(key => (
              <div key={key.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-800">{key.name}</p>
                  <p className="text-xs text-gray-400">
                    Created {new Date(key.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteKey(key.id)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  title="Delete key"
                >
                  <FiTrash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleCreateKey} className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Key name, e.g. Production"
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
          />
          <button
            type="submit"
            disabled={creatingKey}
            className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            {creatingKey ? 'Creating…' : 'Create key'}
          </button>
        </form>
      </div>
    </div>
  )
}
