import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bike, RefreshCw, TriangleAlert, Users } from 'lucide-react'
import { DELIVERY_STATUSES, type DeliveryListEntry, type DeliveryStatus } from '../../../../shared/delivery'
import { Button, EmptyState, IconButton, Input, Modal, Money, Select, Skeleton, cn, toast } from '../../components/ui'
import { errorText, localToday, minutesBetween, useAsync } from '../cash/cashShared'
import { DeliveryCard } from './DeliveryCard'

const DOT: Record<DeliveryStatus, string> = {
  pending: 'bg-faint',
  preparing: 'bg-warning',
  out_for_delivery: 'bg-info',
  delivered: 'bg-success',
  failed: 'bg-danger'
}
const REFRESH_MS = 15_000

/** Live dispatch board: one column per delivery status, assign drivers, move orders along. */
export function DeliveryBoard() {
  const { t } = useTranslation()
  const [date, setDate] = useState(localToday())
  const [driverFilter, setDriverFilter] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [failing, setFailing] = useState<DeliveryListEntry | null>(null)
  const [reason, setReason] = useState('')
  const [now, setNow] = useState(Date.now())
  const list = useAsync(() => window.api.delivery.list({ date }), [date])
  const drivers = useAsync(() => window.api.delivery.getDrivers(), [])
  const reload = list.reload

  useEffect(() => {
    const poll = setInterval(() => { void reload(); setNow(Date.now()) }, REFRESH_MS)
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [reload])

  const rows = useMemo(
    () => (list.data ?? []).filter((r) => r.order_status !== 'cancelled' && (!driverFilter || String(r.driver_id ?? '') === driverFilter)),
    [list.data, driverFilter]
  )
  const columns = DELIVERY_STATUSES.map((status) => ({ status, items: rows.filter((r) => r.status === status) }))
  const active = rows.filter((r) => r.status !== 'delivered' && r.status !== 'failed')
  const late = active.filter((r) => r.estimated_minutes !== null && minutesBetween(r.created_at, null, now) > r.estimated_minutes).length
  const cod = rows.filter((r) => r.status === 'out_for_delivery' || (r.status === 'delivered' && r.settlement_id === null))
    .reduce((a, r) => a + Math.max(0, r.balance_due), 0)

  const run = useCallback(async (entry: DeliveryListEntry, action: () => Promise<unknown>) => {
    setBusyId(entry.order_id)
    try {
      await action()
      await reload()
    } catch (e) {
      toast.error(t('delivery.board.actionFailed', { number: entry.daily_number }), { description: errorText(e, '') })
    } finally {
      setBusyId(null)
    }
  }, [reload, t])

  const onMove = useCallback((entry: DeliveryListEntry, status: DeliveryStatus) =>
    void run(entry, () => window.api.delivery.setStatus(entry.order_id, status)), [run])
  const onAssign = useCallback((entry: DeliveryListEntry, driverId: number | null) =>
    void run(entry, () => window.api.delivery.assignDriver(entry.order_id, driverId)), [run])
  const onFail = useCallback((entry: DeliveryListEntry) => { setReason(''); setFailing(entry) }, [])

  const confirmFail = async (): Promise<void> => {
    if (!failing) return
    const entry = failing
    setFailing(null)
    await run(entry, () => window.api.delivery.setStatus(entry.order_id, 'failed', reason.trim() || undefined))
  }

  const driverList = drivers.data ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44"><Input type="date" label={t('delivery.board.date')} value={date} max={localToday()} onChange={(e) => setDate(e.target.value || localToday())} /></div>
        <div className="w-52">
          <Select
            label={t('delivery.card.driver')}
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
            options={[{ value: '', label: t('delivery.board.allDrivers') }, ...driverList.map((d) => ({ value: String(d.id), label: d.name }))]}
          />
        </div>
        <IconButton icon={<RefreshCw className={cn(list.loading && 'animate-spin')} />} label={t('delivery.board.refresh')} variant="secondary" size="lg" onClick={() => void reload()} />
        <div className="ms-auto flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl bg-surface border border-line px-3.5 py-2 text-sm">
            <Bike className="h-4 w-4 text-primary-ink" /><span className="text-muted">{t('delivery.board.active')}</span>
            <span className="num font-bold text-ink">{active.length}</span>
          </span>
          <span className={cn('inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm', late > 0 ? 'bg-warning-soft border-transparent text-warning-ink' : 'bg-surface border-line')}>
            <TriangleAlert className="h-4 w-4" /><span className={late > 0 ? '' : 'text-muted'}>{t('delivery.board.late')}</span>
            <span className="num font-bold">{late}</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-xl bg-surface border border-line px-3.5 py-2 text-sm">
            <span className="text-muted">{t('delivery.board.codOut')}</span>
            <span className="font-bold text-ink"><Money value={cod} decimals={0} /></span>
          </span>
        </div>
      </div>

      {driverList.length === 0 && drivers.data && (
        <div className="flex items-center gap-3 rounded-2xl bg-info-soft text-info-ink px-4 py-3 text-sm">
          <Users className="h-5 w-5 shrink-0" />
          <p>{t('delivery.board.noDrivers')}</p>
        </div>
      )}

      {list.loading && !list.data ? (
        <div className="grid grid-cols-5 gap-3">{DELIVERY_STATUSES.map((s) => <Skeleton key={s} className="h-80 rounded-2xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={<Bike />} title={t('delivery.board.emptyTitle')} />
        </div>
      ) : (
        <div className="relative overflow-x-auto pb-2 -mx-1 px-1">
          <div className="grid grid-cols-5 gap-3 min-w-[1040px]">
            {columns.map(({ status, items }) => (
              <section key={status} className="rounded-2xl bg-surface-2 border border-line p-2.5 flex flex-col gap-2.5 min-h-64">
                <header className="flex items-center justify-between px-1.5 pt-1">
                  <span className="flex items-center gap-2 text-sm font-bold text-ink">
                    <span className={cn('h-2.5 w-2.5 rounded-full', DOT[status])} aria-hidden="true" />
                    {t(`delivery.status.${status}`)}
                  </span>
                  <span className="num min-w-7 rounded-full bg-surface px-2 text-center text-xs font-bold leading-6 text-ink-2 border border-line">{items.length}</span>
                </header>
                {items.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted">{t('delivery.board.columnEmpty')}</p>
                ) : (
                  items.map((entry) => (
                    <DeliveryCard
                      key={entry.order_id}
                      entry={entry}
                      drivers={driverList}
                      now={now}
                      busy={busyId === entry.order_id}
                      onMove={onMove}
                      onFail={onFail}
                      onAssign={onAssign}
                    />
                  ))
                )}
              </section>
            ))}
          </div>
        </div>
      )}

      <Modal
        isOpen={failing !== null}
        onClose={() => setFailing(null)}
        size="sm"
        title={t('delivery.fail.title', { number: failing?.daily_number ?? '' })}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setFailing(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" size="lg" onClick={confirmFail}>{t('delivery.fail.confirm')}</Button>
          </>
        }
      >
        <Input label={t('cashAdmin.reason')} value={reason} maxLength={200} autoFocus placeholder={t('delivery.fail.placeholder')} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  )
}
