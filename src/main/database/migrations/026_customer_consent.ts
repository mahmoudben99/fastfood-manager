import type Database from 'better-sqlite3'

/**
 * v4 checkout: personal-data consent (Algerian law 18-07). A customer's phone and delivery
 * addresses are kept for later orders only after they agreed at the till; the POS records when
 * and which wording (consent_version) they agreed to. Existing customers have no consent on file
 * (NULL) and are asked again the next time an address would be saved. Idempotent.
 */
export const migration026 = {
  version: 26,
  name: 'customer_consent',
  up(db: Database.Database): void {
    const columns = new Set(
      (db.prepare('PRAGMA table_info(customers)').all() as { name: string }[]).map((column) => column.name)
    )
    if (!columns.has('consent_at')) db.exec('ALTER TABLE customers ADD COLUMN consent_at TEXT')
    if (!columns.has('consent_version')) db.exec('ALTER TABLE customers ADD COLUMN consent_version TEXT')
    // "Repeat last order" reads a customer's most recent orders.
    db.exec('CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at)')
  }
}
