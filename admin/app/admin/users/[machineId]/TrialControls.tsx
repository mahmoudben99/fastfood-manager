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
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [customDays, setCustomDays] = useState('')
  const [customExpiry, setCustomExpiry] = useState('')

  const doAction = async (action: string, label: string, days?: number, expiresAt?: string) => {
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await fetch('/api/trial/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId, action, days, expiresAt })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Action failed')
      } else {
        setSuccess(label)
        setTimeout(() => setSuccess(''), 5000)
        startTransition(() => router.refresh())
      }
    } catch {
      setError('Network error — check your connection')
    } finally {
      setLoading(false)
    }
  }

  const disabled = isPending || loading
  const isActive = trialStatus === 'active'
  const isPaused = trialStatus === 'paused'

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-3">Trial Controls</h3>

      {/* Success feedback */}
      {success && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
          ✓ {success}
        </div>
      )}

      {/* Error feedback */}
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          ✗ {error}
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Applying action...
        </div>
      )}

      <div className="mb-3">
        <p className="text-xs text-gray-500 mb-2">Extend trial by:</p>
        <div className="flex flex-wrap gap-2">
          {[1, 3, 7, 14].map((d) => (
            <button
              key={d}
              onClick={() => doAction('extend', `Extended trial by ${d} day(s)`, d)}
              disabled={disabled}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              +{d}d
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
              onClick={() => { if (customDays) doAction('extend', `Extended trial by ${customDays} day(s)`, Number(customDays)) }}
              disabled={disabled || !customDays}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              +Custom
            </button>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs text-gray-500 mb-2">Reduce trial by:</p>
        <div className="flex flex-wrap gap-2">
          {[1, 3, 7].map((d) => (
            <button
              key={d}
              onClick={() => doAction('reduce', `Reduced trial by ${d} day(s)`, d)}
              disabled={disabled}
              className="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              -{d}d
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">Set exact expiry date/time:</p>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={customExpiry}
            onChange={(e) => setCustomExpiry(e.target.value)}
            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          <button
            onClick={() => { if (customExpiry) doAction('setExpiry', `Expiry set to ${new Date(customExpiry).toLocaleString()}`, undefined, customExpiry) }}
            disabled={disabled || !customExpiry}
            className="px-3 py-1.5 text-sm rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors disabled:opacity-50"
          >
            Set
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {isActive && (
          <button
            onClick={() => doAction('pause', 'Trial paused — clock frozen')}
            disabled={disabled}
            className="px-3 py-1.5 text-sm rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 transition-colors disabled:opacity-50"
          >
            ⏸ Pause
          </button>
        )}
        {isPaused && (
          <button
            onClick={() => doAction('resume', 'Trial resumed — clock running')}
            disabled={disabled}
            className="px-3 py-1.5 text-sm rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            ▶ Resume
          </button>
        )}
        <button
          onClick={() => { if (confirm('Terminate this trial immediately?')) doAction('terminate', 'Trial terminated') }}
          disabled={disabled}
          className="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          🚫 Terminate
        </button>
        {trialStatus === 'expired' && (
          <button
            onClick={() => { if (confirm('Reactivate this trial for 7 days?')) doAction('reactivate', 'Trial reactivated for 7 days') }}
            disabled={disabled}
            className="px-3 py-1.5 text-sm rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            ♻ Reactivate
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Changes take effect on the app within ~30 seconds.
      </p>
    </div>
  )
}
