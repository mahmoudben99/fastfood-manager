import { getDb } from '../connection'
import { stockRepo } from './stock.repo'
import { menuRepo } from './menu.repo'
import { customersRepo } from './customers.repo'

/**
 * Restaurant-LOCAL calendar date (YYYY-MM-DD).
 * Using UTC here (the old `new Date().toISOString()`) bucketed late-night orders
 * onto the wrong day for non-UTC timezones (Algeria is UTC+1). The machine running
 * the POS is in the restaurant's timezone, so getTimezoneOffset() is correct here.
 */
function localDate(d = new Date()): string {
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().split('T')[0]
}

export interface Order {
  id: number
  daily_number: number
  order_date: string
  order_type: string
  table_number: string | null
  customer_phone: string | null
  customer_name: string | null
  status: string
  subtotal: number
  total: number
  discount_amount: number
  discount_details: string | null
  customer_id: number | null
  notes: string | null
  created_at: string
  completed_at: string | null
  items?: OrderItem[]
}

export interface OrderItem {
  id: number
  order_id: number
  menu_item_id: number
  quantity: number
  unit_price: number
  total_price: number
  notes: string | null
  worker_id: number | null
  menu_item_name?: string
  worker_name?: string
}

export interface CreateOrderInput {
  order_type: string
  table_number?: string
  customer_phone?: string
  customer_name?: string
  notes?: string
  discount_amount?: number
  discount_details?: string
  /**
   * When true, item prices are ALWAYS taken from the menu and any caller-supplied
   * unit_price is ignored. Set by untrusted callers (tablet self-order server, remote
   * online orders) so a client can't POST unit_price: 0. The trusted POS leaves this
   * off so cashiers can still apply manual price overrides.
   */
  forceMenuPrice?: boolean
  items: {
    menu_item_id: number
    quantity: number
    notes?: string
    worker_id?: number
    unit_price?: number
  }[]
}

