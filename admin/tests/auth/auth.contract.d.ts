/**
 * Frozen Node acceptance-test seam for the owner/admin authentication routes.
 *
 * These exports belong in the corresponding route modules (not in a test-only
 * production module).  The ordinary POST/GET exports must construct the same
 * handlers with real Supabase-backed dependencies.  The factories exist solely
 * to make that behavior executable without a Next server or network access.
 *
 * REVISION 2 (adjudicated interface evolution — cross-vendor security review):
 * `getThrottle`/`saveThrottle` are replaced by `takeThrottleAttempt`, a single
 * atomic reservation across BOTH scopes that gates BEFORE any credential
 * comparison. The prior shape (read both rows, compute in the caller, write
 * both rows back) could never be made race-safe: N concurrent requests all
 * read the same failure_count before any of them writes, so the lock never
 * actually engages under a real burst, and every one of those N requests still
 * ran bcrypt before any of that mattered (a CPU-cost-hash DoS surface). Every
 * *other* export and every behavioral guarantee below is unchanged.
 */

export type SessionCheck =
  | { ok: true; machineId: string; credentialVersion?: string }
  | { ok: false; reason: 'missing' | 'expired' | 'invalid' | 'wrong_machine' }

export interface AuthThrottleRow {
  scope: 'machine' | 'ip'
  key: string
  failureCount: number
  lockedUntil: Date | null
}

export interface ThrottleAttemptResult {
  allowed: boolean
  /** Whole seconds remaining on whichever scope is locked. 0 when `allowed` is true. */
  retryAfterSeconds: number
  machine: AuthThrottleRow
  ip: AuthThrottleRow
}

/**
 * Adapter for the Supabase `owner_credentials` and `auth_throttle` tables.
 * The production adapter MUST persist every read/write through Supabase; it
 * must not retain throttle state in process memory, and MUST throw on any
 * Supabase-reported error rather than treating it as "no row"/"nothing to
 * do" — a throttle or credential read/write failure fails the request
 * CLOSED (503), never silently open.  `calls` is intentionally optional and
 * is used only by the test double.
 */
export interface OwnerAuthSupabase {
  calls?: Array<{ operation: string; table: string; [key: string]: unknown }>
  getOwnerCredential(machineId: string): Promise<{ credential_hash: string; updatedAt?: string } | null>
  /**
   * Atomically reserves one login attempt across BOTH the machine and IP
   * throttle scopes in a single round-trip, BEFORE any credential
   * comparison runs. MUST be an atomic operation (a single Postgres
   * statement/RPC in production) — a read-then-write pair here reintroduces
   * exactly the race this replaces.
   */
  takeThrottleAttempt(machineKey: string, ipKey: string, now: Date): Promise<ThrottleAttemptResult>
  clearThrottle(scope: 'machine' | 'ip', key: string): Promise<void>
  queryOwnerData?(machineId: string, date: string): Promise<unknown>
  queryOwnerStats?(machineId: string, period: string): Promise<unknown>
  /** Not exercised by the frozen tests; used only by the admin credential-reset endpoint. */
  setOwnerCredential?(machineId: string, credentialHash: string): Promise<void>
}

export interface OwnerRouteDependencies {
  /** Origin of the admin application, for same-origin mutation checks. */
  appOrigin: string
  supabase: OwnerAuthSupabase
  now: () => Date
  compareCredential(credential: string, credentialHash: string): Promise<boolean> | boolean
  /**
   * `credentialVersion` is an additive optional parameter: it lets a session be bound to the
   * owner credential's current version (its row's `updated_at`) so a later credential reset can
   * invalidate sessions minted under the old one, without changing the required call shape for
   * any caller that doesn't need it.
   */
  createOwnerSession(machineId: string, credentialVersion?: string): Promise<string>
  ownerCookieName(machineId: string): string
  getOwnerSessionToken(request: Request, machineId: string): string | undefined
  verifyOwnerSession(token: string | undefined, machineId: string): Promise<SessionCheck> | SessionCheck
}

/** Required export from `app/api/owner/verify-pin/route.ts`. */
export function createVerifyOwnerCredentialHandler(
  dependencies: OwnerRouteDependencies,
): (request: Request) => Promise<Response>

/** Required export from `app/api/owner/data/route.ts`. */
export function createOwnerDataHandler(
  dependencies: OwnerRouteDependencies,
): (request: Request) => Promise<Response>

/** Required export from `app/api/owner/stats/route.ts`. */
export function createOwnerStatsHandler(
  dependencies: OwnerRouteDependencies,
): (request: Request) => Promise<Response>

/**
 * Required export from `app/api/login/route.ts`; production POST must use it.
 * It is used to freeze same-origin handling for the mutating admin login route.
 */
export function createAdminLoginHandler(dependencies: {
  appOrigin: string
  adminPassword: () => string | undefined
  createSession: () => Promise<string>
}): (request: Request) => Promise<Response>

/**
 * Throttle schedule frozen by the tests: failures 1 and 2 are not locked;
 * failure 3 locks for 60 seconds; each later failure doubles the duration,
 * capped at 3600 seconds. A valid credential while either scope is locked is
 * rejected with 429 and does not bypass the lock. The reservation that
 * enforces this (`takeThrottleAttempt`) MUST run, and MUST resolve, before
 * any credential comparison — see the interface doc above.
 */
