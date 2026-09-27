import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck, Clock, MapPin, Phone, RotateCcw, Timer, TriangleAlert, Undo2, CircleX } from 'lucide-react'
import type { DeliveryListEntry, DeliveryStatus } from '../../../../shared/delivery'
import { Badge, Button, IconButton, Money, cn, controlClass } from '../../components/ui'
import { fmtTime, minutesBetween } from '../cash/cashShared'

/** The main forward step of each column; `failed` retries from pending. */
const NEXT: Partial<Record<DeliveryStatus, DeliveryStatus>> = {
  pending: 'preparing',
  preparing: 'out_for_delivery',
  out_for_delivery: 'delivered',
  failed: 'pending'
}

/** When the clock for "elapsed" starts in each status. */
function since(entry: DeliveryListEntry): string | null {
  if (entry.status === 'out_for_delivery') return entry.out_for_delivery_at
  if (entry.status === 'delivered') return entry.out_for_delivery_at ?? entry.created_at
  return entry.created_at
}

interface DeliveryCardProps {
  entry: DeliveryListEntry
  drivers: { id: number; name: string }[]
  now: number
  busy: boolean
  onMove: (entry: DeliveryListEntry, status: DeliveryStatus) => void
  onFail: (entry: DeliveryListEntry) => void
  onAssign: (entry: DeliveryListEntry, driverId: number | null) => void
}

export const DeliveryCard = memo(function DeliveryCard({ entry, drivers, now, busy, onMove, onFail, onAssign }: DeliveryCardProps) {
  const { t } = useTranslation()
  const done = entry.status === 'delivered'
  const failed = entry.status === 'failed'
  const settled = entry.settlement_id !== null
  const total = minutesBetween(entry.created_at, done ? entry.delivered_at : null, now)
  const inStatus = minutesBetween(since(entry), done ? entry.delivered_at : null, now)
  const late = !done && !failed && entry.estimated_minutes !== null && total > entry.estimated_minutes
  const next = NEXT[entry.status]
  const due = Math.max(0, entry.balance_due)

  return (
    <article
      className={cn(
        'rounded-2xl bg-surface border shadow-e1 p-3 flex flex-col gap-2.5 contain-card',
        late ? 'border-warning' : 'border-line'
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-extrabold text-ink leading-none num">#{entry.daily_number}</p>
          <p className="mt-1 text-xs text-muted num">{fmtTime(entry.created_at)}</p>
        </div>
        {done ? (
          <Badge variant="success" icon={<CircleCheck />}>{fmtTime(entry.delivered_at)}</Badge>
        ) : late ? (
          <Badge variant="warning" icon={<TriangleAlert />}><span className="num">{t('delivery.card.late', { minutes: total })}</span></Badge>
        ) : (
          <Badge variant="neutral" icon={<Timer />}><span className="num">{t('delivery.card.minutes', { minutes: inStatus })}</span></Badge>
        )}
      </header>

      {(entry.customer_name || entry.customer_phone) && (
        <div className="min-w-0">
          {entry.customer_name && <p className="text-sm font-semibold text-ink truncate"><bdi>{entry.customer_name}</bdi></p>}
          {entry.customer_phone && (
            <p className="flex items-center gap-1.5 text-sm text-ink-2 num"><Phone className="h-3.5 w-3.5 text-muted" /><bdi dir="ltr">{entry.customer_phone}</bdi></p>
          )}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-sm text-ink-2">
        <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted" />
        <span className={cn('line-clamp-2', !entry.address && 'text-muted italic')}><bdi>{entry.address || t('delivery.card.noAddress')}</bdi></span>
      </p>

      <div className="flex flex-wrap gap-1.5">
        {entry.zone_name && <Badge variant="primary"><bdi>{entry.zone_name}</bdi></Badge>}
        {entry.estimated_minutes !== null && (
          <Badge variant="neutral" icon={<Clock />}><span className="num">{t('delivery.card.eta', { minutes: entry.estimated_minutes })}</span></Badge>
        )}
        {failed && entry.failure_reason && <Badge variant="danger"><bdi>{entry.failure_reason}</bdi></Badge>}
      </div>

      <select
        data-ui="select"
        aria-label={t('delivery.card.driver')}
        value={entry.driver_id ?? ''}
        disabled={busy || settled || done}
        onChange={(e) => onAssign(entry, e.target.value ? Number(e.target.value) : null)}
        className={controlClass({ className: cn('text-sm cursor-pointer', !entry.driver_id && 'text-muted') })}
      >
        <option value="">{t('delivery.card.noDriver')}</option>
        {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        {entry.driver_id !== null && !drivers.some((d) => d.id === entry.driver_id) && (
          <option value={entry.driver_id}>{entry.driver_name ?? `#${entry.driver_id}`}</option>
        )}
      </select>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-dashed border-line-strong pt-2.5">
        <span className="text-base font-bold text-ink"><Money value={entry.total} decimals={0} /></span>
        {due > 0 ? (
          <Badge variant="warning">{t('delivery.card.cod')} <Money value={due} decimals={0} styledSymbol={false} /></Badge>
        ) : (
          <Badge variant="success" icon={<CircleCheck />}>{t('delivery.card.paid')}</Badge>
        )}
      </div>

      {(next || done) && (
        <div className="flex items-center gap-2">
          {next && (
            <Button
              size="lg"
              className="flex-1 min-w-0 whitespace-nowrap px-3"
              variant={failed ? 'secondary' : entry.status === 'out_for_delivery' ? 'success' : 'soft'}
              icon={failed ? <RotateCcw className="h-4 w-4" /> : undefined}
              disabled={busy}
              cooldownMs={600}
              onClick={() => onMove(entry, next)}
            >
              {t(`delivery.card.next.${entry.status}`)}
            </Button>
          )}
          {done && !settled && (
            <Button size="md" variant="ghost" icon={<Undo2 className="h-4 w-4 rtl:-scale-x-100" />} disabled={busy} onClick={() => onMove(entry, 'out_for_delivery')}>
              {t('delivery.card.undo')}
            </Button>
          )}
          {done && settled && <span className="text-xs font-semibold text-success-ink">{t('delivery.card.settled')}</span>}
          {!done && !failed && (
            <IconButton icon={<CircleX />} label={t('delivery.card.fail')} variant="ghost" size="lg" disabled={busy} onClick={() => onFail(entry)} />
          )}
        </div>
      )}
    </article>
  )
})
