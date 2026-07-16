/**
 * Frozen acceptance boundary for src/main/activation/license-client.ts.
 * The server timestamps and claims are specified by CONTRACT.md §1. Implementations
 * may add exports, but these exports and observable meanings must remain compatible.
 */
export type LicenseState = 'licensed' | 'locked' | 'migration'
export type LicenseReason =
  | 'valid_entitlement' | 'revoked' | 'expired' | 'not_found' | 'migration_expired'
  | 'inconclusive' | 'invalid_entitlement' | 'replay'

export interface EntitlementClaims {
  v: 1; kid: string; typ: 'entitlement'; mid: string
  st: 'active' | 'trial' | 'expired' | 'revoked'
  plan: 'trial' | 'monthly' | 'yearly' | 'lifetime' | null
  sub: string | null; rev: number; name: string | null; iat: number; exp: number
}
export interface LicenseDecision {
  state: LicenseState; reason: LicenseReason
  entitlement?: EntitlementClaims
  /** True when the persisted machine ID differs from a newly computed host ID. */
  machineIdMismatch: boolean
  /** True only when Electron safeStorage was unavailable and settings fallback was used. */
  deviceSecretStorageFallback: boolean
}
export interface Key { kid: string; /** raw 32-byte Ed25519 public key, base64url */ pub: string }
export interface KeyValueStorage { get(key: string): string | undefined; set(key: string, value: string): void; delete(key: string): void }
export interface DeviceSecretStorage { load(): string | undefined; save(secret: string): void; clear(): void; readonly fallback: boolean }
export interface Clock { now(): number } // Unix milliseconds; injectable for deterministic tests
export interface LicenseClientOptions {
  licenseServerUrl: string; appVersion: string; publicKeys: readonly Key[]
  storage: KeyValueStorage; deviceSecretStorage: DeviceSecretStorage; clock: Clock
  recomputeMachineId(): string; fetch?: typeof fetch; log?(message: string): void
  /** Existing HMAC serial validation supplied during the one-time legacy migration only. */
  legacySerialIsValid?(): boolean
}
export interface LicenseClient {
  /** Periodic/startup read-only check. It MUST NOT call /v1/trial/start except after 401 enroll:true. */
  check(): Promise<LicenseDecision>
  /** The only public path permitted to create a fresh trial. */
  startTrial(input: { restaurantName?: string; phone?: string }): Promise<LicenseDecision>
  diagnostics(): Pick<LicenseDecision, 'machineIdMismatch' | 'deviceSecretStorageFallback'>
}
export function createLicenseClient(options: LicenseClientOptions): LicenseClient
