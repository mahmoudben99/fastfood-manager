/**
 * WP-G — POS remote-order inbox.
 *
 * Shows pending `submitted` remote requests for this machine and lets staff
 * ACCEPT (creates the real local order exactly once via the WP-F service) or
 * REJECT (zero local effects). Mounted from OrderScreen behind the marked
 * `WP-G remote inbox mount` line; talks to main via the `remoteInbox` preload
 * bridge (appended block at the end of src/preload/index.ts).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface RemoteRow {
  id: string
  order_type: 'local' | 'takeout' | 'delivery'
  table_number?: string | null
  customer_name: string
  customer_phone?: string | null
  note?: string | null
  items: Array<{ menuItemId: number; quantity: number; unitPrice: number; name: string }>
  quoted_total: number
  created_at: string
  expires_at: string
}

interface RemoteInboxBridge {
  list(): Promise<RemoteRow[]>
  accept(id: string): Promise<{ outcome: string; dailyNumber?: number; message?: string }>
  reject(id: string, reason?: string): Promise<{ ok: boolean }>
  onChanged(cb: (rows: RemoteRow[]) => void): () => void
}

function bridge(): RemoteInboxBridge | null {
  const api = (window as any).remoteInbox
  return api && typeof api.list === 'function' ? (api as RemoteInboxBridge) : null
}

const POLL_MS = 5000

export function RemoteOrderInbox() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<RemoteRow[]>([])
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<RemoteRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 5000)
  }, [])

  const refresh = useCallback(async () => {
    const api = bridge()
    if (!api) return
    try {
      const pending = await api.list()
      setRows(Array.isArray(pending) ? pending : [])
    } catch { /* main not ready */ }
  }, [])

  useEffect(() => {
    const api = bridge()
    if (!api) return
    void refresh()
    const unsubscribe = api.onChanged((pending) => setRows(Array.isArray(pending) ? pending : []))
    const interval = setInterval(() => { void refresh() }, POLL_MS)
    return () => {
      unsubscribe()
      clearInterval(interval)
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [refresh])

  const accept = async (row: RemoteRow) => {
    const api = bridge()
    if (!api || busyId) return
    setBusyId(row.id)
    try {
      const result = await api.accept(row.id)
      if (result.outcome === 'accepted') {
        flash(t('remoteInbox.acceptedToast', { number: result.dailyNumber ?? '—' }))
      } else if (result.outcome === 'lost_race') {
        flash(t('remoteInbox.alreadyDecided'))
      } else if (result.outcome === 'expired' || result.outcome === 'revision_changed') {
        flash(t('remoteInbox.expiredToast'))
      } else {
        flash(t('remoteInbox.acceptFailed', { message: result.message ?? '' }))
      }
    } finally {
      setBusyId(null)
      void refresh()
    }
  }

  const confirmReject = async () => {
    const api = bridge()
    if (!api || !rejecting || busyId) return
    setBusyId(rejecting.id)
    try {
      await api.reject(rejecting.id, rejectReason.trim() || undefined)
      flash(t('remoteInbox.rejectedToast'))
    } finally {
      setBusyId(null)
      setRejecting(null)
      setRejectReason('')
      void refresh()
    }
  }

  const typeLabel = (row: RemoteRow) => {
    if (row.order_type === 'local') return `${t('remoteInbox.dineIn')} · ${t('remoteInbox.table')} ${row.table_number ?? '?'}`
    if (row.order_type === 'delivery') return t('remoteInbox.delivery')
    return t('remoteInbox.takeout')
  }

  const minutesLeft = (row: RemoteRow) => {
    const ms = new Date(row.expires_at).getTime() - Date.now()
    return Math.max(0, Math.ceil(ms / 60000))
  }

  if (!bridge()) return null

  return (
    <>
      {/* Floating badge — visible whenever remote requests are waiting */}
      {(rows.length > 0 || open) && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-orange-500 px-4 py-3 text-white shadow-lg hover:bg-orange-600 active:scale-95 transition-transform"
        >
          <span className="text-lg" aria-hidden>📥</span>
          <span className="font-semibold text-sm">{t('remoteInbox.title')}</span>
          {rows.length > 0 && (
            <span className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-orange-600">
              {rows.length}
            </span>
          )}
        </button>
      )}

      {notice && (
        <div className="fixed bottom-20 right-4 z-40 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {notice}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-bold text-gray-900">{t('remoteInbox.title')}</h3>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-500 hover:bg-gray-100">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {rows.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">{t('remoteInbox.empty')}</p>
              ) : (
                rows.map((row) => (
                  <div key={row.id} className="mb-3 rounded-xl border border-gray-200 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-semibold text-gray-900">{row.customer_name}</span>
                      <span className="text-xs font-medium text-orange-600">
                        {t('remoteInbox.expiresIn', { minutes: minutesLeft(row) })}
                      </span>
                    </div>
                    <div className="mb-2 text-xs text-gray-500">
                      {typeLabel(row)}
                      {row.customer_phone ? ` · ${row.customer_phone}` : ''}
                    </div>
                    <div className="mb-2 space-y-0.5">
                      {(row.items || []).map((line, index) => (
                        <div key={index} className="flex justify-between text-sm text-gray-700">
                          <span>{line.quantity}× {line.name}</span>
                          <span>{line.unitPrice * line.quantity}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t pt-1 text-sm font-bold text-gray-900">
                        <span>{t('remoteInbox.total')}</span>
                        <span>{row.quoted_total}</span>
                      </div>
                    </div>
                    {row.note && (
                      <div className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        {t('remoteInbox.note')}: {row.note}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { void accept(row) }}
                        disabled={busyId !== null}
                        className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {busyId === row.id ? '…' : t('remoteInbox.accept')}
                      </button>
                      <button
                        onClick={() => { setRejecting(row); setRejectReason('') }}
                        disabled={busyId !== null}
                        className="flex-1 rounded-lg bg-red-50 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        {t('remoteInbox.reject')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-1 font-bold text-gray-900">{t('remoteInbox.rejectTitle')}</h3>
            <p className="mb-3 text-xs text-gray-500">
              {t('remoteInbox.rejectDesc', { name: rejecting.customer_name })}
            </p>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              maxLength={300}
              placeholder={t('remoteInbox.rejectReasonPlaceholder')}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRejecting(null)}
                className="flex-1 rounded-lg bg-gray-100 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
              >
                {t('remoteInbox.cancel')}
              </button>
              <button
                onClick={() => { void confirmReject() }}
                disabled={busyId !== null}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t('remoteInbox.confirmReject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
