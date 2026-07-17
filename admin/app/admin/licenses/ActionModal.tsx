'use client'

import { useState } from 'react'
import type { LicenseRow, MutateAction } from '@/lib/license-server'

type Plan = 'monthly' | 'yearly' | 'lifetime'

const ACTIONS: { value: MutateAction; label: string; destructive?: boolean }[] = [
  { value: 'extend', label: 'Extend subscription' },
  { value: 'setPlan', label: 'Set plan' },
  { value: 'grantTrial', label: 'Grant trial' },
  { value: 'reinstate', label: 'Reinstate' },
  { value: 'rebindDevice', label: 'Rebind device' },
  { value: 'revoke', label: 'Revoke', destructive: true },
  { value: 'tombstone', label: 'Tombstone', destructive: true }
]

interface Props {
  license: LicenseRow
  onClose: () => void
  onUpdated: (license: LicenseRow) => void
  onError: (message: string) => void
}

/** Per-row action modal: picks an action, collects its args, confirms destructive ones, POSTs to /api/licenses/mutate. */
export function ActionModal({ license, onClose, onUpdated, onError }: Props) {
  const [action, setAction] = useState<MutateAction>('extend')
  const [days, setDays] = useState('')
  const [plan, setPlan] = useState<Plan>('monthly')
  const [planMode, setPlanMode] = useState<'days' | 'until'>('days')
  const [until, setUntil] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  const meta = ACTIONS.find((a) => a.value === action)!
  const requiresTypedConfirm = !!meta.destructive
  const confirmWord = action === 'revoke' ? 'REVOKE' : 'TOMBSTONE'

  const resetActionState = (next: MutateAction) => {
    setAction(next)
    setLocalError('')
    setConfirmText('')
  }

  const buildArgs = (): { args: Record<string, unknown>; error?: string } => {
    switch (action) {
      case 'extend': {
        const n = Number(days)
        if (!Number.isFinite(n) || n === 0) return { args: {}, error: 'Days must be a non-zero number' }
        return { args: { days: n } }
      }
      case 'setPlan': {
        if (plan === 'lifetime') return { args: { plan } }
        if (planMode === 'days') {
          const n = Number(days)
          if (!Number.isFinite(n) || n <= 0) return { args: {}, error: 'Days must be a positive number' }
          return { args: { plan, days: n } }
        }
        if (!until) return { args: {}, error: 'Pick a date' }
        return { args: { plan, until } }
      }
      case 'grantTrial': {
        if (!days.trim()) return { args: {} }
        const n = Number(days)
        if (!Number.isFinite(n) || n <= 0) return { args: {}, error: 'Days must be a positive number' }
        return { args: { days: n } }
      }
      case 'reinstate': {
        if (!days.trim()) return { args: {} }
        const n = Number(days)
        if (!Number.isFinite(n)) return { args: {}, error: 'Days must be a number' }
        return { args: { days: n } }
      }
      case 'rebindDevice':
      case 'revoke':
      case 'tombstone':
        return { args: {} }
      default:
        return { args: {} }
    }
  }

  const handleSubmit = async () => {
    setLocalError('')
    if (requiresTypedConfirm && confirmText.trim().toUpperCase() !== confirmWord) {
      setLocalError(`Type ${confirmWord} to confirm`)
      return
    }
    const { args, error } = buildArgs()
    if (error) {
      setLocalError(error)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/licenses/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId: license.machine_id, action, ...args })
      })
      const data = await res.json()
      if (!res.ok) {
        const message =
          data?.error === 'not_configured'
            ? 'License server not configured on this deployment (LICENSE_ADMIN_BEARER missing)'
            : data?.error || 'Request failed'
        setLocalError(message)
        onError(`${license.machine_id}: ${message}`)
        return
      }
      onUpdated(data.license)
      onClose()
    } catch {
      setLocalError('Network error')
      onError(`${license.machine_id}: network error`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold">Manage license</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="text-xs text-gray-500 font-mono mb-4">
          {license.machine_id} {license.restaurant_name ? `· ${license.restaurant_name}` : ''}
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
        <select
          value={action}
          onChange={(e) => resetActionState(e.target.value as MutateAction)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>

        {action === 'extend' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Days (non-zero; negative shortens)</label>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="e.g. 30"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        )}

        {action === 'setPlan' && (
          <div className="mb-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as Plan)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </div>
            {plan !== 'lifetime' && (
              <div>
                <div className="flex gap-4 mb-2 text-sm text-gray-700">
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={planMode === 'days'} onChange={() => setPlanMode('days')} /> Days from now
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={planMode === 'until'} onChange={() => setPlanMode('until')} /> Specific date
                  </label>
                </div>
                {planMode === 'days' ? (
                  <input
                    type="number"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    placeholder="e.g. 30"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                ) : (
                  <input
                    type="date"
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {(action === 'grantTrial' || action === 'reinstate') && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Days (optional)</label>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder={action === 'grantTrial' ? 'default: server TRIAL_DAYS' : 'default: keep current subscription_until'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        )}

        {action === 'rebindDevice' && (
          <p className="text-sm text-gray-500 mb-4">
            Clears the bound device secret. The machine re-binds automatically on its next check-in.
          </p>
        )}

        {requiresTypedConfirm && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700 mb-2">
              {action === 'revoke'
                ? 'This immediately locks the customer out.'
                : 'This revokes the license and appends a permanent tombstone marker (the row is retained, never deleted).'}{' '}
              Type <span className="font-mono font-bold">{confirmWord}</span> to confirm.
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmWord}
              className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
        )}

        {localError && <p className="text-sm text-red-600 mb-3">{localError}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 border border-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              meta.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'
            }`}
          >
            {submitting ? 'Working…' : meta.label}
          </button>
        </div>
      </div>
    </div>
  )
}
