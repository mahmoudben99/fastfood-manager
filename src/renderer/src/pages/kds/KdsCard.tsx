import { memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bike,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  Flame,
  Hourglass,
  Play,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  StickyNote,
  TriangleAlert,
  UtensilsCrossed,
  X
} from 'lucide-react'
import { Button } from '../../components/ui'
import { cn } from '../../components/ui/cn'
import {
  KDS_CHANGE_HIGHLIGHT_MS,
  formatKdsElapsed,
  kdsTimerLevel,
  type KdsCard as KdsCardData,
  type KdsDisplaySettings,
  type KdsItemView,
  type KdsTicketStatus,
  type KdsTimerLevel
} from '../../../../shared/kds'
import { KdsItems } from './KdsItems'

interface Props {
  card: KdsCardData
  expo: boolean
  nowMs: number
  settings: KdsDisplaySettings
  onBump: (card: KdsCardData) => void
  onLineDone: (item: KdsItemView) => void
  onStart: (ticketId: number) => void
}

/** Header tint follows the ticket state (never a random colour); the timer pill carries the lateness. */
const STATE_HEAD: Record<KdsTicketStatus, string> = {
  new: 'bg-primary-soft',
  in_progress: 'bg-surface-3',
  ready: 'bg-success-soft',
  bumped: 'bg-success-soft',
  cancelled: 'bg-danger-soft'
}
const STATUS_KEY: Record<KdsTicketStatus, string> = {
  new: 'kds.statusNew',
  in_progress: 'kds.statusInProgress',
  ready: 'kds.statusReady',
  bumped: 'kds.statusBumped',
  cancelled: 'kds.statusCancelled'
}
const TIMER: Record<KdsTimerLevel, { cls: string; icon: ReactNode; word?: string }> = {
  ok: { cls: 'text-ink', icon: <Clock className="h-6 w-6 text-muted" aria-hidden="true" /> },
  warn: { cls: 'bg-warning text-canvas', icon: <Hourglass className="h-6 w-6" aria-hidden="true" />, word: 'kds.timerWarn' },
  late: { cls: 'bg-danger-strong text-white', icon: <TriangleAlert className="h-6 w-6" aria-hidden="true" />, word: 'kds.timerLate' }
}

/** Word + icon status chip (colour is never the only signal). */
export function KdsStatusBadge({ status }: { status: KdsTicketStatus }) {
  const { t } = useTranslation()
  const look = status === 'new'
    ? { cls: 'bg-primary-soft-2 text-primary-ink', icon: null }
    : status === 'in_progress'
      ? { cls: 'bg-info-soft text-info-ink', icon: <Flame className="h-4 w-4" aria-hidden="true" /> }
      : status === 'cancelled'
        ? { cls: 'bg-danger-soft text-danger-ink', icon: <X className="h-4 w-4" aria-hidden="true" /> }
        : { cls: 'bg-success-soft text-success-ink', icon: <Check className="h-4 w-4" aria-hidden="true" /> }
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-0.5 text-sm font-black', look.cls)}>
      {look.icon}
      {t(STATUS_KEY[status])}
    </span>
  )
}

