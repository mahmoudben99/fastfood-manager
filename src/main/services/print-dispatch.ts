/**
 * Builds and prints one document on one printer (receipts, kitchen tickets), plus the helpers
 * shared by the durable queue and the manual print IPC handlers in printer.ipc.ts.
 */
import { settingsRepo } from '../database/repositories/settings.repo'
import { ordersRepo } from '../database/repositories/orders.repo'
import { printerAssignmentsRepo } from '../database/repositories/printer-assignments.repo'
import { workersRepo } from '../database/repositories/workers.repo'
import { receiptTemplatesRepo } from '../database/repositories/receipt-templates.repo'
import { getDb } from '../database/connection'
import { changesForTicket, loadRoutingConfig, targetPrinters, type KitchenLineChange, type PrintScope, type PrintTarget } from './print-routing'
import { printHtml, type PrintResult } from './print-window'
import { buildDefaultReceiptHTML, buildKitchenHTML, type PrintEventType } from './print-documents'
import { buildFromTemplate, type ReceiptContext } from './receipt-template'
import { getLogoDataUrl } from './logo'

/** Current routing inputs (assignments, legacy printer settings). */
export const routing = () => loadRoutingConfig(getDb())

/** Printer for a queued job that has none recorded (legacy rows / nothing routable at enqueue). */
export function resolveJobPrinter(job: { document_type: 'receipt' | 'kitchen'; scope: PrintScope; worker_id: number | null }): string | null {
  return targetPrinters(routing(), { documentType: job.document_type, scope: job.scope, workerId: job.worker_id })[0] ?? null
}

export function noPrinterError(target: PrintTarget): string {
  if (target.documentType === 'receipt') return 'No printer configured for the customer receipt'
  if (target.scope === 'worker' && target.workerId != null) {
    return `No printer configured for ${workersRepo.getById(target.workerId)?.name || 'this station'}`
  }
  return 'No printer configured for kitchen tickets'
}

async function logoDataUrl(): Promise<string | null> {
  try {
    return await getLogoDataUrl()
  } catch (error) {
    console.error('[Printer] Logo unavailable; printing without it:', error)
    return null
  }
}

function activeTemplate(): { blocks: unknown } | null {
  try {
    const template = receiptTemplatesRepo.getActiveTemplate()
    return template && template.blocks ? template : null
  } catch (error) {
    console.error('[Printer] Could not read the active receipt template; printing the default receipt:', error)
    return null
  }
}

/**
 * The receipt exactly as `printerName` prints it. template: undefined = the active template,
 * null = the built-in receipt, object = an unsaved editor template (preview).
 */
export async function receiptHTML(
  order: any,
  settings: Record<string, string>,
  printerName: string | null,
  opts: { reprint?: boolean; template?: { blocks: unknown } | null }
): Promise<string> {
  const printer = printerName
    ? printerAssignmentsRepo.getSettingsForPrinter(printerName, 'receipt')
    : printerAssignmentsRepo.getReceiptSettings()
  const ctx: ReceiptContext = {
    logoDataUrl: await logoDataUrl(),
    paperWidth: printer?.paper_width || null,
    receiptFontSize: printer?.receipt_font_size || null,
    reprint: opts.reprint
  }
  const template = opts.template === undefined ? activeTemplate() : opts.template
  if (template) {
    const html = await buildFromTemplate(template, order, settings, ctx)
    if (html) return html
  }
  return buildDefaultReceiptHTML(order, settings, ctx)
}

export async function printReceiptOn(orderId: number, printerName: string, opts: { reprint?: boolean }): Promise<PrintResult> {
  const order = ordersRepo.getById(orderId)
  if (!order) return { success: false, error: 'Order not found', printerName }
  const html = await receiptHTML(order, settingsRepo.getAll(), printerName, { reprint: opts.reprint })
  return printHtml(html, printerName)
}

function menuNames(menuItemIds: number[]): Record<number, string> {
  const names: Record<number, string> = {}
  if (menuItemIds.length === 0) return names
  const rows = getDb()
    .prepare(`SELECT id, name FROM menu_items WHERE id IN (${menuItemIds.map(() => '?').join(',')})`)
    .all(...menuItemIds) as { id: number; name: string }[]
  for (const row of rows) names[row.id] = row.name
  return names
}

export async function printKitchenOn(
  orderId: number,
  target: PrintTarget,
  printerName: string,
  opts: { eventType: PrintEventType; changes?: KitchenLineChange[]; reprint?: boolean }
): Promise<PrintResult> {
  const settings = settingsRepo.getAll()
  const order = ordersRepo.getById(orderId)
  if (!order) return { success: false, error: 'Order not found', printerName }

  const allItems = order.items || []
  const items = target.scope === 'worker'
    ? allItems.filter((item) => item.worker_id === target.workerId)
    : target.scope === 'unassigned'
      ? allItems.filter((item) => item.worker_id == null)
      : allItems
  const changes = opts.eventType === 'updated'
    ? changesForTicket(opts.changes || [], target.scope, target.workerId)
    : []
  const removed = changes.filter((change) => change.kind === 'removed')
  // A station whose only line was removed still gets its UPDATED ticket (showing the removal).
  if (items.length === 0 && removed.length === 0) {
    return {
      success: false,
      error: target.scope === 'worker' ? 'No items for this worker' : 'No items for this kitchen ticket',
      printerName
    }
  }

  const workerName = target.scope === 'worker' && target.workerId != null
    ? workersRepo.getById(target.workerId)?.name || null
    : target.scope === 'unassigned' ? 'Unassigned' : null
  const printer = printerAssignmentsRepo.getSettingsForPrinter(printerName, 'kitchen')
  const html = buildKitchenHTML(order, items, settings, {
    paperWidth: printer?.paper_width || null,
    kitchenFontSize: printer?.kitchen_font_size || null,
    eventType: opts.eventType,
    workerName,
    changes,
    removedNames: menuNames([...new Set(removed.map((change) => change.menuItemId))]),
    reprint: opts.reprint
  })
  return printHtml(html, printerName)
}

/** Merges per-printer results into one: success only if every printer succeeded. */
function combineResults(results: PrintResult[]): PrintResult {
  const failed = results.filter((result) => !result.success)
  const printers = [...new Set(results.map((result) => result.printerName).filter(Boolean))]
  return {
    success: failed.length === 0,
    ...(failed.length > 0
      ? { error: failed.map((result) => result.error || `Printer "${result.printerName}": Print failed`).join('; ') }
      : {}),
    ...(printers.length > 0 ? { printerName: printers.join(', ') } : {})
  }
}

/** Prints each document; printers work in parallel, documents for one printer keep their order. */
export async function printPlanned<T extends { printerName: string | null }>(
  entries: T[],
  print: (entry: T & { printerName: string }) => Promise<PrintResult>,
  whenUnroutable: (entry: T) => string
): Promise<PrintResult> {
  const lanes = new Map<string, T[]>()
  const results: PrintResult[] = []
  for (const entry of entries) {
    if (!entry.printerName) {
      results.push({ success: false, error: whenUnroutable(entry) })
      continue
    }
    lanes.set(entry.printerName, [...(lanes.get(entry.printerName) || []), entry])
  }
  await Promise.all([...lanes.values()].map(async (lane) => {
    for (const entry of lane) results.push(await print(entry as T & { printerName: string }))
  }))
  return combineResults(results)
}
