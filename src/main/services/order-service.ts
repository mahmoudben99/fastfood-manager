import type Database from 'better-sqlite3'
import { normalizeAlgerianPhone } from '../domain/customer-phone'
import { recordAuditEvent } from './audit-events'
import { totalRecipeDeduction } from './stock-units'

export type OrderSource = 'pos' | 'tablet' | 'remote'
export type OrderStatus = 'pending' | 'preparing' | 'completed' | 'cancelled'

export interface OrderLineInput {
  menuItemId: number
  quantity: number
  unitPriceOverride?: number
  note?: string
  workerId?: number
}

export interface CreateOrderInput {
  source: OrderSource
  sourceRequestId: string
  orderType: 'local' | 'takeout' | 'delivery'
  tableNumber?: string
  lines: OrderLineInput[]
  customer?: { phone?: string; name?: string }
  note?: string
  applyAutoPromotions: boolean
  /** Compatibility seam for the POS cart's already-resolved promotion snapshot. */
  explicitDiscountAmount?: number
  discountDetails?: string
  operator?: string
}

export type CreateOrderResult =
  | {
      ok: true
      duplicate: boolean
      orderId: number
      dailyNumber: number
      orderDate: string
      subtotal: number
      discountAmount: number
      total: number
      printJobIds: number[]
    }
  | {
      ok: false
      code: 'invalid_input' | 'inactive_item' | 'incompatible_unit' | 'db_failure'
      message: string
      lineIndex?: number
    }

export interface UpdateOrderHeaderInput {
  orderId: number
  note?: string | null
  tableNumber?: string | null
  customer?: { phone?: string | null; name?: string | null }
}

export interface OrderLineEditInput extends OrderLineInput {
  orderItemId?: number
}

export interface UpdateOrderLinesInput {
  orderId: number
  lines: OrderLineEditInput[]
  discountAmount?: number
  /** Internal compatibility fields used by ordersRepo.updateItems. */
  discountDetails?: string
  header?: Omit<UpdateOrderHeaderInput, 'orderId'> & { orderType?: 'local' | 'takeout' | 'delivery' }
  operator?: string
}

export type UpdateOrderResult =
  | { ok: true; orderId: number; subtotal: number; discountAmount: number; total: number }
  | {
      ok: false
      code:
        | 'not_found'
        | 'invalid_input'
        | 'inactive_item'
        | 'incompatible_unit'
        | 'line_edit_not_allowed'
        | 'db_failure'
      message: string
    }

export interface OrderServiceDeps {
  db: Database.Database
  now?: () => Date
}

interface OrderRow {
  id: number
  daily_number: number
  order_date: string
  order_type: string
  table_number: string | null
  customer_phone: string | null
  customer_name: string | null
  customer_id: number | null
  status: OrderStatus
  subtotal: number
  discount_amount: number
  discount_details: string | null
  total: number
  notes: string | null
  source: OrderSource
  source_request_id: string | null
}

interface OrderItemRow {
  id: number
  order_id: number
  menu_item_id: number
  quantity: number
  unit_price: number
  total_price: number
  notes: string | null
  worker_id: number | null
}

interface DeductionRow {
  id: number
  stock_item_id: number
  quantity_deducted: number
  cost_per_unit: number
}

class DomainError extends Error {
  constructor(
    public code: 'invalid_input' | 'inactive_item' | 'incompatible_unit',
    message: string,
    public lineIndex?: number
  ) {
    super(message)
  }
}

const ORDER_TYPES = new Set(['local', 'takeout', 'delivery'])
const MAX_LINES = 100
const MAX_UNITS = 999
const MAX_MONEY = 1_000_000_000

/** Algeria is permanently UTC+1 and has no DST. */
export function orderDateInAlgiers(date: Date): string {
  return new Date(date.getTime() + 60 * 60_000).toISOString().slice(0, 10)
}

/** The application stores cash amounts as whole Algerian dinars. */
function roundMoney(value: number): number {
  return Math.round(value)
}

function isBusyOrFull(error: unknown): boolean {
  return /SQLITE_(BUSY|FULL)/i.test(String((error as { code?: string })?.code || error))
}

function isSourceRequestUniqueConflict(error: unknown): boolean {
  const text = `${String((error as { code?: string })?.code || '')} ${String((error as { message?: string })?.message || error)}`
  return /SQLITE_CONSTRAINT_UNIQUE/i.test(text) &&
    (/orders\.source[^\n]*orders\.source_request_id/i.test(text) || /idx_orders_source_request/i.test(text))
}

