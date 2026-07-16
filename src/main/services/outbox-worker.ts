import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export type OutboxEventType = 'owner-sync'|'analytics-dirty'|'telegram'|'queue-broadcast'
export interface OutboxEventRow { id: number; event_type: OutboxEventType; payload: string; status: 'pending'|'done'|'failed'; attempts: number; last_error: string|null }
export type OutboxConsumer = (event: OutboxEventRow) => Promise<void> | void
export interface OutboxWorkerDeps { db: Database.Database; consumers: Partial<Record<OutboxEventType, OutboxConsumer>>; now?: () => Date }

export function createOutboxWorker({ db, consumers, now = () => new Date() }: OutboxWorkerDeps) {
  return { async processOnce(limit = 10): Promise<{ processed: number }> {
    const captured = now()
    const stamp = captured.toISOString()
    const staleBefore = new Date(captured.getTime() - 15 * 60_000).toISOString()
    const claimToken = randomUUID()
    const events = db.transaction(() => {
      // A dead process eventually releases its lease. Until then, the conditional UPDATE below
      // prevents two app processes from delivering the same external effect concurrently.
      db.prepare(
        `UPDATE outbox_events SET claim_token = NULL, claimed_at = NULL
         WHERE status = 'pending' AND claim_token IS NOT NULL
           AND datetime(claimed_at) <= datetime(?)`
      ).run(staleBefore)
      const eligible = db.prepare(
        `SELECT * FROM outbox_events WHERE status = 'pending' AND claim_token IS NULL
         AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime(?))
         ORDER BY created_at, id LIMIT ?`
      ).all(stamp, limit) as OutboxEventRow[]
      const claimed: OutboxEventRow[] = []
      const claim = db.prepare(
        `UPDATE outbox_events SET claim_token = ?, claimed_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending' AND claim_token IS NULL`
      )
      for (const event of eligible) {
        if (claim.run(claimToken, stamp, stamp, event.id).changes === 1) claimed.push(event)
      }
      return claimed
    })()
    for (const event of events) {
      const consumer = consumers[event.event_type]
      try {
        if (!consumer) throw new Error(`No outbox consumer registered for ${event.event_type}`)
        await consumer(event)
        db.prepare(
          `UPDATE outbox_events SET status = 'done', attempts = ?, last_error = NULL,
           next_attempt_at = NULL, claim_token = NULL, claimed_at = NULL, updated_at = ?
           WHERE id = ? AND claim_token = ?`
        ).run(event.attempts + 1, stamp, event.id, claimToken)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const retryAt = new Date(now().getTime() + Math.min(60_000 * (event.attempts + 1), 300_000)).toISOString()
        db.prepare(
          `UPDATE outbox_events SET attempts = ?, last_error = ?, next_attempt_at = ?,
           claim_token = NULL, claimed_at = NULL, updated_at = ?
           WHERE id = ? AND claim_token = ?`
        ).run(event.attempts + 1, message, retryAt, stamp, event.id, claimToken)
      }
    }
    return { processed: events.length }
  } }
}
