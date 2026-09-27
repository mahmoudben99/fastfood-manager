import { getDb } from '../connection'
import { fallbackPrinter, loadRoutingConfig, targetPrinters } from '../../services/print-routing'

export interface PrinterAssignment {
  id: number
  printer_name: string
  assignment_type: 'worker' | 'receipt' | 'kitchen_all' | 'default'
  worker_id: number | null
  is_active: number
  auto_print: number
  paper_width: string
  receipt_font_size: string
  kitchen_font_size: string
}

type PrinterSettings = { paper_width: string; receipt_font_size: string; kitchen_font_size: string }

// Routing (which printer gets what) lives in services/print-routing.ts so automatic jobs, manual
// prints and these helpers agree. Every multi-row query orders by id: "LIMIT 1" without ORDER BY
// picked an arbitrary row, so a task ticked on two printers printed on an unpredictable one.
export const printerAssignmentsRepo = {
  // Get all active printer assignments
  getAll(): PrinterAssignment[] {
    return getDb()
      .prepare('SELECT * FROM printer_assignments WHERE is_active = 1 ORDER BY id')
      .all() as PrinterAssignment[]
  },

  /** First printer for customer receipts (all of them: targetPrinters). */
  getReceiptPrinter(): string | null {
    return targetPrinters(loadRoutingConfig(getDb()), { documentType: 'receipt', scope: 'all', workerId: null })[0] ?? null
  },

  // Get receipt printer settings (paper width, font size)
  getReceiptSettings(): { paper_width: string; receipt_font_size: string } | null {
    const assignment = getDb()
      .prepare(
        `SELECT paper_width, receipt_font_size FROM printer_assignments
         WHERE assignment_type = 'receipt' AND is_active = 1
         ORDER BY id LIMIT 1`
      )
      .get() as { paper_width: string; receipt_font_size: string } | undefined
    return assignment || null
  },

  // Get kitchen printer settings
  getKitchenSettings(): { paper_width: string; kitchen_font_size: string } | null {
    const assignment = getDb()
      .prepare(
        `SELECT paper_width, kitchen_font_size FROM printer_assignments
         WHERE assignment_type IN ('kitchen_all', 'worker') AND is_active = 1
         ORDER BY id LIMIT 1`
      )
      .get() as { paper_width: string; kitchen_font_size: string } | undefined
    return assignment || null
  },

  /**
   * Paper width / font sizes configured on THIS printer's card. Rows of the task being printed
   * win; any other row of the same printer is next (the card's settings are shared by its rows),
   * so a receipt routed to a kitchen-only printer is still laid out at that printer's width.
   */
  getSettingsForPrinter(printerName: string, type: 'receipt' | 'kitchen'): PrinterSettings | null {
    const preferred = type === 'receipt' ? "('receipt')" : "('worker', 'kitchen_all')"
    const assignment = getDb()
      .prepare(
        `SELECT paper_width, receipt_font_size, kitchen_font_size
         FROM printer_assignments
         WHERE printer_name = ? AND is_active = 1
         ORDER BY CASE WHEN assignment_type IN ${preferred} THEN 0
                       WHEN assignment_type = 'default' THEN 1 ELSE 2 END, id
         LIMIT 1`
      )
      .get(printerName) as PrinterSettings | undefined
    return assignment || null
  },

  /** First printer for full kitchen tickets. */
  getKitchenAllPrinter(): string | null {
    return targetPrinters(loadRoutingConfig(getDb()), { documentType: 'kitchen', scope: 'all', workerId: null })[0] ?? null
  },

  /** First printer for a worker's tickets: worker rows → legacy workers.printer_name → kitchen chain. */
  getPrinterForWorker(workerId: number): string | null {
    return targetPrinters(loadRoutingConfig(getDb()), { documentType: 'kitchen', scope: 'worker', workerId })[0] ?? null
  },

  /**
   * Fallback printer. A printer card with no task ticked is stored as a 'default' row so it
   * persists in the UI; it used to catch every receipt/unassigned/worker ticket even in
   * multi-printer setups (drinks on the office printer). It is now a fallback only when it is
   * the ONLY configured printer — single-printer setups behave exactly as before.
   */
  getDefaultPrinter(): string | null {
    return fallbackPrinter(loadRoutingConfig(getDb()))
  },

  // Save full printer configuration — clears everything and rebuilds
  saveFullConfig(configs: {
    printerName: string
    tasks: string[]
    autoPrint: boolean
    paperWidth: string
    receiptFontSize: string
    kitchenFontSize: string
  }[]): void {
    const db = getDb()
    db.transaction(() => {
      // Clear all existing
      db.prepare('DELETE FROM printer_assignments').run()

      const insert = db.prepare(
        `INSERT INTO printer_assignments
         (printer_name, assignment_type, worker_id, is_active, auto_print, paper_width, receipt_font_size, kitchen_font_size)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?)`
      )

      for (const config of configs) {
        if (!config.printerName) continue

        // If no tasks assigned, insert a 'default' row so the printer config persists
        if (config.tasks.length === 0) {
          insert.run(
            config.printerName,
            'default',
            null,
            config.autoPrint ? 1 : 0,
            config.paperWidth,
            config.receiptFontSize,
            config.kitchenFontSize
          )
          continue
        }

        for (const task of config.tasks) {
          let assignmentType = task
          let workerId: number | null = null

          if (task.startsWith('worker_')) {
            assignmentType = 'worker'
            workerId = parseInt(task.replace('worker_', ''))
          }

          insert.run(
            config.printerName,
            assignmentType,
            workerId,
            config.autoPrint ? 1 : 0,
            config.paperWidth,
            config.receiptFontSize,
            config.kitchenFontSize
          )
        }
      }
    })()
  },

  // Delete assignment
  deleteAssignment(id: number): void {
    getDb().prepare('DELETE FROM printer_assignments WHERE id = ?').run(id)
  }
}
