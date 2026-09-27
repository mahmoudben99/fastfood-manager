import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Ban, Bell, Bike, CheckCircle2, ChefHat, CircleDollarSign, CircleDot, Hourglass, ShoppingBag, UtensilsCrossed, XCircle
} from 'lucide-react'
import { Badge, type BadgeVariant } from '../../../components/ui'
import type { HistoryItem, HistoryModifier } from './types'

/** Same rule as before: pending/preparing orders can still be finished, cancelled or edited. */
export const isOngoing = (status: string): boolean => status === 'preparing' || status === 'pending'

/** orders.payment_status NULL = pre-v4 order, counted as paid in cash (void once cancelled). */
export function effectivePaymentStatus(paymentStatus: string | null | undefined, orderStatus: string): string {
  if (paymentStatus) return paymentStatus
  return orderStatus === 'cancelled' ? 'void' : 'paid'
}

export function stripIpcPrefix(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
}

/** "YYYY-MM-DD HH:MM:SS" (SQLite datetime, UTC without marker) or ISO → Date. */
function parseStored(iso: string): Date {
  const s = iso.trim()
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s)
}

/** Local wall-clock time "14:05" (Latin digits in every language). */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = parseStored(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** Local "27/09 14:05" for multi-day lists. */
export function formatDayClock(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = parseStored(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })} ${formatClock(iso)}`
}

/** Display name of a line in the food language (sale-time snapshot first). */
export function itemName(item: HistoryItem, foodLanguage: string): string {
  if (foodLanguage === 'ar' && item.menu_item_name_ar) return item.menu_item_name_ar
  if (foodLanguage === 'fr' && item.menu_item_name_fr) return item.menu_item_name_fr
  return item.menu_item_name ?? `#${item.menu_item_id}`
}

export function modifierName(mod: HistoryModifier, foodLanguage: string): string {
  if (foodLanguage === 'ar' && mod.name_ar) return mod.name_ar
  if (foodLanguage === 'fr' && mod.name_fr) return mod.name_fr
  return mod.name
}

const STATUS: Record<string, { variant: BadgeVariant; icon: ReactNode }> = {
  pending: { variant: 'warning', icon: <Hourglass /> },
  preparing: { variant: 'info', icon: <ChefHat /> },
  ready: { variant: 'success', icon: <Bell /> },
  completed: { variant: 'success', icon: <CheckCircle2 /> },
  cancelled: { variant: 'danger', icon: <XCircle /> }
}

export function OrderStatusBadge({ status, size }: { status: string; size?: 'sm' | 'md' }) {
  const { t } = useTranslation()
  const style = STATUS[status] ?? { variant: 'neutral' as BadgeVariant, icon: <CircleDot /> }
  return (
    <Badge variant={style.variant} icon={style.icon} size={size}>
      {t(`orderHistory.status.${status}`, { defaultValue: status })}
    </Badge>
  )
}

const PAYMENT: Record<string, { variant: BadgeVariant; icon: ReactNode }> = {
  paid: { variant: 'success', icon: <CheckCircle2 /> },
  unpaid: { variant: 'warning', icon: <CircleDollarSign /> },
  partial: { variant: 'warning', icon: <CircleDollarSign /> },
  void: { variant: 'neutral', icon: <Ban /> }
}

export function PaymentBadge({ status, size }: { status: string; size?: 'sm' | 'md' }) {
  const { t } = useTranslation()
  const style = PAYMENT[status] ?? PAYMENT.paid
  return (
    <Badge variant={style.variant} icon={style.icon} size={size}>
      {t(`orderHistory.pay.${status}`, { defaultValue: status })}
    </Badge>
  )
}

const TYPE_ICON: Record<string, ReactNode> = {
  local: <UtensilsCrossed />,
  takeout: <ShoppingBag />,
  delivery: <Bike />
}

/** Icon-only order type (narrow tables); the word is the tooltip + accessible name. */
export function OrderTypeIcon({ type, className = '' }: { type: string; className?: string }) {
  const { t } = useTranslation()
  const label = t(`orderHistory.type.${type}`, { defaultValue: type })
  return (
    <span role="img" aria-label={label} title={label} className={`inline-flex text-muted [&_svg]:h-4 [&_svg]:w-4 ${className}`}>
      {TYPE_ICON[type] ?? <CircleDot />}
    </span>
  )
}

export function OrderTypeBadge({ type, size }: { type: string; size?: 'sm' | 'md' }) {
  const { t } = useTranslation()
  return (
    <Badge variant={type === 'delivery' ? 'info' : 'neutral'} icon={TYPE_ICON[type]} size={size}>
      {t(`orderHistory.type.${type}`, { defaultValue: type })}
    </Badge>
  )
}

/** Titled block inside the order drawer. */
export function DetailSection({
  icon,
  title,
  aside,
  children
}: {
  icon: ReactNode
  title: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-ink [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
          <h3 className="truncate text-base font-semibold text-ink">{title}</h3>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}
