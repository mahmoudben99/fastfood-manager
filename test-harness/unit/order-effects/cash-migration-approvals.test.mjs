// v4: migration 022 on an older (v3.2.1, migration 020) database, and manager approvals.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import {
  approvals, createOrderService, fixedNow, freshDb, NOW, order, payments, runMigrations, seedMenu, setSetting, shifts
} from './cash-test-helpers.mjs'

const migrationFiles = [
  '001_initial', '002_table_number', '003_menu_emoji', '004_menu_versions', '005_restaurant_address',
  '006_order_alert_time', '007_receipt_appearance', '008_workers_and_printers', '009_printer_assignments',
  '010_printer_config', '011_promotions', '012_receipt_editor', '013_loyalty', '014_customer_phone_identity',
  '015_print_jobs', '016_order_sources', '017_order_effects', '018_order_effects_hardening',
  '019_order_item_name_snapshot', '020_category_soft_delete'
]

test('migration 022 upgrades a v3.2.1 database: old orders stay paid cash, defaults added, re-run is a no-op', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-m022-'))
  const db = new Database(path.join(dir, 'old.db'))
  try {
    db.pragma('foreign_keys = ON')
    db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    for (const file of migrationFiles) {
      const module = await import(`../../../src/main/database/migrations/${file}.ts`)
      const migration = Object.values(module)[0]
      db.transaction(() => {
        migration.up(db)
        db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name)
      })()
    }
    assert.equal(db.prepare('PRAGMA table_info(orders)').all().some((c) => c.name === 'delivery_fee'), false)
    seedMenu(db)
    db.exec(`INSERT INTO orders (id, daily_number, order_date, order_type, status, subtotal, discount_amount, total, created_at)
             VALUES (1, 1, '2026-09-20', 'delivery', 'completed', 900, 0, 900, '2026-09-20T10:00:00Z'),
                    (2, 2, '2026-09-20', 'takeout', 'cancelled', 500, 0, 500, '2026-09-20T11:00:00Z')`)
    db.exec(`INSERT INTO settings (key, value) VALUES ('cash_rounding', '10')`)

    runMigrations(db)
    const columns = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name)
    for (const name of ['delivery_fee', 'shift_id', 'payment_status', 'cashier_name']) assert.ok(columns.includes(name), name)
    assert.deepEqual(db.prepare('SELECT id, delivery_fee, payment_status, shift_id FROM orders ORDER BY id').all(), [
      { id: 1, delivery_fee: 0, payment_status: null, shift_id: null },
      { id: 2, delivery_fee: 0, payment_status: null, shift_id: null }
    ])
    const legacy = payments.paymentSummary(db, 1)
    assert.deepEqual([legacy.legacy, legacy.status, legacy.paid], [true, 'paid', 900])
    const setting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value
    assert.equal(setting('cash_rounding'), '10', 'an existing value is kept')
    assert.equal(setting('require_open_shift'), 'false')
    assert.equal(setting('approval_enabled'), 'false')
    assert.deepEqual(JSON.parse(setting('payment_methods')).map((m) => m.id), ['cash', 'cib', 'edahabia', 'baridipay', 'transfer', 'other'])
    for (const table of ['shifts', 'cash_movements', 'order_payments', 'order_deliveries', 'delivery_zones', 'customer_addresses',
      'driver_settlements', 'order_voids', 'approvals', 'invoices']) {
      assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table), table)
    }
    assert.equal(db.prepare('SELECT version FROM _migrations WHERE version = 22').get().version, 22)
    runMigrations(db)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM _migrations WHERE version = 22').get().n, 1)
    assert.throws(() => db.prepare("INSERT INTO shifts (register_id, cashier_name, opened_at, business_date) VALUES ('main', 'A', 'x', 'y'), ('main', 'B', 'x', 'y')").run(),
      /UNIQUE/, 'only one open shift per register')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('approvals: off by default; when on, guarded actions need a valid PIN + reason and are logged immutably', () => {
  const { db, cleanup } = freshDb()
  try {
    assert.equal(approvals.requireApproval(db, 'cancel_order', undefined), null, 'disabled → no approval needed')
    setSetting(db, 'approval_enabled', 'true')
    setSetting(db, 'admin_password_hash', bcrypt.hashSync('owner-secret', 4))
    assert.throws(() => approvals.requireApproval(db, 'cancel_order', undefined), /^Error: APPROVAL_REQUIRED:cancel_order$/)
    assert.throws(() => approvals.requireApproval(db, 'cancel_order', { pin: '1234', reason: '' }), /APPROVAL_REQUIRED/)
    assert.throws(() => approvals.setManagerPin(db, 'wrong', '4321'), /admin password is incorrect/)
    approvals.setManagerPin(db, 'owner-secret', '4321')
    assert.equal(approvals.approvalPolicy(db).hasManagerPin, true)
    assert.throws(() => approvals.requireApproval(db, 'pay_out', { pin: '0000', reason: 'bread' }, {}, NOW), /APPROVAL_INVALID:pay_out/)

    shifts.openShift(db, { cashier_name: 'Karim', opening_float: 0 }, NOW)
    const manager = approvals.requireApproval(db, 'cancel_order', { pin: '4321', reason: 'Customer left' }, { orderId: 5 }, NOW)
    assert.deepEqual(manager, { approvedBy: 'manager', operator: 'Karim', reason: 'Customer left' })
    const admin = approvals.requireApproval(db, 'refund', { pin: 'owner-secret', reason: 'Cold food', operator: 'Nadia' }, {}, NOW)
    assert.deepEqual([admin.approvedBy, admin.operator], ['admin', 'Nadia'])
    const logged = db.prepare('SELECT action, order_id, requested_by, approved_by, reason FROM approvals ORDER BY id').all()
    assert.deepEqual(logged.map((row) => [row.action, row.approved_by]), [['cancel_order', 'manager'], ['refund', 'admin']])
    assert.throws(() => db.prepare("UPDATE approvals SET reason = 'x'").run(), /immutable/)
    assert.throws(() => db.prepare('DELETE FROM approvals').run(), /append-only/)

    const policy = approvals.saveApprovalPolicy(db, 'owner-secret', { actions: ['cancel_order', 'view_expected'], discountPercent: 15 })
    assert.deepEqual([policy.actions, policy.discountPercent], [['cancel_order'], 15])
    assert.equal(approvals.requireApproval(db, 'pay_out', undefined), null, 'action not in approval_actions')
    assert.throws(() => approvals.saveApprovalPolicy(db, 'guess', { enabled: false }), /admin password is incorrect/)
    assert.ok(approvals.APPROVAL_SETTING_KEYS.includes('approval_enabled'), 'protected from settings:set')
  } finally { cleanup() }
})

