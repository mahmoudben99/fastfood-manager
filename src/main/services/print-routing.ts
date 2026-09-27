import type Database from 'better-sqlite3'

/**
 * Printer routing — which printer(s) receive which document.
 *
 * Shared by the order service (automatic, durable print jobs) and printer.ipc (manual prints
 * and legacy queued jobs) so both follow one set of rules:
 *  - a task ticked on several printers prints on EVERY one of them (one job per printer);
 *  - in split mode a "Kitchen Ticket (All Items)" printer still gets the full ticket;
 *  - a printer card with no task ticked is a fallback only when it is the ONLY printer.
 *
 * Deliberately free of Electron and repository imports: it is unit-tested under plain node
 * (test-harness/unit/print-routing.test.mjs).
 */

export interface AssignmentRow {
  printer_name: string
  assignment_type: string
  worker_id: number | null
  auto_print: number
}

export interface RoutingConfig {
  /** Active printer_assignments rows, in insertion (id) order. */
  assignments: AssignmentRow[]
  /** Legacy workers.printer_name, used only for a worker that has no assignment rows. */
  workerPrinters: Record<number, string>
  /** Legacy settings.printer_name / settings.kitchen_printer_name. */
  receiptPrinter: string
  kitchenPrinter: string
  /**
   * KDS "screen instead of paper" (settings kds_replaces_paper_<workerId|expo>): stations whose
   * AUTOMATIC kitchen tickets are skipped. 0 = the full ticket / unassigned lines (expo).
   */
  paperlessStations?: number[]
}

export type PrintScope = 'all' | 'worker' | 'unassigned'

export interface PrintTarget {
  documentType: 'receipt' | 'kitchen'
  scope: PrintScope
  workerId: number | null
}

export interface PlannedPrintJob extends PrintTarget {
  /** null = nothing routable right now; re-resolved when the job prints. */
  printerName: string | null
}

const unique = <T>(values: T[]): T[] => [...new Set(values)]

function rowsFor(config: RoutingConfig, type: string, workerId?: number): AssignmentRow[] {
  return config.assignments.filter(
    (row) => row.assignment_type === type && (workerId === undefined || row.worker_id === workerId)
  )
}

const printersOf = (rows: AssignmentRow[]): string[] => unique(rows.map((row) => row.printer_name).filter(Boolean))

export function configuredPrinters(config: RoutingConfig): string[] {
  return printersOf(config.assignments)
}

/** The only configured printer (with or without tasks) — the historical single-printer fallback. */
export function fallbackPrinter(config: RoutingConfig): string | null {
  const printers = configuredPrinters(config)
  return printers.length === 1 ? printers[0] : null
}

function isTaskless(config: RoutingConfig, printerName: string): boolean {
  const rows = config.assignments.filter((row) => row.printer_name === printerName)
  return rows.length > 0 && rows.every((row) => row.assignment_type === 'default')
}

/** A legacy settings printer, unless it is a task-less card in a multi-printer setup (office printer). */
function legacyPrinter(config: RoutingConfig, name: string): string | null {
  if (!name) return null
  if (configuredPrinters(config).length > 1 && isTaskless(config, name)) return null
  return name
}

/** Every printer a document should go to, most specific rule first. Empty = not routable. */
export function targetPrinters(config: RoutingConfig, target: PrintTarget): string[] {
  const chain: (string[] | string | null | undefined)[] = []
  if (target.documentType === 'receipt') {
    chain.push(printersOf(rowsFor(config, 'receipt')), fallbackPrinter(config), legacyPrinter(config, config.receiptPrinter))
  } else {
    if (target.scope === 'worker' && target.workerId != null) {
      chain.push(printersOf(rowsFor(config, 'worker', target.workerId)), config.workerPrinters[target.workerId])
    }
    chain.push(
      printersOf(rowsFor(config, 'kitchen_all')),
      fallbackPrinter(config),
      legacyPrinter(config, config.kitchenPrinter),
      legacyPrinter(config, config.receiptPrinter)
    )
  }
  for (const step of chain) {
    const names = Array.isArray(step) ? step : step ? [step] : []
    if (names.length > 0) return names
  }
  return []
}

export interface PlanInput {
  config: RoutingConfig
  split: boolean
  /** Legacy settings auto_print_receipt / auto_print_kitchen (used when no task row decides). */
  autoReceipt: boolean
  autoKitchen: boolean
  /** Worker id of every order line (null = unassigned). */
  workerIds: (number | null | undefined)[]
  includeReceipt: boolean
  includeKitchen: boolean
  /** Manual print: auto-print flags are ignored, every routed printer prints. */
  manual?: boolean
}

