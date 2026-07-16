import { menuRepo } from '../database/repositories/menu.repo'
import { promotionsRepo } from '../database/repositories/promotions.repo'

/**
 * Server-side promotion pricing for orders that do NOT come from the POS renderer.
 *
 * Active promotions used to be applied only by the cashier's cart (renderer `computeDiscount` in
 * store/orderStore.ts). Orders arriving from the LAN self-order tablet or the cloud remote-order
 * page skipped that code entirely, so a customer who ordered a promoted item on the tablet was
 * charged full price while the same item rang up discounted at the till.
 *
 * Prices are resolved from the menu here rather than trusted from the caller, matching
 * `CreateOrderInput.forceMenuPrice`. Keep the arithmetic in step with the renderer's
 * computeDiscount(); when one changes, change both.
 */
export function computeAutoDiscount(
  items: { menu_item_id: number; quantity: number }[]
): { amount: number; details: string } {
  if (items.length === 0) return { amount: 0, details: '' }

  let promos: ReturnType<typeof promotionsRepo.getActivePromotions>
  try {
    promos = promotionsRepo.getActivePromotions()
  } catch {
    return { amount: 0, details: '' }
  }
  if (promos.length === 0) return { amount: 0, details: '' }

  // Resolve authoritative menu prices once.
  const priced: { menu_item_id: number; quantity: number; price: number }[] = []
  let subtotal = 0
  for (const item of items) {
    const menuItem = menuRepo.getById(item.menu_item_id)
    if (!menuItem) continue
    priced.push({ menu_item_id: item.menu_item_id, quantity: item.quantity, price: menuItem.price })
    subtotal += menuItem.price * item.quantity
  }
  if (priced.length === 0) return { amount: 0, details: '' }

  let totalDiscount = 0
  const amountsByPromo = new Map<number, number>()

  // Clamp on each line, not against the whole basket. With an invalid 200%-Burger rule, the old
  // aggregate clamp let the Burger's overflow discount consume Fries and Drinks too.
  for (const item of priced) {
    const itemTotal = item.price * item.quantity
    let remaining = itemTotal
    for (const promo of promos) {
      const applies =
        promo.applies_to === 'all' ||
        (!!promo.menu_item_ids && promo.menu_item_ids.includes(item.menu_item_id))
      if (!applies) continue

      const requested = promo.type === 'percentage'
        ? itemTotal * (promo.discount_value / 100)
        : promo.discount_value * item.quantity
      const applied = Math.min(Math.max(0, requested), remaining)
      if (applied <= 0) continue
      totalDiscount += applied
      remaining -= applied
      amountsByPromo.set(promo.id, (amountsByPromo.get(promo.id) || 0) + applied)
      if (remaining <= 0) break
    }
  }

  const amount = Math.round(Math.min(Math.max(0, totalDiscount), subtotal) * 100) / 100
  const details = promos
    .filter((promo) => (amountsByPromo.get(promo.id) || 0) > 0)
    .map((promo) => `${promo.name}: -${Math.round(amountsByPromo.get(promo.id) || 0)}`)
  return { amount, details: amount > 0 ? details.join(', ') : '' }
}

/**
 * Normalize an untrusted item list from a LAN/cloud client.
 * Quantities must be positive integers within a sane bound: `Number(q) > 0` alone let a client
 * post 2.5, 1e9, or Infinity, which corrupted revenue, stock deductions and loyalty totals.
 */
export const MAX_ITEM_QUANTITY = 999
export const MAX_ORDER_LINES = 100
export const MAX_ORDER_UNITS = 999

export interface SanitizedOrderItem {
  menu_item_id: number
  quantity: number
  notes?: string
}

export function sanitizeOrderItems(rawItems: unknown): SanitizedOrderItem[] {
  if (!Array.isArray(rawItems)) return []
  if (rawItems.length === 0 || rawItems.length > MAX_ORDER_LINES) return []
  const out: SanitizedOrderItem[] = []
  let totalUnits = 0
  for (const it of rawItems as any[]) {
    const id = Number(it?.menu_item_id ?? it?.id)
    const qty = Number(it?.quantity)
    if (!Number.isInteger(id) || id <= 0) return []
    if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_ITEM_QUANTITY) return []
    totalUnits += qty
    if (totalUnits > MAX_ORDER_UNITS) return []
    out.push({
      menu_item_id: id,
      quantity: qty,
      notes: typeof it?.notes === 'string' ? it.notes.slice(0, 500) : undefined
    })
  }
  return out
}
