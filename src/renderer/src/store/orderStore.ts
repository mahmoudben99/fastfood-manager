import { create } from 'zustand'
import type { DeliveryDraft } from '../components/checkout'
import {
  computeUnitPrice, defaultChannelFor, mergeSignature, reprice,
  type ActivePromo, type CartItem, type ManualDiscount, type NewLine, type OrderType
} from './orderPricing'

export * from './orderPricing'

/**
 * The POS cart. Lines are keyed (stable React keys, flash, undo) and carry their v4 catalog picks
 * (modifiers, combo children). `price` is always the effective unit price (see orderPricing.ts).
 */

interface OrderState {
  items: CartItem[]
  orderType: OrderType
  /** Sales channel picked for the order (delivery platform); null = the order type's own channel. */
  channel: string | null
  /** Edit mode: the channel the order was saved on (a change is sent with the update). */
  editingChannel: string | null
  tableNumber: string
  customerPhone: string
  customerName: string
  notes: string
  delivery: DeliveryDraft | null
  deliveryFee: number
  /** Edit mode: the delivery details were changed (send them with the update). */
  deliveryDirty: boolean
  activePromos: ActivePromo[]
  /** Edit mode: stored flat discount of the order being edited. */
  discountAmount: number
  discountDetails: string
  manualDiscount: ManualDiscount | null
  editingOrderId: number | null
  editingOrderDailyNumber: number | null
  /** Last line touched by a tap (ticket flash). */
  pulse: { key: string; n: number } | null

  addItem: (line: NewLine) => string
  updateLine: (key: string, patch: Partial<CartItem>) => void
  setQuantity: (key: string, quantity: number) => void
  removeLine: (key: string) => { line: CartItem; index: number } | null
  restoreLine: (line: CartItem, index: number) => void
  setOrderType: (type: OrderType) => void
  setChannel: (channel: string | null) => void
  setTableNumber: (value: string) => void
  setCustomerPhone: (value: string) => void
  setCustomerName: (value: string) => void
  setNotes: (value: string) => void
  setDelivery: (draft: DeliveryDraft | null, fee: number) => void
  setManualDiscount: (discount: ManualDiscount | null) => void
  loadOrderForEdit: (order: any, lines: CartItem[]) => void
  markUnavailable: (menuItemIds: Set<number>) => void
  loadActivePromos: () => Promise<void>
  clearOrder: () => void
}

/** Channel that prices the cart right now. */
export const activeChannel = (s: { orderType: OrderType; channel: string | null }): string => s.channel ?? defaultChannelFor(s.orderType)

let keySeq = 0
export const newLineKey = (): string => `l${Date.now().toString(36)}${(++keySeq).toString(36)}`

/** Default kitchen worker per category (cached; the lookup used to run on every tap). */
const workerCache = new Map<number, Promise<number | null>>()
function workerForCategory(categoryId: number): Promise<number | null> {
  let hit = workerCache.get(categoryId)
  if (!hit) {
    hit = window.api.workers
      .getByCategoryId(categoryId)
      .then((workers: { id: number }[]) => (workers.length > 0 ? workers[0].id : null))
      .catch(() => null)
    workerCache.set(categoryId, hit)
    // Staff assignments can change in admin; keep the cache short-lived.
    setTimeout(() => workerCache.delete(categoryId), 60_000)
  }
  return hit
}

const EMPTY_ORDER = {
  items: [] as CartItem[],
  orderType: 'local' as OrderType,
  channel: null as string | null,
  editingChannel: null as string | null,
  tableNumber: '',
  customerPhone: '',
  customerName: '',
  notes: '',
  delivery: null,
  deliveryFee: 0,
  deliveryDirty: false,
  discountAmount: 0,
  discountDetails: '',
  manualDiscount: null,
  editingOrderId: null,
  editingOrderDailyNumber: null,
  pulse: null
}

