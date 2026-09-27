import { useTranslation } from 'react-i18next'
import { AlertTriangle, Minus, Plus, Trash2, X } from 'lucide-react'
import { IconButton, Money } from '../../../components/ui'
import { useAppStore } from '../../../store/appStore'
import { groupLines, ModifierList } from './OrderItemsView'
import { itemName } from './labels'
import type { EditLine, HistoryItem, HistoryOrder } from './types'

/** Editable copy of the order's top-level lines (combo children follow their combo line). */
export function toEditLines(order: HistoryOrder): EditLine[] {
  return groupLines(order.items).map(({ line }) => ({
    order_item_id: line.id,
    menu_item_id: line.menu_item_id,
    menu_item_name: line.menu_item_name,
    quantity: line.quantity,
    unit_price: line.unit_price,
    notes: line.notes,
    worker_id: line.worker_id
  }))
}

/** Total shown while editing = what gets stored (the stored discount and delivery fee are kept). */
export function editTotals(order: HistoryOrder, lines: EditLine[]): { subtotal: number; discount: number; fee: number; total: number } {
  const subtotal = lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0)
  const discount = Math.min(Math.max(0, order.discount_amount ?? 0), subtotal)
  const fee = Math.max(0, order.delivery_fee ?? 0)
  return { subtotal, discount, fee, total: subtotal - discount + fee }
}

interface OrderEditorProps {
  order: HistoryOrder
  lines: EditLine[]
  onChange: (lines: EditLine[]) => void
  error: string
  onDismissError: () => void
}

export function OrderEditor({ order, lines, onChange, error, onDismissError }: OrderEditorProps) {
  const { t } = useTranslation()
  const foodLanguage = useAppStore((s) => s.foodLanguage)
  const groups = new Map(groupLines(order.items).map((g) => [g.line.id, g]))
  const totals = editTotals(order, lines)

  const setQty = (index: number, qty: number) => {
    if (qty < 1) {
      onChange(lines.filter((_, i) => i !== index))
      return
    }
    onChange(lines.map((line, i) => (i === index ? { ...line, quantity: qty } : line)))
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft p-3" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-danger-ink">{t('orders.orderError.updateTitle')}</p>
            <p className="break-words text-sm text-danger-ink">{error}</p>
          </div>
          <IconButton icon={<X />} label={t('orders.orderError.dismiss')} size="sm" variant="danger" onClick={onDismissError} />
        </div>
      )}

      {lines.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-5 text-center text-sm text-muted">
          {t('orderHistory.edit.empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line, i) => {
            const source = groups.get(line.order_item_id)
            const view: HistoryItem | undefined = source?.line
            const name = view ? itemName(view, foodLanguage) : line.menu_item_name ?? ''
            return (
              <li key={line.order_item_id} className="rounded-2xl border border-line bg-surface p-3 contain-card">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-ink"><bdi>{name}</bdi></p>
                    <p className="text-[13px] text-muted">
                      <Money value={line.unit_price} /> {t('orderHistory.edit.each')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
                    <IconButton
                      icon={<Minus />}
                      label={t('orderHistory.edit.decrease')}
                      variant="secondary"
                      onClick={() => setQty(i, line.quantity - 1)}
                    />
                    <span className="num w-9 text-center text-base font-bold text-ink">{line.quantity}</span>
                    <IconButton
                      icon={<Plus />}
                      label={t('orderHistory.edit.increase')}
                      variant="secondary"
                      onClick={() => setQty(i, line.quantity + 1)}
                    />
                  </div>
                  <IconButton
                    icon={<Trash2 />}
                    label={t('orderHistory.edit.remove', { name })}
                    variant="danger"
                    onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
                  />
                </div>
                {view && <ModifierList modifiers={view.modifiers} />}
                {source && source.children.length > 0 && (
                  <ul className="mt-2 space-y-1 border-s-2 border-line-strong ps-3">
                    {source.children.map((child) => (
                      <li key={child.id} className="text-sm text-ink-2">
                        <span className="num me-1.5 text-muted">{child.quantity}×</span>
                        <bdi>{itemName(child, foodLanguage)}</bdi>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <dl className="space-y-1.5 rounded-2xl bg-surface-2 p-4 text-sm">
        {totals.discount > 0 && (
          <div className="flex justify-between gap-3 text-success-ink">
            <dt className="min-w-0 truncate">{order.discount_details || t('orderHistory.detail.discount')}</dt>
            <dd className="shrink-0"><bdi dir="ltr">−<Money value={totals.discount} /></bdi></dd>
          </div>
        )}
        {totals.fee > 0 && (
          <div className="flex justify-between gap-3 text-ink-2">
            <dt>{t('orderHistory.detail.deliveryFee')}</dt>
            <dd><Money value={totals.fee} /></dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-base font-bold text-ink">{t('orders.total')}</dt>
          <dd className="text-2xl font-extrabold tracking-tight text-ink">
            <Money value={totals.total} animate />
          </dd>
        </div>
      </dl>
    </div>
  )
}
