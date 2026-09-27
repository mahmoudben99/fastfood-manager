import type { TFunction } from 'i18next'
import { toast } from '../../../components/ui'
import type { OrderWorker, PrintResult } from '../types'
import { stripIpcPrefix } from './checkout'

/** Manual prints from order history always carry the REPRINT banner. */
export const REPRINT = { reprint: true } as const

/** Lines no worker cooks (combo parents never print, so they do not count). */
export function unassignedLineCount(items?: { worker_id: number | null; line_kind?: string }[]): number {
  return (items || []).filter((item) => item.worker_id == null && item.line_kind !== 'combo').length
}

export interface PrintTarget {
  key: string
  label: string
  shortLabel: string
  run: () => Promise<PrintResult>
}

/**
 * Kitchen print buttons for one order: one per worker, plus "other items" for lines with no
 * worker (unreachable in v2 once any line had a worker), or a single ticket when none is assigned.
 */
export function kitchenPrintTargets(
  t: TFunction,
  orderId: number,
  workers: OrderWorker[],
  unassignedCount: number,
  opts?: { reprint?: boolean }
): PrintTarget[] {
  if (workers.length === 0) {
    return [{ key: 'all', label: t('orders.printKitchen'), shortLabel: t('orders.printKitchen'), run: () => window.api.printer.printKitchen(orderId, opts) }]
  }
  const targets: PrintTarget[] = workers.map((worker) => ({
    key: `worker-${worker.id}`,
    label: t('orders.reprint.workerTicket', { name: worker.name, n: worker.itemCount }),
    shortLabel: `${worker.name} (${worker.itemCount})`,
    run: () => window.api.printer.printKitchenForWorker(orderId, worker.id, opts)
  }))
  if (unassignedCount > 0) {
    targets.push({
      key: 'unassigned',
      label: t('orders.reprint.unassignedTicket', { n: unassignedCount }),
      shortLabel: t('orders.reprint.unassignedShort', { n: unassignedCount }),
      run: () => window.api.printer.printKitchenUnassigned(orderId, opts)
    })
  }
  return targets
}

/** Runs a manual print and reports it: success names the printer, a failure stays until dismissed. */
export async function runManualPrint(t: TFunction, request: () => Promise<PrintResult>, document: string): Promise<void> {
  try {
    const result = await request()
    if (result?.success) {
      toast.success(result.printerName
        ? t('orders.reprint.sent', { document, printer: result.printerName })
        : t('orders.reprint.sentDefault', { document }), { id: 'pos-print' })
    } else {
      toast.error(t('orders.reprint.failed', { document, error: result?.error || t('orders.reprint.failedUnknown') }), { id: 'pos-print', duration: 0 })
    }
  } catch (error) {
    toast.error(t('orders.reprint.failed', { document, error: stripIpcPrefix(error) }), { id: 'pos-print', duration: 0 })
  }
}
