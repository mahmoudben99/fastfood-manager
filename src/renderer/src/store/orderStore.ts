import { create } from 'zustand'

export interface CartItem {
  menu_item_id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  price: number
  quantity: number
  notes: string
  image_path: string | null
  category_id: number
  worker_id: number | null
}

interface ActivePromo {
  id: number
  name: string
  type: 'percentage' | 'fixed'
  discount_value: number
  applies_to: 'all' | 'specific'
  menu_item_ids?: number[]
}

interface OrderState {
  items: CartItem[]
  orderType: 'local' | 'takeout' | 'delivery'
  tableNumber: string
  customerPhone: string
  customerName: string
  notes: string
  activePromos: ActivePromo[]
  discountAmount: number
  discountDetails: string
  editingOrderId: number | null

  addItem: (item: Omit<CartItem, 'quantity' | 'notes' | 'worker_id'>) => Promise<void>
  removeItem: (index: number) => void
  updateQuantity: (index: number, quantity: number) => void
  updateItemNotes: (index: number, notes: string) => void
  updateItemPrice: (index: number, price: number) => void
  setWorkerForItem: (index: number, workerId: number | null) => void
  setOrderType: (type: 'local' | 'takeout' | 'delivery') => void
  setTableNumber: (num: string) => void
  setCustomerPhone: (phone: string) => void
  setCustomerName: (name: string) => void
  setNotes: (notes: string) => void
  setEditingOrder: (orderId: number | null) => void
  loadOrderForEdit: (order: any) => void
  loadActivePromos: () => Promise<void>
  getSubtotal: () => number
  getDiscount: () => number
  getDiscountDetails: () => string
  getTotal: () => number
  clearOrder: () => void
}

/** Compute the promo discount for a cart, returning both the amount and a human-readable breakdown. */
function computeDiscount(
  items: CartItem[],
  activePromos: ActivePromo[]
): { amount: number; details: string } {
  if (activePromos.length === 0 || items.length === 0) return { amount: 0, details: '' }

  let totalDiscount = 0
  const details: string[] = []

  for (const promo of activePromos) {
    let promoDiscount = 0
    for (const item of items) {
      const applies =
        promo.applies_to === 'all' ||
        (promo.menu_item_ids && promo.menu_item_ids.includes(item.menu_item_id))
      if (!applies) continue

      const itemTotal = item.price * item.quantity
      if (promo.type === 'percentage') {
        promoDiscount += itemTotal * (promo.discount_value / 100)
      } else {
        promoDiscount += Math.min(promo.discount_value * item.quantity, itemTotal)
      }
    }
    if (promoDiscount > 0) {
      totalDiscount += promoDiscount
      details.push(`${promo.name}: -${Math.round(promoDiscount)}`)
    }
  }

  return { amount: Math.round(totalDiscount * 100) / 100, details: details.join(', ') }
}

export const useOrderStore = create<OrderState>((set, get) => ({
  items: [],
  orderType: 'local',
  tableNumber: '',
  customerPhone: '',
  customerName: '',
  notes: '',
  activePromos: [],
  discountAmount: 0,
  discountDetails: '',
  editingOrderId: null,

  addItem: async (item) => {
    const existingIndex = get().items.findIndex(
      (i) => i.menu_item_id === item.menu_item_id
    )

    if (existingIndex >= 0) {
      // Clone the line object (not just the array) so memoized children don't observe a mutated old snapshot.
      set({
        items: get().items.map((it, i) =>
          i === existingIndex ? { ...it, quantity: it.quantity + 1 } : it
        )
      })
      return
    }

    // New item: append synchronously FIRST so a rapid second tap finds it and bumps quantity
    // (previously both taps awaited getByCategoryId, saw existingIndex<0, and appended duplicate lines).
    set({ items: [...get().items, { ...item, quantity: 1, notes: '', worker_id: null }] })

    // Then fill in the auto-assigned worker once the async lookup resolves.
    try {
      const workers = await window.api.workers.getByCategoryId(item.category_id)
      if (workers.length > 0) {
        const workerId = workers[0].id
        set({
          items: get().items.map((it) =>
            it.menu_item_id === item.menu_item_id && it.worker_id === null
              ? { ...it, worker_id: workerId }
              : it
          )
        })
      }
    } catch (err) {
      console.warn('Failed to get worker for category:', err)
    }
  },

  removeItem: (index) => {
    set({ items: get().items.filter((_, i) => i !== index) })
  },

  updateQuantity: (index, quantity) => {
    if (quantity <= 0) {
      set({ items: get().items.filter((_, i) => i !== index) })
      return
    }
    set({ items: get().items.map((it, i) => (i === index ? { ...it, quantity } : it)) })
  },

  updateItemNotes: (index, notes) => {
    set({ items: get().items.map((it, i) => (i === index ? { ...it, notes } : it)) })
  },

  updateItemPrice: (index, price) => {
    set({ items: get().items.map((it, i) => (i === index ? { ...it, price } : it)) })
  },

  setWorkerForItem: (index, workerId) => {
    set({ items: get().items.map((it, i) => (i === index ? { ...it, worker_id: workerId } : it)) })
  },

  setOrderType: (type) => set({ orderType: type }),
  setTableNumber: (num) => set({ tableNumber: num }),
  setCustomerPhone: (phone) => set({ customerPhone: phone }),
  setCustomerName: (name) => set({ customerName: name }),
  setNotes: (notes) => set({ notes }),
  setEditingOrder: (orderId) => set({ editingOrderId: orderId }),

  loadOrderForEdit: (order) => {
    const items: CartItem[] = (order.items || []).map((item: any) => ({
      menu_item_id: item.menu_item_id,
      name: item.menu_item_name || item.name || '',
      name_ar: item.name_ar || null,
      name_fr: item.name_fr || null,
      price: item.unit_price ?? item.price ?? 0,
      quantity: item.quantity,
      notes: item.notes || '',
      image_path: item.image_path || null,
      category_id: item.category_id || 0,
      worker_id: item.worker_id || null
    }))
    set({
      items,
      editingOrderId: order.id,
      orderType: (order.order_type as 'local' | 'takeout' | 'delivery') || 'local',
      tableNumber: order.table_number || '',
      customerPhone: order.customer_phone || '',
      customerName: order.customer_name || '',
      notes: order.notes || ''
    })
  },

  loadActivePromos: async () => {
    try {
      const promos = await window.api.promotions.getActive()
      set({ activePromos: promos })
    } catch {
      set({ activePromos: [] })
    }
  },

  getSubtotal: () => {
    return get().items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  },

  getDiscount: () => computeDiscount(get().items, get().activePromos).amount,

  getDiscountDetails: () => computeDiscount(get().items, get().activePromos).details,

  getTotal: () => {
    return Math.max(0, get().getSubtotal() - get().getDiscount())
  },

  clearOrder: () =>
    set({
      items: [],
      orderType: 'local',
      tableNumber: '',
      customerPhone: '',
      customerName: '',
      notes: '',
      discountAmount: 0,
      discountDetails: '',
      editingOrderId: null
    })
}))
