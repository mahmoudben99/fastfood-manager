import { getDb } from '../connection'

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

export const printerAssignmentsRepo = {
  // Get all active printer assignments
  getAll(): PrinterAssignment[] {
    return getDb()
      .prepare('SELECT * FROM printer_assignments WHERE is_active = 1')
      .all() as PrinterAssignment[]
  },

  // Get printer for receipt printing (fallback to default if not found)
  getReceiptPrinter(): string | null {
    const assignment = getDb()
      .prepare(
        `SELECT printer_name FROM printer_assignments
         WHERE assignment_type = 'receipt' AND is_active = 1
         LIMIT 1`
      )
      .get() as { printer_name: string } | undefined

    if (assignment) return assignment.printer_name
    return this.getDefaultPrinter()
  },

  // Get receipt printer settings (paper width, font size)
  getReceiptSettings(): { paper_width: string; receipt_font_size: string } | null {
    const assignment = getDb()
      .prepare(
        `SELECT paper_width, receipt_font_size FROM printer_assignments
         WHERE assignment_type = 'receipt' AND is_active = 1
         LIMIT 1`
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
         LIMIT 1`
      )
      .get() as { paper_width: string; kitchen_font_size: string } | undefined
    return assignment || null
  },

  // Get printer for kitchen (all workers) - fallback to default
  getKitchenAllPrinter(): string | null {
    const assignment = getDb()
      .prepare(
        `SELECT printer_name FROM printer_assignments
         WHERE assignment_type = 'kitchen_all' AND is_active = 1
         LIMIT 1`
      )
      .get() as { printer_name: string } | undefined

    if (assignment) return assignment.printer_name
    return this.getDefaultPrinter()
  },

  // Get printer for specific worker - fallback chain: worker → kitchen_all → default
  getPrinterForWorker(workerId: number): string | null {
    // Check workers table first for direct assignment
    const worker = getDb()
      .prepare('SELECT printer_name FROM workers WHERE id = ? AND is_active = 1')
      .get(workerId) as { printer_name: string | null } | undefined

    if (worker?.printer_name) return worker.printer_name

    // Fallback to printer_assignments table
    const assignment = getDb()
      .prepare(
        `SELECT printer_name FROM printer_assignments
         WHERE assignment_type = 'worker' AND worker_id = ? AND is_active = 1
         LIMIT 1`
      )
      .get(workerId) as { printer_name: string } | undefined

    if (assignment) return assignment.printer_name
    return this.getKitchenAllPrinter()
  },

  // Get default fallback printer
  getDefaultPrinter(): string | null {
    const assignment = getDb()
      .prepare(
        `SELECT printer_name FROM printer_assignments
         WHERE assignment_type = 'default' AND is_active = 1
         LIMIT 1`
      )
      .get() as { printer_name: string } | undefined

    return assignment?.printer_name || null
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
