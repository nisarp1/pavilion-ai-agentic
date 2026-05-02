import React from 'react'

export function CardSkeleton() {
  return (
    <div className="animate-pulse bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
      <div className="h-8 bg-gray-200 rounded w-1/2" />
    </div>
  )
}

export function ArticleRowSkeleton() {
  return (
    <div className="animate-pulse flex items-center gap-4 py-3 border-b border-gray-100">
      <div className="w-4 h-4 bg-gray-200 rounded" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
      </div>
      <div className="h-6 bg-gray-200 rounded w-20" />
      <div className="h-8 bg-gray-200 rounded w-24" />
    </div>
  )
}

export function ArticleListSkeleton({ rows = 8 }) {
  return (
    <div className="space-y-0">
      {[...Array(rows)].map((_, i) => (
        <ArticleRowSkeleton key={i} />
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="h-56 bg-gray-200 rounded-xl" />
        <div className="h-56 bg-gray-200 rounded-xl" />
      </div>
      <div className="h-40 bg-gray-200 rounded-xl" />
    </div>
  )
}
