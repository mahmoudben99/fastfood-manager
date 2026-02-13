import { getDb } from '../connection'

export const settingsRepo = {
  get(key: string): string | null {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  },

  set(key: string, value: string): void {
    getDb()
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(key, value)
  },

  getAll(): Record<string, string> {
    const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  },

  getMultiple(keys: string[]): Record<string, string> {
    const placeholders = keys.map(() => '?').join(',')
    const rows = getDb()
      .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
      .all(...keys) as { key: string; value: string }[]
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  },

  setMultiple(settings: Record<string, string>): void {
    const stmt = getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    const transaction = getDb().transaction((entries: [string, string][]) => {
      for (const [key, value] of entries) {
        stmt.run(key, value)
      }
    })
    transaction(Object.entries(settings))
  },

  // Work schedule
  getSchedule(): any[] {
    return getDb()
      .prepare('SELECT * FROM work_schedule ORDER BY day_of_week')
      .all()
  },

  updateScheduleDay(
    dayOfWeek: number,
    status: string,
    openTime: string | null,
    closeTime: string | null,
    halfEnd: string | null
  ): void {
    getDb()
      .prepare(
        'UPDATE work_schedule SET status = ?, open_time = ?, close_time = ?, half_end = ? WHERE day_of_week = ?'
      )
      .run(status, openTime, closeTime, halfEnd, dayOfWeek)
  },

  setSchedule(
    schedule: {
      day_of_week: number
      status: string
      open_time: string | null
      close_time: string | null
      half_end: string | null
    }[]
  ): void {
    const stmt = getDb().prepare(
      'UPDATE work_schedule SET status = ?, open_time = ?, close_time = ?, half_end = ? WHERE day_of_week = ?'
    )
    const transaction = getDb().transaction(
      (
        days: {
          day_of_week: number
          status: string
          open_time: string | null
          close_time: string | null
          half_end: string | null
        }[]
      ) => {
        for (const day of days) {
          stmt.run(day.status, day.open_time, day.close_time, day.half_end, day.day_of_week)
        }
      }
    )
    transaction(schedule)
  }
}
