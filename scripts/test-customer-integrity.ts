import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { normalizeAlgerianPhone } from '../src/main/domain/customer-phone'
import { migration014 } from '../src/main/database/migrations/014_customer_phone_identity'
import { createCustomersRepository } from '../src/main/database/repositories/customers.repo'

assert.equal(normalizeAlgerianPhone('0550 12 34 56'), '+213550123456')
assert.equal(normalizeAlgerianPhone('+213 (0) 550-12-34-56'), '+213550123456')
assert.equal(normalizeAlgerianPhone('00213 550 12 34 56'), '+213550123456')
assert.equal(normalizeAlgerianPhone('\u0660\u0665\u0665\u0660\u0661\u0662\u0663\u0664\u0665\u0666'), '+213550123456')
assert.equal(normalizeAlgerianPhone('0550', { allowPartial: true }), '+213550')
assert.equal(normalizeAlgerianPhone('not a phone'), null)

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE,
    name TEXT,
    total_spent REAL NOT NULL DEFAULT 0,
    order_count INTEGER NOT NULL DEFAULT 0,
    last_order_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    status TEXT NOT NULL
  );
  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    menu_item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL
  );
`)

const insert = db.prepare(`
  INSERT INTO customers
    (phone, name, total_spent, order_count, last_order_date, notes, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)
const firstId = Number(insert.run(
  '0550 12 34 56',
  null,
  1200,
  2,
  '2026-01-01 12:00:00',
  'Prefers no onions',
  '2025-01-01 00:00:00',
  '2026-01-01 12:00:00'
).lastInsertRowid)
const duplicateId = Number(insert.run(
  '+213550123456',
  'Amina',
  800,
  1,
  '2026-02-01 12:00:00',
  'Call on arrival',
  '2025-02-01 00:00:00',
  '2026-02-01 12:00:00'
).lastInsertRowid)
const invalidId = Number(insert.run(
  'counter customer',
  'Walk-in',
  100,
  1,
  null,
  null,
  '2026-01-01 00:00:00',
  '2026-01-01 00:00:00'
).lastInsertRowid)

db.prepare(`INSERT INTO orders (id, customer_id, status) VALUES (1, ?, 'completed')`).run(firstId)
db.prepare(`INSERT INTO orders (id, customer_id, status) VALUES (2, ?, 'cancelled')`).run(duplicateId)
db.prepare(`INSERT INTO order_items (id, order_id, menu_item_id, quantity) VALUES (1, 1, 10, 2)`).run()
db.prepare(`INSERT INTO order_items (id, order_id, menu_item_id, quantity) VALUES (2, 2, 20, 99)`).run()

db.transaction(() => migration014.up(db))()

const merged = db.prepare(`SELECT * FROM customers WHERE phone_normalized = ?`).get('+213550123456') as any
assert.equal(merged.id, firstId)
assert.equal(merged.phone, '0550 12 34 56')
assert.equal(merged.name, 'Amina')
assert.equal(merged.total_spent, 2000)
assert.equal(merged.order_count, 3)
assert.equal(merged.last_order_date, '2026-02-01 12:00:00')
assert.equal(merged.notes, 'Prefers no onions\nCall on arrival')
assert.equal(db.prepare(`SELECT customer_id FROM orders WHERE id = 2`).pluck().get(), firstId)
assert.equal(db.prepare(`SELECT COUNT(*) FROM customers`).pluck().get(), 2)
assert.equal(
  db.prepare(`SELECT phone_normalized FROM customers WHERE id = ?`).pluck().get(invalidId),
  `legacy-invalid:${invalidId}`
)
assert.throws(() => {
  db.prepare(`
    INSERT INTO customers
      (phone, phone_normalized, total_spent, order_count, created_at, updated_at)
    VALUES ('duplicate display', '+213550123456', 0, 0, datetime('now'), datetime('now'))
  `).run()
})
assert.throws(() => {
  db.prepare(`
    INSERT INTO customers
      (phone, total_spent, order_count, created_at, updated_at)
    VALUES ('missing identity', 0, 0, datetime('now'), datetime('now'))
  `).run()
})

const repository = createCustomersRepository(() => db)
assert.equal(repository.getByPhone('+213 (0) 550 12 34 56')?.id, firstId)
assert.equal(repository.search('0550')[0]?.id, firstId)
assert.equal(repository.search('\u0660\u0665\u0665\u0660')[0]?.id, firstId)
assert.deepEqual(repository.getFavoriteItems(firstId), [{ menu_item_id: 10, total: 2 }])
assert.equal(repository.upsertFromOrder('00213 550 12 34 56', 500, 'Amina B.'), firstId)
assert.equal(repository.getById(firstId)?.total_spent, 2500)
assert.equal(repository.getById(firstId)?.order_count, 4)
assert.throws(() => repository.upsertFromOrder('delivery desk', 100))

db.close()
console.log('Customer phone normalization and migration checks passed.')
