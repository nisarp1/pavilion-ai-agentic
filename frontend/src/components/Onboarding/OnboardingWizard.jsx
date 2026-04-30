import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import api from '../../services/api'
import { showSuccess, showError } from '../../utils/toast'

const STEPS = ['Create Account', 'Create Newsroom', 'Add RSS Feed']

export default function OnboardingWizard() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  const [account, setAccount] = useState({ email: '', password: '', first_name: '', last_name: '' })
  const [newsroom, setNewsroom] = useState({ name: '', subdomain: '' })
  const [rss, setRss] = useState({ name: '', url: '' })

  const [tokens, setTokens] = useState(null)
  const [tenant, setTenant] = useState(null)

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post('/auth/register/', account)
      localStorage.setItem('access_token', res.data.access)
      localStorage.setItem('refresh_token', res.data.refresh)
      setTokens(res.data)
      showSuccess('Account created!')
      setStep(1)
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.email?.[0] || 'Registration failed'
      showError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNewsroom = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post('/tenants/', newsroom)
      const t = res.data
      localStorage.setItem('tenant_id', t.id)
      setTenant(t)
      showSuccess('Newsroom created!')
      setStep(2)
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.subdomain?.[0] || 'Failed to create newsroom'
      showError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleAddRSS = async (e) => {
    e.preventDefault()
    if (!rss.url) { navigate('/'); return }
    setLoading(true)
    try {
      await api.post('/rss/feeds/', rss)
      showSuccess('RSS feed added!')
    } catch (err) {
      showError('Could not add RSS feed, but you can add it later.')
    } finally {
      setLoading(false)
      navigate('/')
    }
  }

  const subdomainHint = newsroom.name
    ? newsroom.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <React.Fragment key={i}>
              <div className={`flex items-center gap-1 text-xs font-medium ${i <= step ? 'text-blue-600' : 'text-gray-400'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${i < step ? 'bg-blue-600 text-white' : i === step ? 'border-2 border-blue-600 text-blue-600' : 'border-2 border-gray-300 text-gray-400'}`}>
                  {i < step ? '✓' : i + 1}
                </span>
                <span className="hidden sm:block">{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px ${i < step ? 'bg-blue-400' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 0: Register */}
        {step === 0 && (
          <form onSubmit={handleRegister} className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Create your account</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">First name</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={account.first_name} onChange={e => setAccount(a => ({...a, first_name: e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Last name</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={account.last_name} onChange={e => setAccount(a => ({...a, last_name: e.target.value}))} />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Email *</label>
              <input type="email" required className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={account.email} onChange={e => setAccount(a => ({...a, email: e.target.value}))} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Password *</label>
              <input type="password" required minLength={8} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={account.password} onChange={e => setAccount(a => ({...a, password: e.target.value}))} />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium text-sm disabled:opacity-60 transition-colors">
              {loading ? 'Creating account…' : 'Create account →'}
            </button>
            <p className="text-center text-sm text-gray-500">
              Already have an account? <Link to="/login" className="text-blue-600 hover:underline">Sign in</Link>
            </p>
          </form>
        )}

        {/* Step 1: Newsroom */}
        {step === 1 && (
          <form onSubmit={handleCreateNewsroom} className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Name your newsroom</h2>
            <p className="text-sm text-gray-500">This is the name of your news organisation on Pavilion.</p>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Newsroom name *</label>
              <input required className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newsroom.name}
                onChange={e => {
                  const name = e.target.value
                  setNewsroom(n => ({
                    name,
                    subdomain: n.subdomain || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                  }))
                }}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Subdomain *</label>
              <div className="flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                <input required className="flex-1 px-3 py-2 text-sm outline-none"
                  value={newsroom.subdomain}
                  onChange={e => setNewsroom(n => ({...n, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')}))}
                />
                <span className="px-3 py-2 bg-gray-50 text-xs text-gray-400 border-l">.pavilion.app</span>
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium text-sm disabled:opacity-60 transition-colors">
              {loading ? 'Creating newsroom…' : 'Create newsroom →'}
            </button>
          </form>
        )}

        {/* Step 2: RSS Feed */}
        {step === 2 && (
          <form onSubmit={handleAddRSS} className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Add your first RSS feed</h2>
            <p className="text-sm text-gray-500">Add a news source to start pulling articles. You can skip this and add feeds later.</p>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Feed name</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={rss.name} onChange={e => setRss(r => ({...r, name: e.target.value}))} placeholder="e.g. BBC Sport" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">RSS URL</label>
              <input type="url" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={rss.url} onChange={e => setRss(r => ({...r, url: e.target.value}))} placeholder="https://feeds.bbci.co.uk/sport/rss.xml" />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => navigate('/')} className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-600 py-2.5 rounded-lg font-medium text-sm transition-colors">
                Skip for now
              </button>
              <button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium text-sm disabled:opacity-60 transition-colors">
                {loading ? 'Adding…' : 'Add & Go →'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
