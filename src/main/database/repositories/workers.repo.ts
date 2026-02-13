import { getDb } from '../connection'

export interface Worker {
  id: number
  name: string
  role: string
  pay_full_day: number
  pay_half_day: number
  phone: string | null
  is_active: number
  created_at: string
  updated_at: string
  category_ids?: number[]
}

export interface CreateWorkerInput {
  name: string
  role: string
  pay_full_day: number
  pay_half_day: number
  phone?: string
  category_ids?: number[]
}

export interface WorkerAttendance {
  id: number
  worker_id: number
  date: string
  shift_type: string
  pay_amount: number
  notes: string | null
  worker_name?: string
}

export const workersRepo = {
  getAll(): Worker[] {
    const workers = getDb()
      .prepare('SELECT * FROM workers WHERE is_active = 1 ORDER BY name')
      .all() as Worker[]

    for (const worker of workers) {
      worker.category_ids = this.getCategoryIds(worker.id)
    }
    return workers
  },

  getById(id: number): Worker | undefined {
    const worker = getDb().prepare('SELECT * FROM workers WHERE id = ?').get(id) as
      | Worker
      | undefined
    if (worker) {
      worker.category_ids = this.getCategoryIds(id)
    }
    return worker
  },

  getCategoryIds(workerId: number): number[] {
    const rows = getDb()
      .prepare('SELECT category_id FROM worker_categories WHERE worker_id = ?')
      .all(workerId) as { category_id: number }[]
    return rows.map((r) => r.category_id)
  },

  getByCategoryId(categoryId: number): Worker[] {
    const workers = getDb()
      .prepare(
        `SELECT w.* FROM workers w
         JOIN worker_categories wc ON w.id = wc.worker_id
         WHERE wc.category_id = ? AND w.is_active = 1`
      )
      .all(categoryId) as Worker[]
    return workers
  },

  create(input: CreateWorkerInput): Worker {
    const transaction = getDb().transaction(() => {
      const result = getDb()
        .prepare(
          `INSERT INTO workers (name, role, pay_full_day, pay_half_day, phone)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(input.name, input.role, input.pay_full_day, input.pay_half_day, input.phone ?? null)

      const workerId = result.lastInsertRowid as number

      if (input.category_ids?.length) {
        const stmt = getDb().prepare(
          'INSERT INTO worker_categories (worker_id, category_id) VALUES (?, ?)'
        )
        for (const catId of input.category_ids) {
          stmt.run(workerId, catId)
        }
      }

      return workerId
    })

    const id = transaction()
    return this.getById(id)!
  },

  update(id: number, input: Partial<CreateWorkerInput>): Worker | undefined {
    const current = this.getById(id)
    if (!current) return undefined

    const transaction = getDb().transaction(() => {
      getDb()
        .prepare(
          `UPDATE workers SET name = ?, role = ?, pay_full_day = ?, pay_half_day = ?,
           phone = ?, updated_at = datetime('now') WHERE id = ?`
        )
        .run(
          input.name ?? current.name,
          input.role ?? current.role,
          input.pay_full_day ?? current.pay_full_day,
          input.pay_half_day ?? current.pay_half_day,
          input.phone ?? current.phone,
          id
        )

      if (input.category_ids !== undefined) {
        getDb().prepare('DELETE FROM worker_categories WHERE worker_id = ?').run(id)
        if (input.category_ids.length) {
          const stmt = getDb().prepare(
            'INSERT INTO worker_categories (worker_id, category_id) VALUES (?, ?)'
          )
          for (const catId of input.category_ids) {
            stmt.run(id, catId)
          }
        }
      }
    })

    transaction()
    return this.getById(id)
  },

  delete(id: number): boolean {
    const result = getDb()
      .prepare("UPDATE workers SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
      .run(id)
    return result.changes > 0
  },

  // Attendance
  getAttendance(date: string): WorkerAttendance[] {
    return getDb()
      .prepare(
        `SELECT wa.*, w.name as worker_name
         FROM worker_attendance wa
         JOIN workers w ON wa.worker_id = w.id
         WHERE wa.date = ?
         ORDER BY w.name`
      )
      .all(date) as WorkerAttendance[]
  },

  setAttendance(
    workerId: number,
    date: string,
    shiftType: string,
    payAmount: number,
    notes?: string
  ): void {
    getDb()
      .prepare(
        `INSERT OR REPLACE INTO worker_attendance (worker_id, date, shift_type, pay_amount, notes)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(workerId, date, shiftType, payAmount, notes ?? null)
  },

  getAttendanceRange(
    startDate: string,
    endDate: string,
    workerId?: number
  ): WorkerAttendance[] {
    let query = `
      SELECT wa.*, w.name as worker_name
      FROM worker_attendance wa
      JOIN workers w ON wa.worker_id = w.id
      WHERE wa.date BETWEEN ? AND ?
    `
    const params: any[] = [startDate, endDate]
    if (workerId) {
      query += ' AND wa.worker_id = ?'
      params.push(workerId)
    }
    query += ' ORDER BY wa.date, w.name'
    return getDb().prepare(query).all(...params) as WorkerAttendance[]
  }
}
