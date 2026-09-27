import { useTranslation } from 'react-i18next'
import { ChefHat, StickyNote } from 'lucide-react'
import { Badge, Money, cn } from '../../../components/ui'
import { useAppStore } from '../../../store/appStore'
import { itemName, modifierName } from './labels'
import type { HistoryItem, HistoryModifier, HistoryOrder } from './types'

export interface LineGroup {
  line: HistoryItem
  children: HistoryItem[]
}

/** Top-level lines with their combo children (children whose parent is missing stay top-level). */
export function groupLines(items: HistoryItem[] = []): LineGroup[] {
  const ids = new Set(items.map((item) => item.id))
  const groups: LineGroup[] = []
  const byId = new Map<number, LineGroup>()
  for (const item of items) {
    if (item.parent_order_item_id != null && ids.has(item.parent_order_item_id)) continue
    const group = { line: item, children: [] as HistoryItem[] }
    groups.push(group)
    byId.set(item.id, group)
  }
  for (const item of items) {
    if (item.parent_order_item_id != null) byId.get(item.parent_order_item_id)?.children.push(item)
  }
  return groups
}

export function ModifierList({ modifiers, className = '' }: { modifiers?: HistoryModifier[]; className?: string }) {
  const { t } = useTranslation()
  const foodLanguage = useAppStore((s) => s.foodLanguage)
  if (!modifiers || modifiers.length === 0) return null
  return (
    <ul className={cn('mt-1 space-y-0.5', className)}>
      {modifiers.map((mod) => {
        const name = modifierName(mod, foodLanguage)
        const label =
          mod.kind === 'none'
            ? mod.group_name && mod.group_name !== name ? `${mod.group_name}: ${name}` : name
            : t(`orderHistory.mod.${mod.kind}`, { name })
        const delta = mod.price_delta * (mod.quantity || 1)
        return (
          <li
            key={mod.id}
            className={cn('flex items-baseline justify-between gap-3 text-[13px]', mod.kind === 'no' ? 'text-danger-ink' : 'text-muted')}
          >
            <span className="min-w-0">
              {mod.quantity > 1 && <span className="num me-1">{mod.quantity}×</span>}
              <bdi>{label}</bdi>
            </span>
            {delta !== 0 && (
              <bdi dir="ltr" className="shrink-0">
                {delta > 0 ? '+' : ''}
                <Money value={delta} />
              </bdi>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function ChildLine({ child }: { child: HistoryItem }) {
  const foodLanguage = useAppStore((s) => s.foodLanguage)
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm font-medium text-ink-2">
          <span className="num me-1.5 text-muted">{child.quantity}×</span>
          <bdi>{itemName(child, foodLanguage)}</bdi>
        </span>
        {(child.combo_upcharge ?? 0) > 0 && (
          <span className="shrink-0 text-[13px] text-muted">
            <bdi dir="ltr">+<Money value={child.combo_upcharge ?? 0} /></bdi>
          </span>
        )}
      </div>
      <ModifierList modifiers={child.modifiers} />
      {child.notes && <p className="mt-0.5 text-[13px] italic text-muted">{child.notes}</p>}
    </li>
  )
}

/** Read-only order lines: quantity pill, name, line total; options and combo picks indented. */
export function OrderLines({ items }: { items?: HistoryItem[] }) {
  const { t } = useTranslation()
  const foodLanguage = useAppStore((s) => s.foodLanguage)
  const groups = groupLines(items)
  return (
    <ul className="divide-y divide-line">
      {groups.map(({ line, children }) => (
        <li key={line.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
          <span className="num flex h-7 min-w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 px-2 text-sm font-bold text-ink">
            {line.quantity}×
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold text-ink">
                  <bdi>{itemName(line, foodLanguage)}</bdi>
                </span>
                {line.line_kind === 'combo' && <Badge variant="primary">{t('orderHistory.detail.combo')}</Badge>}
              </div>
              <span className="shrink-0 text-sm font-bold text-ink">
                <Money value={line.total_price} />
              </span>
            </div>
            <ModifierList modifiers={line.modifiers} />
            {children.length > 0 && (
              <ul className="mt-2 space-y-1.5 border-s-2 border-line-strong ps-3">
                {children.map((child) => (
                  <ChildLine key={child.id} child={child} />
                ))}
              </ul>
            )}
            {line.notes && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[13px] italic text-muted">
                <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 break-words">{line.notes}</span>
              </p>
            )}
            {line.worker_name && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <ChefHat className="h-3.5 w-3.5" />
                {t('orderHistory.detail.madeBy', { name: line.worker_name })}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Subtotal, discount, delivery fee and the big total. */
export function OrderTotals({ order }: { order: HistoryOrder }) {
  const { t } = useTranslation()
  const discount = Math.max(0, order.discount_amount ?? 0)
  const fee = Math.max(0, order.delivery_fee ?? 0)
  return (
    <dl className="space-y-1.5 text-sm">
      {(discount > 0 || fee > 0) && (
        <div className="flex justify-between gap-3 text-ink-2">
          <dt>{t('orders.subtotal')}</dt>
          <dd><Money value={order.subtotal} /></dd>
        </div>
      )}
      {discount > 0 && (
        <div className="flex justify-between gap-3 text-success-ink">
          <dt className="min-w-0 truncate">{order.discount_details || t('orderHistory.detail.discount')}</dt>
          <dd className="shrink-0"><bdi dir="ltr">−<Money value={discount} /></bdi></dd>
        </div>
      )}
      {fee > 0 && (
        <div className="flex justify-between gap-3 text-ink-2">
          <dt>{t('orderHistory.detail.deliveryFee')}</dt>
          <dd><Money value={fee} /></dd>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-line-strong pt-2.5">
        <dt className="text-base font-bold text-ink">{t('orders.total')}</dt>
        <dd className="text-2xl font-extrabold tracking-tight text-ink">
          <Money value={order.total} />
        </dd>
      </div>
    </dl>
  )
}
