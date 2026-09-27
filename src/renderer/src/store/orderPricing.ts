/**
 * Pricing and totals of the POS cart (pure; shared by the order store and the order screen).
 * Unit price = max(0, channel base + option deltas + combo upcharges/child options), the same
 * formula as the main process; a cashier override or an existing line's snapshot wins.
 */

export type OrderType = 'local' | 'takeout' | 'delivery'
/** Channel id ('local' | 'takeout' | 'delivery' | 'yassir' | custom platform) → price in DA. */
export type ChannelPrices = Record<string, number>

/** The channel an order type sells on when no platform is picked. */
export function defaultChannelFor(orderType: string): string {
  return orderType === 'delivery' || orderType === 'takeout' ? orderType : 'local'
}
export type ModifierKind = 'none' | 'extra' | 'light' | 'no'

export interface CartModifier {
  option_id: number
  group_id: number | null
  name: string
  name_ar: string | null
  name_fr: string | null
  kind: ModifierKind
  price_delta: number
  /** Units per ONE unit of the line. */
  quantity: number
}

export interface CartComboChild {
  slot_id: number
  menu_item_id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  upcharge: number
  /** undefined = the child's default options (server side). */
  modifiers?: CartModifier[]
  note?: string
}

export interface CartItem {
  key: string
  /** Present for a line loaded from an existing order. */
  order_item_id?: number
  menu_item_id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  emoji?: string | null
  image_path: string | null
  category_id: number
  worker_id: number | null
  quantity: number
  notes: string
  /** Effective unit price (see file comment). */
  price: number
  /** The menu item's normal price (unknown for loaded lines until their options change). */
  menu_price?: number
  channel_prices?: ChannelPrices | null
  /** Deliberate cashier override (sent as unit_price); null/undefined = priced by the DB. */
  price_override?: number | null
  /** Existing lines: sale-time unit price, kept unless options/picks/override change. */
  snapshot_price?: number
  is_combo?: boolean
  modifiers?: CartModifier[]
  children?: CartComboChild[]
  /** Existing lines: options/picks changed → send them; new lines always send what they have. */
  catalog_dirty?: boolean
  /** Existing combo lines: child rows passed back unchanged on update (void guard sees them kept). */
  child_rows?: { order_item_id: number; menu_item_id: number; quantity: number }[]
  /** The item turned out unavailable (sold out) when the order was sent. */
  unavailable?: boolean
}

export type NewLine = Omit<CartItem, 'key' | 'price' | 'worker_id' | 'quantity' | 'notes'> & {
  quantity?: number
  notes?: string
}

export interface ManualDiscount {
  mode: 'percent' | 'amount'
  value: number
  /** Label written into discount_details (receipt), already translated. */
  label: string
}

export interface ActivePromo {
  id: number
  name: string
  type: 'percentage' | 'fixed'
  discount_value: number
  applies_to: 'all' | 'specific'
  menu_item_ids?: number[]
}

export const round2 = (value: number): number => Math.round(value * 100) / 100

/** Price of an item on a sales channel; falls back to the normal menu price. */
export function channelPrice(menuPrice: number, prices: ChannelPrices | null | undefined, channel: string): number {
  const value = prices?.[channel]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : menuPrice
}

export function modifiersExtra(modifiers?: CartModifier[]): number {
  return round2((modifiers || []).reduce((sum, m) => sum + m.price_delta * m.quantity, 0))
}

export function childrenExtra(children?: CartComboChild[]): number {
  return round2((children || []).reduce((sum, c) => sum + c.upcharge + modifiersExtra(c.modifiers), 0))
}

export function computeUnitPrice(line: Omit<CartItem, 'key' | 'price'>, channel: string): number {
  if (line.price_override !== undefined && line.price_override !== null) return line.price_override
  if (line.order_item_id !== undefined && !line.catalog_dirty && line.snapshot_price !== undefined) return line.snapshot_price
  const base = channelPrice(line.menu_price ?? line.snapshot_price ?? 0, line.channel_prices, channel)
  return Math.max(0, round2(base + modifiersExtra(line.modifiers) + childrenExtra(line.children)))
}