function validateCreateInput(input: CreateOrderInput): void {
  if (!input || !['pos', 'tablet', 'remote'].includes(input.source) || !ORDER_TYPES.has(input.orderType)) {
    throw new DomainError('invalid_input', 'Invalid order input')
  }
  if (typeof input.sourceRequestId !== 'string' || !input.sourceRequestId.trim()) {
    throw new DomainError('invalid_input', 'sourceRequestId is required')
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > MAX_LINES) {
    throw new DomainError('invalid_input', `Order must contain 1 to ${MAX_LINES} lines`)
  }
  if (input.explicitDiscountAmount !== undefined &&
      (!Number.isFinite(input.explicitDiscountAmount) || input.explicitDiscountAmount < 0 || input.explicitDiscountAmount > MAX_MONEY)) {
    throw new DomainError('invalid_input', 'Discount is outside the supported range')
  }

  let units = 0
  input.lines.forEach((line, index) => {
    if (!Number.isInteger(line.menuItemId) || line.menuItemId <= 0) {
      throw new DomainError('invalid_input', 'Invalid menu item', index)
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_UNITS) {
      throw new DomainError('invalid_input', `Line quantity must be an integer between 1 and ${MAX_UNITS}`, index)
    }
    if (line.unitPriceOverride !== undefined &&
        (!Number.isFinite(line.unitPriceOverride) || line.unitPriceOverride < 0 || line.unitPriceOverride > MAX_MONEY)) {
      throw new DomainError('invalid_input', 'Invalid unit price override', index)
    }
    if (line.workerId !== undefined && (!Number.isInteger(line.workerId) || line.workerId <= 0)) {
      throw new DomainError('invalid_input', 'Invalid worker assignment', index)
    }
    units += line.quantity
  })
  if (units > MAX_UNITS) throw new DomainError('invalid_input', `Order cannot contain more than ${MAX_UNITS} units`)
}

function validateEditLines(lines: OrderLineEditInput[]): void {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES) {
    throw new DomainError('invalid_input', `Order must contain 1 to ${MAX_LINES} lines`)
  }
  let units = 0
  const ids = new Set<number>()
  lines.forEach((line, index) => {
    if (!Number.isInteger(line.menuItemId) || line.menuItemId <= 0 ||
        !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_UNITS) {
      throw new DomainError('invalid_input', 'Invalid order line', index)
    }
    if (line.orderItemId !== undefined) {
      if (!Number.isInteger(line.orderItemId) || line.orderItemId <= 0 || ids.has(line.orderItemId)) {
        throw new DomainError('invalid_input', 'Invalid or repeated existing order line', index)
      }
      ids.add(line.orderItemId)
    }
    if (line.unitPriceOverride !== undefined &&
        (!Number.isFinite(line.unitPriceOverride) || line.unitPriceOverride < 0 || line.unitPriceOverride > MAX_MONEY)) {
      throw new DomainError('invalid_input', 'Invalid unit price override', index)
    }
    units += line.quantity
  })
  if (units > MAX_UNITS) throw new DomainError('invalid_input', `Order cannot contain more than ${MAX_UNITS} units`)
}

function printSetting(db: Database.Database, key: string): string | undefined {
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value
}

function enqueueAutomaticPrintJobs(
  db: Database.Database,
  orderId: number,
  items: { worker_id: number | null }[],
  eventType: 'new' | 'updated' | 'cancelled' | 'restored'
): number[] {
  const assignment = (type: 'receipt' | 'kitchen_all' | 'worker', workerId?: number | null) =>
    db.prepare(
      workerId == null
        ? 'SELECT auto_print FROM printer_assignments WHERE assignment_type = ? AND is_active = 1 LIMIT 1'
        : 'SELECT auto_print FROM printer_assignments WHERE assignment_type = ? AND worker_id = ? AND is_active = 1 LIMIT 1'
    ).get(...(workerId == null ? [type] : [type, workerId])) as { auto_print: number } | undefined

  const eventSequence = (db.prepare(
    'SELECT COALESCE(MAX(event_sequence), 0) + 1 AS sequence FROM print_jobs WHERE order_id = ? AND event_type = ?'
  ).get(orderId, eventType) as { sequence: number }).sequence
  const insert = db.prepare(
    `INSERT OR IGNORE INTO print_jobs
     (order_id, event_type, event_sequence, document_type, scope, worker_id, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`
  )
  const ids: number[] = []
  const add = (documentType: 'receipt' | 'kitchen', scope: 'all' | 'worker' | 'unassigned', workerId: number | null) => {
    const result = insert.run(orderId, eventType, eventSequence, documentType, scope, workerId)
    if (result.changes === 1) ids.push(Number(result.lastInsertRowid))
  }

  if (eventType === 'new') {
    const receipt = assignment('receipt')
    const autoReceipt = receipt ? receipt.auto_print === 1 : printSetting(db, 'auto_print_receipt') === 'true'
    if (autoReceipt) add('receipt', 'all', null)
  }

  const autoKitchenDefault = printSetting(db, 'auto_print_kitchen') === 'true'
  const split = printSetting(db, 'split_kitchen_tickets') === 'true'
  if (!split) {
    const kitchen = assignment('kitchen_all')
    if (kitchen ? kitchen.auto_print === 1 : autoKitchenDefault) add('kitchen', 'all', null)
    return ids
  }

  const groups = new Set(items.map((item) => item.worker_id))
  if (groups.size === 0) groups.add(null)
  for (const workerId of groups) {
    const direct = workerId == null ? undefined : assignment('worker', workerId)
    const fallback = assignment('kitchen_all')
    const auto = direct ? direct.auto_print === 1 : fallback ? fallback.auto_print === 1 : autoKitchenDefault
    if (auto) add('kitchen', workerId == null ? 'unassigned' : 'worker', workerId)
  }
  return ids
}

