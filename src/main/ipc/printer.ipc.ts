import { ipcMain, BrowserWindow } from 'electron'
import { settingsRepo } from '../database/repositories/settings.repo'
import { ordersRepo } from '../database/repositories/orders.repo'
import { printerAssignmentsRepo } from '../database/repositories/printer-assignments.repo'
import { workersRepo } from '../database/repositories/workers.repo'
import { getDb } from '../database/connection'
import { createPrintQueueWorker, ensurePrintJobColumns } from '../services/print-queue'
import {
  configuredPrinters, isKitchenLine, parseKitchenChanges, planPrintJobs, targetPrinters, type PrintScope, type PrintTarget
} from '../services/print-routing'
import { cleanupStalePrintFiles, printHtml, type PrintResult } from '../services/print-window'
import { buildSampleOrder, type PrintEventType } from '../services/print-documents'
import {
  noPrinterError, printKitchenOn, printPlanned, printReceiptOn, printTestOn, receiptHTML, resolveJobPrinter, routing
} from '../services/print-dispatch'

/** Manual print options (contract C3): reprint=true prints a visible "REPRINT" banner. */
type PrintOpts = { reprint?: boolean } | undefined

interface PrintJobRow {
  id: number
  order_id: number
  daily_number: number
  event_type: PrintEventType
  document_type: 'receipt' | 'kitchen'
  scope: PrintScope
  worker_id: number | null
  worker_name: string | null
  printer_name: string | null
  detail: string | null
  status: 'pending' | 'printing' | 'succeeded' | 'attention' | 'cancelled'
  attempts: number
  last_error: string | null
  created_at: string
}

let printProcessorTimer: NodeJS.Timeout | null = null
let productionPrintWorker: ReturnType<typeof createPrintQueueWorker> | null = null

function getOpenPrintJobs(): PrintJobRow[] {
  return getDb()
    .prepare(
      'SELECT pj.*, o.daily_number, w.name AS worker_name ' +
      'FROM print_jobs pj ' +
      'JOIN orders o ON o.id = pj.order_id ' +
      'LEFT JOIN workers w ON w.id = pj.worker_id ' +
      "WHERE pj.status IN ('pending', 'printing', 'attention') " +
      'ORDER BY CASE pj.status WHEN \'attention\' THEN 0 WHEN \'printing\' THEN 1 ELSE 2 END, pj.created_at'
    )
    .all() as PrintJobRow[]
}

function broadcastPrintJobs(): void {
  const jobs = getOpenPrintJobs()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('printer:jobsChanged', jobs)
  }
}

/**
 * Before a manual retry: a job routed to a printer that is no longer configured (renamed or
 * replaced in Settings after "Printer X not found") moves to the printer now configured for the
 * same task — skipping printers that already have this document — instead of failing forever.
 */
function rerouteRemovedPrinter(jobId: number): void {
  const job = getDb().prepare('SELECT * FROM print_jobs WHERE id = ?').get(jobId) as
    (PrintJobRow & { event_sequence: number }) | undefined
  if (!job?.printer_name) return
  const config = routing()
  const configured = configuredPrinters(config)
  if (configured.length === 0 || configured.includes(job.printer_name)) return
  const siblings = (getDb().prepare(
    `SELECT printer_name FROM print_jobs WHERE order_id = ? AND event_type = ? AND event_sequence = ?
     AND document_type = ? AND scope = ? AND IFNULL(worker_id, -1) = IFNULL(?, -1) AND id <> ?`
  ).all(job.order_id, job.event_type, job.event_sequence, job.document_type, job.scope, job.worker_id, job.id) as
    { printer_name: string | null }[]).map((row) => row.printer_name)
  const next = targetPrinters(config, { documentType: job.document_type, scope: job.scope, workerId: job.worker_id })
    .find((printer) => !siblings.includes(printer))
  if (next) getDb().prepare('UPDATE print_jobs SET printer_name = ? WHERE id = ?').run(next, job.id)
}

