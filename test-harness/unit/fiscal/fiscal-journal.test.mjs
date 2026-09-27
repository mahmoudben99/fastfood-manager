// v4 fiscal journal: coverage of every order event, the hash chain, tamper detection, the yearly
// archive and the attestation template.
// Run: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings --test test-harness/unit/fiscal/*.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  NOW, buildAttestationHtml, buildYearArchive, createOrderService, dropFiscalTriggers, entries, fixedNow, freshDb,
  getFiscalStatus, getVendorInfo, journal, order, payments, rows, saveVendorInfo, seedMenu, verifyJournal
} from './_fiscal.mjs'

const { entryHash } = await import('../../../src/main/services/fiscal/hash.ts')

/** Order A (Burger x2 + Fries, paid cash) edited, header-edited, cancelled, restored; order B unpaid → paid → refund. */
function scenario() {
  const { db, cleanup } = freshDb()
  seedMenu(db)
  const service = createOrderService({ db, now: fixedNow })
  const a = order(service, { lines: [{ menuItemId: 1, quantity: 2 }, { menuItemId: 2, quantity: 1 }], operator: 'Amel' })
  const items = rows(db, 'SELECT * FROM order_items WHERE order_id = ? ORDER BY id', a.orderId)
  const edit = service.updateOrderLines({
    orderId: a.orderId,
    lines: [{ orderItemId: items[0].id, menuItemId: 1, quantity: 1 }, { menuItemId: 3, quantity: 1 }],
    operator: 'Samir'
  })
  assert.equal(edit.ok, true, edit.message)
  const header = service.updateOrderHeader({ orderId: a.orderId, tableNumber: '7', note: 'no salt', customer: { phone: '0555123456' } })
  assert.equal(header.ok, true, header.message)
  const b = order(service, { payments: [] })
  const ctx = { shiftId: null, operator: 'Amel', now: NOW }
  db.transaction(() => payments.recordPayments(db, b.orderId, [{ method: 'cash' }], ctx))()
  db.transaction(() => payments.recordRefund(db, b.orderId, { method: 'cash', amount: 100, reason: 'cold fries' }, ctx))()
  assert.equal(service.updateOrderStatus(a.orderId, 'cancelled', { operator: 'Manager', reason: 'customer left' }).ok, true)
  assert.equal(service.updateOrderStatus(a.orderId, 'preparing').ok, true)
  assert.equal(service.updateOrderStatus(b.orderId, 'completed').ok, true)
  return { db, cleanup, a, b, items }
}

test('every order event is journaled in the same transaction, in order, with a verifiable chain', () => {
  const { db, cleanup, a, b, items } = scenario()
  try {
    const all = entries(db)
    assert.equal(all[0].event_type, 'journal_open')
    assert.deepEqual(all.filter((e) => e.order_id === a.orderId).map((e) => e.event_type), [
      'create', 'void', 'void', 'refund', 'line_edit', 'header_edit', 'cancel', 'refund', 'restore', 'payment'
    ])
    assert.deepEqual(all.filter((e) => e.order_id === b.orderId).map((e) => e.event_type), ['create', 'payment', 'refund'],
      'completing an order is not a fiscal event')
    assert.ok(all.every((e) => e.fiscal_number === (e.order_id === a.orderId ? 1 : e.order_id === b.orderId ? 2 : null)))

    const create = all.find((e) => e.order_id === a.orderId && e.event_type === 'create').data
    assert.deepEqual(create.state.lines.map((line) => [line.item_name, line.quantity, line.unit_price]), [['Burger', 2, 500], ['Fries', 1, 300]])
    assert.deepEqual(create.state.payments.map((p) => [p.kind, p.amount]), [['payment', 1300]], 'checkout payment is inside the create entry')
    const voids = all.filter((e) => e.event_type === 'void').map((e) => [e.data.line.item_name, e.data.quantity, e.data.amount])
    assert.deepEqual(voids, [['Fries', 1, 300], ['Burger', 1, 500]])
    const lineEdit = all.find((e) => e.event_type === 'line_edit').data
    assert.deepEqual(lineEdit.before.lines.map((line) => line.item_name), ['Burger', 'Fries'], 'removed line kept in the journal')
    assert.deepEqual(lineEdit.state.lines.map((line) => [line.item_name, line.quantity]), [['Burger', 1], ['Soda', 1]])
    assert.equal(lineEdit.operator, 'Samir')
    const archived = rows(db, 'SELECT * FROM order_items_archive WHERE order_id = ?', a.orderId)
    assert.deepEqual(archived.map((row) => [row.order_item_id, JSON.parse(row.row_json).item_name]), [[items[1].id, 'Fries']])

    const headerEdit = all.find((e) => e.event_type === 'header_edit').data
    assert.deepEqual(headerEdit.changes, { table_number: { from: null, to: '7' }, notes: { changed: true }, customer_phone: { changed: true } })
    assert.ok(!all.some((e) => e.payload.includes('0555123456') || e.payload.includes('no salt')), 'personal data never enters the journal')
    const cancel = all.find((e) => e.event_type === 'cancel').data
    assert.deepEqual([cancel.from, cancel.operator, cancel.reason], ['preparing', 'Manager', 'customer left'])
    const refund = all.find((e) => e.order_id === b.orderId && e.event_type === 'refund').data.payment
    assert.deepEqual([refund.amount, refund.reason, refund.operator], [-100, 'cold fries', 'Amel'])

    for (let i = 1; i < all.length; i++) assert.equal(all[i].prev_hash, all[i - 1].hash)
    const verification = verifyJournal(db, NOW)
    assert.equal(verification.ok, true, JSON.stringify(verification.breaks))
    assert.deepEqual([verification.events, verification.ordersChecked, verification.lastFiscalNumber], [all.length, 2, 2])
    const status = getFiscalStatus(db)
    assert.deepEqual([status.lastFiscalNumber, status.journalEvents, status.years], [2, all.length, [2026]])
    assert.equal(status.lastVerification.ok, true)
  } finally {
    cleanup()
  }
})