test('approval rules: discount threshold beyond promotions, line voids, blind-count reveal', () => {
  const { db, cleanup } = freshDb()
  try {
    setSetting(db, 'approval_enabled', 'true')
    assert.equal(approvals.discountNeedsApproval(db, { subtotal: 1000, discount: 100, allowance: 0 }), false, '10% is the limit')
    assert.equal(approvals.discountNeedsApproval(db, { subtotal: 1000, discount: 150, allowance: 0 }), true)
    assert.equal(approvals.discountNeedsApproval(db, { subtotal: 1000, discount: 200, allowance: 200 }), false, 'promotion covers it')
    assert.equal(approvals.editVoidsLines([{ id: 1, quantity: 2 }], [{ order_item_id: 1, quantity: 2 }, { quantity: 1 }]), false)
    assert.equal(approvals.editVoidsLines([{ id: 1, quantity: 2 }], [{ order_item_id: 1, quantity: 1 }]), true)
    assert.equal(approvals.editVoidsLines([{ id: 1, quantity: 2 }, { id: 2, quantity: 1 }], [{ order_item_id: 1, quantity: 2 }]), true)
    assert.equal(approvals.isGuarded(db, 'view_expected'), true, 'blind close is on by default')
    setSetting(db, 'shift_blind_close', 'false')
    assert.equal(approvals.isGuarded(db, 'view_expected'), false)
  } finally { cleanup() }
})

test('cancellations from the service keep their operator + reason in the audit trail', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const service = createOrderService({ db, now: fixedNow })
    const created = order(service)
    service.updateOrderStatus(created.orderId, 'cancelled', { operator: 'Manager Bob', reason: 'Duplicate ticket' })
    const audit = db.prepare("SELECT operator, reason FROM audit_events WHERE event_type = 'void'").get()
    assert.deepEqual(audit, { operator: 'Manager Bob', reason: 'Duplicate ticket' })
    const voidRow = db.prepare("SELECT scope, amount, operator, reason FROM order_voids").get()
    assert.deepEqual(voidRow, { scope: 'order', amount: 1000, operator: 'Manager Bob', reason: 'Duplicate ticket' })
  } finally { cleanup() }
})
