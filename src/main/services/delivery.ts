import type Database from 'better-sqlite3'
import { normalizeAlgerianPhone } from '../domain/customer-phone'
import {
  DELIVERY_STATUSES, DRIVER_ROLE, canMoveDelivery, type CustomerAddress, type CustomerAddressInput,
  type DeliveryListEntry, type DeliveryStatus, type DeliveryZone, type DeliveryZoneInput, type OrderDelivery
} from '../../shared/delivery'
import { CashError, cleanText, wholeDinars } from './cash-error'

/**
 * Delivery: zones (fee, minimum order, ETA), customer address book, per-order delivery details
 * (order_deliveries), driver assignment and the status timeline. The fee itself lives on
 * orders.delivery_fee and is part of the total: total = subtotal − discount + delivery_fee.
 */

/** Service-level (camelCase) delivery details on an order create / edit. */
export interface DeliveryDetails {
  address?: string | null
  addressId?: number | null
  zoneId?: number | null
  driverId?: number | null
  fee?: number | null
  notes?: string | null
  saveAddress?: boolean
  ignoreMinOrder?: boolean
}

export interface ResolvedDelivery {
  fee: number
  address: string
  addressId: number | null
  zoneId: number | null
  zoneName: string | null
  estimatedMinutes: number | null
  driverId: number | null
  notes: string | null
  saveAddress: boolean
}

// ── Zones ──
export function listZones(db: Database.Database, includeInactive = false): DeliveryZone[] {
  return db.prepare(
    `SELECT * FROM delivery_zones WHERE (? = 1 OR is_active = 1) ORDER BY sort_order, name`
  ).all(includeInactive ? 1 : 0) as DeliveryZone[]
}

