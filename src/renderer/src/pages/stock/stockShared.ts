/** Stock helpers shared by the stock page, its dialogs and table. */

export interface StockItem {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  unit_type: string
  quantity: number
  price_per_unit: number
  alert_threshold: number
}

export type StockStatus = 'ok' | 'low' | 'out'
export type AdjustKind = 'fix' | 'adjust' | 'purchase'

export const UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  liter: 'L',
  unit: 'pcs'
}

export function stockStatus(item: StockItem): StockStatus {
  if (item.quantity <= 0) return 'out'
  if (item.quantity <= item.alert_threshold) return 'low'
  return 'ok'
}

/** "12.50 kg" / "7 pcs" (pieces are whole numbers). Negative stock keeps its sign. */
export function formatQty(item: Pick<StockItem, 'quantity' | 'unit_type'>, quantity = item.quantity): string {
  const unit = UNIT_LABELS[item.unit_type] || item.unit_type
  if (item.unit_type === 'unit') return `${Math.round(quantity)} ${unit}`
  return `${quantity.toFixed(2)} ${unit}`
}

/** Fill level 0..1 for the stock bar: full at twice the alert threshold (or any stock without one). */
export function stockLevel(item: StockItem): number {
  if (item.quantity <= 0) return 0
  const target = item.alert_threshold > 0 ? item.alert_threshold * 2 : item.quantity
  return Math.max(0.04, Math.min(1, item.quantity / target))
}
