'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  machineId: string
  trialStatus: string
}

export function TrialControls({ machineId, trialStatus }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [customDays, setCustomDays] = useState('')

  const doAction = async (action: string, days?: number) => {
    setError('')
    const res = await fetch('/api/trial/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId, action, days })
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Action failed')
    } else {
      startTransition(() => router.refresh())
    }
  }

  const isActive = trialStatus === 'active'
  const isPaused = trialStatus === 'paused'

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-3">Trial Controls</h3>

      {/* Extend */}
      <div className="mb-3">
        <p className="text-xs text-gray-500 mb-2">Extend trial by:</p>
        <div className="flex flex-wrap gap-2">
          {[1, 3, 7, 14].map((days) => (
            <button
              key={days}
              onClick={() => doAction('extend', days)}
              disabled={isPending}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              +{days}d
            </button>
          ))}
          <div className="flex gap-1">
            <input
              type="number"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              placeholder="days"
              min="1"
              max="365"
              className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              onClick={() => { if (customDays) doAction('extend', Number(customDays)) }}
              disabled={isPending || !customDays}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              +Custom
            </button>
          </div>
        </div>
      </div>

      {/* Pause / Resume / Terminate */}
      <div className="flex flex-wrap gap-2">
        {isActive && (
          <button
            onClick={() => doAction('pause')}
            disabled={isPending}
            className="px-3 py-1.5 text-sm rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 transition-colors disabled:opacity-50"
          >
            ⏸ Pause
          </button>
        )}
        {isPaused && (
          <button
            onClick={() => doAction('resume')}
            disabled={isPending}
            className="px-3 py-1.5 text-sm rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            ▶ Resume
          </button>
        )}
        <button
          onClick={() => { if (confirm('Terminate this trial immediately?')) doAction('terminate') }}
          disabled={isPending}
          className="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          🚫 Terminate
        </button>
        {trialStatus === 'expired' && (
          <button
            onClick={() => { if (confirm('Reactivate this trial?')) doAction('reactivate') }}
            disabled={isPending}
            className="px-3 py-1.5 text-sm rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            ♻ Reactivate
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {isPending && <p className="mt-2 text-xs text-gray-400">Refreshing…</p>}
    </div>
  )
}
