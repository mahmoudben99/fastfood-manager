'use client'

import { useMemo, useState } from 'react'
import type { LicenseRow, LicenseStatus } from '@/lib/license-server'
import { ActionModal } from './ActionModal'

export interface Toast {
  id: number
  kind: 'success' | 'error'
  message: string
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function timeAgo(iso: string | null) {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  if (ms < 60000) return 'just now'
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`
  return `${Math.floor(ms / 86400000)}d ago`
}

const STATUS_STYLES: Record<LicenseStatus, string> = {
  trial: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  expired: 'bg-gray-200 text-gray-600',
  revoked: 'bg-red-100 text-red-700'
}

function StatusBadge({ status }: { status: LicenseStatus }) {
  return (
    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_STYLES[status]}`}>
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  )
}

function PlanBadge({ plan }: { plan: LicenseRow['plan'] }) {
  if (!plan) return <span className="text-gray-400">—</span>
  return <span className="text-gray-700">{plan[0].toUpperCase() + plan.slice(1)}</span>
}

export function LicensesTable({ initialLicenses }: { initialLicenses: LicenseRow[] }) {
  const [licenses, setLicenses] = useState<LicenseRow[]>(initialLicenses)
  const [search, setSearch] = useState('')
  const [activeMachineId, setActiveMachineId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const pushToast = (kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, kind, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }

  const handleUpdated = (updated: LicenseRow) => {
    setLicenses((prev) => prev.map((l) => (l.machine_id === updated.machine_id ? updated : l)))
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return licenses
    return licenses.filter(
      (l) =>
        (l.restaurant_name || '').toLowerCase().includes(q) ||
        l.machine_id.toLowerCase().includes(q) ||
        (l.phone || '').toLowerCase().includes(q)
    )
  }, [licenses, search])

  const activeLicense = licenses.find((l) => l.machine_id === activeMachineId) || null

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by restaurant, machine ID, or phone..."
        className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Restaurant</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Machine ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Subscription Until</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Bound</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Last Seen</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((l) => (
              <tr key={l.machine_id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium">{l.restaurant_name || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{l.machine_id}</td>
                <td className="px-4 py-3">
                  <PlanBadge plan={l.plan} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={l.effective} />
                </td>
                <td className="px-4 py-3 text-gray-600">{formatDate(l.subscription_until)}</td>
                <td className="px-4 py-3">
                  {l.bound ? (
                    <span className="text-green-600 font-medium">Yes</span>
                  ) : (
                    <span className="text-gray-400">No</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500" title={l.last_seen || ''}>
                  {timeAgo(l.last_seen)}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setActiveMachineId(l.machine_id)}
                    className="text-orange-500 hover:text-orange-600 font-medium"
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No licenses found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeLicense && (
        <ActionModal
          license={activeLicense}
          onClose={() => setActiveMachineId(null)}
          onUpdated={(updated) => {
            handleUpdated(updated)
            pushToast('success', `${updated.machine_id}: updated`)
          }}
          onError={(message) => pushToast('error', message)}
        />
      )}

      <div className="fixed bottom-4 right-4 z-50 space-y-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg shadow-lg px-4 py-3 text-sm font-medium text-white ${
              t.kind === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
