'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export function AutoRefresh({ fetchedAt }: { fetchedAt: string }) {
  const router = useRouter()
  const [lastRefresh, setLastRefresh] = useState(fetchedAt)

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh()
      setLastRefresh(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 15_000)
    return () => clearInterval(interval)
  }, [router])

  const handleManualRefresh = () => {
    router.refresh()
    setLastRefresh(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
  }

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <span>Updated {lastRefresh}</span>
      <button onClick={handleManualRefresh} className="text-blue-500 hover:text-blue-700 underline">
        Refresh
      </button>
    </div>
  )
}