export const reprice = (items: CartItem[], channel: string): CartItem[] =>
  items.map((it) => {
    const price = computeUnitPrice(it, channel)
    return price === it.price ? it : { ...it, price }
  })

const modsKey = (mods?: CartModifier[]): string =>
  (mods || []).map((m) => `${m.option_id}x${m.quantity}`).sort().join(',')

/** Lines merge on a tap only when they are the same product with the same picks and nothing custom. */
export function mergeSignature(line: Pick<CartItem, 'menu_item_id' | 'modifiers' | 'children'>): string {
  const kids = (line.children || []).map((c) => `${c.slot_id}:${c.menu_item_id}[${modsKey(c.modifiers)}]${c.note || ''}`).join('|')
  return `${line.menu_item_id}#${modsKey(line.modifiers)}#${kids}`
}

/** Promotions (auto discounts) on the cart; amount + breakdown for discount_details. */
function computePromoDiscount(items: CartItem[], promos: ActivePromo[]): { amount: number; details: string[] } {
  if (promos.length === 0 || items.length === 0) return { amount: 0, details: [] }
  let total = 0
  const byPromo = new Map<number, number>()
  for (const item of items) {
    const lineTotal = item.price * item.quantity
    let remaining = lineTotal
    for (const promo of promos) {
      const applies = promo.applies_to === 'all' || (promo.menu_item_ids && promo.menu_item_ids.includes(item.menu_item_id))
      if (!applies) continue
      const requested = promo.type === 'percentage' ? lineTotal * (promo.discount_value / 100) : promo.discount_value * item.quantity
      const applied = Math.min(Math.max(0, requested), remaining)
      if (applied <= 0) continue
      total += applied
      remaining -= applied
      byPromo.set(promo.id, (byPromo.get(promo.id) || 0) + applied)
      if (remaining <= 0) break
    }
  }
  const details = promos
    .filter((p) => (byPromo.get(p.id) || 0) > 0)
    .map((p) => `${p.name}: -${Math.round(byPromo.get(p.id) || 0)}`)
  return { amount: round2(total), details }
}

export interface CartTotals {
  subtotal: number
  /** Promotions + manual discount (new order) or the stored flat discount (edit), capped at subtotal. */
  discount: number
  discountDetails: string
  /** Part of `discount` the promotions give on their own (approval allowance). */
  promoDiscount: number
  deliveryFee: number
  total: number
  count: number
}

export interface TotalsInput {
  items: CartItem[]
  activePromos: ActivePromo[]
  editingOrderId: number | null
  discountAmount: number
  discountDetails: string
  manualDiscount: ManualDiscount | null
  orderType: OrderType
  deliveryFee: number
}

export function cartTotals(s: TotalsInput): CartTotals {
  const subtotal = round2(s.items.reduce((sum, it) => sum + it.price * it.quantity, 0))
  const count = s.items.reduce((sum, it) => sum + it.quantity, 0)
  let discount = 0
  let details = ''
  let promoDiscount = 0
  if (s.editingOrderId) {
    discount = Math.min(Math.max(0, s.discountAmount), subtotal)
    details = s.discountDetails
    promoDiscount = discount
  } else {
    const promo = computePromoDiscount(s.items, s.activePromos)
    promoDiscount = promo.amount
    const parts = [...promo.details]
    let manual = 0
    if (s.manualDiscount && s.manualDiscount.value > 0) {
      const room = Math.max(0, subtotal - promo.amount)
      const wanted = s.manualDiscount.mode === 'percent' ? (subtotal * s.manualDiscount.value) / 100 : s.manualDiscount.value
      manual = round2(Math.min(room, Math.max(0, wanted)))
      if (manual > 0) parts.push(`${s.manualDiscount.label}: -${Math.round(manual)}`)
    }
    discount = Math.min(subtotal, round2(promo.amount + manual))
    details = parts.join(', ')
  }
  const deliveryFee = s.orderType === 'delivery' ? Math.max(0, s.deliveryFee || 0) : 0
  return { subtotal, discount, discountDetails: details, promoDiscount, deliveryFee, total: round2(Math.max(0, subtotal - discount) + deliveryFee), count }
}
