import assert from 'node:assert/strict'
import test from 'node:test'
import {
  changesForTicket,
  diffKitchenLines,
  fallbackPrinter,
  planPrintJobs,
  targetPrinters
} from '../../src/main/services/print-routing.ts'

const row = (printer_name, assignment_type, worker_id = null, auto_print = 1) =>
  ({ printer_name, assignment_type, worker_id, auto_print })

const config = (assignments, extra = {}) => ({
  assignments,
  workerPrinters: {},
  receiptPrinter: '',
  kitchenPrinter: '',
  ...extra
})

const plan = (cfg, overrides = {}) =>
  planPrintJobs({
    config: cfg,
    split: true,
    autoReceipt: false,
    autoKitchen: false,
    workerIds: [],
    includeReceipt: true,
    includeKitchen: true,
    ...overrides
  })

const summary = (jobs) =>
  jobs.map((j) => `${j.documentType}/${j.scope}/${j.workerId ?? '-'}@${j.printerName ?? 'null'}`).sort()

test('a task ticked on two printers prints on both, each with its own auto-print flag', () => {
  const cfg = config([
    row('Counter', 'receipt'),
    row('Bar', 'receipt'),
    row('Grill', 'worker', 1, 1),
    row('Backup', 'worker', 1, 0)
  ])
  assert.deepEqual(summary(plan(cfg, { workerIds: [1] })), [
    'kitchen/worker/1@Grill',
    'receipt/all/-@Bar',
    'receipt/all/-@Counter'
  ])
  // Manual prints ignore auto flags: every ticked printer prints.
  assert.deepEqual(summary(plan(cfg, { workerIds: [1], includeReceipt: false, manual: true })), [
    'kitchen/worker/1@Backup',
    'kitchen/worker/1@Grill'
  ])
  assert.deepEqual(targetPrinters(cfg, { documentType: 'kitchen', scope: 'worker', workerId: 1 }), ['Grill', 'Backup'])
})

test('split mode still sends the full ticket to "All Items" printers; uncovered groups ride on it', () => {
  const cfg = config([row('Kitchen', 'kitchen_all'), row('Grill', 'worker', 1)])
  assert.deepEqual(summary(plan(cfg, { workerIds: [1, 2, null], includeReceipt: false })), [
    'kitchen/all/-@Kitchen',
    'kitchen/worker/1@Grill'
  ])
})

test('without an "All Items" printer, unassigned and printer-less stations use the legacy kitchen printer', () => {
  const cfg = config([row('Grill', 'worker', 1)], { kitchenPrinter: 'Grill' })
  assert.deepEqual(summary(plan(cfg, { workerIds: [1, 2, null], includeReceipt: false, autoKitchen: true })), [
    'kitchen/unassigned/-@Grill',
    'kitchen/worker/1@Grill',
    'kitchen/worker/2@Grill'
  ])
})

test('a task-less printer is a fallback only when it is the only printer', () => {
  const office = config([row('Office', 'default'), row('Kitchen', 'worker', 1)], { receiptPrinter: 'Office', kitchenPrinter: 'Office' })
  assert.equal(fallbackPrinter(office), null)
  assert.deepEqual(targetPrinters(office, { documentType: 'receipt', scope: 'all', workerId: null }), [])
  assert.deepEqual(targetPrinters(office, { documentType: 'kitchen', scope: 'worker', workerId: 2 }), [])

  const single = config([row('Only', 'default')])
  assert.equal(fallbackPrinter(single), 'Only')
  assert.deepEqual(targetPrinters(single, { documentType: 'receipt', scope: 'all', workerId: null }), ['Only'])
  assert.deepEqual(targetPrinters(single, { documentType: 'kitchen', scope: 'worker', workerId: 7 }), ['Only'])
  // Auto-print for the single printer still follows the legacy settings, as before.
  assert.deepEqual(summary(plan(single, { split: false, autoReceipt: true, autoKitchen: false })), ['receipt/all/-@Only'])
})

test('legacy installs without assignment rows keep routing through settings and workers.printer_name', () => {
  const legacy = config([], { receiptPrinter: 'EPSON', kitchenPrinter: 'Kitchen', workerPrinters: { 3: 'Pizza' } })
  assert.deepEqual(summary(plan(legacy, { workerIds: [3, null], autoReceipt: true, autoKitchen: true })), [
    'kitchen/unassigned/-@Kitchen',
    'kitchen/worker/3@Pizza',
    'receipt/all/-@EPSON'
  ])
  // Nothing configured at all: the job is still enqueued (fails visibly when printing).
  assert.deepEqual(summary(plan(config([]), { split: false, autoReceipt: true, autoKitchen: true })), [
    'kitchen/all/-@null',
    'receipt/all/-@null'
  ])
})

test('diffKitchenLines marks added, removed, quantity/note changes and station moves', () => {
  const before = [
    { id: 1, menu_item_id: 10, quantity: 1, notes: null, worker_id: 1 },
    { id: 2, menu_item_id: 11, quantity: 2, notes: null, worker_id: 2 },
    { id: 3, menu_item_id: 12, quantity: 1, notes: 'no salt', worker_id: 1 },
    { id: 4, menu_item_id: 13, quantity: 1, notes: null, worker_id: 1 }
  ]
  const after = [
    { id: 1, menu_item_id: 10, quantity: 3, notes: null, worker_id: 1 },
    { id: 3, menu_item_id: 12, quantity: 1, notes: 'extra salt', worker_id: 1 },
    { id: 4, menu_item_id: 13, quantity: 1, notes: null, worker_id: 2 },
    { id: 5, menu_item_id: 14, quantity: 1, notes: null, worker_id: null }
  ]
  const changes = diffKitchenLines(before, after)
  const brief = changes.map((c) => `${c.kind}:${c.orderItemId}@${c.workerId}`).sort()
  assert.deepEqual(brief, ['added:4@2', 'added:5@null', 'changed:1@1', 'changed:3@1', 'removed:2@2', 'removed:4@1'])
  assert.equal(changes.find((c) => c.orderItemId === 1).previousQuantity, 1)
  assert.equal(changes.find((c) => c.orderItemId === 3).noteChanged, true)

  // Station 2 lost its only original line: it must still see the removal (and the moved-in line).
  assert.deepEqual(changesForTicket(changes, 'worker', 2).map((c) => `${c.kind}:${c.orderItemId}`).sort(), ['added:4', 'removed:2'])
  assert.deepEqual(changesForTicket(changes, 'unassigned', null).map((c) => c.orderItemId), [5])
  // On the full ticket a station move is not news.
  assert.deepEqual(changesForTicket(changes, 'all', null).map((c) => c.orderItemId).sort(), [1, 2, 3, 5])
})