test('the database refuses to change, delete or skip journal entries', () => {
  const { db, cleanup } = scenario()
  try {
    assert.throws(() => db.exec("UPDATE fiscal_journal SET payload = '{}' WHERE seq = 2"), /APPEND_ONLY/)
    assert.throws(() => db.exec('DELETE FROM fiscal_journal WHERE seq = 2'), /APPEND_ONLY/)
    assert.throws(() => db.prepare(
      "INSERT INTO fiscal_journal (seq, created_at, event_type, payload, prev_hash, hash) VALUES (999, 'x', 'create', '{}', 'x', 'y')"
    ).run(), /contiguous/)
    assert.ok(verifyJournal(db).ok)
  } finally {
    cleanup()
  }
})

test('tampering is detected: edited entry, re-hashed entry, removed entry, truncated tail', () => {
  const edited = scenario()
  try {
    dropFiscalTriggers(edited.db)
    edited.db.exec(`UPDATE fiscal_journal SET payload = replace(payload, '"quantity":2', '"quantity":1')
                    WHERE event_type = 'create' AND order_id = ${edited.a.orderId}`)
    const result = verifyJournal(edited.db)
    assert.equal(result.ok, false)
    assert.deepEqual(result.breaks.map((b) => b.kind), ['hash_mismatch'])
  } finally {
    edited.cleanup()
  }

  const rehashed = scenario()
  try {
    dropFiscalTriggers(rehashed.db)
    const row = rehashed.db.prepare("SELECT * FROM fiscal_journal WHERE event_type = 'refund' ORDER BY seq LIMIT 1").get()
    const payload = row.payload.replace('-650', '-50')
    rehashed.db.prepare('UPDATE fiscal_journal SET payload = ?, hash = ? WHERE seq = ?').run(payload, entryHash({ ...row, payload }), row.seq)
    const result = verifyJournal(rehashed.db)
    assert.ok(result.breaks.some((b) => b.kind === 'chain_broken' && b.seq === row.seq + 1), JSON.stringify(result.breaks))
  } finally {
    rehashed.cleanup()
  }

  const removed = scenario()
  try {
    dropFiscalTriggers(removed.db)
    removed.db.exec("DELETE FROM fiscal_journal WHERE seq = (SELECT seq FROM fiscal_journal WHERE event_type = 'header_edit')")
    const kinds = verifyJournal(removed.db).breaks.map((b) => b.kind)
    assert.ok(kinds.includes('sequence_gap') && kinds.includes('chain_broken'), kinds.join())
  } finally {
    removed.cleanup()
  }

  const truncated = scenario()
  try {
    dropFiscalTriggers(truncated.db)
    truncated.db.exec('DELETE FROM fiscal_journal WHERE seq > (SELECT MAX(seq) - 2 FROM fiscal_journal)')
    const kinds = verifyJournal(truncated.db).breaks.map((b) => b.kind)
    assert.ok(kinds.includes('head_mismatch') && kinds.includes('order_altered'), kinds.join())
  } finally {
    truncated.cleanup()
  }
})

