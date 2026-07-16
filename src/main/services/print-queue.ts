import type Database from 'better-sqlite3'

export interface PrintJobRow { id: number; order_id: number; event_type: 'new'|'updated'|'cancelled'|'restored'; document_type: 'receipt'|'kitchen'; scope: 'all'|'worker'|'unassigned'; worker_id: number|null; status: 'pending'|'printing'|'succeeded'|'attention'|'cancelled'; attempts: number; last_error: string|null }
export interface PrintAttemptResult { success: boolean; error?: string }
export type PrintAttempter = (job: PrintJobRow) => Promise<PrintAttemptResult> | PrintAttemptResult
export interface PrintQueueDeps { db: Database.Database; attemptPrint: PrintAttempter; now?: () => Date; maxAttempts?: number }

const ambiguous = (message: string) => /timeout|closed while printing|no printer configured|no items/i.test(message)

export function createPrintQueueWorker({ db, attemptPrint, now = () => new Date(), maxAttempts = 3 }: PrintQueueDeps) {
  return { async processOnce(limit = 10): Promise<{ processed: number }> {
    const stamp = now().toISOString()
    const jobs = db.prepare(`SELECT * FROM print_jobs WHERE status = 'pending'
      AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime(?))
      ORDER BY created_at, id LIMIT ?`).all(stamp, limit) as PrintJobRow[]
    for (const job of jobs) {
      const claimed = db.prepare(
        "UPDATE print_jobs SET status = 'printing', updated_at = ? WHERE id = ? AND status = 'pending'"
      ).run(stamp, job.id)
      if (claimed.changes !== 1) continue
      let result: PrintAttemptResult
      try { result = await attemptPrint(job) } catch (error) { result = { success: false, error: error instanceof Error ? error.message : String(error) } }
      const attempts = job.attempts + 1
      if (result.success) {
        db.prepare("UPDATE print_jobs SET status = 'succeeded', attempts = ?, last_error = NULL, last_attempt_at = ?, completed_at = ?, updated_at = ? WHERE id = ?").run(attempts, stamp, stamp, stamp, job.id)
      } else {
        const error = result.error || 'Print failed'
        const attention = ambiguous(error) || attempts >= maxAttempts
        const next = new Date(now().getTime() + Math.min(60_000 * attempts, 300_000)).toISOString()
        db.prepare(`UPDATE print_jobs SET status = ?, attempts = ?, last_error = ?, last_attempt_at = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?`).run(attention ? 'attention' : 'pending', attempts, error, stamp, attention ? null : next, stamp, job.id)
      }
    }
    return { processed: jobs.length }
  } }
}