export const useOrderStore = create<OrderState>((set, get) => ({
  ...EMPTY_ORDER,
  activePromos: [],

  addItem: (input) => {
    const { items, pulse } = get()
    const channelKey = activeChannel(get())
    const quantity = Math.max(1, input.quantity ?? 1)
    const notes = input.notes ?? ''
    const signature = mergeSignature(input)
    const unitPrice = computeUnitPrice({ ...input, worker_id: null, quantity, notes }, channelKey)
    const hit = notes === '' && input.price_override == null
      ? items.findIndex((it) => it.notes === '' && !it.unavailable && it.price_override == null &&
          (it.order_item_id === undefined || !it.catalog_dirty) && it.price === unitPrice &&
          mergeSignature(it) === signature)
      : -1
    if (hit >= 0) {
      const key = items[hit].key
      // Clone the line (not just the array) so memoized ticket lines see a new object.
      set({
        items: items.map((it, i) => (i === hit ? { ...it, quantity: it.quantity + quantity } : it)),
        pulse: { key, n: (pulse?.n ?? 0) + 1 }
      })
      return key
    }
    const key = newLineKey()
    const line: CartItem = { ...input, key, quantity, notes, worker_id: null, price: unitPrice }
    // Append synchronously so a rapid second tap finds this line and bumps it.
    set({ items: [...items, line], pulse: { key, n: (pulse?.n ?? 0) + 1 } })
    if (!input.is_combo) {
      void workerForCategory(input.category_id).then((workerId) => {
        if (workerId === null) return
        set({ items: get().items.map((it) => (it.key === key && it.worker_id === null ? { ...it, worker_id: workerId } : it)) })
      })
    }
    return key
  },

  updateLine: (key, patch) => {
    const channelKey = activeChannel(get())
    set({
      items: get().items.map((it) => {
        if (it.key !== key) return it
        const next = { ...it, ...patch }
        return { ...next, price: computeUnitPrice(next, channelKey) }
      })
    })
  },

  setQuantity: (key, quantity) => {
    if (quantity <= 0) {
      get().removeLine(key)
      return
    }
    set({ items: get().items.map((it) => (it.key === key ? { ...it, quantity } : it)) })
  },

  removeLine: (key) => {
    const items = get().items
    const index = items.findIndex((it) => it.key === key)
    if (index < 0) return null
    set({ items: items.filter((it) => it.key !== key) })
    return { line: items[index], index }
  },

  restoreLine: (line, index) => {
    const items = get().items.filter((it) => it.key !== line.key)
    items.splice(Math.min(index, items.length), 0, line)
    set({ items })
  },

  // A platform belongs to one order type: switching type goes back to the type's own channel.
  setOrderType: (orderType) => set({ orderType, channel: null, items: reprice(get().items, defaultChannelFor(orderType)) }),
  setChannel: (channel) => {
    const next = channel === defaultChannelFor(get().orderType) ? null : channel
    set({ channel: next, items: reprice(get().items, next ?? defaultChannelFor(get().orderType)) })
  },
  setTableNumber: (tableNumber) => set({ tableNumber }),
  setCustomerPhone: (customerPhone) => set({ customerPhone }),
  setCustomerName: (customerName) => set({ customerName }),
  setNotes: (notes) => set({ notes }),
  setDelivery: (delivery, fee) => set({ delivery, deliveryFee: Math.max(0, fee || 0), deliveryDirty: true }),
  setManualDiscount: (manualDiscount) => set({ manualDiscount }),

  loadOrderForEdit: (order, lines) => {
    const orderType = (['local', 'takeout', 'delivery'].includes(order.order_type) ? order.order_type : 'local') as OrderType
    const d = order.delivery
    set({
      ...EMPTY_ORDER,
      items: lines,
      editingOrderId: order.id,
      editingOrderDailyNumber: order.daily_number ?? null,
      orderType,
      channel: order.channel && order.channel !== defaultChannelFor(orderType) ? order.channel : null,
      editingChannel: order.channel && order.channel !== defaultChannelFor(orderType) ? order.channel : null,
      tableNumber: order.table_number || '',
      customerPhone: order.customer_phone || '',
      customerName: order.customer_name || '',
      notes: order.notes || '',
      delivery: d
        ? { address: d.address ?? null, address_id: d.address_id ?? null, zone_id: d.zone_id ?? null, driver_id: d.driver_id ?? null, fee: d.fee ?? null, notes: d.notes ?? null }
        : null,
      deliveryFee: Number(order.delivery_fee) || 0,
      // Editing a historical order must not apply today's promotions: keep its flat discount.
      discountAmount: Number(order.discount_amount) || 0,
      discountDetails: order.discount_details || ''
    })
  },

  markUnavailable: (ids) =>
    set({ items: get().items.map((it) => (ids.has(it.menu_item_id) !== Boolean(it.unavailable) ? { ...it, unavailable: ids.has(it.menu_item_id) } : it)) }),

  loadActivePromos: async () => {
    try {
      set({ activePromos: await window.api.promotions.getActive() })
    } catch {
      set({ activePromos: [] })
    }
  },

  clearOrder: () => set({ ...EMPTY_ORDER })
}))