test('orders changed or deleted outside the software no longer match the journal', () => {
  const priced = scenario()
  try {
    priced.db.exec(`UPDATE order_items SET unit_price = 1, total_price = 1 WHERE order_id = ${priced.a.orderId} AND item_name = 'Burger'`)
    const result = verifyJournal(priced.db)
    assert.deepEqual(result.breaks.map((b) => [b.kind, b.orderId]), [['order_altered', priced.a.orderId]])
  } finally {
    priced.cleanup()
  }

  const paid = scenario()
  try {
    paid.db.prepare(
      "INSERT INTO order_payments (order_id, kind, method, amount, created_at) VALUES (?, 'payment', 'cash', 99, '2026-09-27T10:00:00Z')"
    ).run(paid.b.orderId)
    assert.deepEqual(verifyJournal(paid.db).breaks.map((b) => [b.kind, b.orderId]), [['order_altered', paid.b.orderId]])
  } finally {
    paid.cleanup()
  }

  const deleted = scenario()
  try {
    dropFiscalTriggers(deleted.db)
    deleted.db.pragma('foreign_keys = OFF')
    deleted.db.exec(`DELETE FROM orders WHERE id = ${deleted.b.orderId}`)
    const kinds = verifyJournal(deleted.db).breaks.map((b) => b.kind)
    assert.ok(kinds.includes('order_deleted') && kinds.includes('fiscal_gap'), kinds.join())
  } finally {
    deleted.cleanup()
  }
})

test('yearly archive: JSON + CSV + manifest with SHA-256, removed lines, no personal data', () => {
  const { db, cleanup, a } = scenario()
  try {
    const verification = verifyJournal(db, NOW)
    const { files, summary } = buildYearArchive(db, 2026, { software: 'Fast Food Manager', version: '4.0.0', exportedAt: NOW, verification })
    assert.deepEqual(Object.keys(files).sort(), [
      'LISEZMOI.txt', 'journal.csv', 'journal.json', 'manifest.json', 'order_lines.csv', 'orders.csv', 'orders.json', 'payments.csv'
    ])
    const manifest = JSON.parse(files['manifest.json'])
    for (const [name, hash] of Object.entries(manifest.files)) {
      assert.equal(createHash('sha256').update(files[name], 'utf8').digest('hex'), hash, name)
    }
    assert.deepEqual(manifest.fiscal_numbers, { first: 1, last: 2 })
    assert.equal(manifest.keep_until, '2032-12-31')
    assert.equal(manifest.verification.ok, true)
    assert.equal(summary.orders, 2)
    assert.equal(summary.journalEvents, entries(db).length)
    const orders = JSON.parse(files['orders.json']).orders
    assert.deepEqual(orders.find((o) => o.id === a.orderId).removed_lines.map((line) => line.row_json.item_name), ['Fries'])
    assert.equal(files['orders.csv'].split('\r\n').filter(Boolean).length, 3)
    assert.ok(files['orders.csv'].startsWith('﻿fiscal_number,'))
    assert.ok(!Object.values(files).some((text) => text.includes('0555123456')), 'no customer phone in the archive')
    assert.deepEqual(buildYearArchive(db, 2019, { software: 'x', version: '1', exportedAt: NOW, verification: null }).summary.orders, 0)
  } finally {
    cleanup()
  }
})

test('attestation template (FR / AR) is clearly a model and shows vendor + journal state', () => {
  const { db, cleanup } = scenario()
  try {
    const vendor = saveVendorInfo(db, { vendor_name: 'SARL Ember Soft', vendor_nif: '000016001234567', software_version: '4.0.0' }, '4.0.0')
    assert.equal(getVendorInfo(db, '9.9.9').software_version, '4.0.0')
    assert.equal(vendor.software_name, 'Fast Food Manager')
    const base = {
      vendor,
      restaurant: { name: 'La Zone', legal_name: '', nif: '', nis: '', rc: '', ai: '', address: 'Alger' },
      journal: { events: 12, lastFiscalNumber: 2, headHash: 'ab'.repeat(32), verifiedOk: true, verifiedAt: NOW.toISOString() },
      generatedAt: NOW
    }
    const fr = buildAttestationHtml({ ...base, lang: 'fr' })
    assert.match(fr, /MODÈLE DE DOCUMENT/)
    assert.match(fr, /professionnel du droit/)
    assert.match(fr, /SARL Ember Soft/)
    assert.match(fr, /\[à compléter\]/)
    assert.match(fr, /00000002/)
    assert.match(fr, /dir="ltr"/)
    const ar = buildAttestationHtml({ ...base, lang: 'ar' })
    assert.match(ar, /dir="rtl"/)
    assert.match(ar, /نموذج وثيقة/)
    assert.match(ar, /مختص في القانون/)
    assert.ok(!/<script/i.test(fr + ar))
    assert.equal(journal.fiscalReady(db), true)
  } finally {
    cleanup()
  }
})