export const ordersRepo = {
  getNextDailyNumber(): number {
    const today = localDate()
    // Atomic increment in a single statement (date is PRIMARY KEY). Replaces the old
    // SELECT-then-UPDATE which could hand out the same number to two near-simultaneous
    // creates (e.g. a POS order and a remote order). RETURNING gives back the new value.
    const row = getDb()
      .prepare(
        `INSERT INTO daily_counters (date, last_order_num) VALUES (?, 1)
         ON CONFLICT(date) DO UPDATE SET last_order_num = last_order_num + 1
         RETURNING last_order_num`
      )
      .get(today) as { last_order_num: number }
    return row.last_order_num
  },

  create(input: CreateOrderInput): Order {
    const transaction = getDb().transaction(() => {
      const today = localDate()
      const dailyNumber = this.getNextDailyNumber()

      // Calculate totals
      let subtotal = 0
      const itemDetails: {
        menu_item_id: number
        quantity: number
        unit_price: number
        total_price: number
        notes: string | null
        worker_id: number | null
      }[] = []

      for (const item of input.items) {
        const menuItem = menuRepo.getById(item.menu_item_id)
        if (!menuItem) throw new Error(`Menu item ${item.menu_item_id} not found`)

        const unitPrice = input.forceMenuPrice ? menuItem.price : (item.unit_price ?? menuItem.price)
        const totalPrice = unitPrice * item.quantity
        subtotal += totalPrice

        itemDetails.push({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          unit_price: unitPrice,
          total_price: totalPrice,
          notes: item.notes ?? null,
          worker_id: item.worker_id ?? null
        })
      }

      // Apply discount (clamped to [0, subtotal]) so the stored total reflects promos.
      const discount = Math.min(Math.max(0, input.discount_amount ?? 0), subtotal)
      const total = subtotal - discount

      // Loyalty: link the order to a customer (and accrue their running total) inside
      // this same transaction so customer_id is written atomically. Done here — not in
      // the IPC handler — so tablet & remote orders also accrue loyalty.
      let customerId: number | null = null
      if (input.customer_phone) {
        try {
          customerId = customersRepo.upsertFromOrder(
            input.customer_phone,
            total,
            input.customer_name
          )
        } catch {
          customerId = null
        }
      }

      // Insert order (status = 'preparing' immediately)
      const now = new Date().toISOString()
      const orderResult = getDb()
        .prepare(
          `INSERT INTO orders (daily_number, order_date, order_type, table_number, customer_phone, customer_name, subtotal, total, discount_amount, discount_details, customer_id, notes, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'preparing', ?)`
        )
        .run(
          dailyNumber,
          today,
          input.order_type,
          input.table_number ?? null,
          input.customer_phone ?? null,
          input.customer_name ?? null,
          subtotal,
          total,
          discount,
          input.discount_details ?? null,
          customerId,
          input.notes ?? null,
          now
        )

      const orderId = orderResult.lastInsertRowid as number

      // Insert order items and deduct stock
      const itemStmt = getDb().prepare(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes, worker_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )

      const deductStmt = getDb().prepare(
        `INSERT INTO order_item_deductions (order_item_id, stock_item_id, quantity_deducted, cost_per_unit)
         VALUES (?, ?, ?, ?)`
      )

      const stockAdjStmt = getDb().prepare(
        `INSERT INTO stock_adjustments (stock_item_id, adjustment_type, quantity_change, previous_qty, new_qty, affects_cost, reason)
         VALUES (?, 'order_deduction', ?, ?, ?, 0, ?)`
      )

      for (const item of itemDetails) {
        const itemResult = itemStmt.run(
          orderId,
          item.menu_item_id,
          item.quantity,
          item.unit_price,
          item.total_price,
          item.notes,
          item.worker_id
        )
        const orderItemId = itemResult.lastInsertRowid as number

        // Deduct ingredients from stock
        const ingredients = menuRepo.getIngredients(item.menu_item_id)
        for (const ing of ingredients) {
          const totalDeduction = ing.quantity * item.quantity
          const stockItem = stockRepo.getById(ing.stock_item_id)
          if (stockItem) {
            const previousQty = stockItem.quantity
            stockRepo.deduct(ing.stock_item_id, totalDeduction)

            deductStmt.run(
              orderItemId,
              ing.stock_item_id,
              totalDeduction,
              stockItem.price_per_unit
            )

            stockAdjStmt.run(
              ing.stock_item_id,
              -totalDeduction,
              previousQty,
              previousQty - totalDeduction,
              `Order #${dailyNumber}`
            )
          }
        }
      }

      return orderId
    })

    const orderId = transaction()
    return this.getById(orderId)!
  },

  getById(id: number): Order | undefined {
    const order = getDb()
      .prepare('SELECT * FROM orders WHERE id = ?')
      .get(id) as Order | undefined

    if (order) {
      order.items = this.getOrderItems(id)
    }
    return order
  },

  getOrderItems(orderId: number): OrderItem[] {
    return getDb()
      .prepare(
        `SELECT oi.*, mi.name as menu_item_name, mi.name_ar as menu_item_name_ar, mi.name_fr as menu_item_name_fr, w.name as worker_name
         FROM order_items oi
         LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
         LEFT JOIN workers w ON oi.worker_id = w.id
         WHERE oi.order_id = ?`
      )
      .all(orderId) as OrderItem[]
  },

  getByDate(date: string): Order[] {
    return getDb()
      .prepare('SELECT * FROM orders WHERE order_date = ? ORDER BY daily_number DESC')
      .all(date) as Order[]
  },

  getByDateRange(startDate: string, endDate: string): Order[] {
    return getDb()
      .prepare(
        'SELECT * FROM orders WHERE order_date BETWEEN ? AND ? ORDER BY order_date DESC, daily_number DESC'
      )
      .all(startDate, endDate) as Order[]
  },

  /** Auto-complete all preparing/pending orders from previous days */
  autoCompletePreviousDays(): number {
    const today = localDate()
    const result = getDb()
      .prepare("UPDATE orders SET status = 'completed', completed_at = datetime('now') WHERE status IN ('preparing', 'pending') AND order_date < ?")
      .run(today)
    return result.changes
  },

  updateStatus(id: number, status: string): Order | undefined {
    const completedAt = status === 'completed' ? new Date().toISOString() : null
    getDb()
      .prepare('UPDATE orders SET status = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?')
      .run(status, completedAt, id)
    return this.getById(id)
  },

  cancelOrder(id: number): Order | undefined {
    // Restore stock when cancelling
    const order = this.getById(id)
    if (!order || order.status === 'cancelled') return order

    const transaction = getDb().transaction(() => {
      // Restore stock for each item
      if (order.items) {
        for (const item of order.items) {
          const deductions = getDb()
            .prepare(
              'SELECT * FROM order_item_deductions WHERE order_item_id = ?'
            )
            .all(item.id) as { stock_item_id: number; quantity_deducted: number }[]

          for (const ded of deductions) {
            const stockItem = stockRepo.getById(ded.stock_item_id)
            if (stockItem) {
              getDb()
                .prepare(
                  "UPDATE stock_items SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?"
                )
                .run(ded.quantity_deducted, ded.stock_item_id)
            }
          }
        }
      }

      getDb()
        .prepare("UPDATE orders SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?")
        .run(id)
    })

    transaction()
    return this.getById(id)
  },

  updateItems(
    orderId: number,
    items: {
      menu_item_id: number
      quantity: number
      notes?: string
      worker_id?: number
      unit_price?: number
    }[],
    discountAmount?: number,
    discountDetails?: string
  ): Order | undefined {
    const order = this.getById(orderId)
    if (!order || order.status === 'cancelled' || order.status === 'completed') return order

    const transaction = getDb().transaction(() => {
      // 1. Restore stock from old deductions
      const oldItems = this.getOrderItems(orderId)
      for (const item of oldItems) {
        const deductions = getDb()
          .prepare('SELECT * FROM order_item_deductions WHERE order_item_id = ?')
          .all(item.id) as { stock_item_id: number; quantity_deducted: number }[]
        for (const ded of deductions) {
          getDb()
            .prepare("UPDATE stock_items SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?")
            .run(ded.quantity_deducted, ded.stock_item_id)
        }
      }

      // 2. Delete old order items (cascade deletes deductions)
      getDb().prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId)

      // 3. Recalculate and insert new items
      let subtotal = 0
      const itemStmt = getDb().prepare(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes, worker_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      const deductStmt = getDb().prepare(
        `INSERT INTO order_item_deductions (order_item_id, stock_item_id, quantity_deducted, cost_per_unit)
         VALUES (?, ?, ?, ?)`
      )

      for (const item of items) {
        const menuItem = menuRepo.getById(item.menu_item_id)
        if (!menuItem) continue

        // Preserve the caller's unit price (custom-priced lines / the order's original
        // price) instead of silently re-pricing to the current menu price on every edit.
        const unitPrice = item.unit_price ?? menuItem.price
        const totalPrice = unitPrice * item.quantity
        subtotal += totalPrice

        const result = itemStmt.run(
          orderId,
          item.menu_item_id,
          item.quantity,
          unitPrice,
          totalPrice,
          item.notes ?? null,
          item.worker_id ?? null
        )
        const orderItemId = result.lastInsertRowid as number

        // Deduct ingredients
        const ingredients = menuRepo.getIngredients(item.menu_item_id)
        for (const ing of ingredients) {
          const totalDeduction = ing.quantity * item.quantity
          const stockItem = stockRepo.getById(ing.stock_item_id)
          if (stockItem) {
            stockRepo.deduct(ing.stock_item_id, totalDeduction)
            deductStmt.run(orderItemId, ing.stock_item_id, totalDeduction, stockItem.price_per_unit)
          }
        }
      }

      // 4. Update order totals (preserve the order's existing discount unless a new one
      //    is supplied), so editing an order no longer wipes its promo discount.
      const discount = Math.min(
        Math.max(0, discountAmount ?? order.discount_amount ?? 0),
        subtotal
      )
      const total = subtotal - discount
      const details = discountDetails ?? order.discount_details ?? null
      getDb()
        .prepare('UPDATE orders SET subtotal = ?, total = ?, discount_amount = ?, discount_details = ? WHERE id = ?')
        .run(subtotal, total, discount, details, orderId)
    })

    transaction()
    return this.getById(orderId)
  },

  getTodayOrders(): Order[] {
    const today = localDate()
    const orders = this.getByDate(today)

    // Load items for each order
    return orders.map((order) => ({
      ...order,
      items: this.getOrderItems(order.id)
    }))
  }
}
