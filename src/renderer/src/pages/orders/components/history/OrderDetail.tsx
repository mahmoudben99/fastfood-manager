import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, ChefHat, CornerDownRight, Pencil, Printer, RefreshCw, X } from 'lucide-react'
import { Badge, Button, Money, Skeleton } from '../../../../components/ui'
import { useAppStore } from '../../../../store/appStore'
import { REPRINT, kitchenPrintTargets, runManualPrint, unassignedLineCount } from '../../lib/printing'
import { localName } from '../../lib/names'
import { topLevelItems, type OrderData, type OrderItemData, type OrderWorker } from '../../types'
import { moneyDecimals } from '../MenuTile'
import { SignedMoney } from '../SignedMoney'
import { ModifierText } from '../TicketLine'
import { PaymentBadge, formatTime, typeIcon } from './HistoryRow'

const itemName = (item: OrderItemData, lang: string): string =>
  localName({ name: item.menu_item_name || '', name_ar: item.menu_item_name_ar, name_fr: item.menu_item_name_fr }, lang)

interface OrderDetailProps {
  orderId: number
  ready: boolean
  onBack: () => void
  onDone: (id: number) => Promise<void>
  onRestore: (id: number) => Promise<void>
  onEdit: (id: number) => void
  onCancel: (order: OrderData) => void
  /** Bumps after a status change so the detail re-reads the order. */
  version: number
}

/** Full order: lines with options and combo picks, totals, reprints (receipt / per worker / other items), actions. */
export function OrderDetail({ orderId, ready, onBack, onDone, onRestore, onEdit, onCancel, version }: OrderDetailProps) {
  const { t } = useTranslation()
  const lang = useAppStore((s) => s.foodLanguage)
  const [order, setOrder] = useState<OrderData | null>(null)
  const [workers, setWorkers] = useState<OrderWorker[]>([])

  useEffect(() => {
    let alive = true
    Promise.all([window.api.orders.getById(orderId), window.api.printer.getOrderWorkers(orderId).catch(() => [])])
      .then(([full, w]) => {
        if (!alive) return
        setOrder(full)
        setWorkers(w || [])
      })
      .catch(() => alive && setOrder(null))
    return () => { alive = false }
  }, [orderId, version])

  if (!order) {
    return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
  }
  const ongoing = order.status === 'preparing' || order.status === 'pending'
  const all = order.items || []

  return (
    <div>
      <Button variant="ghost" size="md" icon={<ArrowLeft className="rtl:-scale-x-100" />} onClick={onBack} className="-ms-2 mb-3">{t('common.back')}</Button>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="num text-2xl font-extrabold text-ink">#{order.daily_number}</h3>
          <p className="flex items-center gap-1.5 text-sm text-muted mt-0.5 flex-wrap">
            {typeIcon(order.order_type)}
            <span>{formatTime(order.created_at)}</span>
            {order.table_number && <span>· {t('pos.history.table', { table: order.table_number })}</span>}
            {order.customer_phone && <span>· <bdi dir="ltr" className="num">{order.customer_phone}</bdi></span>}
            {order.customer_name && <span>· {order.customer_name}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {ready && ongoing && <Badge variant="success" icon={<ChefHat />}>{t('pos.history.ready')}</Badge>}
          <Badge variant={order.status === 'cancelled' ? 'danger' : ongoing ? 'info' : 'neutral'}>{t(`pos.status.${order.status}`, { defaultValue: order.status })}</Badge>
          <PaymentBadge status={order.payment_status} />
        </div>
      </div>

      <div className="rounded-2xl border border-line divide-y divide-line">
        {topLevelItems(all).map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[0.9375rem] font-semibold text-ink"><span className="num text-muted me-1.5">{item.quantity}×</span>{itemName(item, lang)}</p>
              {(item.modifiers || []).map((m, i) => (
                <p key={i} className="ps-6 text-[0.8125rem] text-muted">
                  <ModifierText mod={{ ...m, option_id: m.option_id ?? -i, quantity: m.quantity || 1 }} lang={lang} />
                </p>
              ))}
              {all.filter((c) => c.parent_order_item_id === item.id).map((child) => (
                <div key={child.id} className="ps-5 text-[0.8125rem] text-ink-2">
                  <p className="flex items-center gap-1"><CornerDownRight className="h-3.5 w-3.5 text-faint rtl:-scale-x-100" />{itemName(child, lang)}</p>
                  {(child.modifiers || []).map((m, i) => (
                    <p key={i} className="ps-5 text-muted"><ModifierText mod={{ ...m, option_id: m.option_id ?? -i, quantity: m.quantity || 1 }} lang={lang} /></p>
                  ))}
                </div>
              ))}
              {item.notes && <p className="ps-6 text-[0.8125rem] italic text-warning-ink">“{item.notes}”</p>}
            </div>
            <span className="text-[0.9375rem] font-bold text-ink shrink-0"><Money value={item.total_price} decimals={moneyDecimals(item.total_price)} /></span>
          </div>
        ))}
        {order.notes && <p className="px-4 py-2.5 text-sm italic text-ink-2">{order.notes}</p>}
        {Number(order.discount_amount) > 0 && (
          <div className="flex justify-between px-4 py-2 text-sm font-semibold text-success-ink">
            <span>{t('pos.ticket.discount')}</span>
            <SignedMoney value={Number(order.discount_amount)} sign="−" />
          </div>
        )}
        {Number(order.delivery_fee) > 0 && (
          <div className="flex justify-between px-4 py-2 text-sm text-muted">
            <span>{t('pos.ticket.deliveryFee')}</span>
            <Money value={Number(order.delivery_fee)} decimals={moneyDecimals(Number(order.delivery_fee))} styledSymbol={false} />
          </div>
        )}
        <div className="flex justify-between items-center px-4 py-3 bg-surface-2/60 rounded-b-2xl">
          <span className="font-bold text-ink">{t('pos.ticket.total')}</span>
          <span className="text-xl font-extrabold text-ink"><Money value={order.total} decimals={moneyDecimals(order.total)} /></span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <Button variant="secondary" size="lg" icon={<Printer />} cooldownMs={800} onClick={() => runManualPrint(t, () => window.api.printer.printReceipt(order.id, REPRINT), t('orders.reprint.receipt'))}>
          {t('orders.printReceipt')}
        </Button>
        {kitchenPrintTargets(t, order.id, workers, unassignedLineCount(all), REPRINT).map((target) => (
          <Button key={target.key} variant="secondary" size="lg" icon={<Printer />} cooldownMs={800} onClick={() => runManualPrint(t, target.run, t('orders.reprint.kitchen'))}>
            {target.label}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 pt-4 mt-4 border-t border-line">
        {ongoing ? (
          <>
            <Button variant="secondary" size="lg" icon={<Pencil />} className="flex-1" onClick={() => onEdit(order.id)}>{t('orders.editOrder')}</Button>
            <Button variant="success" size="lg" icon={<Check />} className="flex-1" onClick={() => onDone(order.id)}>{t('orders.markDone')}</Button>
            <Button variant="danger" size="lg" icon={<X />} onClick={() => onCancel(order)}>{t('orders.cancelOrder')}</Button>
          </>
        ) : (
          <Button variant="secondary" size="lg" icon={<RefreshCw />} className="flex-1" onClick={() => onRestore(order.id)}>{t('orders.restoreOrder')}</Button>
        )}
      </div>
    </div>
  )
}
