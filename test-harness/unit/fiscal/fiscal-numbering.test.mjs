// v4 fiscal: gapless fiscal ticket numbers — sequential, failed transactions, duplicates, two
// connections with a lock conflict, database guards and the receipt line.
// Run: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings --test test-harness/unit/fiscal/*.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import {
  createOrderService, fiscalNumbers, fixedNow, freshDb, journal, order, range, seedMenu, setSetting, tryOrder, verifyJournal
} from './_fiscal.mjs'

const printDocuments = await import('../../../src/main/services/print-documents.ts')

test('each order gets the next fiscal number in its own transaction; daily numbers stay per day', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const service = createOrderService({ db, now: fixedNow })
    const created = range(5).map(() => order(service))
    const rows = db.prepare('SELECT id, daily_number, fiscal_number, channel FROM orders ORDER BY id').all()
    assert.deepEqual(rows.map((row) => row.fiscal_number), [1, 2, 3, 4, 5])
    assert.deepEqual(rows.map((row) => row.daily_number), [1, 2, 3, 4, 5])
    assert.ok(rows.every((row) => row.channel === 'takeout'), 'channel defaults to the order type')
    const nextDay = createOrderService({ db, now: () => new Date('2026-09-28T10:00:00Z') })
    order(nextDay)
    const last = db.prepare('SELECT daily_number, fiscal_number FROM orders ORDER BY id DESC LIMIT 1').get()
    assert.deepEqual([last.daily_number, last.fiscal_number], [1, 6], 'the kitchen number restarts, the fiscal number never does')
    assert.equal(journal.lastFiscalNumber(db), 6)
    assert.equal(created.length, 5)
    assert.ok(verifyJournal(db).ok)
  } finally {
    cleanup()
  }
})

test('refused and rolled-back orders never consume a number; a retried request keeps its number', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const service = createOrderService({ db, now: fixedNow })
    order(service)
    // Refused before any write.
    assert.equal(tryOrder(service, { lines: [{ menuItemId: 999, quantity: 1 }] }).ok, false)
    // Fails AFTER the fiscal number was taken (line insert aborts) → the whole order rolls back.
    db.exec(`CREATE TEMP TRIGGER boom AFTER INSERT ON order_items WHEN NEW.quantity = 13
             BEGIN SELECT RAISE(ABORT, 'simulated crash'); END`)
    const crashed = tryOrder(service, { lines: [{ menuItemId: 1, quantity: 13 }] })
    assert.equal(crashed.ok, false)
    assert.match(crashed.message, /simulated crash/)
    const second = order(service, { sourceRequestId: 'retry-me' })
    const again = order(service, { sourceRequestId: 'retry-me' })
    assert.equal(again.duplicate, true)
    assert.equal(again.orderId, second.orderId)
    order(service)
    assert.deepEqual(fiscalNumbers(db), [1, 2, 3])
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM fiscal_journal WHERE event_type = ?').get('create').n, 3)
    assert.ok(verifyJournal(db).ok)
  } finally {
    cleanup()
  }
})

test('two connections: interleaved creates, a lock conflict and random failures leave no gap', () => {
  const { db, cleanup } = freshDb()
  const other = new Database(db.name)
  try {
    seedMenu(db)
    other.pragma('busy_timeout = 0')
    db.pragma('busy_timeout = 0')
    const first = createOrderService({ db, now: fixedNow })
    const second = createOrderService({ db: other, now: fixedNow })
    db.exec(`CREATE TEMP TRIGGER boom AFTER INSERT ON order_items WHEN NEW.quantity = 13
             BEGIN SELECT RAISE(ABORT, 'simulated crash'); END`)

    // `other` holds the write lock: `first` cannot take a number, then succeeds after the release.
    other.exec('BEGIN IMMEDIATE')
    other.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('probe', '1')").run()
    assert.throws(() => first.createOrder({
      source: 'pos', sourceRequestId: 'locked', orderType: 'local', lines: [{ menuItemId: 1, quantity: 1 }], applyAutoPromotions: false
    }), /SQLITE_BUSY|locked/)
    other.exec('ROLLBACK')

    let ok = 0
    for (let i = 0; i < 40; i++) {
      const service = i % 2 ? second : first
      const lines = i % 7 === 3 ? [{ menuItemId: 999, quantity: 1 }] : i % 5 === 4 ? [{ menuItemId: 2, quantity: 13 }] : [{ menuItemId: 3, quantity: 1 }]
      const result = tryOrder(service, { lines, orderType: i % 3 ? 'takeout' : 'local' })
      if (result.ok) ok += 1
    }
    assert.ok(ok >= 25 && ok < 40, `${ok} orders succeeded`)
    assert.deepEqual(fiscalNumbers(db), range(ok), 'numbers 1..N without a gap')
    assert.equal(journal.lastFiscalNumber(other), ok)
    const verification = verifyJournal(other)
    assert.equal(verification.ok, true, JSON.stringify(verification.breaks))
    assert.equal(verification.lastFiscalNumber, ok)
  } finally {
    other.close()
    cleanup()
  }
})

test('the database refuses to delete an order or change its fiscal number', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const created = order(createOrderService({ db, now: fixedNow }))
    assert.throws(() => db.prepare('DELETE FROM orders WHERE id = ?').run(created.orderId), /FISCAL_RECORD_PROTECTED/)
    assert.throws(() => db.prepare('UPDATE orders SET fiscal_number = 42 WHERE id = ?').run(created.orderId), /never changes/)
    assert.throws(() => db.prepare('DELETE FROM order_payments WHERE order_id = ?').run(created.orderId), /never deleted/)
    assert.throws(() => db.prepare('UPDATE order_payments SET amount = 1 WHERE order_id = ?').run(created.orderId), /refund/)
    db.prepare('UPDATE orders SET notes = ? WHERE id = ?').run('allowed: not a fiscal column', created.orderId)
  } finally {
    cleanup()
  }
})

test('receipts print the fiscal number ("N° fiscal 00000001")', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const created = order(createOrderService({ db, now: fixedNow }))
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(created.orderId)
    row.items = db.prepare("SELECT *, item_name AS menu_item_name FROM order_items WHERE order_id = ?").all(created.orderId)
    const ctx = { logoDataUrl: null, paperWidth: '80', receiptFontSize: 'medium' }
    const fr = printDocuments.buildDefaultReceiptHTML(row, { language: 'fr' }, ctx)
    assert.match(fr, /N° fiscal <bdi>00000001<\/bdi>/)
    const ar = printDocuments.buildDefaultReceiptHTML(row, { language: 'ar' }, ctx)
    assert.match(ar, /الرقم الجبائي <bdi>00000001<\/bdi>/)
    const sample = printDocuments.buildDefaultReceiptHTML({ ...row, fiscal_number: null }, { language: 'en' }, ctx)
    assert.doesNotMatch(sample, /Fiscal No\./, 'sample / preview orders print no number')
    setSetting(db, 'language', 'en')
  } finally {
    cleanup()
  }
})