function getPrintWorker(): ReturnType<typeof createPrintQueueWorker> {
  if (!productionPrintWorker) {
    productionPrintWorker = createPrintQueueWorker({
      db: getDb(),
      attemptPrint: (job) => {
        const target: PrintTarget = { documentType: job.document_type, scope: job.scope, workerId: job.worker_id }
        const printer = job.printer_name || resolveJobPrinter(job)
        if (!printer) return { success: false, error: noPrinterError(target) }
        if (job.document_type === 'receipt') return printReceiptOn(job.order_id, printer, {})
        return printKitchenOn(job.order_id, target, printer, {
          eventType: job.event_type,
          changes: parseKitchenChanges(job.detail)
        })
      },
      // One lane per printer: a hung printer only delays its own tickets.
      laneKey: (job) => job.printer_name || resolveJobPrinter(job) || '',
      onChange: () => {
        try { broadcastPrintJobs() } catch (error) { console.error('[Printer] Could not broadcast print jobs:', error) }
      }
    })
  }
  return productionPrintWorker
}

async function processPendingPrintJobs(): Promise<void> {
  await getPrintWorker().processOnce(10)
}

function logPrintProcessorFailure(error: unknown): void {
  console.error('[Printer] Durable print queue failed:', error)
  try { broadcastPrintJobs() } catch { /* the next scheduled run/startup recovery remains durable */ }
}

export function startPrintJobProcessor(): void {
  if (printProcessorTimer) return
  ensurePrintJobColumns(getDb())
  cleanupStalePrintFiles()
  // A previous process dying after handing a document to the OS leaves an ambiguous physical
  // outcome. Escalate on every startup (not only when migration 015 first runs).
  getDb().prepare(
    `UPDATE print_jobs SET status = 'attention',
     last_error = COALESCE(last_error, 'Application closed while printing; verify before retrying'),
     updated_at = datetime('now') WHERE status = 'printing'`
  ).run()
  void processPendingPrintJobs().catch(logPrintProcessorFailure)
  // Each tick only starts printers (lanes) that are idle, so ticks may overlap safely.
  printProcessorTimer = setInterval(() => {
    void processPendingPrintJobs().catch(logPrintProcessorFailure)
  }, 2000)
}

export async function stopPrintJobProcessor(): Promise<void> {
  if (printProcessorTimer) {
    clearInterval(printProcessorTimer)
    printProcessorTimer = null
  }
  const worker = productionPrintWorker
  productionPrintWorker = null
  if (worker) {
    try { await worker.idle() } catch { /* pending/attention state records the print failure */ }
  }
}

export function isPrintJobProcessorBusy(): boolean {
  return productionPrintWorker?.isBusy() ?? false
}

function reprintOf(opts: PrintOpts): boolean {
  return !!(opts && typeof opts === 'object' && opts.reprint === true)
}

/** Manual print of one document on EVERY printer its task is ticked on. */
function printOnEveryTarget(target: PrintTarget, print: (printerName: string) => Promise<PrintResult>): Promise<PrintResult> {
  const entries = targetPrinters(routing(), target).map((printerName) => ({ ...target, printerName }))
  if (entries.length === 0) return Promise.resolve({ success: false, error: noPrinterError(target) })
  return printPlanned(entries, (entry) => print(entry.printerName), () => noPrinterError(target))
}

