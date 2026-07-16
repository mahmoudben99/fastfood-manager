import { getDb } from '../connection'
import { stockRepo } from './stock.repo'
import { menuRepo } from './menu.repo'
import { customersRepo } from './customers.repo'
import { workersRepo } from './workers.repo'
import { totalRecipeDeduction } from '../../services/stock-units'

const ORDER_TYPES = new Set(['local', 'takeout', 'delivery'])
const ORDER_STATUSES = new Set(['pending', 'preparing', 'completed', 'cancelled'])
const MAX_ORDER_LINES = 100
const MAX_ORDER_UNITS = 999
const MAX_MONEY = 1_000_000_000

function validateNewOrderInput(input: CreateOrderInput): void {
  if (!ORDER_TYPES.has(input.order_type)) throw new Error('Invalid order type')
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error('Order must contain at least one item')
  if (input.items.length > MAX_ORDER_LINES) throw new Error(`Order cannot contain more than ${MAX_ORDER_LINES} lines`)
  let units = 0
  for (const item of input.items) {
    if (!Number.isInteger(item.menu_item_id) || item.menu_item_id <= 0) throw new Error('Invalid menu item')
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > MAX_ORDER_UNITS) {
      throw new Error(`Item quantity must be an integer between 1 and ${MAX_ORDER_UNITS}`)
    }
    units += item.quantity
    if (item.unit_price !== undefined && (!Number.isFinite(item.unit_price) || item.unit_price < 0 || item.unit_price > MAX_MONEY)) {
      throw new Error('Item price is outside the supported range')
    }
  }
  if (units > MAX_ORDER_UNITS) throw new Error(`Order cannot contain more than ${MAX_ORDER_UNITS} total items`)
  if (input.discount_amount !== undefined && (!Number.isFinite(input.discount_amount) || input.discount_amount < 0)) {
    throw new Error('Discount must be a finite non-negative number')
  }
}

/**
 * Restaurant-LOCAL calendar date (YYYY-MM-DD).
 * Using UTC here (the old `new Date().toISOString()`) bucketed late-night orders
 * onto the wrong day for non-UTC timezones (Algeria is UTC+1). The machine running
 * the POS is in the restaurant's timezone, so getTimezoneOffset() is correct here.
 */
export function localDate(d = new Date()): string {
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

export interface UpdateOrderItemInput {
  /** Existing database line identity. Omit only when adding a genuinely new line. */
  order_item_id?: number
  menu_item_id: number
  quantity: number
  notes?: string
  worker_id?: number | null
  unit_price?: number
}

interface OrderItemDeduction {
  id: number
  stock_item_id: number
  quantity_deducted: number
  cost_per_unit: number
}

function validateUpdateOrderItems(items: UpdateOrderItemInput[]): void {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Order must contain at least one item')
  if (items.length > MAX_ORDER_LINES) throw new Error('Order contains too many lines')

  const existingIds = new Set<number>()
  let units = 0
  for (const item of items) {
    if (!Number.isInteger(item.menu_item_id) || item.menu_item_id <= 0) throw new Error('Invalid menu item')
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > MAX_ORDER_UNITS) {
      throw new Error('Item quantity is outside the supported range')
    }
    units += item.quantity
    if (item.order_item_id !== undefined) {
      if (!Number.isInteger(item.order_item_id) || item.order_item_id <= 0) {
        throw new Error('Invalid existing order line')
      }
      if (existingIds.has(item.order_item_id)) throw new Error('The same existing order line was submitted twice')
      existingIds.add(item.order_item_id)
    }
    if (item.worker_id !== undefined && item.worker_id !== null &&
        (!Number.isInteger(item.worker_id) || item.worker_id <= 0)) {
      throw new Error('Invalid worker assignment')
    }
    if (item.unit_price !== undefined &&
        (!Number.isFinite(item.unit_price) || item.unit_price < 0 || item.unit_price > MAX_MONEY)) {
      throw new Error('Item price is outside the supported range')
    }
  }
  if (units > MAX_ORDER_UNITS) throw new Error('Order contains too many total items')
}

