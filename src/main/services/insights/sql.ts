/**
 * SQL fragments shared by the insights queries so every screen counts money the same way as
 * Analytics (analytics.repo.ts):
 *
 *   revenue      = order total − delivery fee (the fee is usually the driver's; reported apart)
 *   item lines   = combo CHILDREN count as their own item at their allocated share of the combo
 *                  price; the combo PARENT line is a container and is skipped for item figures
 *                  (a combo menu item only ever appears as a parent line, so grouping by
 *                  menu_item_id keeps combos and items apart)
 */

/** Net order revenue for an `orders` row (alias optional). */
export function netTotal(alias = ''): string {
  const p = alias ? `${alias}.` : ''
  return `(${p}total - COALESCE(${p}delivery_fee, 0))`
}

/** Revenue of an order_items row `oi`: combo parents keep their price, children their share. */
export const LINE_REVENUE =
  "CASE WHEN oi.line_kind = 'combo' THEN oi.total_price ELSE COALESCE(oi.allocated_revenue, oi.total_price) END"

/** order_items rows that are physical items (plain lines + combo children). */
export const ITEM_LINE = "oi.line_kind <> 'combo'"

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',')
}
