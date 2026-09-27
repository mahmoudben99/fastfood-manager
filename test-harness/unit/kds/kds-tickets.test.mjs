// v4 KDS: ticket model driven by the real order service (Electron-as-node, real SQLite).
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/kds/*.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { freshDb, seedKitchen, load, runMigrations, ticketsOf, itemsOf, ticketAt, flushEvents } from './_setup.mjs'

const { createOrderService } = await load('main/services/order-service.ts')
const { runKdsAction } = await load('main/services/kds/kds-actions.ts')
const { buildKdsSnapshot, buildBoardState, readyOrderIds } = await load('main/services/kds/kds-query.ts')
const { healKdsTickets, syncKdsOrder } = await load('main/services/kds/kds-sync.ts')
const { kdsEvents } = await load('main/services/kds/kds-events.ts')

const T0 = new Date('2026-09-27T10:00:00.000Z')
const at = (seconds) => new Date(T0.getTime() + seconds * 1000)

function createOrder(service, lines, extra = {}) {
  const result = service.createOrder({
    source: 'pos',
    sourceRequestId: randomUUID(),
    orderType: 'local',
    tableNumber: '4',
    lines,
    applyAutoPromotions: false,
    ...extra
  })
  assert.equal(result.ok, true, result.message)
  return result.orderId
}

const lineIds = (db, orderId) =>
  db.prepare('SELECT id, menu_item_id FROM order_items WHERE order_id = ? ORDER BY id').all(orderId)

test('order create: one ticket per station, unassigned lines on the expo station, timer = order time', () => {
  const { db, cleanup } = freshDb()
  try {
    seedKitchen(db)
    const service = createOrderService({ db, now: () => T0 })
    const orderId = createOrder(service, [
      { menuItemId: 1, quantity: 2, note: 'no onions' },
      { menuItemId: 2, quantity: 1 },
      { menuItemId: 3, quantity: 1 }
    ])
    const tickets = ticketsOf(db, orderId)
    assert.deepEqual(tickets.map((t) => [t.station_id, t.status]), [[0, 'new'], [1, 'new'], [2, 'new']])
    assert.ok(tickets.every((t) => t.created_at === T0.toISOString() && t.change_kind === null))
    const grill = itemsOf(db, ticketAt(db, orderId, 1).id)
    assert.deepEqual(grill.map((i) => [i.name, i.name_ar, i.quantity, i.notes, i.change_kind]),
      [['Classic Burger', 'برغر', 2, 'no onions', null]])
    assert.equal(itemsOf(db, ticketAt(db, orderId, 0).id)[0].name, 'Ice Cream')
  } finally { cleanup() }
})

test('transitions: start → line done → bump (ready) → bump (bumped), with timestamps; order readiness', () => {
  const { db, cleanup } = freshDb()
  try {
    seedKitchen(db)
    const service = createOrderService({ db, now: () => T0 })
    const orderId = createOrder(service, [{ menuItemId: 1, quantity: 1 }, { menuItemId: 2, quantity: 1 }])
    const grill = ticketAt(db, orderId, 1)
    const drinks = ticketAt(db, orderId, 2)

    assert.equal(runKdsAction(db, { type: 'start', ticketId: grill.id }, at(30)).ok, true)
    let row = ticketAt(db, orderId, 1)
    assert.equal(row.status, 'in_progress')
    assert.equal(row.started_at, at(30).toISOString())

    const drinkItem = itemsOf(db, drinks.id)[0]
    assert.equal(runKdsAction(db, { type: 'line-done', itemId: drinkItem.id, done: true }, at(40)).ok, true)
    assert.equal(itemsOf(db, drinks.id)[0].done_at, at(40).toISOString())
    assert.equal(ticketAt(db, orderId, 2).status, 'in_progress', 'first done line starts a new ticket')

    assert.equal(runKdsAction(db, { type: 'bump', ticketId: grill.id }, at(60)).ok, true)
    row = ticketAt(db, orderId, 1)
    assert.deepEqual([row.status, row.ready_at, row.closed_by], ['ready', at(60).toISOString(), 'kds'])
    assert.deepEqual(readyOrderIds(db, at(60)), [], 'drinks still open → order not ready')

    runKdsAction(db, { type: 'bump', ticketId: drinks.id }, at(70))
    assert.deepEqual(readyOrderIds(db, at(70)), [orderId])

    runKdsAction(db, { type: 'bump', ticketId: grill.id }, at(80))
    row = ticketAt(db, orderId, 1)
    assert.deepEqual([row.status, row.bumped_at], ['bumped', at(80).toISOString()])

    assert.deepEqual(runKdsAction(db, { type: 'start', ticketId: grill.id }, at(90)), { ok: false, error: 'not_active' })
    assert.equal(runKdsAction(db, { type: 'bump', ticketId: 9999 }).ok, false)
  } finally { cleanup() }
})

test('recall keeps the original timer; recall-last picks the latest; expo bump/recall restores per-ticket state', () => {
  const { db, cleanup } = freshDb()
  try {
    seedKitchen(db)
    const service = createOrderService({ db, now: () => T0 })
    const first = createOrder(service, [{ menuItemId: 1, quantity: 1 }])
    const second = createOrder(service, [{ menuItemId: 1, quantity: 3 }, { menuItemId: 2, quantity: 1 }])
    const a = ticketAt(db, first, 1)
    const b = ticketAt(db, second, 1)

    runKdsAction(db, { type: 'start', ticketId: a.id }, at(10))
    runKdsAction(db, { type: 'bump', ticketId: a.id }, at(20))
    runKdsAction(db, { type: 'bump', ticketId: b.id }, at(30))
    assert.equal(buildKdsSnapshot(db, 1, at(31)).canRecall, true)

    assert.equal(runKdsAction(db, { type: 'recall-last', station: 1 }, at(40)).ok, true)
    const recalled = ticketAt(db, second, 1)
    assert.deepEqual([recalled.status, recalled.ready_at, recalled.recalled_at, recalled.created_at],
      ['new', null, at(40).toISOString(), T0.toISOString()])

    assert.equal(runKdsAction(db, { type: 'recall', ticketId: a.id }, at(50)).ok, true)
    assert.equal(ticketAt(db, first, 1).status, 'in_progress', 'a started ticket comes back as in progress')

    // Expo: drinks ready, grill still cooking → one tap serves both; undo restores each state.
    const drinks = ticketAt(db, second, 2)
    runKdsAction(db, { type: 'bump', ticketId: drinks.id }, at(60))
    assert.equal(runKdsAction(db, { type: 'bump-order', orderId: second }, at(70)).ok, true)
    assert.deepEqual(ticketsOf(db, second).map((t) => t.status), ['bumped', 'bumped'])
    assert.equal(runKdsAction(db, { type: 'recall-order', orderId: second }, at(75)).ok, true)
    assert.deepEqual(ticketsOf(db, second).map((t) => [t.station_id, t.status]), [[1, 'new'], [2, 'ready']])
    assert.deepEqual(runKdsAction(db, { type: 'recall-last', station: 2 }, at(80)).ok, true)
  } finally { cleanup() }
})

test('order edit: CHANGED / ADDED / REMOVED marks, emptied station flashes cancelled, header change flags UPDATED', () => {
  const { db, cleanup } = freshDb()
  try {
    seedKitchen(db)
    const service = createOrderService({ db, now: () => T0 })
    const orderId = createOrder(service, [{ menuItemId: 1, quantity: 1 }, { menuItemId: 2, quantity: 1 }])
    const [burger] = lineIds(db, orderId)
    const edited = service.updateOrderLines({
      orderId,
      lines: [{ orderItemId: burger.id, menuItemId: 1, quantity: 2 }, { menuItemId: 4, quantity: 1 }],
      header: { note: 'allergy: sesame' }
    })
    assert.equal(edited.ok, true, edited.message)

    const grill = ticketAt(db, orderId, 1)
    assert.equal(grill.change_kind, 'updated')
    assert.deepEqual(itemsOf(db, grill.id).map((i) => [i.name, i.quantity, i.previous_quantity, i.change_kind]), [
      ['Classic Burger', 2, 1, 'changed'],
      ['Fries', 1, null, 'added']
    ])
    const drinks = ticketAt(db, orderId, 2)
    assert.deepEqual([drinks.status, drinks.change_kind], ['cancelled', 'cancelled'])
    assert.equal(itemsOf(db, drinks.id)[0].change_kind, 'removed', 'the removed line stays visible, struck through')

    // A finished station that receives new work reopens with ONLY the new marks.
    runKdsAction(db, { type: 'bump', ticketId: grill.id })
    const current = lineIds(db, orderId)
    service.updateOrderLines({
      orderId,
      lines: [...current.map((l) => ({ orderItemId: l.id, menuItemId: l.menu_item_id, quantity: l.menu_item_id === 1 ? 2 : 1 })),
        { menuItemId: 1, quantity: 1, note: 'well done' }]
    })
    const reopened = ticketAt(db, orderId, 1)
    assert.deepEqual([reopened.status, reopened.ready_at, reopened.change_kind], ['new', null, 'updated'])
    assert.deepEqual(itemsOf(db, reopened.id).map((i) => i.change_kind), [null, null, 'added'])

    // Header-only change (table) marks the open ticket UPDATED without touching lines.
    runKdsAction(db, { type: 'start', ticketId: reopened.id })
    db.prepare("UPDATE kds_tickets SET change_kind = NULL WHERE id = ?").run(reopened.id)
    assert.equal(service.updateOrderHeader({ orderId, tableNumber: '9' }).ok, true)
    assert.equal(ticketAt(db, orderId, 1).change_kind, 'updated')
    assert.equal(buildKdsSnapshot(db, 1, at(100)).cards[0].tableNumber, '9')
  } finally { cleanup() }
})

test('cancelled orders flash then disappear; restoring brings the tickets back', () => {
  const { db, cleanup } = freshDb()
  try {
    seedKitchen(db)
    // Real clock: the in-transaction sync stamps cancelled_at with the wall clock.
    const service = createOrderService({ db })
    const orderId = createOrder(service, [{ menuItemId: 1, quantity: 1 }, { menuItemId: 3, quantity: 1 }])
    runKdsAction(db, { type: 'start', ticketId: ticketAt(db, orderId, 1).id })
    assert.equal(service.updateOrderStatus(orderId, 'cancelled').ok, true)
    const cancelled = ticketsOf(db, orderId)
    assert.ok(cancelled.every((t) => t.status === 'cancelled' && t.cancelled_at && t.change_kind === 'cancelled'))

    const cancelledAt = new Date(cancelled[0].cancelled_at)
    const during = buildKdsSnapshot(db, 'all', new Date(cancelledAt.getTime() + 2000))
    assert.equal(during.cards.length, 1)
    assert.equal(during.cards[0].status, 'cancelled')
    assert.equal(buildKdsSnapshot(db, 'all', new Date(cancelledAt.getTime() + 60_000)).cards.length, 0)

    assert.equal(service.updateOrderStatus(orderId, 'preparing').ok, true)
    assert.deepEqual(ticketsOf(db, orderId).map((t) => [t.station_id, t.status, t.change_kind, t.cancelled_at]),
      [[0, 'new', 'restored', null], [1, 'in_progress', 'restored', null]])
  } finally { cleanup() }
})

test('POS completion closes open tickets; the customer board shows the number as ready, then clears it', () => {
  const { db, cleanup } = freshDb()
  try {
    seedKitchen(db)
    const service = createOrderService({ db, now: () => T0 })
    const cooking = createOrder(service, [{ menuItemId: 1, quantity: 1 }])
    const served = createOrder(service, [{ menuItemId: 2, quantity: 1 }])
    const board = buildBoardState(db, at(1))
    assert.deepEqual(board.preparing.map((e) => e.number), [1, 2])

    runKdsAction(db, { type: 'bump', ticketId: ticketAt(db, cooking, 1).id }, at(60))
    const ready = buildBoardState(db, at(61))
    assert.deepEqual([ready.preparing.map((e) => e.number), ready.ready.map((e) => e.number)], [[2], [1]])
    assert.equal(buildBoardState(db, at(60 + 5 * 60 + 1)).ready.length, 0, 'cleared after ready_board_clear_minutes')

    assert.equal(service.updateOrderStatus(served, 'completed').ok, true)
    const closed = ticketAt(db, served, 2)
    assert.deepEqual([closed.status, closed.closed_by], ['bumped', 'pos'])
    assert.equal(service.updateOrderStatus(served, 'preparing').ok, true)
    assert.deepEqual([ticketAt(db, served, 2).status, ticketAt(db, served, 2).change_kind], ['new', 'restored'])
  } finally { cleanup() }
})

test('snapshot: expo view groups stations per order, station view filters, all-day totals what is left', () => {
  const { db, cleanup } = freshDb()
  try {
    seedKitchen(db)
    const service = createOrderService({ db, now: () => T0 })
    const one = createOrder(service, [{ menuItemId: 1, quantity: 2 }, { menuItemId: 2, quantity: 1 }])
    createOrder(service, [{ menuItemId: 1, quantity: 3 }, { menuItemId: 3, quantity: 1 }])
    const expo = buildKdsSnapshot(db, 'all', at(5))
    assert.deepEqual(expo.cards.map((c) => c.key), [`o${one}`, `o${one + 1}`])
    assert.deepEqual(expo.cards[0].tickets.map((t) => t.stationName), ['Drinks', 'Grill'])
    assert.deepEqual(expo.cards[1].tickets.map((t) => t.stationId), [1, 0], 'expo/unassigned group is listed last')
    assert.deepEqual(expo.allDay.map((r) => [r.name, r.quantity]), [['Classic Burger', 5], ['Ice Cream', 1], ['Soda', 1]])

    runKdsAction(db, { type: 'line-done', itemId: itemsOf(db, ticketAt(db, one, 1).id)[0].id, done: true })
    const grill = buildKdsSnapshot(db, 1, at(6))
    assert.deepEqual(grill.cards.map((c) => c.key.startsWith('t')), [true, true])
    assert.deepEqual(grill.allDay.map((r) => [r.name, r.quantity]), [['Classic Burger', 3]])
    assert.deepEqual(grill.stations.map((s) => s.id), [2, 1, 0])
    assert.deepEqual(grill.settings, { warnMinutes: 5, lateMinutes: 8, sound: true, flash: true, boardClearMinutes: 5 })
  } finally { cleanup() }
})

test('paper skip: a screen station gets no automatic kitchen slip; manual prints and other stations unchanged', async () => {
  const { planPrintJobs, loadRoutingConfig } = await load('main/services/print-routing.ts')
  const { db, cleanup } = freshDb()
  try {
    seedKitchen(db)
    const insert = db.prepare(
      `INSERT INTO printer_assignments (printer_name, assignment_type, worker_id, is_active, auto_print) VALUES (?, ?, ?, 1, 1)`
    )
    insert.run('KITCHEN', 'kitchen_all', null)
    insert.run('GRILL', 'worker', 1)
    insert.run('BAR', 'worker', 2)
    db.exec(`INSERT OR REPLACE INTO settings (key, value) VALUES
      ('split_kitchen_tickets', 'true'), ('auto_print_receipt', 'false'), ('auto_print_kitchen', 'true'),
      ('kds_replaces_paper_1', 'true')`)
    const service = createOrderService({ db, now: () => T0 })
    const orderId = createOrder(service, [{ menuItemId: 1, quantity: 1 }, { menuItemId: 2, quantity: 1 }])
    const jobs = db.prepare('SELECT scope, worker_id, printer_name FROM print_jobs WHERE order_id = ? ORDER BY id').all(orderId)
    assert.deepEqual(jobs.map((j) => `${j.scope}/${j.worker_id ?? '-'}@${j.printer_name}`).sort(), ['all/-@KITCHEN', 'worker/2@BAR'])
    assert.equal(ticketsOf(db, orderId).length, 2, 'the screen still gets both tickets')

    const plan = (manual) => planPrintJobs({
      config: loadRoutingConfig(db), split: true, autoReceipt: false, autoKitchen: true,
      workerIds: [1, 2], includeReceipt: false, includeKitchen: true, manual
    }).map((j) => `${j.scope}/${j.workerId ?? '-'}`).sort()
    assert.deepEqual(plan(true), ['all/-', 'worker/1', 'worker/2'], 'manual reprints ignore the screen setting')
    db.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('kds_replaces_paper_expo', 'true')")
    assert.deepEqual(plan(false), ['worker/2'], 'expo on screen drops the full ticket too')
  } finally { cleanup() }
})

test('migration 024 upgrades an older database; tickets are rebuilt for orders already in the kitchen', () => {
  const { db, cleanup } = freshDb()
  try {
    seedKitchen(db)
    db.exec('DROP TABLE kds_ticket_items; DROP TABLE kds_tickets; DELETE FROM _migrations WHERE version = 24')
    const service = createOrderService({ db, now: () => new Date() })
    const originalError = console.error
    console.error = () => {}
    let orderId
    try {
      orderId = createOrder(service, [{ menuItemId: 1, quantity: 1 }])
    } finally { console.error = originalError }
    assert.ok(db.prepare('SELECT 1 FROM orders WHERE id = ?').get(orderId), 'a KDS failure never loses the order')

    runMigrations(db)
    assert.ok(db.prepare('SELECT 1 FROM _migrations WHERE version = 24').get())
    const columns = db.prepare('PRAGMA table_info(kds_ticket_items)').all().map((c) => c.name)
    assert.ok(['combo_name', 'modifiers', 'done_at', 'change_kind'].every((c) => columns.includes(c)))
    assert.deepEqual(healKdsTickets(db), [orderId])
    assert.deepEqual(ticketsOf(db, orderId).map((t) => [t.station_id, t.status, t.change_kind]), [[1, 'new', null]])
    assert.deepEqual(healKdsTickets(db), [], 'idempotent')
  } finally { cleanup() }
})

test('v4-catalog lines: combo containers skipped, children carry the combo name, modifiers snapshotted', () => {
  const { db, cleanup } = freshDb()
  try {
    seedKitchen(db)
    // Migration 021 (v4-catalog) creates these; only simulate them on a schema that predates it.
    const lineColumns = db.prepare('PRAGMA table_info(order_items)').all().map((c) => c.name)
    if (!lineColumns.includes('parent_order_item_id')) {
      db.exec(`ALTER TABLE order_items ADD COLUMN parent_order_item_id INTEGER;
        ALTER TABLE order_items ADD COLUMN line_kind TEXT NOT NULL DEFAULT 'item';
        CREATE TABLE order_item_modifiers (id INTEGER PRIMARY KEY, order_item_id INTEGER NOT NULL, name TEXT NOT NULL,
          name_ar TEXT, name_fr TEXT, kind TEXT NOT NULL DEFAULT 'none', quantity INTEGER, sort_order INTEGER, created_at TEXT)`)
    }
    db.exec("INSERT INTO menu_items (id, name, price, category_id, is_active) VALUES (9, 'Menu Maxi', 900, 1, 1)")
    const service = createOrderService({ db, now: () => T0 })
    const orderId = createOrder(service, [{ menuItemId: 9, quantity: 1 }, { menuItemId: 1, quantity: 1 }, { menuItemId: 2, quantity: 1 }])
    const [combo, burger, soda] = lineIds(db, orderId)
    db.prepare("UPDATE order_items SET line_kind = 'combo', worker_id = NULL WHERE id = ?").run(combo.id)
    db.prepare("UPDATE order_items SET line_kind = 'combo_child', parent_order_item_id = ? WHERE id IN (?, ?)").run(combo.id, burger.id, soda.id)
    db.prepare("INSERT INTO order_item_modifiers (order_item_id, name, kind, quantity, sort_order) VALUES (?, 'onions', 'no', 1, 1), (?, 'Cheese', 'extra', 2, 2)")
      .run(burger.id, burger.id)
    // Rebuild as the catalog's order creation would have produced it.
    db.prepare('DELETE FROM kds_tickets WHERE order_id = ?').run(orderId)
    syncKdsOrder(db, orderId, { now: at(5) })

    assert.deepEqual(ticketsOf(db, orderId).map((t) => t.station_id), [1, 2], 'the combo container is not a cookable line')
    const [item] = itemsOf(db, ticketAt(db, orderId, 1).id)
    assert.deepEqual([item.name, item.combo_name, item.parent_order_item_id, item.change_kind],
      ['Classic Burger', 'Menu Maxi', combo.id, null])
    assert.deepEqual(JSON.parse(item.modifiers).map((m) => [m.name, m.kind, m.quantity]), [['onions', 'no', 1], ['Cheese', 'extra', 2]])
    const card = buildKdsSnapshot(db, 1, at(6)).cards[0]
    assert.equal(card.tickets[0].items[0].comboName, 'Menu Maxi')
  } finally { cleanup() }
})

test('events: changed fires after the order commits, ready fires when the last station finishes', async () => {
  const { db, cleanup } = freshDb()
  const changed = []
  const ready = []
  const onChanged = (event) => changed.push(event)
  const onReady = (event) => ready.push(event)
  kdsEvents.on('changed', onChanged)
  kdsEvents.on('ready', onReady)
  try {
    seedKitchen(db)
    const service = createOrderService({ db, now: () => T0 })
    const orderId = createOrder(service, [{ menuItemId: 1, quantity: 1 }])
    assert.equal(changed.length, 0, 'nothing is emitted inside the transaction')
    await flushEvents()
    assert.deepEqual(changed.at(-1), { orderIds: [orderId] })

    runKdsAction(db, { type: 'bump', ticketId: ticketAt(db, orderId, 1).id })
    await flushEvents()
    assert.deepEqual(ready, [{ orderId, dailyNumber: 1, ready: true }])
    runKdsAction(db, { type: 'recall', ticketId: ticketAt(db, orderId, 1).id })
    await flushEvents()
    assert.deepEqual(ready.at(-1), { orderId, dailyNumber: 1, ready: false })
  } finally {
    kdsEvents.off('changed', onChanged)
    kdsEvents.off('ready', onReady)
    cleanup()
  }
})

test('repair pass: a no-op for orders in step, fixes tickets a swallowed sync left stale', () => {
  const { db, cleanup } = freshDb()
  try {
    seedKitchen(db)
    const service = createOrderService({ db })
    const orderId = createOrder(service, [{ menuItemId: 1, quantity: 1 }, { menuItemId: 2, quantity: 1 }])
    const before = JSON.stringify(ticketsOf(db, orderId))
    assert.deepEqual(healKdsTickets(db), [])
    assert.equal(JSON.stringify(ticketsOf(db, orderId)), before, 'nothing rewritten')

    db.prepare('UPDATE order_items SET quantity = 3 WHERE order_id = ? AND menu_item_id = 1').run(orderId)
    assert.deepEqual(healKdsTickets(db), [orderId])
    const [burger] = itemsOf(db, ticketAt(db, orderId, 1).id)
    assert.deepEqual([burger.quantity, burger.previous_quantity, burger.change_kind], [3, 1, 'changed'])
    assert.deepEqual(healKdsTickets(db), [])
  } finally { cleanup() }
})