function enqueueAutomaticPrintJobs(
  orderId: number,
  items: { worker_id: number | null }[],
  eventType: 'new' | 'updated' | 'cancelled' | 'restored' = 'new'
): void {
  const db = getDb()
  const setting = (key: string): string | undefined =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined)?.value
  const assignment = (type: 'receipt' | 'kitchen_all' | 'worker', workerId?: number | null) =>
    db.prepare(
      workerId == null
        ? 'SELECT auto_print FROM printer_assignments WHERE assignment_type = ? AND is_active = 1 LIMIT 1'
        : 'SELECT auto_print FROM printer_assignments WHERE assignment_type = ? AND worker_id = ? AND is_active = 1 LIMIT 1'
    ).get(...(workerId == null ? [type] : [type, workerId])) as
      | { auto_print: number }
      | undefined

  const insert = db.prepare(
    'INSERT OR IGNORE INTO print_jobs ' +
    '(order_id, event_type, event_sequence, document_type, scope, worker_id, status) ' +
    "VALUES (?, ?, ?, ?, ?, ?, 'pending')"
  )
  const eventSequence = (
    db.prepare(
      'SELECT COALESCE(MAX(event_sequence), 0) + 1 AS sequence ' +
      'FROM print_jobs WHERE order_id = ? AND event_type = ?'
    ).get(orderId, eventType) as { sequence: number }
  ).sequence

  if (eventType === 'new') {
    const receiptAssignment = assignment('receipt')
    const autoReceipt = receiptAssignment
      ? receiptAssignment.auto_print === 1
      : setting('auto_print_receipt') === 'true'
    if (autoReceipt) {
      insert.run(orderId, eventType, eventSequence, 'receipt', 'all', null)
    }
  }

  const legacyAutoKitchen = setting('auto_print_kitchen') === 'true'
  const split = setting('split_kitchen_tickets') === 'true'
  if (!split) {
    const kitchen = assignment('kitchen_all')
    const auto = kitchen ? kitchen.auto_print === 1 : legacyAutoKitchen
    if (auto) insert.run(orderId, eventType, eventSequence, 'kitchen', 'all', null)
    return
  }

  const groups = new Set(items.map((item) => item.worker_id))
  for (const workerId of groups) {
    const direct = workerId == null ? undefined : assignment('worker', workerId)
    const fallback = assignment('kitchen_all')
    const auto = direct
      ? direct.auto_print === 1
      : fallback
        ? fallback.auto_print === 1
        : legacyAutoKitchen
    if (!auto) continue
    insert.run(
      orderId,
      eventType,
      eventSequence,
      'kitchen',
      workerId == null ? 'unassigned' : 'worker',
      workerId
    )
  }
}

