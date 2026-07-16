import type { EntitlementClaims, LicenseDecision, LicenseReason } from './license-client'

/**
 * Pure mapping from a signed license decision to desktop side-effects. Kept dependency-free so it is
 * unit-testable headlessly and shared by BOTH the enrollment IPC and the periodic watcher — the two
 * places whose divergence (B1/B2) previously defeated grace and revocation.
 */

export type ActivationType = 'full' | 'trial'

const PAID_PLANS = new Set<string>(['monthly', 'yearly', 'lifetime'])
const LOCKABLE_REASONS = new Set<LicenseReason>([
  'revoked',
  'expired',
  'not_found',
  'migration_expired',
  'invalid_entitlement',
  'replay'
])

/** B1: a paid plan tags the install 'full'; only a trial plan is 'trial'. Never tag paid as trial. */
export function activationTypeForEntitlement(ent: EntitlementClaims | undefined): ActivationType {
  return ent && ent.plan !== null && PAID_PLANS.has(ent.plan) ? 'full' : 'trial'
}

/** ISO expiry to surface: subscription-until when present, else the signed 7-day entitlement exp. */
export function expiresAtForEntitlement(ent: EntitlementClaims | undefined): string | undefined {
  if (!ent) return undefined
  if (ent.sub) return ent.sub
  return new Date(ent.exp * 1000).toISOString()
}

export type WatcherOutcome =
  | { kind: 'unlock'; activationType: ActivationType | null; expiresAt?: string; entitlement?: EntitlementClaims }
  | { kind: 'lock'; reason: LicenseReason }
  | { kind: 'defer' }

/**
 * Map a decision to the watcher action, applying the tri-state + 7-day grace boundary UNIFORMLY to
 * trial and paid (B2):
 *  - licensed (incl. offline-grace) → unlock, tagging activation_type from the plan (B1).
 *  - migration window → unlock, keep the current tag.
 *  - definitive lock (revoked/expired/not_found/…) → lock immediately (M8).
 *  - inconclusive lock (offline/unverifiable): lock ONLY if the machine was previously licensed
 *    (a persisted lock, or a still-present-but-now-invalid cached entitlement = grace exhausted);
 *    otherwise defer so a fresh install mid-enrollment isn't locked on a transient blip.
 */
export function resolveWatcherOutcome(
  decision: LicenseDecision,
  ctx: { hasCachedEntitlement: boolean; persistedLock: LicenseReason | null }
): WatcherOutcome {
  if (decision.state === 'licensed') {
    return {
      kind: 'unlock',
      activationType: activationTypeForEntitlement(decision.entitlement),
      expiresAt: expiresAtForEntitlement(decision.entitlement),
      entitlement: decision.entitlement
    }
  }
  if (decision.state === 'migration') {
    return { kind: 'unlock', activationType: null }
  }
  // state === 'locked'
  if (decision.reason !== 'inconclusive') {
    return { kind: 'lock', reason: decision.reason }
  }
  if (ctx.persistedLock && LOCKABLE_REASONS.has(ctx.persistedLock)) {
    return { kind: 'lock', reason: ctx.persistedLock }
  }
  if (ctx.hasCachedEntitlement) {
    return { kind: 'lock', reason: 'expired' } // grace exhausted offline (7-day bound)
  }
  return { kind: 'defer' }
}
