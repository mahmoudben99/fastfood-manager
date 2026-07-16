/**
 * Pure exponential-backoff logic for the owner/admin remote-credential login.
 *
 * Frozen schedule (see admin/tests/auth/auth.contract.d.ts and
 * admin/tests/auth/owner-admin-auth.test.mjs): failures 1-2 are rejected
 * normally with no lock. Failure 3 creates a 60-second lock. Every failure
 * after that doubles the remaining lock duration, capped at one hour (3600s).
 *
 * This module has no I/O — callers (admin/lib/owner-auth.ts) read/write the
 * durable row through the injected Supabase-backed adapter and use these
 * helpers to decide what the next row should look like.
 */

export type ThrottleScope = 'machine' | 'ip'

export interface ThrottleRow {
  scope: ThrottleScope
  key: string
  failureCount: number
  lockedUntil: Date | null
}

export const LOCK_THRESHOLD = 3
export const INITIAL_LOCK_SECONDS = 60
export const MAX_LOCK_SECONDS = 3600

/** Lock duration (seconds) for a given cumulative failure count, or null if not yet locked. */
export function lockSecondsForFailureCount(failureCount: number): number | null {
  if (failureCount < LOCK_THRESHOLD) return null
  const doublings = failureCount - LOCK_THRESHOLD
  return Math.min(MAX_LOCK_SECONDS, INITIAL_LOCK_SECONDS * 2 ** doublings)
}

/** Whether `row` is presently locked at instant `now`. */
export function isLocked(row: ThrottleRow | null | undefined, now: Date): row is ThrottleRow {
  return !!row?.lockedUntil && row.lockedUntil.getTime() > now.getTime()
}

/** Whole seconds remaining until `row`'s lock lifts. Assumes `isLocked(row, now)`. */
export function retryAfterSeconds(row: ThrottleRow, now: Date): number {
  const remainingMs = (row.lockedUntil as Date).getTime() - now.getTime()
  return Math.max(1, Math.ceil(remainingMs / 1000))
}

/** The row to persist after one more failed credential check against `scope`/`key`. */
export function nextRowAfterFailure(
  previous: ThrottleRow | null | undefined,
  scope: ThrottleScope,
  key: string,
  now: Date
): ThrottleRow {
  const failureCount = (previous?.failureCount ?? 0) + 1
  const lockSeconds = lockSecondsForFailureCount(failureCount)
  const lockedUntil = lockSeconds === null ? null : new Date(now.getTime() + lockSeconds * 1000)
  return { scope, key, failureCount, lockedUntil }
}