export const ordersRepo = {
  getNextDailyNumber(date = localDate()): number {
    // Atomic increment in a single statement (date is PRIMARY KEY). Replaces the old
    // SELECT-then-UPDATE which could hand out the same number to two near-simultaneous
    // creates (e.g. a POS order and a remote order). RETURNING gives back the new value.
    const row = getDb()
      .prepare(
        `INSERT INTO daily_counters (date, last_order_num) VALUES (?, 1)
         ON CONFLICT(date) DO UPDATE SET last_order_num = last_order_num + 1
         RETURNING last_order_num`
      )
      .get(date) as { last_order_num: number }
    return row.last_order_num
  },

  create(input: CreateOrderInput): Order {
    validateNewOrderInput(input)
    const transaction = getDb().transaction(() => {
      const today = localDate()
      const dailyNumber = this.getNextDailyNumber(today)

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
        const menuItem = menuRepo.getActiveById(item.menu_item_id)
        if (!menuItem) throw new Error(`Menu item ${item.menu_item_id} is unavailable`)

        const unitPrice = input.forceMenuPrice ? menuItem.price : (item.unit_price ?? menuItem.price)
        const totalPrice = unitPrice * item.quantity
        if (!Number.isFinite(totalPrice) || totalPrice < 0 || subtotal + totalPrice > MAX_MONEY) {
          throw new Error('Order total is outside the supported range')
        }
        subtotal += totalPrice

        let workerId = item.worker_id ?? null
        if (workerId != null) {
          const worker = workersRepo.getById(workerId)
          if (!worker || worker.is_active !== 1) workerId = null
        }
        if (workerId == null) {
          workerId = workersRepo.getByCategoryId(menuItem.category_id)[0]?.id ?? null
        }

        itemDetails.push({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          unit_price: unitPrice,
          total_price: totalPrice,
          notes: item.notes ?? null,
          worker_id: workerId
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
        customerId = customersRepo.upsertFromOrder(
          input.customer_phone,
          total,
          input.customer_name
        )
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
          const stockItem = stockRepo.getById(ing.stock_item_id)
          if (stockItem) {
            const totalDeduction = totalRecipeDeduction(
              ing.quantity,
              item.quantity,
              ing.unit,
              stockItem.unit_type
            )
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

      // Durable auto-print intent is committed with the order itself. A crash immediately
      // after commit can no longer erase the only kitchen ticket request.
      enqueueAutomaticPrintJobs(orderId, itemDetails)

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
    if (!ORDER_STATUSES.has(status)) throw new Error('Invalid order status')
    const order = this.getById(id)
    if (!order) return order
    if (order.status === status) return order
    if (status === 'cancelled') return this.cancelOrder(id)

    const allowedTransitions: Record<string, string[]> = {
      pending: ['preparing', 'completed'],
      preparing: ['completed'],
      completed: ['preparing'],
      cancelled: ['preparing']
    }
    if (!allowedTransitions[order.status]?.includes(status)) {
      throw new Error('Order cannot move from ' + order.status + ' to ' + status)
    }

    // Restoring a previously-cancelled order back to an active state must re-apply the
    // side-effects that cancelOrder() reversed: re-deduct the ingredients from stock and
    // re-accrue the customer's loyalty. Otherwise cancel→restore leaves stock inflated and
    // re-cancelling would restore stock/loyalty a second time (phantom quantity & spend).
    const isRestore = order.status === 'cancelled' && status !== 'cancelled'

    const completedAt = status === 'completed' || status === 'cancelled'
      ? new Date().toISOString()
      : null
    const apply = getDb().transaction(() => {
      if (isRestore) {
        if (order.items) {
          for (const item of order.items) {
            const deductions = getDb()
              .prepare('SELECT * FROM order_item_deductions WHERE order_item_id = ?')
              .all(item.id) as { stock_item_id: number; quantity_deducted: number }[]
            for (const ded of deductions) {
              getDb()
                .prepare("UPDATE stock_items SET quantity = quantity - ?, updated_at = datetime('now') WHERE id = ?")
                .run(ded.quantity_deducted, ded.stock_item_id)
            }
          }
        }
        if (order.customer_id != null) {
          getDb()
            .prepare("UPDATE customers SET total_spent = total_spent + ?, order_count = order_count + 1, updated_at = datetime('now') WHERE id = ?")
            .run(order.total, order.customer_id)
        }
      }

      getDb()
        .prepare('UPDATE orders SET status = ?, completed_at = ? WHERE id = ?')
        .run(status, completedAt, id)
      if (status === 'preparing' && (order.status === 'cancelled' || order.status === 'completed')) {
        enqueueAutomaticPrintJobs(id, order.items || [], 'restored')
      }
    })
    apply()
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

      // Reverse the loyalty accrual that create() applied, so a cancelled order no longer
      // counts toward the customer's total_spent / order_count (kept clamped at 0).
      if (order.customer_id != null) {
        getDb()
          .prepare("UPDATE customers SET total_spent = MAX(0, total_spent - ?), order_count = MAX(0, order_count - 1), updated_at = datetime('now') WHERE id = ?")
          .run(order.total, order.customer_id)
      }

      getDb()
        .prepare("UPDATE orders SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?")
        .run(id)
      enqueueAutomaticPrintJobs(id, order.items || [], 'cancelled')
    })

    transaction()
    return this.getById(id)
  },

  updateItems(
    orderId: number,
    items: UpdateOrderItemInput[],
    discountAmount?: number,
    discountDetails?: string,
    info?: {
      order_type?: string
      table_number?: string | null
      customer_phone?: string | null
      customer_name?: string | null
      notes?: string | null
    }
  ): Order | undefined {
    validateUpdateOrderItems(items)
    if (discountAmount !== undefined &&
        (!Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount > MAX_MONEY)) {
      throw new Error('Discount is outside the supported range')
    }
    if (info?.order_type !== undefined && !ORDER_TYPES.has(info.order_type)) {
      throw new Error('Invalid order type')
    }

    const order = this.getById(orderId)
    if (!order || order.status === 'cancelled' || order.status === 'completed') return order

    const oldItems = this.getOrderItems(orderId)
    const oldById = new Map(oldItems.map((item) => [item.id, item]))
    const retainedIds = new Set<number>()

    // Validate every claimed existing line before changing stock. A renderer must not be able
    // to attach a line from another order or change its product identity.
    for (const item of items) {
      if (item.order_item_id === undefined) continue
      const old = oldById.get(item.order_item_id)
      if (!old) throw new Error('An edited order line no longer exists')
      if (old.menu_item_id !== item.menu_item_id) throw new Error('An existing order line cannot change products')
      retainedIds.add(old.id)
    }
    const kitchenRelevantChange =
      retainedIds.size !== oldItems.length ||
      items.some((item) => {
        if (item.order_item_id === undefined) return true
        const old = oldById.get(item.order_item_id)!
        const nextWorker = item.worker_id === undefined ? old.worker_id : item.worker_id
        return item.quantity !== old.quantity ||
          (item.notes ?? null) !== (old.notes ?? null) ||
          (nextWorker ?? null) !== (old.worker_id ?? null)
      }) ||
      (info?.order_type !== undefined && info.order_type !== order.order_type) ||
      (info && 'table_number' in info && (info.table_number ?? null) !== (order.table_number ?? null)) ||
      (info && 'notes' in info && (info.notes ?? null) !== (order.notes ?? null))

    const transaction = getDb().transaction(() => {
      const adjustStock = (stockItemId: number, quantityChange: number, reason: string): void => {
        if (Math.abs(quantityChange) < 1e-12) return
        const stock = stockRepo.getById(stockItemId)
        if (!stock) throw new Error('A stock item used by this order no longer exists')
        const next = stock.quantity + quantityChange
        getDb()
          .prepare("UPDATE stock_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?")
          .run(next, stockItemId)
        getDb()
          .prepare(
            "INSERT INTO stock_adjustments " +
            "(stock_item_id, adjustment_type, quantity_change, previous_qty, new_qty, affects_cost, reason) " +
            "VALUES (?, 'order_edit', ?, ?, ?, 0, ?)"
          )
          .run(stockItemId, quantityChange, stock.quantity, next, reason)
      }

      const deductionsFor = (orderItemId: number): OrderItemDeduction[] =>
        getDb()
          .prepare('SELECT id, stock_item_id, quantity_deducted, cost_per_unit FROM order_item_deductions WHERE order_item_id = ?')
          .all(orderItemId) as OrderItemDeduction[]

      // Removed lines restore exactly what that historical line deducted. They do not consult
      // today's recipe or stock cost.
      for (const old of oldItems) {
        if (retainedIds.has(old.id)) continue
        for (const deduction of deductionsFor(old.id)) {
          adjustStock(
            deduction.stock_item_id,
            deduction.quantity_deducted,
            'Order #' + order.daily_number + ' edit: removed line'
          )
        }
        getDb().prepare('DELETE FROM order_items WHERE id = ? AND order_id = ?').run(old.id, orderId)
      }

      let subtotal = 0
      const insertItem = getDb().prepare(
        'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes, worker_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      const insertDeduction = getDb().prepare(
        'INSERT INTO order_item_deductions (order_item_id, stock_item_id, quantity_deducted, cost_per_unit) ' +
        'VALUES (?, ?, ?, ?)'
      )

      for (const item of items) {
        if (item.order_item_id !== undefined) {
          const old = oldById.get(item.order_item_id)!
          const unitPrice = item.unit_price ?? old.unit_price
          const totalPrice = unitPrice * item.quantity
          if (!Number.isFinite(totalPrice) || totalPrice < 0 || subtotal + totalPrice > MAX_MONEY) {
            throw new Error('Order total is outside the supported range')
          }

          let workerId = item.worker_id === undefined ? old.worker_id : item.worker_id
          if (workerId != null && workerId !== old.worker_id) {
            const worker = workersRepo.getById(workerId)
            if (!worker || worker.is_active !== 1) throw new Error('The selected worker is unavailable')
          }

          if (item.quantity !== old.quantity) {
            for (const deduction of deductionsFor(old.id)) {
              const perUnit = deduction.quantity_deducted / old.quantity
              if (!Number.isFinite(perUnit) || perUnit < 0) {
                throw new Error('This order has an invalid stock deduction snapshot')
              }
              const nextDeduction = perUnit * item.quantity
              // Positive means stock comes back; negative means the extra quantity consumes it.
              adjustStock(
                deduction.stock_item_id,
                deduction.quantity_deducted - nextDeduction,
                'Order #' + order.daily_number + ' edit: quantity delta'
              )
              getDb()
                .prepare('UPDATE order_item_deductions SET quantity_deducted = ? WHERE id = ?')
                .run(nextDeduction, deduction.id)
            }
          }

          getDb()
            .prepare(
              'UPDATE order_items SET quantity = ?, unit_price = ?, total_price = ?, notes = ?, worker_id = ? ' +
              'WHERE id = ? AND order_id = ?'
            )
            .run(
              item.quantity,
              unitPrice,
              totalPrice,
              item.notes ?? null,
              workerId ?? null,
              old.id,
              orderId
            )
          subtotal += totalPrice
          continue
        }

        // A line without an existing identity is genuinely new. It uses the current active
        // product, current recipe and current cost snapshot.
        const menuItem = menuRepo.getActiveById(item.menu_item_id)
        if (!menuItem) throw new Error('A newly added menu item is unavailable')
        const unitPrice = item.unit_price ?? menuItem.price
        const totalPrice = unitPrice * item.quantity
        if (!Number.isFinite(totalPrice) || totalPrice < 0 || subtotal + totalPrice > MAX_MONEY) {
          throw new Error('Order total is outside the supported range')
        }

        let workerId = item.worker_id ?? null
        if (workerId != null) {
          const worker = workersRepo.getById(workerId)
          if (!worker || worker.is_active !== 1) throw new Error('The selected worker is unavailable')
        } else {
          workerId = workersRepo.getByCategoryId(menuItem.category_id)[0]?.id ?? null
        }

        const result = insertItem.run(
          orderId,
          item.menu_item_id,
          item.quantity,
          unitPrice,
          totalPrice,
          item.notes ?? null,
          workerId
        )
        const newOrderItemId = result.lastInsertRowid as number

        for (const ingredient of menuRepo.getIngredients(item.menu_item_id)) {
          const stock = stockRepo.getById(ingredient.stock_item_id)
          if (!stock || stock.is_active !== 1) throw new Error('A recipe stock item is unavailable')
          const deduction = totalRecipeDeduction(
            ingredient.quantity,
            item.quantity,
            ingredient.unit,
            stock.unit_type
          )
          adjustStock(
            ingredient.stock_item_id,
            -deduction,
            'Order #' + order.daily_number + ' edit: added line'
          )
          insertDeduction.run(newOrderItemId, ingredient.stock_item_id, deduction, stock.price_per_unit)
        }
        subtotal += totalPrice
      }

      // Legacy orders have only a flat stored discount, not a trustworthy per-promotion
      // snapshot. Preserve that agreed discount unless the caller explicitly requests a
      // reprice; never apply whichever promotions happen to be active today.
      const requestedDiscount = discountAmount ?? order.discount_amount ?? 0
      const discount = Math.min(Math.max(0, requestedDiscount), subtotal)
      const total = subtotal - discount
      const details = discountDetails !== undefined
        ? (discountDetails.trim() || null)
        : order.discount_details

      const orderType = info?.order_type ?? order.order_type
      const tableNumber = info && 'table_number' in info ? info.table_number : order.table_number
      const customerPhone = info && 'customer_phone' in info ? info.customer_phone : order.customer_phone
      const customerName = info && 'customer_name' in info ? info.customer_name : order.customer_name
      const notes = info && 'notes' in info ? info.notes : order.notes

      const phoneChanged = (customerPhone || null) !== (order.customer_phone || null)
      let customerId: number | null = order.customer_id ?? null

      if (phoneChanged) {
        if (order.customer_id != null) {
          getDb()
            .prepare(
              "UPDATE customers SET total_spent = MAX(0, total_spent - ?), " +
              "order_count = MAX(0, order_count - 1), updated_at = datetime('now') WHERE id = ?"
            )
            .run(order.total, order.customer_id)
        }
        customerId = null
        if (customerPhone) {
          customerId = customersRepo.upsertFromOrder(customerPhone, total, customerName ?? undefined)
        }
      } else if (customerId != null && total !== order.total) {
        getDb()
          .prepare(
            "UPDATE customers SET total_spent = MAX(0, total_spent + ?), " +
            "updated_at = datetime('now') WHERE id = ?"
          )
          .run(total - order.total, customerId)
      }

      getDb()
        .prepare(
          'UPDATE orders SET subtotal = ?, total = ?, discount_amount = ?, discount_details = ?, ' +
          'order_type = ?, table_number = ?, customer_phone = ?, customer_name = ?, notes = ?, customer_id = ? ' +
          'WHERE id = ?'
        )
        .run(
          subtotal,
          total,
          discount,
          details,
          orderType,
          tableNumber,
          customerPhone,
          customerName,
          notes,
          customerId,
          orderId
        )
      if (kitchenRelevantChange) {
        const updatedItems = getDb()
          .prepare('SELECT worker_id FROM order_items WHERE order_id = ?')
          .all(orderId) as { worker_id: number | null }[]
        enqueueAutomaticPrintJobs(orderId, updatedItems, 'updated')
      }
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
