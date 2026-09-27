import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Bike, Check, ChefHat, Pencil, Printer, ShoppingBag, Timer, UtensilsCrossed, X } from 'lucide-react'
import { Badge, Button, Money, cn } from '../../../../components/ui'
import { useAppStore } from '../../../../store/appStore'
import { localName } from '../../lib/names'
import { REPRINT, kitchenPrintTargets, runManualPrint, unassignedLineCount } from '../../lib/printing'
import { topLevelItems, type OrderData, type OrderWorker } from '../../types'
import { moneyDecimals } from '../MenuTile'

export const typeIcon = (type: string) =>
  type === 'delivery' ? <Bike className="h-4 w-4" /> : type === 'takeout' ? <ShoppingBag className="h-4 w-4" /> : <UtensilsCrossed className="h-4 w-4" />

export function formatAge(minutes: number, t: TFunction): string {
  if (minutes < 1) return t('pos.history.justNow')
  if (minutes < 60) return t('pos.history.minutes', { count: minutes })
  return t('pos.history.hours', { h: Math.floor(minutes / 60), m: minutes % 60 })
}

export const formatTime = (value: string): string =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

export function PaymentBadge({ status }: { status?: string | null }) {
  const { t } = useTranslation()
  if (status === 'unpaid') return <Badge variant="warning">{t('pos.history.unpaid')}</Badge>
  if (status === 'partial') return <Badge variant="warning">{t('pos.history.partial')}</Badge>
  return null
}

interface HistoryRowProps {
  order: OrderData
  ready: boolean
  ageMinutes: number
  overdue: boolean
  onOpen: (order: OrderData) => void
  onDone: (id: number) => void
  onEdit: (id: number) => void
  onCancel: (order: OrderData) => void
}

/** One of today's orders: number tile, type/table, age, READY (KDS), payment, items, total, quick actions. */
export const HistoryRow = memo(function HistoryRow({ order, ready, ageMinutes, overdue, onOpen, onDone, onEdit, onCancel }: HistoryRowProps) {
  const { t } = useTranslation()
  const [printing, setPrinting] = useState<OrderWorker[] | null>(null)
  const ongoing = order.status === 'preparing' || order.status === 'pending'
  const lang = useAppStore((s) => s.foodLanguage)
  const lines = topLevelItems(order.items)
  const summary = lines
    .map((i) => `${localName({ name: i.menu_item_name || '', name_ar: i.menu_item_name_ar, name_fr: i.menu_item_name_fr }, lang)} ×${i.quantity}`)
    .join(lang === 'ar' ? '، ' : ', ')

  const togglePrint = async (): Promise<void> => {
    if (printing) {
      setPrinting(null)
      return
    }
    try { setPrinting((await window.api.printer.getOrderWorkers(order.id)) || []) } catch { setPrinting([]) }
  }

  return (
    <div className={cn('rounded-2xl border bg-surface contain-card', overdue && ongoing ? 'border-danger/60' : ready ? 'border-success/60' : 'border-line')}>
      <button type="button" onClick={() => onOpen(order)} className="tap w-full flex items-center gap-3 p-3 text-start rounded-2xl hover:bg-surface-2/60">
        <span className={cn('num h-12 min-w-12 px-2 rounded-xl flex items-center justify-center text-base font-extrabold shrink-0',
          order.status === 'cancelled' ? 'bg-danger-soft text-danger-ink' : ready ? 'bg-success-soft text-success-ink' : overdue && ongoing ? 'bg-danger-soft text-danger-ink' : 'bg-primary-soft text-primary-ink')}>
          #{order.daily_number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink">
              {typeIcon(order.order_type)}
              {order.table_number ? t('pos.history.table', { table: order.table_number }) : order.customer_phone ? <bdi dir="ltr" className="num">{order.customer_phone}</bdi> : t(`pos.type.${order.order_type}`, { defaultValue: order.order_type })}
            </span>
            {ongoing && (
              <span className={cn('inline-flex items-center gap-1 h-6 px-2 rounded-full text-xs font-bold', overdue ? 'bg-danger-soft text-danger-ink' : 'bg-surface-2 text-ink-2')}>
                <Timer className="h-3.5 w-3.5" />
                {overdue ? `${t('pos.history.late')} · ` : ''}{formatAge(ageMinutes, t)}
              </span>
            )}
            {ready && ongoing && <Badge variant="success" icon={<ChefHat />}>{t('pos.history.ready')}</Badge>}
            {!ongoing && <Badge variant={order.status === 'cancelled' ? 'danger' : 'neutral'}>{t(`pos.status.${order.status}`, { defaultValue: order.status })}</Badge>}
            <PaymentBadge status={order.payment_status} />
          </span>
          <span className="block text-xs text-muted mt-0.5 truncate">{formatTime(order.created_at)} · {summary}</span>
        </span>
        <span className="text-base font-extrabold text-ink shrink-0"><Money value={order.total} decimals={moneyDecimals(order.total)} /></span>
      </button>

      {ongoing && (
        <div className="grid grid-cols-4 gap-2 px-3 pb-3">
          <Button size="lg" variant="success" icon={<Check />} onClick={() => onDone(order.id)}>{t('orders.markDone')}</Button>
          <Button size="lg" variant={printing ? 'soft' : 'secondary'} icon={<Printer />} onClick={togglePrint}>{t('pos.history.print')}</Button>
          <Button size="lg" variant="secondary" icon={<Pencil />} onClick={() => onEdit(order.id)}>{t('orders.editOrder')}</Button>
          <Button size="lg" variant="ghost" icon={<X />} className="text-danger-ink" onClick={() => onCancel(order)}>{t('pos.history.cancel')}</Button>
        </div>
      )}
      {printing && (
        <div className="flex flex-wrap gap-2 px-3 pb-3 animate-fade-in">
          <Button size="md" variant="secondary" cooldownMs={800} onClick={() => runManualPrint(t, () => window.api.printer.printReceipt(order.id, REPRINT), t('orders.reprint.receipt'))}>
            {t('orders.printReceipt')}
          </Button>
          {kitchenPrintTargets(t, order.id, printing, unassignedLineCount(order.items), REPRINT).map((target) => (
            <Button key={target.key} size="md" variant="secondary" cooldownMs={800} onClick={() => runManualPrint(t, target.run, t('orders.reprint.kitchen'))}>
              {target.shortLabel}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
})