export function registerPrinterHandlers(): void {
  startPrintJobProcessor()

  ipcMain.handle('printer:getPrintJobs', () => getOpenPrintJobs())

  ipcMain.handle('printer:retryPrintJob', async (_, id: number) => {
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'Invalid print job' }
    try {
      rerouteRemovedPrinter(id)
    } catch (error) {
      console.error('[Printer] Could not re-route the print job; retrying on its original printer:', error)
    }
    const result = getDb()
      .prepare(
        "UPDATE print_jobs SET status = 'pending', attempts = 0, next_attempt_at = NULL, " +
        "last_error = NULL, updated_at = datetime('now') " +
        "WHERE id = ? AND status = 'attention'"
      )
      .run(id)
    if (result.changes !== 1) return { success: false, error: 'Print job is not awaiting attention' }
    broadcastPrintJobs()
    void processPendingPrintJobs().catch(logPrintProcessorFailure)
    return { success: true }
  })

  ipcMain.handle('printer:cancelPrintJob', (_, id: number) => {
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'Invalid print job' }
    const result = getDb()
      .prepare(
        "UPDATE print_jobs SET status = 'cancelled', updated_at = datetime('now') " +
        "WHERE id = ? AND status IN ('pending', 'attention')"
      )
      .run(id)
    broadcastPrintJobs()
    return result.changes === 1
      ? { success: true }
      : { success: false, error: 'Print job can no longer be cancelled' }
  })

  ipcMain.handle('printer:getPrinters', async () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length === 0) return []
    const printers = await wins[0].webContents.getPrintersAsync()
    return printers.map(p => ({
      name: p.name,
      isDefault: p.isDefault,
      status: p.status
    }))
  })

  // Manual prints go to EVERY printer the task is ticked on and resolve {success, error?, printerName?}.
  ipcMain.handle('printer:printReceipt', async (_, orderId: number, opts?: PrintOpts): Promise<PrintResult> => {
    if (!ordersRepo.getById(orderId)) return { success: false, error: 'Order not found' }
    return printOnEveryTarget(
      { documentType: 'receipt', scope: 'all', workerId: null },
      (printerName) => printReceiptOn(orderId, printerName, { reprint: reprintOf(opts) })
    )
  })

  ipcMain.handle('printer:printKitchen', async (_, orderId: number, opts?: PrintOpts): Promise<PrintResult> => {
    const order = ordersRepo.getById(orderId)
    if (!order) return { success: false, error: 'Order not found' }
    const plan = planPrintJobs({
      config: routing(),
      split: settingsRepo.get('split_kitchen_tickets') === 'true',
      autoReceipt: false,
      autoKitchen: false,
      workerIds: (order.items || []).filter(isKitchenLine).map((item) => item.worker_id),
      includeReceipt: false,
      includeKitchen: true,
      manual: true
    })
    if (plan.length === 0) return { success: false, error: noPrinterError({ documentType: 'kitchen', scope: 'all', workerId: null }) }
    return printPlanned(
      plan,
      (job) => printKitchenOn(orderId, job, job.printerName, { eventType: 'new', reprint: reprintOf(opts) }),
      (job) => noPrinterError(job)
    )
  })

  ipcMain.handle('printer:printKitchenForWorker', async (_, orderId: number, workerId: number, opts?: PrintOpts): Promise<PrintResult> => {
    if (!Number.isInteger(workerId)) return { success: false, error: 'Invalid worker' }
    const target: PrintTarget = { documentType: 'kitchen', scope: 'worker', workerId }
    return printOnEveryTarget(target, (printerName) =>
      printKitchenOn(orderId, target, printerName, { eventType: 'new', reprint: reprintOf(opts) }))
  })

  ipcMain.handle('printer:printKitchenUnassigned', async (_, orderId: number, opts?: PrintOpts): Promise<PrintResult> => {
    const target: PrintTarget = { documentType: 'kitchen', scope: 'unassigned', workerId: null }
    return printOnEveryTarget(target, (printerName) =>
      printKitchenOn(orderId, target, printerName, { eventType: 'new', reprint: reprintOf(opts) }))
  })

  ipcMain.handle('printer:previewReceipt', async (_, orderId: number) => {
    const order = ordersRepo.getById(orderId)
    if (!order) return null
    const printer = targetPrinters(routing(), { documentType: 'receipt', scope: 'all', workerId: null })[0] ?? null
    return receiptHTML(order, settingsRepo.getAll(), printer, {})
  })

  // Contract C2: the receipt printer's exact output for a sample order, built by the same code
  // as real printing, from an UNSAVED template (null = the built-in receipt).
  ipcMain.handle('printer:previewTemplate', async (_, template: unknown): Promise<string> => {
    const printer = targetPrinters(routing(), { documentType: 'receipt', scope: 'all', workerId: null })[0] ?? null
    const menu = getDb()
      .prepare('SELECT name, name_ar, price FROM menu_items WHERE is_active = 1 ORDER BY id LIMIT 3')
      .all() as { name: string; name_ar: string | null; price: number }[]
    const unsaved = template && typeof template === 'object' && 'blocks' in template
      ? (template as { blocks: unknown })
      : null
    return receiptHTML(buildSampleOrder(menu), settingsRepo.getAll(), printer, { template: unsaved })
  })

  ipcMain.handle('printer:getOrderWorkers', async (_, orderId: number) => {
    const order = ordersRepo.getById(orderId)
    if (!order || !order.items) return []

    // Get unique workers from order items
    const workerIds = new Set<number>()
    for (const item of order.items) {
      if (item.worker_id) {
        workerIds.add(item.worker_id)
      }
    }

    // Get worker details
    const workers: { id: number; name: string; itemCount: number }[] = []
    for (const workerId of workerIds) {
      const worker = workersRepo.getById(workerId)
      if (worker) {
        const itemCount = order.items.filter(i => i.worker_id === workerId).length
        workers.push({ id: worker.id, name: worker.name, itemCount })
      }
    }

    return workers.sort((a, b) => a.name.localeCompare(b.name))
  })

  // Printer assignment CRUD
  ipcMain.handle('printer:getAssignments', () => {
    return printerAssignmentsRepo.getAll()
  })

  ipcMain.handle('printer:deleteAssignment', (_, id: number) => {
    printerAssignmentsRepo.deleteAssignment(id)
    return { success: true }
  })

  ipcMain.handle('printer:saveFullConfig', (_, config: {
    assignments: { printerName: string; tasks: string[]; autoPrint: boolean; paperWidth: string; receiptFontSize: string; kitchenFontSize: string }[]
  }) => {
    const assignments = (Array.isArray(config?.assignments) ? config.assignments : [])
      .filter((p) => p && typeof p.printerName === 'string' && p.printerName.trim())
      .map((p) => ({ ...p, tasks: Array.isArray(p.tasks) ? p.tasks.filter((t) => typeof t === 'string') : [] }))

    // Save via repo (handles clearing + rebuilding)
    printerAssignmentsRepo.saveFullConfig(assignments)

    // Sync legacy settings for backward compat with printing logic. A printer card with no task
    // ticked is never a fallback in a multi-printer setup (it was: drinks on the office printer).
    const isKitchen = (p: { tasks: string[] }) => p.tasks.includes('kitchen_all') || p.tasks.some(t => t.startsWith('worker_'))
    const hasAutoReceipt = assignments.some(p => p.autoPrint && p.tasks.includes('receipt'))
    const hasAutoKitchen = assignments.some(p => p.autoPrint && isKitchen(p))
    const receiptPrinter = assignments.find(p => p.tasks.includes('receipt'))
    const kitchenPrinter = assignments.find(isKitchen)
    const sole = new Set(assignments.map(p => p.printerName)).size === 1 ? assignments[0] : undefined
    const firstWithTask = assignments.find(p => p.tasks.length > 0)
    const receiptFallback = receiptPrinter || sole || firstWithTask

    settingsRepo.setMultiple({
      printer_name: receiptFallback?.printerName || '',
      kitchen_printer_name: kitchenPrinter?.printerName || receiptFallback?.printerName || '',
      printer_width: receiptFallback?.paperWidth || '80',
      receipt_font_size: receiptPrinter?.receiptFontSize || 'medium',
      kitchen_font_size: kitchenPrinter?.kitchenFontSize || 'large',
      auto_print_receipt: hasAutoReceipt ? 'true' : 'false',
      auto_print_kitchen: hasAutoKitchen ? 'true' : 'false',
      split_kitchen_tickets: assignments.some(p => p.tasks.some(t => t.startsWith('worker_'))) ? 'true' : 'false'
    })

    // Legacy workers.printer_name mirrors the FIRST printer a worker is ticked on (routing reads the
    // assignment rows, which include every printer). Clear first: un-assigning used to leave the
    // old value behind and tickets kept going to the removed printer forever.
    workersRepo.clearAllPrinterNames()
    const mirrored = new Set<number>()
    for (const printer of assignments) {
      for (const task of printer.tasks) {
        if (task.startsWith('worker_')) {
          const workerId = parseInt(task.replace('worker_', ''), 10)
          if (Number.isInteger(workerId) && !mirrored.has(workerId)) {
            workersRepo.setPrinterName(workerId, printer.printerName)
            mirrored.add(workerId)
          }
        }
      }
    }

    return { success: true }
  })

  // Test button: prints the real receipt / kitchen ticket this printer is set up for, laid out
  // exactly as configured (template, width, fonts, logo), with random items from the menu.
  ipcMain.handle('printer:testPrintOnPrinter', async (_, printerName: string): Promise<PrintResult> => {
    if (typeof printerName !== 'string' || !printerName.trim()) return { success: false, error: 'No printer selected' }
    return printTestOn(printerName)
  })

  ipcMain.handle('printer:testPrint', async (): Promise<PrintResult> => {
    const printerName = settingsRepo.getAll().printer_name
    if (!printerName) return { success: false, error: 'No printer configured' }
    return printTestOn(printerName)
  })
}
