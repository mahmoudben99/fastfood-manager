'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  machineId: string
  trialStatus: string
  hasActivation: boolean
}

type Mode = 'trial' | 'full' | 'expired'

export function TrialControls({ machineId, trialStatus, hasActivation }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState('')
  const [customExpiry, setCustomExpiry] = useState('')

  const currentMode: Mode = hasActivation ? 'full' : (trialStatus === 'expired' ? 'expired' : 'trial')

  const doAction = async (action: string, label: string, payload?: Record<string, unknown>) => {
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await fetch('/api/trial/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId, action, ...payload })
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

  const handleAdjustDays = () => {
    const n = Number(days)
    if (!n || n === 0) return
    if (n > 0) {
      doAction('extend', `Extended trial by ${n} day(s)`, { days: n })
    } else {
      doAction('reduce', `Reduced trial by ${Math.abs(n)} day(s)`, { days: Math.abs(n) })
    }
  }

  const handleSetExpiry = () => {
    if (!customExpiry) return
    doAction('setExpiry', `Expiry set to ${new Date(customExpiry).toLocaleString()}`, { expiresAt: customExpiry })
  }

  const handleSetMode = (mode: Mode) => {
    if (mode === currentMode) return
    const confirmMsg = mode === 'full'
      ? 'Grant full license to this machine?'
      : mode === 'expired'
        ? 'Set this machine to expired (locked)?'
        : 'Set this machine back to trial mode?'
    if (!confirm(confirmMsg)) return
    doAction('setMode', `Mode changed to ${mode}`, { mode })
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-3">Controls</h3>

      {success && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}
      {loading && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Applying...
        </div>
      )}

      {/* Mode toggle: Trial / Full License / Expired */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">Activation mode:</p>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {([
            { mode: 'trial' as Mode, label: 'Trial', color: 'bg-blue-500 text-white' },
            { mode: 'full' as Mode, label: 'Full License', color: 'bg-green-500 text-white' },
            { mode: 'expired' as Mode, label: 'Expired', color: 'bg-red-500 text-white' }
          ]).map(({ mode, label, color }) => (
            <button
              key={mode}
              onClick={() => handleSetMode(mode)}
              disabled={disabled}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                currentMode === mode ? color : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Adjust days (+/-) */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">Adjust trial days (positive to add, negative to remove):</p>
        <div className="flex gap-2">
          <input
            type="number"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="e.g. 7 or -3"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={handleAdjustDays}
            disabled={disabled || !days || Number(days) === 0}
            className="px-4 py-2 text-sm rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50 font-medium"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Set exact expiry */}
      <div className="mb-3">
        <p className="text-xs text-gray-500 mb-2">Set exact expiry date/time:</p>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={customExpiry}
            onChange={(e) => setCustomExpiry(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          <button
            onClick={handleSetExpiry}
            disabled={disabled || !customExpiry}
            className="px-4 py-2 text-sm rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors disabled:opacity-50 font-medium"
          >
            Set
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Changes take effect on the app within ~30 seconds.
      </p>
    </div>
  )
}
