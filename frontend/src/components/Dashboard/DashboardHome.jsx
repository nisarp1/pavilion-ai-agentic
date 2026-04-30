import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { fetchDashboardStats } from '../../store/slices/dashboardSlice'

const StatCard = ({ label, value, color, to }) => (
  <Link to={to || '#'} className="block bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
    <p className="text-sm text-gray-500 mb-1">{label}</p>
    <p className={`text-3xl font-bold ${color || 'text-gray-800'}`}>{value ?? '—'}</p>
  </Link>
)

const statusLabel = {
  fetched: 'Fetched',
  draft: 'Drafts',
  published: 'Published',
  generating: 'Generating',
  archived: 'Archived',
}

const statusColor = {
  fetched: '#6366f1',
  draft: '#f59e0b',
  published: '#10b981',
  generating: '#3b82f6',
  archived: '#9ca3af',
}

export default function DashboardHome() {
  const dispatch = useDispatch()
  const { stats, loading } = useSelector((s) => s.dashboard)
  const { activeTenant } = useSelector((s) => s.auth)

  useEffect(() => {
    dispatch(fetchDashboardStats())
    const interval = setInterval(() => dispatch(fetchDashboardStats()), 30000)
    return () => clearInterval(interval)
  }, [dispatch, activeTenant])

  const byStatus = stats?.articles_by_status || {}
  const chartData = Object.entries(byStatus).map(([key, count]) => ({
    name: statusLabel[key] || key,
    count,
    fill: statusColor[key] || '#6366f1',
  }))

  const formatDate = (iso) => {
    if (!iso) return 'Never'
    return new Date(iso).toLocaleString()
  }

  if (loading && !stats) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl" />
            ))}
          </div>
          <div className="h-48 bg-gray-200 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Newsroom Overview</h1>
        <button
          onClick={() => dispatch(fetchDashboardStats())}
          className="text-sm text-blue-600 hover:underline"
        >
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Articles"
          value={stats?.total}
          color="text-gray-800"
          to="/articles"
        />
        <StatCard
          label="Published (30 days)"
          value={stats?.published_last_30_days}
          color="text-green-600"
          to="/articles?status=published"
        />
        <StatCard
          label="Drafts"
          value={byStatus.draft}
          color="text-yellow-600"
          to="/articles?status=draft"
        />
        <StatCard
          label="Pending Generation"
          value={stats?.pending_generation}
          color="text-indigo-600"
          to="/articles?status=fetched"
        />
      </div>

      {/* Chart + RSS Feeds */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Article Status Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Articles by Status</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <rect key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No articles yet</p>
          )}
        </div>

        {/* RSS Feed Health */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">RSS Feed Status</h2>
          {stats?.rss_feeds?.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {stats.rss_feeds.map((feed) => (
                <div key={feed.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${feed.is_active ? 'bg-green-400' : 'bg-gray-300'}`} />
                    <span className="text-gray-700 truncate max-w-[160px]" title={feed.name}>{feed.name}</span>
                  </div>
                  <span className="text-gray-400 text-xs">{formatDate(feed.last_fetched_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400 mb-2">No RSS feeds configured</p>
              <Link to="/rss-feeds" className="text-sm text-blue-600 hover:underline">Add your first feed →</Link>
            </div>
          )}
        </div>
      </div>

      {/* Recent Published */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-700">Recently Published</h2>
          <Link to="/articles?status=published" className="text-sm text-blue-600 hover:underline">View all →</Link>
        </div>
        {stats?.recent_published?.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {stats.recent_published.map((article) => (
              <div key={article.id} className="py-2 flex items-center justify-between">
                <Link
                  to={`/articles/${article.id}/edit`}
                  className="text-sm text-gray-800 hover:text-blue-600 truncate max-w-[60%]"
                >
                  {article.title}
                </Link>
                <span className="text-xs text-gray-400">
                  {article.published_at ? new Date(article.published_at).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">No published articles yet</p>
        )}
      </div>
    </div>
  )
}
