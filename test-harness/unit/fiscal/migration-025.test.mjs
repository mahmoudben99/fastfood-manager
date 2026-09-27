// v4 fiscal: migration 025 on older databases (v3.2.1 = migration 020, and wave-1 v4 = 024).
// Run: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings --test test-harness/unit/fiscal/*.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  NOW, createOrderService, entries, fiscalNumbers, fixedNow, getFiscalStatus, order, payments, runMigrations, seedMenu, verifyJournal
} from './_fiscal.mjs'

const V3 = [
  '001_initial', '002_table_number', '003_menu_emoji', '004_menu_versions', '005_restaurant_address',
  '006_order_alert_time', '007_receipt_appearance', '008_workers_and_printers', '009_printer_assignments',
  '010_printer_config', '011_promotions', '012_receipt_editor', '013_loyalty', '014_customer_phone_identity',
  '015_print_jobs', '016_order_sources', '017_order_effects', '018_order_effects_hardening',
  '019_order_item_name_snapshot', '020_category_soft_delete'
]
const V4_WAVE1 = [...V3, '021_modifiers_combos', '022_cash_shifts_delivery', '024_kds_tickets']

async function oldDatabase(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-m025-'))
  const db = new Database(path.join(dir, 'old.db'))
  db.pragma('foreign_keys = ON')
  db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`)
  for (const file of files) {
    const module = await import(`../../../src/main/database/migrations/${file}.ts`)
    const migration = Object.values(module)[0]
    db.transaction(() => {
      migration.up(db)
      db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name)
    })()
  }
  seedMenu(db)
  // Three historical orders, inserted out of date order on purpose (numbers follow creation = id).
  db.exec(`INSERT INTO orders (id, daily_number, order_date, order_type, status, subtotal, discount_amount, total, created_at)
           VALUES (1, 1, '2025-12-31', 'delivery', 'completed', 900, 0, 900, '2025-12-31T20:00:00Z'),
                  (2, 1, '2026-09-27', 'local', 'preparing', 800, 0, 800, '2026-09-27T09:00:00Z'),
                  (5, 2, '2026-09-27', 'takeout', 'cancelled', 500, 0, 500, '2026-09-27T09:30:00Z')`)
  db.exec(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, item_name) VALUES
           (1, 1, 1, 500, 500, 'Burger'), (1, 2, 1, 300, 300, 'Fries'), (1, 3, 1, 100, 100, 'Soda'),
           (2, 1, 1, 500, 500, 'Burger'), (2, 2, 1, 300, 300, 'Fries'), (5, 1, 1, 500, 500, 'Burger')`)
  db.exec(`INSERT INTO daily_counters (date, last_order_num) VALUES ('2025-12-31', 1), ('2026-09-27', 2)`)
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true }) } }
}

test('025 on a wave-1 v4 database: history numbered, journal opened, new orders continue the sequence', async () => {
  const { db, cleanup } = await oldDatabase(V4_WAVE1)
  try {
    assert.equal(db.prepare('PRAGMA table_info(orders)').all().some((c) => c.name === 'fiscal_number'), false)
    runMigrations(db)
    assert.deepEqual(db.prepare('SELECT id, fiscal_number, channel FROM orders ORDER BY id').all(), [
      { id: 1, fiscal_number: 1, channel: 'delivery' },
      { id: 2, fiscal_number: 2, channel: 'local' },
      { id: 5, fiscal_number: 3, channel: 'takeout' }
    ])
    const [open] = entries(db)
    assert.equal(entries(db).length, 1)
    assert.equal(open.event_type, 'journal_open')
    assert.deepEqual(open.data.pre_journal, {
      orders: 3, last_order_id: 5, last_fiscal_number: 3, first_date: '2025-12-31', last_date: '2026-09-27', net_total: 1700
    })
    const first = verifyJournal(db, NOW)
    assert.equal(first.ok, true, JSON.stringify(first.breaks))
    assert.deepEqual([first.preJournalOrders, first.ordersChecked, first.lastFiscalNumber], [3, 0, 3])
    const setting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value
    assert.equal(setting('availability_enforce'), 'warn')
    assert.deepEqual(JSON.parse(setting('sales_channels')).map((c) => c.id), ['yassir'])

    const service = createOrderService({ db, now: fixedNow })
    const fresh = order(service)
    assert.equal(db.prepare('SELECT fiscal_number FROM orders WHERE id = ?').get(fresh.orderId).fiscal_number, 4)
    // A refund on a historical (pre-journal) order is journaled and fingerprints that order from now on.
    db.transaction(() => payments.recordRefund(db, 1, { method: 'cash', amount: 100, reason: 'late' }, { shiftId: null, now: NOW }))()
    // Editing today's historical order: the removed line is archived and kept in the journal.
    const lines = db.prepare('SELECT id FROM order_items WHERE order_id = 2 ORDER BY id').all()
    assert.equal(service.updateOrderLines({ orderId: 2, lines: [{ orderItemId: lines[0].id, menuItemId: 1, quantity: 1 }] }).ok, true)
    assert.deepEqual(entries(db).map((e) => [e.event_type, e.order_id]), [
      // the legacy (pre-v4 cash) payment becomes an explicit row before the refund, both journaled
      ['journal_open', null], ['create', fresh.orderId], ['payment', 1], ['refund', 1], ['void', 2], ['line_edit', 2]
    ])
    assert.deepEqual(entries(db).find((e) => e.event_type === 'line_edit').data.before.lines.map((l) => l.item_name), ['Burger', 'Fries'])
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_items_archive WHERE order_id = 2').get().n, 1)
    const after = verifyJournal(db, NOW)
    assert.equal(after.ok, true, JSON.stringify(after.breaks))
    assert.deepEqual([after.preJournalOrders, after.ordersChecked], [1, 3])
    assert.equal(getFiscalStatus(db).lastFiscalNumber, 4)

    runMigrations(db)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM fiscal_journal WHERE event_type = 'journal_open'").get().n, 1, 're-run is a no-op')
    assert.deepEqual(fiscalNumbers(db), [1, 2, 3, 4])
  } finally {
    cleanup()
  }
})

test('025 on a v3.2.1 database (021 → 025 in one start)', async () => {
  const { db, cleanup } = await oldDatabase(V3)
  try {
    runMigrations(db)
    assert.deepEqual(fiscalNumbers(db), [1, 2, 3])
    assert.equal(db.prepare('SELECT version FROM _migrations WHERE version = 25').get().version, 25)
    const created = order(createOrderService({ db, now: fixedNow }), { orderType: 'delivery' })
    assert.equal(created.ok, true)
    assert.ok(verifyJournal(db, NOW).ok)
  } finally {
    cleanup()
  }
})
