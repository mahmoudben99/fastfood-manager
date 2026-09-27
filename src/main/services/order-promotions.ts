import type Database from 'better-sqlite3'
import { getDb } from '../database/connection'
import { catalogLang } from './catalog-common'
import { channelBasePrice } from './channels'
import {
  prepareCatalogLine, sanitizeCatalogFields, type OrderLineComboChildInput, type OrderLineModifierInput
} from './order-catalog'

/**
 * Server-side promotion pricing for orders that do NOT come from the POS renderer.
 *
 * Active promotions used to be applied only by the cashier's cart (renderer `computeDiscount` in
 * store/orderStore.ts). Orders arriving from the LAN self-order tablet or the cloud remote-order
 * page skipped that code entirely, so a customer who ordered a promoted item on the tablet was
 * charged full price while the same item rang up discounted at the till.
 *
 * Prices are resolved from the database rather than trusted from the caller, matching
 * `CreateOrderInput.forceMenuPrice`. Keep the arithmetic in step with the renderer's
 * computeDiscount(); when one changes, change both.
 *
 * v4: the POS cart applies promotions to the FINAL unit price of a line (menu price + option
 * deltas + combo upcharges — the price it sends as unit_price), and order-service prices tablet
 * and remote lines the same way. Promotions here therefore run on that same final unit price
 * (`resolveUnitPrice`), so "10% off" on a Burger with +Cheese discounts the cheese too, exactly
 * like at the till. Promotions are applied in the POS cart's order (newest first).
 */
export interface PromotionLineInput {
  menu_item_id: number
  quantity: number
  modifiers?: OrderLineModifierInput[]
  children?: OrderLineComboChildInput[]
}

interface ActivePromotion {
  id: number
  name: string
  type: 'percentage' | 'fixed'
  discount_value: number
  applies_to: 'all' | 'specific'
  menu_item_ids: number[]
}

/** Same rows and order as promotionsRepo.getActivePromotions() (what the POS cart receives). */
function activePromotions(db: Database.Database): ActivePromotion[] {
  const promos = db.prepare('SELECT * FROM promotions WHERE is_active = 1 ORDER BY created_at DESC').all() as ActivePromotion[]
  if (promos.length === 0) return []
  const links = db.prepare('SELECT promotion_id, menu_item_id FROM promotion_items').all() as
    { promotion_id: number; menu_item_id: number }[]
  for (const promo of promos) {
    promo.menu_item_ids = links.filter((link) => link.promotion_id === promo.id).map((link) => link.menu_item_id)
  }
  return promos
}

/**
 * The final unit price order-service will charge for this line: menu price + option deltas +
 * combo upcharges (+ child option deltas), floored at 0. Choices that fail validation fall back
 * to the menu price (the order itself is refused later with the precise reason). null = the item
 * is not an active menu item.
 */
export function resolveUnitPrice(db: Database.Database, line: PromotionLineInput, channel: string | null = null): number | null {
  const menu = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_active = 1').get(line.menu_item_id) as
    | { id: number; price: number; name: string; is_combo?: number }
    | undefined
  if (!menu) return null
  // v4: the channel price (dine-in / takeout / delivery / platform) is the base, as in order-service.
  const base = channelBasePrice(db, menu, channel)
  try {
    const catalog = prepareCatalogLine(db, menu, { modifiers: line.modifiers, children: line.children }, {
      lang: catalogLang(db),
      fail: (_code, message) => new Error(message)
    })
    return Math.max(0, base + catalog.extrasPerUnit)
  } catch {
    return Math.max(0, base)
  }
}

export function computeAutoDiscount(
  items: PromotionLineInput[],
  database?: Database.Database,
  channel: string | null = null
): { amount: number; details: string } {
  if (items.length === 0) return { amount: 0, details: '' }
  let db: Database.Database
  let promos: ActivePromotion[]
  try {
    db = database ?? getDb()
    promos = activePromotions(db)
  } catch {
    return { amount: 0, details: '' }
  }
  if (promos.length === 0) return { amount: 0, details: '' }

  // Resolve authoritative final unit prices once.
  const priced: { menu_item_id: number; quantity: number; price: number }[] = []
  let subtotal = 0
  for (const item of items) {
    const price = resolveUnitPrice(db, item, channel)
    if (price === null) continue
    priced.push({ menu_item_id: item.menu_item_id, quantity: item.quantity, price })
    subtotal += price * item.quantity
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
  /** v4 catalog: option / combo-pick ids only (prices are always read from the database). */
  modifiers?: OrderLineModifierInput[]
  children?: OrderLineComboChildInput[]
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
    const catalog = sanitizeCatalogFields(it)
    if (!catalog) return []
    out.push({
      menu_item_id: id,
      quantity: qty,
      notes: typeof it?.notes === 'string' ? it.notes.slice(0, 500) : undefined,
      ...catalog
    })
  }
  return out
}
