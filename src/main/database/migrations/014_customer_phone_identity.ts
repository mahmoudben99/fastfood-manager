import type Database from 'better-sqlite3'
import { normalizeAlgerianPhone } from '../../domain/customer-phone'

interface LegacyCustomer {
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

function latestNonEmpty(
  rows: LegacyCustomer[],
  field: 'name' | 'notes'
): string | null {
  return [...rows]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((row) => row[field]?.trim())
    .find((value): value is string => Boolean(value)) ?? null
}

function mergeNotes(rows: LegacyCustomer[]): string | null {
  const notes = [...rows]
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    .map((row) => row.notes?.trim())
    .filter((value): value is string => Boolean(value))
  const unique = [...new Set(notes)]
  return unique.length > 0 ? unique.join('\n') : null
}

export const migration014 = {
  version: 14,
  name: 'customer_phone_identity',
  up(db: Database.Database): void {
    db.exec(`ALTER TABLE customers ADD COLUMN phone_normalized TEXT`)

    const customers = db
      .prepare(
        `SELECT id, phone, name, total_spent, order_count, last_order_date,
                notes, created_at, updated_at
         FROM customers
         ORDER BY id`
      )
      .all() as LegacyCustomer[]

    const groups = new Map<string, LegacyCustomer[]>()
    for (const customer of customers) {
      // Invalid legacy values remain isolated instead of being merged together. New writes
      // reject them at the repository boundary, but no historical customer is discarded.
      const identity = normalizeAlgerianPhone(customer.phone) ?? `legacy-invalid:${customer.id}`
      const group = groups.get(identity) ?? []
      group.push(customer)
      groups.set(identity, group)
    }

    const relinkOrders = db.prepare('UPDATE orders SET customer_id = ? WHERE customer_id = ?')
    const deleteCustomer = db.prepare('DELETE FROM customers WHERE id = ?')
    const mergeCustomer = db.prepare(
      `UPDATE customers
       SET phone_normalized = ?, name = ?, notes = ?, total_spent = ?, order_count = ?,
           last_order_date = ?, created_at = ?, updated_at = ?
       WHERE id = ?`
    )

    for (const [identity, rows] of groups) {
      const survivor = rows[0]
      const lastOrder = rows
        .map((row) => row.last_order_date)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null
      const createdAt = rows.map((row) => row.created_at).sort()[0]
      const updatedAt = rows.map((row) => row.updated_at).sort().at(-1) ?? survivor.updated_at

      mergeCustomer.run(
        identity,
        latestNonEmpty(rows, 'name'),
        mergeNotes(rows),
        rows.reduce((sum, row) => sum + row.total_spent, 0),
        rows.reduce((sum, row) => sum + row.order_count, 0),
        lastOrder,
        createdAt,
        updatedAt,
        survivor.id
      )

      for (const duplicate of rows.slice(1)) {
        relinkOrders.run(survivor.id, duplicate.id)
        deleteCustomer.run(duplicate.id)
      }
    }

    db.exec(`
      CREATE UNIQUE INDEX idx_customers_phone_normalized
        ON customers(phone_normalized);

      CREATE TRIGGER customers_require_phone_identity_insert
      BEFORE INSERT ON customers
      WHEN NEW.phone_normalized IS NULL OR NEW.phone_normalized = ''
      BEGIN
        SELECT RAISE(ABORT, 'customer phone identity is required');
      END;

      CREATE TRIGGER customers_require_phone_identity_update
      BEFORE UPDATE OF phone_normalized ON customers
      WHEN NEW.phone_normalized IS NULL OR NEW.phone_normalized = ''
      BEGIN
        SELECT RAISE(ABORT, 'customer phone identity is required');
      END;
    `)
  }
}
