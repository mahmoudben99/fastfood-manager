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
  loadActivePromos: () => Promise<void>
  getSubtotal: () => number
  getDiscount: () => number
  getTotal: () => number
  clearOrder: () => void
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

  addItem: async (item) => {
    const { items } = get()
    const existingIndex = items.findIndex(
      (i) => i.menu_item_id === item.menu_item_id
    )

    if (existingIndex >= 0) {
      const updated = [...items]
      updated[existingIndex].quantity += 1
      set({ items: updated })
    } else {
      // Automatically assign worker based on category
      let worker_id: number | null = null
      try {
        const workers = await window.api.workers.getByCategoryId(item.category_id)
        if (workers.length > 0) {
          worker_id = workers[0].id // Use first assigned worker
        }
      } catch (err) {
        console.warn('Failed to get worker for category:', err)
      }

      set({
        items: [...items, { ...item, quantity: 1, notes: '', worker_id }]
      })
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
    const updated = [...get().items]
    updated[index].quantity = quantity
    set({ items: updated })
  },

  updateItemNotes: (index, notes) => {
    const updated = [...get().items]
    updated[index].notes = notes
    set({ items: updated })
  },

  updateItemPrice: (index, price) => {
    const updated = [...get().items]
    updated[index].price = price
    set({ items: updated })
  },

  setWorkerForItem: (index, workerId) => {
    const updated = [...get().items]
    updated[index].worker_id = workerId
    set({ items: updated })
  },

  setOrderType: (type) => set({ orderType: type }),
  setTableNumber: (num) => set({ tableNumber: num }),
  setCustomerPhone: (phone) => set({ customerPhone: phone }),
  setCustomerName: (name) => set({ customerName: name }),
  setNotes: (notes) => set({ notes }),

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

  getDiscount: () => {
    const { items, activePromos } = get()
    if (activePromos.length === 0 || items.length === 0) return 0

    let totalDiscount = 0
    const details: string[] = []

    for (const promo of activePromos) {
      let promoDiscount = 0
      for (const item of items) {
        const applies = promo.applies_to === 'all' ||
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

    return Math.round(totalDiscount * 100) / 100
  },

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
      discountDetails: ''
    })
}))
