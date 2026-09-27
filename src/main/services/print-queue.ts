import type Database from 'better-sqlite3'

export interface PrintJobRow { id: number; order_id: number; event_type: 'new'|'updated'|'cancelled'|'restored'; document_type: 'receipt'|'kitchen'; scope: 'all'|'worker'|'unassigned'; worker_id: number|null; status: 'pending'|'printing'|'succeeded'|'attention'|'cancelled'; attempts: number; last_error: string|null; printer_name?: string|null; detail?: string|null }
export interface PrintAttemptResult { success: boolean; error?: string }
export type PrintAttempter = (job: PrintJobRow) => Promise<PrintAttemptResult> | PrintAttemptResult
export interface PrintQueueDeps {
  db: Database.Database
  attemptPrint: PrintAttempter
  now?: () => Date
  maxAttempts?: number
  /** Jobs sharing a lane print in order; different lanes (printers) print in parallel. */
  laneKey?: (job: PrintJobRow) => string
  /** Called after every job state change (UI refresh). */
  onChange?: () => void
}

// A missing/renamed Windows printer never fixes itself by waiting: escalate on the first failure.
const ambiguous = (message: string) =>
  /timeout|closed while printing|no printer configured|no items|not found|invalid device ?name/i.test(message)

/**
 * Adds the per-printer routing columns to print_jobs when missing (no migration number is used).
 * `printer_name` = the printer this job targets (null = resolve when printing, legacy rows);
 * `detail` = JSON change set for UPDATED kitchen tickets. The uniqueness index gains the printer
 * so one event can fan out to several printers. Idempotent and cheap — deliberately not cached,
 * because a caller's transaction may roll the ALTER back.
 */
export function ensurePrintJobColumns(db: Database.Database): void {
  const columns = new Set((db.prepare('PRAGMA table_info(print_jobs)').all() as { name: string }[]).map((c) => c.name))
  if (columns.size === 0) return
  if (!columns.has('printer_name')) db.exec('ALTER TABLE print_jobs ADD COLUMN printer_name TEXT')
  if (!columns.has('detail')) db.exec('ALTER TABLE print_jobs ADD COLUMN detail TEXT')
  const hasIndex = (name: string) =>
    !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?").get(name)
  if (!hasIndex('idx_print_jobs_unique_printer')) {
    db.exec(`CREATE UNIQUE INDEX idx_print_jobs_unique_printer ON print_jobs(
      order_id, event_type, event_sequence, document_type, scope, IFNULL(worker_id, -1), IFNULL(printer_name, ''))`)
  }
  if (hasIndex('idx_print_jobs_unique_effect')) db.exec('DROP INDEX idx_print_jobs_unique_effect')
}

export function createPrintQueueWorker({
  db, attemptPrint, now = () => new Date(), maxAttempts = 3, laneKey = (job) => job.printer_name || '', onChange
}: PrintQueueDeps) {
  const busyLanes = new Map<string, Promise<void>>()
  const changed = () => { try { onChange?.() } catch (error) { console.error('[Printer] Job change listener failed:', error) } }

  async function runJob(job: PrintJobRow): Promise<boolean> {
    const claimedAt = now().toISOString()
    const claimed = db.prepare(
      "UPDATE print_jobs SET status = 'printing', updated_at = ? WHERE id = ? AND status = 'pending'"
    ).run(claimedAt, job.id)
    if (claimed.changes !== 1) return false
    changed()
    let result: PrintAttemptResult
    try { result = await attemptPrint(job) } catch (error) { result = { success: false, error: error instanceof Error ? error.message : String(error) } }
    const stamp = now().toISOString()
    const attempts = job.attempts + 1
    if (result.success) {
      db.prepare("UPDATE print_jobs SET status = 'succeeded', attempts = ?, last_error = NULL, last_attempt_at = ?, completed_at = ?, updated_at = ? WHERE id = ?").run(attempts, stamp, stamp, stamp, job.id)
    } else {
      const error = result.error || 'Print failed'
      const attention = ambiguous(error) || attempts >= maxAttempts
      const next = new Date(now().getTime() + Math.min(60_000 * attempts, 300_000)).toISOString()
      db.prepare(`UPDATE print_jobs SET status = ?, attempts = ?, last_error = ?, last_attempt_at = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?`).run(attention ? 'attention' : 'pending', attempts, error, stamp, attention ? null : next, stamp, job.id)
    }
    changed()
    return true
  }

  return {
    /**
     * Starts every idle lane on its due jobs (up to `limit` per lane) and resolves when those
     * lanes finish. A lane still busy from an earlier call is skipped, so a hung printer never
     * delays another printer's tickets; within a lane jobs keep their creation order.
     */
    async processOnce(limit = 10): Promise<{ processed: number }> {
      const stamp = now().toISOString()
      const jobs = db.prepare(`SELECT * FROM print_jobs WHERE status = 'pending'
        AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime(?))
        ORDER BY created_at, id LIMIT 500`).all(stamp) as PrintJobRow[]
      const lanes = new Map<string, PrintJobRow[]>()
      for (const job of jobs) {
        const key = laneKey(job)
        if (busyLanes.has(key)) continue
        const lane = lanes.get(key) ?? []
        if (lane.length < limit) lane.push(job)
        lanes.set(key, lane)
      }
      let processed = 0
      const runs: Promise<void>[] = []
      for (const [key, laneJobs] of lanes) {
        const run = (async () => {
          for (const job of laneJobs) if (await runJob(job)) processed++
        })().finally(() => { busyLanes.delete(key) })
        busyLanes.set(key, run)
        runs.push(run)
      }
      await Promise.all(runs)
      return { processed }
    },
    isBusy(): boolean {
      return busyLanes.size > 0
    },
    /** Resolves once every running lane has finished. */
    async idle(): Promise<void> {
      while (busyLanes.size > 0) await Promise.allSettled([...busyLanes.values()])
    }
  }
}
