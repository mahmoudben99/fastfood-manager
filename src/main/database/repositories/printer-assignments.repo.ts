import { getDb } from '../connection'

export interface PrinterAssignment {
  id: number
  printer_name: string
  assignment_type: 'worker' | 'receipt' | 'kitchen_all' | 'default'
  worker_id: number | null
  is_active: number
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

    // Fallback to default printer
    return this.getDefaultPrinter()
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

    // Fallback to default
    return this.getDefaultPrinter()
  },

  // Get printer for specific worker - fallback chain: worker → kitchen_all → default
  getPrinterForWorker(workerId: number): string | null {
    // Check workers table first for direct assignment
    const worker = getDb()
      .prepare('SELECT printer_name FROM workers WHERE id = ? AND is_active = 1')
      .get(workerId) as { printer_name: string | null } | undefined

    if (worker?.printer_name) return worker.printer_name

    // Fallback to printer_assignments table (legacy)
    const assignment = getDb()
      .prepare(
        `SELECT printer_name FROM printer_assignments
         WHERE assignment_type = 'worker' AND worker_id = ? AND is_active = 1
         LIMIT 1`
      )
      .get(workerId) as { printer_name: string } | undefined

    if (assignment) return assignment.printer_name

    // Fallback to kitchen_all printer
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

  // Create or update assignment
  setAssignment(
    printerName: string,
    assignmentType: 'worker' | 'receipt' | 'kitchen_all' | 'default',
    workerId?: number
  ): void {
    // Deactivate existing assignments of same type (and worker if applicable)
    if (assignmentType === 'worker' && workerId) {
      getDb()
        .prepare(
          'UPDATE printer_assignments SET is_active = 0 WHERE assignment_type = ? AND worker_id = ?'
        )
        .run(assignmentType, workerId)
    } else {
      getDb()
        .prepare('UPDATE printer_assignments SET is_active = 0 WHERE assignment_type = ?')
        .run(assignmentType)
    }

    // Create new assignment
    getDb()
      .prepare(
        'INSERT INTO printer_assignments (printer_name, assignment_type, worker_id) VALUES (?, ?, ?)'
      )
      .run(printerName, assignmentType, workerId || null)
  },

  // Delete assignment
  deleteAssignment(id: number): void {
    getDb().prepare('DELETE FROM printer_assignments WHERE id = ?').run(id)
  }
}