function enqueueOutbox(
  db: Database.Database,
  orderId: number,
  action: 'created' | 'updated' | 'cancelled' | 'restored',
  includeTelegram = false
): void {
  const order = db.prepare('SELECT order_date, source FROM orders WHERE id = ?').get(orderId) as
    | { order_date: string; source: OrderSource }
    | undefined
  const payload = JSON.stringify({ orderId, action, orderDate: order?.order_date, source: order?.source })
  const types = includeTelegram
    ? ['owner-sync', 'analytics-dirty', 'telegram', 'queue-broadcast']
    : ['owner-sync', 'analytics-dirty', 'queue-broadcast']
  const insert = db.prepare('INSERT INTO outbox_events (event_type, payload) VALUES (?, ?)')
  for (const type of types) insert.run(type, payload)
}

function upsertCustomer(
  db: Database.Database,
  phone: string,
  name: string | undefined,
  total: number
): number {
  const normalized = normalizeAlgerianPhone(phone)
  if (!normalized) throw new DomainError('invalid_input', 'A valid phone number is required for customer loyalty')
  const displayPhone = phone.normalize('NFKC').replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50) || normalized
  const row = db.prepare(
    `INSERT INTO customers (phone, phone_normalized, name, total_spent, order_count, last_order_date)
     VALUES (?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(phone_normalized) DO UPDATE SET
       total_spent = customers.total_spent + excluded.total_spent,
       order_count = customers.order_count + 1,
       last_order_date = datetime('now'),
       name = COALESCE(excluded.name, customers.name),
       updated_at = datetime('now')
     RETURNING id`
  ).get(displayPhone, normalized, name?.trim() || null, total) as { id: number }
  return row.id
}

function linkCustomerWithoutAccrual(
  db: Database.Database,
  phone: string,
  name: string | undefined
): number {
  const normalized = normalizeAlgerianPhone(phone)
  if (!normalized) throw new DomainError('invalid_input', 'A valid phone number is required for customer loyalty')
  const displayPhone = phone.normalize('NFKC').replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50) || normalized
  const row = db.prepare(
    `INSERT INTO customers (phone, phone_normalized, name, total_spent, order_count)
     VALUES (?, ?, ?, 0, 0)
     ON CONFLICT(phone_normalized) DO UPDATE SET
       name = COALESCE(excluded.name, customers.name),
       updated_at = datetime('now')
     RETURNING id`
  ).get(displayPhone, normalized, name?.trim() || null) as { id: number }
  return row.id
}

function reverseCustomerAccrual(db: Database.Database, customerId: number | null, total: number): void {
  if (customerId == null) return
  db.prepare(
    `UPDATE customers SET total_spent = MAX(0, total_spent - ?),
     order_count = MAX(0, order_count - 1), updated_at = datetime('now') WHERE id = ?`
  ).run(total, customerId)
}