/**
 * One entry per (document, printer). Automatic jobs honour each printer's own auto-print flag
 * and skip the kitchen tickets of stations a kitchen screen replaces; manual prints never do.
 */
export function planPrintJobs(input: PlanInput): PlannedPrintJob[] {
  const jobs = planRoutedJobs(input)
  const paperless = new Set(input.config.paperlessStations ?? [])
  if (input.manual || paperless.size === 0) return jobs
  return jobs.filter((job) =>
    job.documentType !== 'kitchen' || !paperless.has(job.scope === 'worker' ? job.workerId ?? 0 : 0))
}

function planRoutedJobs(input: PlanInput): PlannedPrintJob[] {
  const { config, manual = false } = input
  const jobs: PlannedPrintJob[] = []
  const autoOn = (rows: AssignmentRow[], printer: string): boolean =>
    manual || rows.some((row) => row.printer_name === printer && row.auto_print === 1)
  const routed = (rows: AssignmentRow[], target: PrintTarget): void => {
    for (const printer of printersOf(rows)) if (autoOn(rows, printer)) jobs.push({ ...target, printerName: printer })
  }
  const fallback = (target: PrintTarget): void => {
    jobs.push({ ...target, printerName: targetPrinters(config, target)[0] ?? null })
  }

  if (input.includeReceipt) {
    const receipt: PrintTarget = { documentType: 'receipt', scope: 'all', workerId: null }
    const rows = rowsFor(config, 'receipt')
    if (rows.length > 0) routed(rows, receipt)
    else if (manual || input.autoReceipt) fallback(receipt)
  }
  if (!input.includeKitchen) return jobs

  const full: PrintTarget = { documentType: 'kitchen', scope: 'all', workerId: null }
  const kitchenAll = rowsFor(config, 'kitchen_all')
  if (!input.split) {
    if (kitchenAll.length > 0) routed(kitchenAll, full)
    else if (manual || input.autoKitchen) fallback(full)
    return jobs
  }

  // Split mode: "All Items" printers keep receiving the complete ticket, so the stations with a
  // dedicated printer get their own slip and everything else is already on the full ticket.
  routed(kitchenAll, full)
  const groups = unique(input.workerIds.map((id) => (id == null ? null : id)))
  if (groups.length === 0) groups.push(null)
  for (const workerId of groups) {
    if (workerId == null) {
      if (kitchenAll.length === 0 && (manual || input.autoKitchen)) {
        fallback({ documentType: 'kitchen', scope: 'unassigned', workerId: null })
      }
      continue
    }
    const target: PrintTarget = { documentType: 'kitchen', scope: 'worker', workerId }
    const rows = rowsFor(config, 'worker', workerId)
    if (rows.length > 0) {
      routed(rows, target)
      continue
    }
    const legacy = config.workerPrinters[workerId]
    if (legacy) {
      const auto = kitchenAll.length > 0 ? kitchenAll.some((row) => row.auto_print === 1) : input.autoKitchen
      if (manual || auto) jobs.push({ ...target, printerName: legacy })
      continue
    }
    if (kitchenAll.length === 0 && (manual || input.autoKitchen)) fallback(target)
  }
  return jobs
}

/** Reads the routing inputs straight from SQLite (works inside an open transaction). */
export function loadRoutingConfig(db: Database.Database): RoutingConfig {
  const assignments = db.prepare(
    `SELECT printer_name, assignment_type, worker_id, auto_print FROM printer_assignments
     WHERE is_active = 1 ORDER BY id`
  ).all() as AssignmentRow[]
  const workerPrinters: Record<number, string> = {}
  const workers = db.prepare(
    "SELECT id, printer_name FROM workers WHERE is_active = 1 AND printer_name IS NOT NULL AND printer_name <> ''"
  ).all() as { id: number; printer_name: string }[]
  for (const worker of workers) workerPrinters[worker.id] = worker.printer_name
  const setting = (key: string): string =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''
  const paperlessStations: number[] = []
  const paperless = db.prepare(
    "SELECT key FROM settings WHERE substr(key, 1, 19) = 'kds_replaces_paper_' AND value = 'true'"
  ).all() as { key: string }[]
  for (const { key } of paperless) {
    const suffix = key.slice('kds_replaces_paper_'.length)
    if (suffix === 'expo') paperlessStations.push(0)
    else if (/^\d+$/.test(suffix)) paperlessStations.push(Number(suffix))
  }
  return {
    assignments,
    workerPrinters,
    receiptPrinter: setting('printer_name'),
    kitchenPrinter: setting('kitchen_printer_name'),
    paperlessStations
  }
}

