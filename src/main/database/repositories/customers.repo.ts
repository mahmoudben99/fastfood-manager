import { getDb } from '../connection'
import { normalizeAlgerianPhone } from '../../domain/customer-phone'

export interface Customer {
  id: number
  phone: string
  phone_normalized: string
  name: string | null
  total_spent: number
  order_count: number
  last_order_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export function createCustomersRepository(database: typeof getDb = getDb) {
  return {
  getAll(sortBy: 'total_spent' | 'order_count' | 'last_order' = 'total_spent'): Customer[] {
    const db = database()
    const orderColumn =
      sortBy === 'last_order' ? 'last_order_date' : sortBy === 'order_count' ? 'order_count' : 'total_spent'
    return db.prepare(`SELECT * FROM customers ORDER BY ${orderColumn} DESC`).all() as Customer[]
  },

  search(query: string): Customer[] {
    const db = database()
    const trimmed = query.trim()
    const escaped = trimmed.replace(/[\\%_]/g, '\\$&')
    const normalized = normalizeAlgerianPhone(trimmed, { allowPartial: true })
    const escapedNormalized = (normalized ?? '').replace(/[\\%_]/g, '\\$&')
    return db
      .prepare(
        `SELECT * FROM customers
         WHERE phone LIKE ? ESCAPE '\\'
            OR name LIKE ? ESCAPE '\\'
            OR (? != '' AND phone_normalized LIKE ? ESCAPE '\\')
         ORDER BY total_spent DESC`
      )
      .all(`%${escaped}%`, `%${escaped}%`, escapedNormalized, `%${escapedNormalized}%`) as Customer[]
  },

  getByPhone(phone: string): Customer | undefined {
    const db = database()
    const normalized = normalizeAlgerianPhone(phone)
    if (!normalized) return undefined
    return db
      .prepare(`SELECT * FROM customers WHERE phone_normalized = ?`)
      .get(normalized) as Customer | undefined
  },

  getById(id: number): Customer | undefined {
    const db = database()
    return db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id) as Customer | undefined
  },

  getCustomerOrders(customerId: number) {
    const db = database()
    return db
      .prepare(`SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50`)
      .all(customerId)
  },

  getFavoriteItems(customerId: number) {
    const db = database()
    return db
      .prepare(
        `SELECT oi.menu_item_id, SUM(oi.quantity) as total
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.customer_id = ?
           AND o.status != 'cancelled'
         GROUP BY oi.menu_item_id
         ORDER BY total DESC
         LIMIT 5`
      )
      .all(customerId)
  },

  upsertFromOrder(phone: string, orderTotal: number, name?: string): number {
    const db = database()
    const normalized = normalizeAlgerianPhone(phone)
    if (!normalized) throw new Error('A valid phone number is required for customer loyalty')
    if (!Number.isFinite(orderTotal) || orderTotal < 0) throw new Error('Invalid customer order total')

    const displayPhone = phone
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50) || normalized

    const customerName = name?.trim() || null
    const customer = db
      .prepare(
        `INSERT INTO customers (phone, phone_normalized, name, total_spent, order_count, last_order_date)
         VALUES (?, ?, ?, ?, 1, datetime('now'))
         ON CONFLICT(phone_normalized) DO UPDATE SET
           total_spent = customers.total_spent + excluded.total_spent,
           order_count = customers.order_count + 1,
           last_order_date = datetime('now'),
           name = COALESCE(excluded.name, customers.name),
           updated_at = datetime('now')
         RETURNING id`
      )
      .get(displayPhone, normalized, customerName, orderTotal) as { id: number }
    return customer.id
  },

  update(id: number, data: { name?: string; notes?: string }): void {
    const db = database()
    const fields: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      fields.push('name = ?')
      values.push(data.name)
    }
    if (data.notes !== undefined) {
      fields.push('notes = ?')
      values.push(data.notes)
    }

    if (fields.length === 0) return

    fields.push("updated_at = datetime('now')")
    values.push(id)

    db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }
  }
}

export const customersRepo = createCustomersRepository()