export function createOrderService({ db, now = () => new Date() }: OrderServiceDeps) {
  const current = (id: number): OrderRow | undefined =>
    db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined
  const printJobIds = (orderId: number): number[] =>
    (db.prepare('SELECT id FROM print_jobs WHERE order_id = ? ORDER BY id').all(orderId) as { id: number }[]).map((row) => row.id)
  const createResult = (row: OrderRow, duplicate: boolean, ids = printJobIds(row.id)): CreateOrderResult => ({
    ok: true,
    duplicate,
    orderId: row.id,
    dailyNumber: row.daily_number,
    orderDate: row.order_date,
    subtotal: row.subtotal,
    discountAmount: row.discount_amount,
    total: row.total,
    printJobIds: ids
  })
  const updateResult = (row: OrderRow): UpdateOrderResult => ({
    ok: true,
    orderId: row.id,
    subtotal: row.subtotal,
    discountAmount: row.discount_amount,
    total: row.total
  })
  const duplicateFor = (source: OrderSource, sourceRequestId: string): CreateOrderResult | undefined => {
    const row = db.prepare('SELECT * FROM orders WHERE source = ? AND source_request_id = ?').get(source, sourceRequestId) as OrderRow | undefined
    return row ? createResult(row, true) : undefined
  }

  function createOrder(input: CreateOrderInput): CreateOrderResult {
    try {
      validateCreateInput(input)
    } catch (error) {
      const domain = error as DomainError
      return { ok: false, code: domain.code || 'invalid_input', message: domain.message, lineIndex: domain.lineIndex }
    }

    const captured = now()
    const orderDate = orderDateInAlgiers(captured)
    try {
      return db.transaction(() => {
        const duplicate = duplicateFor(input.source, input.sourceRequestId)
        if (duplicate) return duplicate

        const lines = input.lines.map((line, index) => {
          const menu = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_active = 1').get(line.menuItemId) as any
          if (!menu) throw new DomainError('inactive_item', `Menu item ${line.menuItemId} is unavailable`, index)

          let workerId: number | null = line.workerId ?? null
          if (workerId != null) {
            const worker = db.prepare('SELECT id FROM workers WHERE id = ? AND is_active = 1').get(workerId)
            if (!worker) throw new DomainError('invalid_input', 'Selected worker is unavailable', index)
          } else {
            workerId = (db.prepare(
              `SELECT w.id FROM workers w JOIN worker_categories wc ON wc.worker_id = w.id
               WHERE wc.category_id = ? AND w.is_active = 1 ORDER BY w.id LIMIT 1`
            ).get(menu.category_id) as { id: number } | undefined)?.id ?? null
          }

          const ingredients = db.prepare(
            `SELECT mii.*, si.name AS stock_name, si.unit_type AS stock_unit_type,
                    si.quantity AS stock_quantity, si.price_per_unit, si.is_active AS stock_active
             FROM menu_item_ingredients mii
             LEFT JOIN stock_items si ON si.id = mii.stock_item_id
             WHERE mii.menu_item_id = ?`
          ).all(line.menuItemId) as any[]
          for (const ingredient of ingredients) {
            if (!ingredient.stock_name || ingredient.stock_active !== 1) {
              throw new DomainError('inactive_item', 'Recipe ingredient must reference an active stock item', index)
            }
            try {
              totalRecipeDeduction(ingredient.quantity, line.quantity, ingredient.unit, ingredient.stock_unit_type)
            } catch {
              throw new DomainError(
                'incompatible_unit',
                `Recipe unit ${ingredient.unit} is incompatible with ${ingredient.stock_name} (${ingredient.stock_unit_type})`,
                index
              )
            }
          }

          const unitPrice = input.source === 'pos' ? line.unitPriceOverride ?? menu.price : menu.price
          const lineTotal = unitPrice * line.quantity
          if (!Number.isFinite(lineTotal) || lineTotal < 0 || lineTotal > MAX_MONEY) {
            throw new DomainError('invalid_input', 'Order total is outside the supported range', index)
          }
          return { line, menu, ingredients, workerId, unitPrice, lineTotal }
        })

        const rawSubtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
        const subtotal = roundMoney(rawSubtotal)
        if (!Number.isFinite(subtotal) || subtotal < 0 || subtotal > MAX_MONEY) {
          throw new DomainError('invalid_input', 'Order total is outside the supported range')
        }

        let rawDiscount = input.explicitDiscountAmount ?? 0
        let discountDetails = input.discountDetails?.trim() || null
        if (input.explicitDiscountAmount === undefined && input.applyAutoPromotions) {
          const promos = db.prepare('SELECT * FROM promotions WHERE is_active = 1 ORDER BY id').all() as any[]
          const amounts = new Map<number, number>()
          for (const entry of lines) {
            let remaining = entry.lineTotal
            for (const promo of promos) {
              const applies = promo.applies_to === 'all' || Boolean(db.prepare(
                'SELECT 1 FROM promotion_items WHERE promotion_id = ? AND menu_item_id = ?'
              ).get(promo.id, entry.line.menuItemId))
              if (!applies) continue
              const requested = promo.type === 'percentage'
                ? entry.lineTotal * promo.discount_value / 100
                : promo.discount_value * entry.line.quantity
              const applied = Math.min(Math.max(0, requested), remaining)
              rawDiscount += applied
              remaining -= applied
              amounts.set(promo.id, (amounts.get(promo.id) || 0) + applied)
              if (remaining <= 0) break
            }
          }
          discountDetails = promos
            .filter((promo) => (amounts.get(promo.id) || 0) > 0)
            .map((promo) => `${promo.name}: -${roundMoney(amounts.get(promo.id) || 0)}`)
            .join(', ') || null
        }
        const discount = roundMoney(Math.min(Math.max(0, rawDiscount), subtotal))
        const total = roundMoney(subtotal - discount)

        const daily = db.prepare(
          `INSERT INTO daily_counters (date, last_order_num) VALUES (?, 1)
           ON CONFLICT(date) DO UPDATE SET last_order_num = last_order_num + 1
           RETURNING last_order_num`
        ).get(orderDate) as { last_order_num: number }

        const phone = input.customer?.phone?.trim()
        const customerId = phone ? upsertCustomer(db, phone, input.customer?.name, total) : null
        const orderId = Number(db.prepare(
          `INSERT INTO orders
           (daily_number, order_date, order_type, table_number, customer_phone, customer_name,
            customer_id, status, subtotal, discount_amount, discount_details, total, notes,
            source, source_request_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'preparing', ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          daily.last_order_num,
          orderDate,
          input.orderType,
          input.tableNumber ?? null,
          phone ?? null,
          input.customer?.name?.trim() || null,
          customerId,
          subtotal,
          discount,
          discountDetails,
          total,
          input.note ?? null,
          input.source,
          input.sourceRequestId,
          captured.toISOString()
        ).lastInsertRowid)

        const itemInsert = db.prepare(
          `INSERT INTO order_items
           (order_id, menu_item_id, quantity, unit_price, total_price, notes, worker_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        const deductionInsert = db.prepare(
          `INSERT INTO order_item_deductions
           (order_item_id, stock_item_id, quantity_deducted, cost_per_unit)
           VALUES (?, ?, ?, ?)`
        )
        for (const entry of lines) {
          const itemId = Number(itemInsert.run(
            orderId,
            entry.line.menuItemId,
            entry.line.quantity,
            entry.unitPrice,
            entry.lineTotal,
            entry.line.note ?? null,
            entry.workerId
          ).lastInsertRowid)

          if (input.source === 'pos' && entry.line.unitPriceOverride !== undefined && entry.unitPrice !== entry.menu.price) {
            recordAuditEvent(db, {
              eventType: 'price_override',
              orderId,
              orderItemId: itemId,
              originalValue: String(entry.menu.price),
              newValue: String(entry.unitPrice),
              operator: input.operator?.trim() || 'POS',
              reason: 'POS price override'
            })
          }

          for (const ingredient of entry.ingredients) {
            const deduction = totalRecipeDeduction(
              ingredient.quantity,
              entry.line.quantity,
              ingredient.unit,
              ingredient.stock_unit_type
            )
            const stockBefore = (db.prepare('SELECT quantity FROM stock_items WHERE id = ?')
              .get(ingredient.stock_item_id) as { quantity: number }).quantity
            db.prepare("UPDATE stock_items SET quantity = quantity - ?, updated_at = datetime('now') WHERE id = ?")
              .run(deduction, ingredient.stock_item_id)
            deductionInsert.run(itemId, ingredient.stock_item_id, deduction, ingredient.price_per_unit)
            db.prepare(
              `INSERT INTO stock_adjustments
               (stock_item_id, adjustment_type, quantity_change, previous_qty, new_qty, affects_cost, reason)
               VALUES (?, 'order_deduction', ?, ?, ?, 0, ?)`
            ).run(
              ingredient.stock_item_id,
              -deduction,
              stockBefore,
              stockBefore - deduction,
              `Order #${daily.last_order_num}`
            )
          }
        }

        const workerGroups = lines.map((line) => ({ worker_id: line.workerId }))
        const ids = enqueueAutomaticPrintJobs(db, orderId, workerGroups, 'new')
        enqueueOutbox(db, orderId, 'created', true)
        return createResult(current(orderId)!, false, ids)
      })()
    } catch (error) {
      if (error instanceof DomainError) {
        return { ok: false, code: error.code, message: error.message, lineIndex: error.lineIndex }
      }
      // A competing connection may have committed the same request after our initial read.
      if (isSourceRequestUniqueConflict(error)) {
        const duplicate = duplicateFor(input.source, input.sourceRequestId)
        if (duplicate) return duplicate
      }
      if (isBusyOrFull(error)) throw error
      return { ok: false, code: 'db_failure', message: error instanceof Error ? error.message : String(error) }
    }
  }

  function updateHeaderWithinTransaction(
    order: OrderRow,
    input: Omit<UpdateOrderHeaderInput, 'orderId'>,
    replacementTotal = order.total
  ): void {
    const phone = input.customer?.phone !== undefined
      ? input.customer.phone?.trim() || null
      : order.customer_phone
    const name = input.customer?.name !== undefined
      ? input.customer.name?.trim() || null
      : order.customer_name
    const phoneChanged = (phone || null) !== (order.customer_phone || null)
    let customerId = order.customer_id
    if (phoneChanged) {
      if (order.status !== 'cancelled') {
        reverseCustomerAccrual(db, order.customer_id, order.total)
        customerId = phone ? upsertCustomer(db, phone, name ?? undefined, replacementTotal) : null
      } else {
        // A cancelled order has no loyalty accrual, but its linkage still needs to follow a
        // corrected phone so a later restore re-accrues to the intended customer.
        customerId = phone ? linkCustomerWithoutAccrual(db, phone, name ?? undefined) : null
      }
    } else if (customerId != null && order.status !== 'cancelled' && replacementTotal !== order.total) {
      db.prepare(
        `UPDATE customers SET total_spent = MAX(0, total_spent + ?), updated_at = datetime('now')
         WHERE id = ?`
      ).run(replacementTotal - order.total, customerId)
    }
    db.prepare(
      `UPDATE orders SET notes = ?, table_number = ?, customer_phone = ?, customer_name = ?, customer_id = ?
       WHERE id = ?`
    ).run(
      input.note !== undefined ? input.note : order.notes,
      input.tableNumber !== undefined ? input.tableNumber : order.table_number,
      phone || null,
      name,
      customerId,
      order.id
    )
  }

  function updateOrderHeader(input: UpdateOrderHeaderInput): UpdateOrderResult {
    const order = current(input.orderId)
    if (!order) return { ok: false, code: 'not_found', message: 'Order not found' }
    const kitchenRelevantChange =
      (input.note !== undefined && (input.note ?? null) !== (order.notes ?? null)) ||
      (input.tableNumber !== undefined && (input.tableNumber ?? null) !== (order.table_number ?? null))
    try {
      return db.transaction(() => {
        updateHeaderWithinTransaction(order, input)
        if (kitchenRelevantChange) {
          const items = db.prepare('SELECT worker_id FROM order_items WHERE order_id = ?').all(input.orderId) as { worker_id: number | null }[]
          enqueueAutomaticPrintJobs(db, input.orderId, items, 'updated')
        }
        enqueueOutbox(db, input.orderId, 'updated')
        return updateResult(current(input.orderId)!)
      })()
    } catch (error) {
      if (error instanceof DomainError) return { ok: false, code: error.code, message: error.message }
      if (isBusyOrFull(error)) throw error
      return { ok: false, code: 'db_failure', message: error instanceof Error ? error.message : String(error) }
    }
  }

  function updateOrderLines(input: UpdateOrderLinesInput): UpdateOrderResult {
    const order = current(input.orderId)
    if (!order) return { ok: false, code: 'not_found', message: 'Order not found' }
    const captured = now()
    if (order.order_date !== orderDateInAlgiers(captured) || order.status === 'completed' || order.status === 'cancelled') {
      return { ok: false, code: 'line_edit_not_allowed', message: 'Only same-day non-finalized orders can have lines edited' }
    }
    try {
      validateEditLines(input.lines)
      if (input.discountAmount !== undefined &&
          (!Number.isFinite(input.discountAmount) || input.discountAmount < 0 || input.discountAmount > MAX_MONEY)) {
        throw new DomainError('invalid_input', 'Discount is outside the supported range')
      }
      if (input.header?.orderType !== undefined && !ORDER_TYPES.has(input.header.orderType)) {
        throw new DomainError('invalid_input', 'Invalid order type')
      }

      return db.transaction(() => {
        const oldItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(input.orderId) as OrderItemRow[]
        const oldById = new Map(oldItems.map((item) => [item.id, item]))
        const retained = new Set<number>()
        for (const line of input.lines) {
          if (line.orderItemId === undefined) continue
          const old = oldById.get(line.orderItemId)
          if (!old) throw new DomainError('invalid_input', 'An edited order line no longer exists')
          if (old.menu_item_id !== line.menuItemId) {
            throw new DomainError('invalid_input', 'An existing order line cannot change products')
          }
          retained.add(old.id)
        }
        const kitchenRelevantChange =
          retained.size !== oldItems.length ||
          input.lines.some((line) => {
            if (line.orderItemId === undefined) return true
            const old = oldById.get(line.orderItemId)!
            const nextWorker = line.workerId === undefined ? old.worker_id : line.workerId
            return line.quantity !== old.quantity ||
              (line.note ?? null) !== (old.notes ?? null) ||
              (nextWorker ?? null) !== (old.worker_id ?? null)
          }) ||
          (input.header?.orderType !== undefined && input.header.orderType !== order.order_type) ||
          (input.header?.tableNumber !== undefined && (input.header.tableNumber ?? null) !== (order.table_number ?? null)) ||
          (input.header?.note !== undefined && (input.header.note ?? null) !== (order.notes ?? null))

        const deductionsFor = (itemId: number): DeductionRow[] =>
          db.prepare(
            'SELECT id, stock_item_id, quantity_deducted, cost_per_unit FROM order_item_deductions WHERE order_item_id = ?'
          ).all(itemId) as DeductionRow[]
        const adjustStock = (stockId: number, change: number, reason: string): void => {
          if (Math.abs(change) < 1e-12) return
          const stock = db.prepare('SELECT quantity FROM stock_items WHERE id = ?').get(stockId) as { quantity: number } | undefined
          if (!stock) throw new DomainError('inactive_item', 'A stock item used by this order no longer exists')
          const next = stock.quantity + change
          db.prepare("UPDATE stock_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?").run(next, stockId)
          db.prepare(
            `INSERT INTO stock_adjustments
             (stock_item_id, adjustment_type, quantity_change, previous_qty, new_qty, affects_cost, reason)
             VALUES (?, 'order_edit', ?, ?, ?, 0, ?)`
          ).run(stockId, change, stock.quantity, next, reason)
        }

        for (const old of oldItems) {
          if (retained.has(old.id)) continue
          for (const deduction of deductionsFor(old.id)) {
            adjustStock(deduction.stock_item_id, deduction.quantity_deducted, `Order #${order.daily_number} edit: removed line`)
          }
          db.prepare('DELETE FROM order_items WHERE id = ? AND order_id = ?').run(old.id, input.orderId)
        }

        let rawSubtotal = 0
        const insertItem = db.prepare(
          `INSERT INTO order_items
           (order_id, menu_item_id, quantity, unit_price, total_price, notes, worker_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        const insertDeduction = db.prepare(
          `INSERT INTO order_item_deductions
           (order_item_id, stock_item_id, quantity_deducted, cost_per_unit)
           VALUES (?, ?, ?, ?)`
        )

        for (const line of input.lines) {
          if (line.orderItemId !== undefined) {
            const old = oldById.get(line.orderItemId)!
            // Critical edit-safety invariant: absence of an explicit override preserves the snapshot price.
            const unitPrice = line.unitPriceOverride ?? old.unit_price
            const lineTotal = unitPrice * line.quantity
            if (!Number.isFinite(lineTotal) || lineTotal < 0 || rawSubtotal + lineTotal > MAX_MONEY) {
              throw new DomainError('invalid_input', 'Order total is outside the supported range')
            }
            let workerId = line.workerId === undefined ? old.worker_id : line.workerId
            if (workerId != null && workerId !== old.worker_id) {
              const active = db.prepare('SELECT id FROM workers WHERE id = ? AND is_active = 1').get(workerId)
              if (!active) throw new DomainError('invalid_input', 'The selected worker is unavailable')
            }

            if (line.quantity !== old.quantity) {
              for (const deduction of deductionsFor(old.id)) {
                const perUnit = deduction.quantity_deducted / old.quantity
                if (!Number.isFinite(perUnit) || perUnit < 0) {
                  throw new DomainError('invalid_input', 'This order has an invalid stock deduction snapshot')
                }
                const nextDeduction = perUnit * line.quantity
                adjustStock(
                  deduction.stock_item_id,
                  deduction.quantity_deducted - nextDeduction,
                  `Order #${order.daily_number} edit: quantity delta`
                )
                db.prepare('UPDATE order_item_deductions SET quantity_deducted = ? WHERE id = ?')
                  .run(nextDeduction, deduction.id)
              }
            }

            db.prepare(
              `UPDATE order_items SET quantity = ?, unit_price = ?, total_price = ?, notes = ?, worker_id = ?
               WHERE id = ? AND order_id = ?`
            ).run(
              line.quantity,
              unitPrice,
              lineTotal,
              line.note ?? null,
              workerId,
              old.id,
              input.orderId
            )
            if (unitPrice !== old.unit_price) {
              recordAuditEvent(db, {
                eventType: 'price_override',
                orderId: input.orderId,
                orderItemId: old.id,
                originalValue: String(old.unit_price),
                newValue: String(unitPrice),
                operator: input.operator?.trim() || 'POS',
                reason: 'Order line price edited'
              })
            }
            rawSubtotal += lineTotal
            continue
          }

          const menu = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_active = 1').get(line.menuItemId) as any
          if (!menu) throw new DomainError('inactive_item', 'A newly added menu item is unavailable')
          const unitPrice = line.unitPriceOverride ?? menu.price
          const lineTotal = unitPrice * line.quantity
          if (!Number.isFinite(lineTotal) || lineTotal < 0 || rawSubtotal + lineTotal > MAX_MONEY) {
            throw new DomainError('invalid_input', 'Order total is outside the supported range')
          }
          let workerId: number | null = line.workerId ?? null
          if (workerId != null) {
            const active = db.prepare('SELECT id FROM workers WHERE id = ? AND is_active = 1').get(workerId)
            if (!active) throw new DomainError('invalid_input', 'The selected worker is unavailable')
          } else {
            workerId = (db.prepare(
              `SELECT w.id FROM workers w JOIN worker_categories wc ON wc.worker_id = w.id
               WHERE wc.category_id = ? AND w.is_active = 1 ORDER BY w.id LIMIT 1`
            ).get(menu.category_id) as { id: number } | undefined)?.id ?? null
          }

          const itemId = Number(insertItem.run(
            input.orderId,
            line.menuItemId,
            line.quantity,
            unitPrice,
            lineTotal,
            line.note ?? null,
            workerId
          ).lastInsertRowid)
          if (line.unitPriceOverride !== undefined && unitPrice !== menu.price) {
            recordAuditEvent(db, {
              eventType: 'price_override',
              orderId: input.orderId,
              orderItemId: itemId,
              originalValue: String(menu.price),
              newValue: String(unitPrice),
              operator: input.operator?.trim() || 'POS',
              reason: 'Price override on added order line'
            })
          }
          const ingredients = db.prepare(
            `SELECT mii.*, si.unit_type, si.price_per_unit, si.is_active
             FROM menu_item_ingredients mii JOIN stock_items si ON si.id = mii.stock_item_id
             WHERE mii.menu_item_id = ?`
          ).all(line.menuItemId) as any[]
          for (const ingredient of ingredients) {
            if (ingredient.is_active !== 1) throw new DomainError('inactive_item', 'A recipe stock item is unavailable')
            let deduction: number
            try {
              deduction = totalRecipeDeduction(ingredient.quantity, line.quantity, ingredient.unit, ingredient.unit_type)
            } catch {
              throw new DomainError('incompatible_unit', `Recipe unit ${ingredient.unit} is incompatible with stock unit ${ingredient.unit_type}`)
            }
            adjustStock(ingredient.stock_item_id, -deduction, `Order #${order.daily_number} edit: added line`)
            insertDeduction.run(itemId, ingredient.stock_item_id, deduction, ingredient.price_per_unit)
          }
          rawSubtotal += lineTotal
        }

        const subtotal = roundMoney(rawSubtotal)
        const requestedDiscount = input.discountAmount ?? order.discount_amount
        const discount = roundMoney(Math.min(Math.max(0, requestedDiscount), subtotal))
        const total = roundMoney(subtotal - discount)
        const details = input.discountDetails !== undefined
          ? input.discountDetails.trim() || null
          : order.discount_details

        if (input.header) updateHeaderWithinTransaction(order, input.header, total)
        else if (order.customer_id != null && order.status !== 'cancelled' && total !== order.total) {
          db.prepare(
            `UPDATE customers SET total_spent = MAX(0, total_spent + ?), updated_at = datetime('now')
             WHERE id = ?`
          ).run(total - order.total, order.customer_id)
        }
        db.prepare(
          `UPDATE orders SET subtotal = ?, discount_amount = ?, discount_details = ?, total = ?,
           order_type = ? WHERE id = ?`
        ).run(subtotal, discount, details, total, input.header?.orderType ?? order.order_type, input.orderId)

        if (kitchenRelevantChange) {
          const workers = db.prepare('SELECT worker_id FROM order_items WHERE order_id = ?').all(input.orderId) as { worker_id: number | null }[]
          enqueueAutomaticPrintJobs(db, input.orderId, workers, 'updated')
        }
        enqueueOutbox(db, input.orderId, 'updated')
        return updateResult(current(input.orderId)!)
      })()
    } catch (error) {
      if (error instanceof DomainError) return { ok: false, code: error.code, message: error.message }
      if (isBusyOrFull(error)) throw error
      return { ok: false, code: 'db_failure', message: error instanceof Error ? error.message : String(error) }
    }
  }

  function updateOrderStatus(orderId: number, status: OrderStatus): UpdateOrderResult {
    const order = current(orderId)
    if (!order) return { ok: false, code: 'not_found', message: 'Order not found' }
    if (!['pending', 'preparing', 'completed', 'cancelled'].includes(status)) {
      return { ok: false, code: 'invalid_input', message: 'Invalid order status' }
    }
    if (order.status === status) return updateResult(order)

    const allowed: Record<OrderStatus, OrderStatus[]> = {
      pending: ['preparing', 'completed', 'cancelled'],
      preparing: ['completed', 'cancelled'],
      completed: ['preparing', 'cancelled'],
      cancelled: ['preparing']
    }
    if (!allowed[order.status].includes(status)) {
      return { ok: false, code: 'invalid_input', message: `Order cannot move from ${order.status} to ${status}` }
    }

    try {
      return db.transaction(() => {
        const items = db.prepare('SELECT id, worker_id FROM order_items WHERE order_id = ?').all(orderId) as
          { id: number; worker_id: number | null }[]
        if (status === 'cancelled') {
          for (const item of items) {
            const deductions = db.prepare(
              'SELECT stock_item_id, quantity_deducted FROM order_item_deductions WHERE order_item_id = ?'
            ).all(item.id) as { stock_item_id: number; quantity_deducted: number }[]
            for (const deduction of deductions) {
              db.prepare("UPDATE stock_items SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?")
                .run(deduction.quantity_deducted, deduction.stock_item_id)
            }
          }
          reverseCustomerAccrual(db, order.customer_id, order.total)
          recordAuditEvent(db, {
            eventType: 'void',
            orderId,
            originalValue: order.status,
            newValue: 'cancelled',
            operator: 'system',
            reason: 'Order cancelled'
          })
        } else if (order.status === 'cancelled') {
          for (const item of items) {
            const deductions = db.prepare(
              'SELECT stock_item_id, quantity_deducted FROM order_item_deductions WHERE order_item_id = ?'
            ).all(item.id) as { stock_item_id: number; quantity_deducted: number }[]
            for (const deduction of deductions) {
              db.prepare("UPDATE stock_items SET quantity = quantity - ?, updated_at = datetime('now') WHERE id = ?")
                .run(deduction.quantity_deducted, deduction.stock_item_id)
            }
          }
          if (order.customer_id != null) {
            db.prepare(
              `UPDATE customers SET total_spent = total_spent + ?, order_count = order_count + 1,
               updated_at = datetime('now') WHERE id = ?`
            ).run(order.total, order.customer_id)
          }
        }

        const completedAt = status === 'completed' || status === 'cancelled' ? now().toISOString() : null
        db.prepare('UPDATE orders SET status = ?, completed_at = ? WHERE id = ?').run(status, completedAt, orderId)
        const event = status === 'cancelled'
          ? 'cancelled'
          : status === 'preparing' && (order.status === 'cancelled' || order.status === 'completed')
            ? 'restored'
            : null
        if (event) enqueueAutomaticPrintJobs(db, orderId, items, event)
        enqueueOutbox(db, orderId, event === 'restored' ? 'restored' : status === 'cancelled' ? 'cancelled' : 'updated')
        return updateResult(current(orderId)!)
      })()
    } catch (error) {
      if (isBusyOrFull(error)) throw error
      return { ok: false, code: 'db_failure', message: error instanceof Error ? error.message : String(error) }
    }
  }

  return { createOrder, updateOrderHeader, updateOrderLines, updateOrderStatus }
}
