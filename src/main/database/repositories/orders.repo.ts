import { getDb } from '../connection'
import {
  createOrderService,
  orderDateInAlgiers,
  type OrderSource,
  type OrderStatus
} from '../../services/order-service'

const ORDER_TYPES = new Set(['local', 'takeout', 'delivery'])

/** Restaurant-local calendar date, pinned to Africa/Algiers (UTC+1, no DST). */
export function localDate(date = new Date()): string {
  return orderDateInAlgiers(date)
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
  source: OrderSource
  source_request_id: string | null
  duplicate?: boolean
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

/** Legacy renderer/server input, adapted into the one injected order core below. */
export interface CreateOrderInput {
  order_type: string
  table_number?: string
  customer_phone?: string
  customer_name?: string
  notes?: string
  discount_amount?: number
  discount_details?: string
  forceMenuPrice?: boolean
  source?: OrderSource
  source_request_id?: string
  operator?: string
  items: {
    menu_item_id: number
    quantity: number
    notes?: string
    worker_id?: number
    unit_price?: number
  }[]
}

export interface UpdateOrderItemInput {
  order_item_id?: number
  menu_item_id: number
  quantity: number
  notes?: string
  worker_id?: number | null
  unit_price?: number
}

function serviceError(result: { code: string; message: string }): Error {
  const error = new Error(result.message) as Error & { code?: string }
  error.code = result.code
  return error
}

/**
 * Compatibility repository. Every mutation delegates to createOrderService({db:getDb()});
 * the query methods remain here because existing Electron callers consume snake_case rows.
 */
export const ordersRepo = {
  create(input: CreateOrderInput): Order {
    if (!ORDER_TYPES.has(input.order_type)) throw new Error('Invalid order type')
    if (!input.source) throw new Error('Order source is required')
    const sourceRequestId = input.source_request_id?.trim()
    if (!sourceRequestId) throw new Error('source_request_id is required')
    const result = createOrderService({ db: getDb() }).createOrder({
      source: input.source,
      sourceRequestId,
      orderType: input.order_type as 'local' | 'takeout' | 'delivery',
      tableNumber: input.table_number,
      customer: input.customer_phone || input.customer_name
        ? { phone: input.customer_phone, name: input.customer_name }
        : undefined,
      note: input.notes,
      lines: input.items.map((item) => ({
        menuItemId: item.menu_item_id,
        quantity: item.quantity,
        note: item.notes,
        workerId: item.worker_id,
        unitPriceOverride: item.unit_price
      })),
      // Production callers pass the cart/server's promotion snapshot explicitly.
      applyAutoPromotions: input.discount_amount === undefined,
      explicitDiscountAmount: input.discount_amount,
      discountDetails: input.discount_details,
      operator: input.operator
    })
    if (!result.ok) throw serviceError(result)
    return { ...this.getById(result.orderId)!, duplicate: result.duplicate }
  },

  getById(id: number): Order | undefined {
    const order = getDb().prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order | undefined
    if (order) order.items = this.getOrderItems(id)
    return order
  },

  getOrderItems(orderId: number): OrderItem[] {
    return getDb().prepare(
      `SELECT oi.*, mi.name AS menu_item_name, mi.name_ar AS menu_item_name_ar,
              mi.name_fr AS menu_item_name_fr, w.name AS worker_name
       FROM order_items oi
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       LEFT JOIN workers w ON oi.worker_id = w.id
       WHERE oi.order_id = ? ORDER BY oi.id`
    ).all(orderId) as OrderItem[]
  },

  getByDate(date: string): Order[] {
    return getDb().prepare(
      'SELECT * FROM orders WHERE order_date = ? ORDER BY daily_number DESC'
    ).all(date) as Order[]
  },

  getByDateRange(startDate: string, endDate: string): Order[] {
    return getDb().prepare(
      `SELECT * FROM orders WHERE order_date BETWEEN ? AND ?
       ORDER BY order_date DESC, daily_number DESC`
    ).all(startDate, endDate) as Order[]
  },

  autoCompletePreviousDays(): number {
    const db = getDb()
    const service = createOrderService({ db })
    const rows = db.prepare(
      `SELECT id FROM orders
       WHERE status IN ('preparing', 'pending') AND order_date < ?
       ORDER BY order_date, daily_number, id`
    ).all(localDate()) as { id: number }[]
    let completed = 0
    for (const row of rows) {
      const result = service.updateOrderStatus(row.id, 'completed')
      if (!result.ok) throw serviceError(result)
      completed += 1
    }
    return completed
  },

  updateStatus(id: number, status: string): Order | undefined {
    if (!['pending', 'preparing', 'completed', 'cancelled'].includes(status)) {
      throw new Error('Invalid order status')
    }
    const result = createOrderService({ db: getDb() }).updateOrderStatus(id, status as OrderStatus)
    if (!result.ok) {
      if (result.code === 'not_found') return undefined
      throw serviceError(result)
    }
    return this.getById(id)
  },

  cancelOrder(id: number): Order | undefined {
    const result = createOrderService({ db: getDb() }).updateOrderStatus(id, 'cancelled')
    if (!result.ok) {
      if (result.code === 'not_found') return undefined
      throw serviceError(result)
    }
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
    const existing = this.getById(orderId)
    if (!existing) return undefined

    const header: {
      orderType?: 'local' | 'takeout' | 'delivery'
      tableNumber?: string | null
      note?: string | null
      customer?: { phone?: string | null; name?: string | null }
    } = {}
    if (info?.order_type !== undefined) {
      if (!ORDER_TYPES.has(info.order_type)) throw new Error('Invalid order type')
      header.orderType = info.order_type as 'local' | 'takeout' | 'delivery'
    }
    if (info && 'table_number' in info) header.tableNumber = info.table_number
    if (info && 'notes' in info) header.note = info.notes
    if (info && ('customer_phone' in info || 'customer_name' in info)) {
      header.customer = {}
      if ('customer_phone' in info) header.customer.phone = info.customer_phone
      if ('customer_name' in info) header.customer.name = info.customer_name
    }

    const result = createOrderService({ db: getDb() }).updateOrderLines({
      orderId,
      lines: items.map((item) => ({
        orderItemId: item.order_item_id,
        menuItemId: item.menu_item_id,
        quantity: item.quantity,
        note: item.notes,
        workerId: item.worker_id as number | undefined,
        unitPriceOverride: item.unit_price
      })),
      discountAmount,
      discountDetails,
      header: Object.keys(header).length > 0 ? header : undefined
    })
    if (!result.ok) {
      // Preserve the legacy renderer contract: finalized edits return the unchanged row.
      if (result.code === 'line_edit_not_allowed') return this.getById(orderId)
      throw serviceError(result)
    }
    return this.getById(orderId)
  },

  getTodayOrders(): Order[] {
    return this.getByDate(localDate()).map((order) => ({
      ...order,
      items: this.getOrderItems(order.id)
    }))
  }
}
