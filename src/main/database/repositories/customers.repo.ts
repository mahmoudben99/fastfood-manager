import { getDb } from '../connection'

export interface Customer {
  id: number
  phone: string
  name: string | null
  total_spent: number
  order_count: number
  last_order_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export const customersRepo = {
  getAll(sortBy: 'total_spent' | 'order_count' | 'last_order' = 'total_spent'): Customer[] {
    const db = getDb()
    const orderColumn =
      sortBy === 'last_order' ? 'last_order_date' : sortBy === 'order_count' ? 'order_count' : 'total_spent'
    return db.prepare(`SELECT * FROM customers ORDER BY ${orderColumn} DESC`).all() as Customer[]
  },

  search(query: string): Customer[] {
    const db = getDb()
    return db
      .prepare(`SELECT * FROM customers WHERE phone LIKE ? OR name LIKE ? ORDER BY total_spent DESC`)
      .all(`%${query}%`, `%${query}%`) as Customer[]
  },

  getByPhone(phone: string): Customer | undefined {
    const db = getDb()
    return db.prepare(`SELECT * FROM customers WHERE phone = ?`).get(phone) as Customer | undefined
  },

  getById(id: number): Customer | undefined {
    const db = getDb()
    return db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id) as Customer | undefined
  },

  getCustomerOrders(customerId: number) {
    const db = getDb()
    return db
      .prepare(`SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50`)
      .all(customerId)
  },

  getFavoriteItems(customerId: number) {
    const db = getDb()
    return db
      .prepare(
        `SELECT oi.menu_item_id, SUM(oi.quantity) as total
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.customer_id = ?
         GROUP BY oi.menu_item_id
         ORDER BY total DESC
         LIMIT 5`
      )
      .all(customerId)
  },

  upsertFromOrder(phone: string, orderTotal: number, name?: string): number {
    const db = getDb()
    const existing = db.prepare(`SELECT id FROM customers WHERE phone = ?`).get(phone) as
      | { id: number }
      | undefined

    if (existing) {
      db.prepare(
        `UPDATE customers
         SET total_spent = total_spent + ?,
             order_count = order_count + 1,
             last_order_date = datetime('now'),
             name = COALESCE(?, name),
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(orderTotal, name ?? null, existing.id)
      return existing.id
    }

    const result = db
      .prepare(
        `INSERT INTO customers (phone, name, total_spent, order_count, last_order_date)
         VALUES (?, ?, ?, 1, datetime('now'))`
      )
      .run(phone, name ?? null, orderTotal)
    return result.lastInsertRowid as number
  },

  update(id: number, data: { name?: string; notes?: string }): void {
    const db = getDb()
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