export function saveZone(db: Database.Database, input: DeliveryZoneInput): DeliveryZone {
  const name = cleanText(input?.name, 80)
  if (!name) throw new CashError('invalid_input', 'A zone name is required')
  const fee = wholeDinars(input.fee ?? 0, 'Delivery fee')
  const minOrder = input.min_order === null || input.min_order === undefined ? null : wholeDinars(input.min_order, 'Minimum order')
  const eta = input.estimated_minutes === null || input.estimated_minutes === undefined
    ? null : wholeDinars(input.estimated_minutes, 'Estimated minutes')
  const active = input.is_active === false ? 0 : 1
  const sort = Number.isInteger(input.sort_order) ? Number(input.sort_order) : 0
  if (input.id !== undefined) {
    const result = db.prepare(
      `UPDATE delivery_zones SET name = ?, fee = ?, min_order = ?, estimated_minutes = ?, is_active = ?, sort_order = ?,
       updated_at = datetime('now') WHERE id = ?`
    ).run(name, fee, minOrder, eta, active, sort, input.id)
    if (result.changes === 0) throw new CashError('not_found', 'Delivery zone not found')
    return db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(input.id) as DeliveryZone
  }
  const id = Number(db.prepare(
    'INSERT INTO delivery_zones (name, fee, min_order, estimated_minutes, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, fee, minOrder, eta, active, sort).lastInsertRowid)
  return db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(id) as DeliveryZone
}

/** Soft delete: past orders keep their zone snapshot. */
export function deleteZone(db: Database.Database, id: number): boolean {
  return db.prepare("UPDATE delivery_zones SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id).changes > 0
}

// ── Customer addresses ──

/**
 * Law 18-07 (personal data): an address goes into a customer's address book only when that
 * customer's consent is recorded (customers.consent_at, migration 026). Without it the address
 * stays on the order only. Before migration 026 the column does not exist: previous behaviour.
 */
export function customerConsentsToAddressBook(db: Database.Database, customerId: number): boolean {
  const column = db.prepare("SELECT 1 FROM pragma_table_info('customers') WHERE name = 'consent_at'").get()
  if (!column) return true
  const row = db.prepare('SELECT consent_at FROM customers WHERE id = ?').get(customerId) as { consent_at: string | null } | undefined
  return Boolean(row?.consent_at)
}

export function listAddresses(db: Database.Database, customerId: number): CustomerAddress[] {
  return db.prepare(
    'SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, last_used_at DESC, id DESC'
  ).all(customerId) as CustomerAddress[]
}

export function listAddressesByPhone(db: Database.Database, phone: string): CustomerAddress[] {
  const normalized = normalizeAlgerianPhone(phone)
  if (!normalized) return []
  const customer = db.prepare('SELECT id FROM customers WHERE phone_normalized = ?').get(normalized) as { id: number } | undefined
  return customer ? listAddresses(db, customer.id) : []
}

function customerIdFor(db: Database.Database, input: CustomerAddressInput): number {
  if (input.customer_id !== undefined) {
    if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(input.customer_id)) throw new CashError('not_found', 'Customer not found')
    return input.customer_id
  }
  const normalized = normalizeAlgerianPhone(input.customer_phone ?? '')
  if (!normalized) throw new CashError('invalid_input', 'A valid customer phone is required')
  const display = String(input.customer_phone).replace(/\s+/g, ' ').trim().slice(0, 50) || normalized
  return (db.prepare(
    `INSERT INTO customers (phone, phone_normalized, total_spent, order_count) VALUES (?, ?, 0, 0)
     ON CONFLICT(phone_normalized) DO UPDATE SET updated_at = customers.updated_at RETURNING id`
  ).get(display, normalized) as { id: number }).id
}

export function saveAddress(db: Database.Database, input: CustomerAddressInput): CustomerAddress {
  const address = cleanText(input?.address, 300)
  if (!address) throw new CashError('invalid_input', 'An address is required')
  const zoneId = input.zone_id ?? null
  if (zoneId !== null && !db.prepare('SELECT 1 FROM delivery_zones WHERE id = ?').get(zoneId)) {
    throw new CashError('invalid_input', 'Unknown delivery zone')
  }
  return db.transaction(() => {
    const customerId = customerIdFor(db, input)
    if (!customerConsentsToAddressBook(db, customerId)) {
      throw new CashError('not_allowed', 'CONSENT_REQUIRED: the customer has not agreed to keep their address')
    }
    if (input.is_default) db.prepare('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?').run(customerId)
    const values = [cleanText(input.label, 40), address, zoneId, cleanText(input.notes, 200), input.is_default ? 1 : 0]
    let id = input.id
    if (id !== undefined) {
      const result = db.prepare(
        `UPDATE customer_addresses SET label = ?, address = ?, zone_id = ?, notes = ?, is_default = ?,
         updated_at = datetime('now') WHERE id = ? AND customer_id = ?`
      ).run(...values, id, customerId)
      if (result.changes === 0) throw new CashError('not_found', 'Address not found')
    } else {
      id = Number(db.prepare(
        'INSERT INTO customer_addresses (label, address, zone_id, notes, is_default, customer_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(...values, customerId).lastInsertRowid)
    }
    return db.prepare('SELECT * FROM customer_addresses WHERE id = ?').get(id) as CustomerAddress
  })()
}

export function deleteAddress(db: Database.Database, id: number): boolean {
  return db.prepare('DELETE FROM customer_addresses WHERE id = ?').run(id).changes > 0
}

// ── Drivers ──
export function listDrivers(db: Database.Database): { id: number; name: string; phone: string | null }[] {
  return db.prepare(
    'SELECT id, name, phone FROM workers WHERE is_active = 1 AND role = ? ORDER BY name'
  ).all(DRIVER_ROLE) as { id: number; name: string; phone: string | null }[]
}

function assertDriver(db: Database.Database, driverId: number): void {
  const driver = db.prepare('SELECT id FROM workers WHERE id = ? AND is_active = 1 AND role = ?').get(driverId, DRIVER_ROLE)
  if (!driver) throw new CashError('invalid_input', 'The selected driver is not an active worker with the driver role')
}

// ── Order delivery details ──
export function getOrderDelivery(db: Database.Database, orderId: number): OrderDelivery | null {
  return (db.prepare(
    `SELECT d.*, w.name AS driver_name FROM order_deliveries d LEFT JOIN workers w ON w.id = d.driver_id
     WHERE d.order_id = ?`
  ).get(orderId) as OrderDelivery | undefined) ?? null
}

/**
 * Resolve delivery details into a fee and a row. `existing` (edit) is patched: fields left
 * undefined keep their stored value, and the stored fee is kept unless the zone or fee changes.
 */
export function resolveDelivery(
  db: Database.Database,
  details: DeliveryDetails,
  existing: { row: OrderDelivery | null; fee: number } | null,
  netBeforeFee: number
): ResolvedDelivery {
  const row = existing?.row ?? null
  const addressId = details.addressId !== undefined ? details.addressId : row?.address_id ?? null
  const saved = addressId !== null
    ? db.prepare('SELECT * FROM customer_addresses WHERE id = ?').get(addressId) as CustomerAddress | undefined
    : undefined
  if (addressId !== null && !saved) throw new CashError('invalid_input', 'Saved address not found')
  const zoneId = details.zoneId !== undefined ? details.zoneId : row ? row.zone_id : saved?.zone_id ?? null
  const zoneChanged = !row || zoneId !== row.zone_id
  const zone = zoneId !== null
    ? db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(zoneId) as DeliveryZone | undefined
    : undefined
  if (zoneId !== null && (!zone || (zoneChanged && zone.is_active !== 1))) throw new CashError('invalid_input', 'Unknown or inactive delivery zone')
  if (zone && zoneChanged && zone.min_order && netBeforeFee < zone.min_order && !details.ignoreMinOrder) {
    throw new CashError('invalid_input', `BELOW_MIN_ORDER: the minimum order for ${zone.name} is ${zone.min_order}`)
  }
  const address = details.address !== undefined
    ? cleanText(details.address, 300) ?? ''
    : (details.addressId !== undefined && saved ? saved.address : row?.address ?? saved?.address ?? '')
  if (!address) throw new CashError('invalid_input', 'A delivery address is required')
  const driverId = details.driverId !== undefined ? details.driverId : row?.driver_id ?? null
  if (driverId !== null && driverId !== (row?.driver_id ?? null)) assertDriver(db, driverId)
  const fee = details.fee !== undefined && details.fee !== null
    ? wholeDinars(details.fee, 'Delivery fee')
    : zoneChanged || !existing ? zone?.fee ?? 0 : existing.fee
  return {
    fee,
    address,
    addressId,
    zoneId,
    zoneName: zoneChanged ? zone?.name ?? null : row?.zone_name ?? null,
    estimatedMinutes: zoneChanged ? zone?.estimated_minutes ?? null : row?.estimated_minutes ?? null,
    driverId,
    notes: details.notes !== undefined ? cleanText(details.notes, 300) : row?.notes ?? null,
    saveAddress: Boolean(details.saveAddress)
  }
}

/**
 * Insert or patch the order's delivery row (status and timeline are kept on an update).
 * `saveAddress` adds the address to the customer's book only with recorded consent.
 */
export function writeOrderDelivery(db: Database.Database, orderId: number, resolved: ResolvedDelivery, now: Date): void {
  let addressId = resolved.addressId
  if (resolved.saveAddress && addressId === null) {
    const customer = db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(orderId) as { customer_id: number | null }
    if (customer?.customer_id && customerConsentsToAddressBook(db, customer.customer_id)) {
      addressId = Number(db.prepare(
        'INSERT INTO customer_addresses (customer_id, address, zone_id, last_used_at) VALUES (?, ?, ?, ?)'
      ).run(customer.customer_id, resolved.address, resolved.zoneId, now.toISOString()).lastInsertRowid)
    }
  } else if (addressId !== null) {
    db.prepare('UPDATE customer_addresses SET last_used_at = ? WHERE id = ?').run(now.toISOString(), addressId)
  }
  const stamp = now.toISOString()
  db.prepare(
    `INSERT INTO order_deliveries
     (order_id, address, address_id, zone_id, zone_name, estimated_minutes, driver_id, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
     ON CONFLICT(order_id) DO UPDATE SET address = excluded.address, address_id = excluded.address_id,
       zone_id = excluded.zone_id, zone_name = excluded.zone_name, estimated_minutes = excluded.estimated_minutes,
       driver_id = excluded.driver_id, notes = excluded.notes, updated_at = excluded.updated_at`
  ).run(orderId, resolved.address, addressId, resolved.zoneId, resolved.zoneName, resolved.estimatedMinutes,
    resolved.driverId, resolved.notes, stamp, stamp)
}

/** The order is no longer a delivery. A settled delivery cannot be removed. */
export function removeOrderDelivery(db: Database.Database, orderId: number): void {
  const row = getOrderDelivery(db, orderId)
  if (!row) return
  if (row.settlement_id !== null) throw new CashError('not_allowed', 'This delivery was already settled with its driver')
  db.prepare('DELETE FROM order_deliveries WHERE order_id = ?').run(orderId)
}

/** A delivery order created without details (tablet / older POS) gets a row on first dispatch use. */
function ensureDeliveryRow(db: Database.Database, orderId: number, now: Date): OrderDelivery {
  const order = db.prepare('SELECT order_type, status FROM orders WHERE id = ?').get(orderId) as { order_type: string; status: string } | undefined
  if (!order) throw new CashError('not_found', 'Order not found')
  if (order.order_type !== 'delivery') throw new CashError('not_allowed', 'This order is not a delivery')
  const stamp = now.toISOString()
  db.prepare(
    `INSERT OR IGNORE INTO order_deliveries (order_id, address, status, created_at, updated_at) VALUES (?, '', 'pending', ?, ?)`
  ).run(orderId, stamp, stamp)
  return getOrderDelivery(db, orderId)!
}

export function assignDriver(db: Database.Database, orderId: number, driverId: number | null, now: Date = new Date()): OrderDelivery {
  return db.transaction(() => {
    const row = ensureDeliveryRow(db, orderId, now)
    if (row.settlement_id !== null) throw new CashError('not_allowed', 'This delivery was already settled with its driver')
    if (driverId !== null) assertDriver(db, driverId)
    db.prepare('UPDATE order_deliveries SET driver_id = ?, updated_at = ? WHERE order_id = ?').run(driverId, now.toISOString(), orderId)
    return getOrderDelivery(db, orderId)!
  })()
}

const STATUS_COLUMN: Partial<Record<DeliveryStatus, string>> = {
  preparing: 'preparing_at', out_for_delivery: 'out_for_delivery_at', delivered: 'delivered_at', failed: 'failed_at'
}

/** Move along pending → preparing → out_for_delivery → delivered / failed, stamping the timeline. */
export function setDeliveryStatus(
  db: Database.Database,
  orderId: number,
  status: DeliveryStatus,
  options: { reason?: string | null } = {},
  now: Date = new Date()
): OrderDelivery {
  if (!(DELIVERY_STATUSES as readonly string[]).includes(status)) throw new CashError('invalid_input', 'Invalid delivery status')
  return db.transaction(() => {
    const row = ensureDeliveryRow(db, orderId, now)
    if (row.status === status) return row
    const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string }
    if (order.status === 'cancelled' && status !== 'failed') throw new CashError('not_allowed', 'The order is cancelled')
    if (!canMoveDelivery(row.status, status)) throw new CashError('invalid_input', `Delivery cannot move from ${row.status} to ${status}`)
    if (row.settlement_id !== null) throw new CashError('not_allowed', 'This delivery was already settled with its driver')
    const column = STATUS_COLUMN[status]
    db.prepare(
      `UPDATE order_deliveries SET status = ?, ${column ? `${column} = ?, ` : ''}failure_reason = ?, updated_at = ? WHERE order_id = ?`
    ).run(...[status, ...(column ? [now.toISOString()] : []), status === 'failed' ? cleanText(options.reason, 200) : null, now.toISOString(), orderId])
    return getOrderDelivery(db, orderId)!
  })()
}

/** Delivery orders for the dispatch screen (orders without details show as pending). */
export function listDeliveries(
  db: Database.Database,
  options: { date?: string; status?: DeliveryStatus; driverId?: number } = {}
): DeliveryListEntry[] {
  return db.prepare(
    `SELECT o.id AS order_id, o.daily_number, o.order_date, o.status AS order_status, o.customer_name, o.customer_phone,
            o.total, o.delivery_fee, o.payment_status,
            CASE WHEN o.payment_status IS NULL AND NOT EXISTS (SELECT 1 FROM order_payments p WHERE p.order_id = o.id) THEN 0
                 ELSE o.total - COALESCE((SELECT SUM(p.amount) FROM order_payments p WHERE p.order_id = o.id), 0) END AS balance_due,
            COALESCE(d.address, '') AS address, d.address_id, d.zone_id, d.zone_name, d.estimated_minutes, d.driver_id,
            w.name AS driver_name, d.notes, COALESCE(d.status, 'pending') AS status, d.failure_reason,
            COALESCE(d.created_at, o.created_at) AS created_at, d.preparing_at, d.out_for_delivery_at, d.delivered_at,
            d.failed_at, d.settlement_id, COALESCE(d.updated_at, o.created_at) AS updated_at
     FROM orders o LEFT JOIN order_deliveries d ON d.order_id = o.id LEFT JOIN workers w ON w.id = d.driver_id
     WHERE o.order_type = 'delivery' AND (? IS NULL OR o.order_date = ?)
       AND (? IS NULL OR COALESCE(d.status, 'pending') = ?) AND (? IS NULL OR d.driver_id = ?)
     ORDER BY o.id DESC LIMIT 500`
  ).all(
    options.date ?? null, options.date ?? null, options.status ?? null, options.status ?? null,
    options.driverId ?? null, options.driverId ?? null
  ) as DeliveryListEntry[]
}