// ─── Kitchen change markers for "UPDATED" tickets ──────────────────────────────────────────

export interface KitchenLineSnapshot {
  id: number
  menu_item_id: number
  quantity: number
  notes: string | null
  worker_id: number | null
  /** v4 catalog: signature of the line's options; a different value is a kitchen change. */
  modifier_key?: string | null
}

/** A combo parent line (line_kind 'combo') is a container: only its children are cooked/printed. */
export function isKitchenLine(item: { line_kind?: string | null }): boolean {
  return item.line_kind !== 'combo'
}

export interface KitchenLineChange {
  kind: 'added' | 'removed' | 'changed'
  orderItemId: number
  menuItemId: number
  /** Station that must see this change. */
  workerId: number | null
  quantity: number
  previousQuantity?: number
  notes?: string | null
  noteChanged?: boolean
  /** v4 catalog: the chosen options changed (only present when true). */
  modifiersChanged?: boolean
}

/** Line-level difference between an order before and after an edit (price changes ignored). */
export function diffKitchenLines(before: KitchenLineSnapshot[], after: KitchenLineSnapshot[]): KitchenLineChange[] {
  const changes: KitchenLineChange[] = []
  const afterById = new Map(after.map((line) => [line.id, line]))
  const beforeIds = new Set(before.map((line) => line.id))
  const entry = (kind: KitchenLineChange['kind'], line: KitchenLineSnapshot): KitchenLineChange => ({
    kind,
    orderItemId: line.id,
    menuItemId: line.menu_item_id,
    workerId: line.worker_id ?? null,
    quantity: line.quantity,
    notes: line.notes ?? null
  })
  for (const old of before) {
    const next = afterById.get(old.id)
    if (!next) {
      changes.push(entry('removed', old))
    } else if ((next.worker_id ?? null) !== (old.worker_id ?? null)) {
      // Moved to another station: the old one must stop, the new one must start.
      changes.push(entry('removed', old), entry('added', next))
    } else {
      const noteChanged = (next.notes ?? null) !== (old.notes ?? null)
      const modifiersChanged = (next.modifier_key ?? '') !== (old.modifier_key ?? '')
      if (next.quantity !== old.quantity || noteChanged || modifiersChanged) {
        changes.push({
          ...entry('changed', next),
          previousQuantity: old.quantity,
          noteChanged,
          ...(modifiersChanged ? { modifiersChanged: true } : {})
        })
      }
    }
  }
  for (const next of after) if (!beforeIds.has(next.id)) changes.push(entry('added', next))
  return changes
}

/** The changes one kitchen ticket should show. A station move is not news on the full ticket. */
export function changesForTicket(changes: KitchenLineChange[], scope: PrintScope, workerId: number | null): KitchenLineChange[] {
  if (scope === 'worker') return changes.filter((change) => change.workerId === workerId)
  if (scope === 'unassigned') return changes.filter((change) => change.workerId == null)
  const kinds = new Map<number, Set<string>>()
  for (const change of changes) {
    if (!kinds.has(change.orderItemId)) kinds.set(change.orderItemId, new Set())
    kinds.get(change.orderItemId)!.add(change.kind)
  }
  return changes.filter((change) => {
    const set = kinds.get(change.orderItemId)!
    return !(set.has('removed') && set.has('added'))
  })
}

export function serializeKitchenChanges(changes: KitchenLineChange[] | undefined): string | null {
  return changes && changes.length > 0 ? JSON.stringify({ changes }) : null
}

export function parseKitchenChanges(detail: string | null | undefined): KitchenLineChange[] {
  if (!detail) return []
  try {
    const parsed = JSON.parse(detail) as { changes?: unknown }
    if (!Array.isArray(parsed.changes)) return []
    return parsed.changes.filter(
      (change): change is KitchenLineChange =>
        !!change && typeof change === 'object' &&
        ['added', 'removed', 'changed'].includes((change as KitchenLineChange).kind) &&
        Number.isInteger((change as KitchenLineChange).orderItemId)
    )
  } catch (error) {
    console.warn('[Printer] Ignoring unreadable kitchen change set; printing without markers:', error)
    return []
  }
}