/** One kitchen ticket card. Tapping the card (or the big Done button) bumps it; the check box toggles one line. */
export const KdsCard = memo(function KdsCard({ card, expo, nowMs, settings, onBump, onLineDone, onStart }: Props) {
  const { t } = useTranslation()
  const elapsed = nowMs - Date.parse(card.timerStart)
  const cancelled = card.status === 'cancelled'
  const level = cancelled ? 'ok' : kdsTimerLevel(elapsed, settings.warnMinutes, settings.lateMinutes)
  const timer = TIMER[level]
  const banner = cancelled
    ? 'cancelled'
    : card.change && card.changedAt && nowMs - Date.parse(card.changedAt) < KDS_CHANGE_HIGHLIGHT_MS ? card.change : null
  const TypeIcon = card.orderType === 'local' ? UtensilsCrossed : card.orderType === 'delivery' ? Bike : ShoppingBag
  const typeLabel = card.orderType === 'local' ? t('kds.dineIn') : card.orderType === 'delivery' ? t('kds.delivery') : t('kds.takeout')
  const border = cancelled || level === 'late'
    ? 'border-danger'
    : level === 'warn' ? 'border-warning' : card.status === 'ready' ? 'border-success' : 'border-line'
  const canStart = !expo && card.status === 'new' && !!card.tickets[0]

  return (
    <div
      role="button"
      tabIndex={0}
      title={t('kds.tapToBump')}
      onClick={() => onBump(card)}
      onKeyDown={(event) => { if (event.key === 'Enter') onBump(card) }}
      className={cn(
        'contain-card animate-pop-in flex cursor-pointer select-none flex-col overflow-hidden rounded-2xl border-2 bg-surface shadow-e1',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        border,
        cancelled && 'kds-cancel-flash'
      )}
    >
      <div className={cn('space-y-2 px-4 py-3', STATE_HEAD[card.status])}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={cn('num text-4xl font-black leading-none', cancelled ? 'text-danger-ink line-through' : 'text-ink')}>
            #{card.dailyNumber}
          </span>
          <span className="flex-1" />
          <span className={cn('num inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-2xl font-black leading-none', timer.cls)}>
            {timer.icon}
            {formatKdsElapsed(elapsed)}
            {timer.word && <span className="text-base font-black uppercase rtl:normal-case">{t(timer.word)}</span>}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-base font-bold text-ink-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-canvas/40 px-2 py-0.5 uppercase text-ink rtl:normal-case">
            <TypeIcon className="h-4 w-4" aria-hidden="true" />
            {typeLabel}
          </span>
          {card.tableNumber && <span className="text-ink">{t('kds.table', { n: card.tableNumber })}</span>}
          {card.customerName && <bdi className="min-w-0 truncate">{card.customerName}</bdi>}
          <span className="flex-1" />
          {!cancelled && <KdsStatusBadge status={card.status} />}
        </div>
      </div>

      {banner && <Banner kind={banner} />}

      {card.orderNote && (
        <p className="mx-3 mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-lg font-extrabold leading-snug text-warning-ink">
          <StickyNote className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <bdi className="min-w-0 break-words">{card.orderNote}</bdi>
        </p>
      )}

      {card.tickets.map((ticket) => (
        <div key={ticket.id} className="border-t border-line">
          {expo && (
            <div className="flex items-center justify-between gap-2 px-4 pt-3 text-sm font-extrabold uppercase tracking-wide text-muted rtl:normal-case rtl:tracking-normal">
              <bdi className="min-w-0 truncate">{ticket.stationId === 0 ? t('kds.expo') : ticket.stationName}</bdi>
              <KdsStatusBadge status={ticket.status} />
            </div>
          )}
          <KdsItems items={ticket.items} cancelled={cancelled} onLineDone={onLineDone} />
        </div>
      ))}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-line p-3">
        {canStart && (
          <Button
            variant="secondary"
            size="xl"
            icon={<Play className="h-5 w-5 rtl:-scale-x-100" />}
            onClick={(event) => { event.stopPropagation(); onStart(card.tickets[0].id) }}
          >
            {t('kds.start')}
          </Button>
        )}
        <Button
          variant={cancelled ? 'secondary' : 'success'}
          size="xl"
          className="flex-1 font-extrabold"
          icon={cancelled ? <X className="h-6 w-6" /> : <CircleCheck className="h-6 w-6" />}
          onClick={(event) => { event.stopPropagation(); onBump(card) }}
        >
          {cancelled ? t('kds.close') : t('kds.bump')}
        </Button>
      </div>
    </div>
  )
})

function Banner({ kind }: { kind: 'updated' | 'restored' | 'cancelled' }) {
  const { t } = useTranslation()
  const look = kind === 'cancelled'
    ? { cls: 'bg-danger-strong text-white text-2xl', icon: <CircleX className="h-7 w-7" aria-hidden="true" />, text: t('kds.statusCancelled') }
    : kind === 'updated'
      ? { cls: 'kds-banner-pulse bg-warning text-canvas text-xl', icon: <RefreshCw className="h-6 w-6" aria-hidden="true" />, text: t('kds.updated') }
      : { cls: 'bg-info-soft text-info-ink text-xl', icon: <RotateCcw className="h-6 w-6 rtl:-scale-x-100" aria-hidden="true" />, text: t(`kds.${kind}`) }
  return (
    <div className={cn('flex items-center justify-center gap-2 px-4 py-2 font-black uppercase tracking-wide rtl:normal-case rtl:tracking-normal', look.cls)}>
      {look.icon}
      {look.text}
    </div>
  )
}
