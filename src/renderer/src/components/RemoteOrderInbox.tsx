/**
 * WP-G — POS remote-order inbox.
 *
 * Shows pending `submitted` remote requests for this machine and lets staff
 * ACCEPT (creates the real local order exactly once via the WP-F service) or
 * REJECT (zero local effects). Mounted from OrderScreen behind the marked
 * `WP-G remote inbox mount` line; talks to main via the `remoteInbox` preload
 * bridge (appended block at the end of src/preload/index.ts).
 */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Bike, Check, Clock, Inbox, Phone, ShoppingBag, StickyNote, Utensils, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { Badge, Button, EmptyState, IconButton, Input, Modal, Money, toast } from './ui'
import { VirtualKeyboard } from './VirtualKeyboard'

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
  /** Set by main when the request cannot be accepted as sent (e.g. a required option group has no
   *  default). Accept is hidden then; staff can only reject. Both fields may be absent. */
  local_issues?: unknown
  blocked_reason?: string | null
}

const blockedReason = (row: RemoteRow): string =>
  typeof row.blocked_reason === 'string' ? row.blocked_reason.trim() : ''

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
/** Outcome messages stay up as long as the old inline notice did. */
const NOTICE_MS = 5000

export function RemoteOrderInbox() {
  const { t } = useTranslation()
  const isTouch = useAppStore((s) => s.inputMode) === 'touchscreen'
  const [rows, setRows] = useState<RemoteRow[]>([])
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<RemoteRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [keyboardOpen, setKeyboardOpen] = useState(false)

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
    }
  }, [refresh])

  const accept = async (row: RemoteRow) => {
    const api = bridge()
    if (!api || busyId || blockedReason(row)) return
    setBusyId(row.id)
    try {
      const result = await api.accept(row.id)
      if (result.outcome === 'accepted') {
        toast.success(t('remoteInbox.acceptedToast', { number: result.dailyNumber ?? '—' }), { duration: NOTICE_MS })
      } else if (result.outcome === 'lost_race') {
        toast.info(t('remoteInbox.alreadyDecided'), { duration: NOTICE_MS })
      } else if (result.outcome === 'expired' || result.outcome === 'revision_changed') {
        toast.warning(t('remoteInbox.expiredToast'), { duration: NOTICE_MS })
      } else {
        toast.error(t('remoteInbox.acceptFailed', { message: result.message ?? '' }))
      }
    } finally {
      setBusyId(null)
      void refresh()
    }
  }

  const closeReject = () => {
    setRejecting(null)
    setKeyboardOpen(false)
  }

  const confirmReject = async () => {
    const api = bridge()
    if (!api || !rejecting || busyId) return
    setBusyId(rejecting.id)
    try {
      await api.reject(rejecting.id, rejectReason.trim() || undefined)
      toast.info(t('remoteInbox.rejectedToast'), { duration: NOTICE_MS })
    } finally {
      setBusyId(null)
      setRejecting(null)
      setRejectReason('')
      setKeyboardOpen(false)
      void refresh()
    }
  }

  const typeBadge = (row: RemoteRow) => {
    if (row.order_type === 'local') {
      return (
        <Badge variant="neutral" icon={<Utensils />}>
          {t('remoteInbox.dineIn')} · {t('remoteInbox.table')} <bdi className="num">{row.table_number ?? '?'}</bdi>
        </Badge>
      )
    }
    if (row.order_type === 'delivery') {
      return <Badge variant="info" icon={<Bike />}>{t('remoteInbox.delivery')}</Badge>
    }
    return <Badge variant="neutral" icon={<ShoppingBag />}>{t('remoteInbox.takeout')}</Badge>
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
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="tap fixed bottom-4 start-4 z-40 flex min-h-14 items-center gap-2.5 rounded-full bg-ember ps-5 pe-3 text-base font-semibold text-on-primary shadow-glow hover:brightness-[1.07]"
        >
          <Inbox className="h-5 w-5" aria-hidden />
          <span>{t('remoteInbox.title')}</span>
          {rows.length > 0 && (
            <span className="num flex h-8 min-w-8 items-center justify-center rounded-full bg-surface px-2 text-sm font-bold text-primary-ink">
              {rows.length}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-start p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-overlay animate-fade-in" aria-hidden />
          <div
            role="dialog"
            aria-label={t('remoteInbox.title')}
            className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl border border-line bg-surface shadow-e4 animate-pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-primary-soft text-primary-ink flex items-center justify-center">
                  <Inbox className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="truncate text-lg font-bold text-ink">{t('remoteInbox.title')}</h3>
                {rows.length > 0 && <Badge variant="primary" className="num">{rows.length}</Badge>}
              </div>
              <IconButton icon={<X />} label={t('common.close')} size="lg" onClick={() => setOpen(false)} />
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-surface-2/60 p-4">
              {rows.length === 0 ? (
                <EmptyState compact icon={<Inbox />} title={t('remoteInbox.empty')} />
              ) : (
                rows.map((row) => {
                  const blocked = blockedReason(row)
                  return (
                  <article
                    key={row.id}
                    className={
                      blocked
                        ? 'contain-card rounded-2xl border border-danger/50 bg-surface p-4 shadow-e1'
                        : 'contain-card rounded-2xl border border-line bg-surface p-4 shadow-e1'
                    }
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <bdi className="min-w-0 truncate text-base font-bold text-ink">{row.customer_name}</bdi>
                      <Badge variant="warning" icon={<Clock />} className="num shrink-0">
                        {t('remoteInbox.expiresIn', { minutes: minutesLeft(row) })}
                      </Badge>
                    </div>

                    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                      {typeBadge(row)}
                      {row.customer_phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" aria-hidden />
                          <bdi dir="ltr" className="num">{row.customer_phone}</bdi>
                        </span>
                      ) : null}
                    </div>

                    <ul className="space-y-1">
                      {(row.items || []).map((line, index) => (
                        <li key={index} className="flex items-baseline justify-between gap-3 text-sm text-ink-2">
                          <span className="min-w-0">
                            <span className="num font-semibold text-ink">{line.quantity}×</span> <bdi>{line.name}</bdi>
                          </span>
                          <Money value={line.unitPrice * line.quantity} className="shrink-0 text-ink" />
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-dashed border-line-strong pt-2">
                      <span className="text-sm font-semibold text-ink-2">{t('remoteInbox.total')}</span>
                      <Money value={row.quoted_total} className="text-lg font-extrabold text-ink" />
                    </div>

                    {row.note && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-ink">
                        <StickyNote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <p className="min-w-0 break-words">
                          <span className="font-semibold">{t('remoteInbox.note')}:</span> <bdi>{row.note}</bdi>
                        </p>
                      </div>
                    )}

                    {blocked && (
                      <div role="alert" className="mt-3 flex items-start gap-2.5 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger-ink">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                        <div className="min-w-0">
                          <p className="font-bold">{t('remoteInbox.blockedTitle')}</p>
                          <p className="mt-0.5 break-words font-medium">
                            <bdi>{blocked}</bdi>
                          </p>
                          <p className="mt-1 text-xs font-medium">{t('remoteInbox.blockedHint')}</p>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex gap-2">
                      {!blocked && (
                        <Button
                          variant="success"
                          size="lg"
                          className="flex-1"
                          onClick={() => { void accept(row) }}
                          disabled={busyId !== null}
                          loading={busyId === row.id}
                          icon={<Check className="h-5 w-5" />}
                        >
                          {t('remoteInbox.accept')}
                        </Button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setRejecting(row); setRejectReason('') }}
                        disabled={busyId !== null}
                        className="tap inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-5 text-base font-semibold text-danger-ink hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X className="h-5 w-5" aria-hidden />
                        {t('remoteInbox.reject')}
                      </button>
                    </div>
                  </article>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={rejecting !== null}
        onClose={closeReject}
        zIndex={60}
        size="sm"
        closeOnBackdrop={false}
        title={t('remoteInbox.rejectTitle')}
        description={rejecting ? t('remoteInbox.rejectDesc', { name: rejecting.customer_name }) : undefined}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={closeReject}>
              {t('remoteInbox.cancel')}
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={() => { void confirmReject() }}
              disabled={busyId !== null}
              loading={rejecting !== null && busyId === rejecting.id}
            >
              {t('remoteInbox.confirmReject')}
            </Button>
          </>
        }
      >
        <Input
          type="text"
          inputSize="lg"
          dir="auto"
          value={rejectReason}
          readOnly={isTouch}
          onClick={isTouch ? () => setKeyboardOpen(true) : undefined}
          onChange={(e) => setRejectReason(e.target.value)}
          maxLength={300}
          placeholder={t('remoteInbox.rejectReasonPlaceholder')}
        />
      </Modal>

      {/* Touch mode: the reject reason is typed on the on-screen keyboard */}
      {isTouch && rejecting && keyboardOpen && (
        <VirtualKeyboard
          visible
          type="text"
          extended
          value={rejectReason}
          onChange={(value) => setRejectReason(value.slice(0, 300))}
          onClose={() => setKeyboardOpen(false)}
        />
      )}
    </>
  )
}
