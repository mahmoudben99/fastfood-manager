import { b64urlEncode, signArtifact } from './crypto'

export interface Env {
  DB: D1Database
  SIGNING_PRIVATE_KEY?: string
  ADMIN_BEARER?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  LICENSE_KID?: string
  TRIAL_DAYS?: string
  TOKEN_TTL_DAYS?: string

  // Compatibility aliases used by the locked v1 contract and its local fixture.
  LICENSE_PRIVATE_KEY?: string
  ADMIN_API_KEY?: string
}

type StoredStatus = 'trial' | 'active' | 'expired' | 'revoked'
type EffectiveStatus = StoredStatus
type Plan = 'trial' | 'monthly' | 'yearly' | 'lifetime' | null

interface License {
  machine_id: string
  status: StoredStatus
  plan: Plan
  subscription_until: string | null
  restaurant_name: string | null
  phone: string | null
  app_version: string | null
  notes: string | null
  created_at: string
  updated_at: string
  last_seen: string | null
  last_ip: string | null
  check_count: number
  device_secret_hash: string | null
  device_bound_at: string | null
  revision: number
}

interface ArtifactClaims {
  v: 1
  kid: string
  typ: 'access' | 'entitlement'
  mid: string
  st: EffectiveStatus
  plan: Plan
  sub: string | null
  rev: number
  name: string | null
  iat: number
  exp: number
}

interface RateLimitResult {
  limited: boolean
  retryAfter: number
}

const MACHINE_ID = /^[A-Z0-9]{6,64}$/
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const STRICT_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/
const ALGIERS_TIME_ZONE = 'Africa/Algiers'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...headers }
  })
}

function machineIdFrom(value: unknown): string | null {
  const machineId = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return MACHINE_ID.test(machineId) ? machineId : null
}

function cleanOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  return clean ? clean.slice(0, maxLength) : null
}

function positiveEnvInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function nowIso(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString()
}

function addDaysIso(baseMs: number, days: number): string {
  return new Date(baseMs + days * 86_400_000).toISOString()
}

function effective(license: License, nowMs = Date.now()): { st: EffectiveStatus; sub: string | null } {
  if (license.status === 'revoked') return { st: 'revoked', sub: license.subscription_until }
  if (license.status === 'active') {
    if (license.subscription_until === null) return { st: 'active', sub: null }
    const expiry = Date.parse(license.subscription_until)
    return Number.isFinite(expiry) && nowMs <= expiry
      ? { st: 'active', sub: license.subscription_until }
      : { st: 'expired', sub: license.subscription_until }
  }
  if (license.status === 'trial') {
    const expiry = license.subscription_until === null ? Number.NaN : Date.parse(license.subscription_until)
    return Number.isFinite(expiry) && nowMs <= expiry
      ? { st: 'trial', sub: license.subscription_until }
      : { st: 'expired', sub: license.subscription_until }
  }
  return { st: 'expired', sub: license.subscription_until }
}

async function readJson(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : json({ error: 'bad_input' }, 400)
  } catch {
    return json({ error: 'bad_json' }, 400)
  }
}

async function getLicense(env: Env, machineId: string): Promise<License | null> {
  return env.DB.prepare('SELECT * FROM licenses WHERE machine_id = ?').bind(machineId).first<License>()
}

function deviceSecret(request: Request): string | null {
  const authorization = request.headers.get('Authorization') || ''
  return authorization.startsWith('Device ') && authorization.length > 7 ? authorization.slice(7) : null
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function equalHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

async function secretMatches(request: Request, expectedHash: string): Promise<boolean> {
  const secret = deviceSecret(request)
  return secret !== null && equalHex(await sha256Hex(secret), expectedHash)
}

function newDeviceSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return b64urlEncode(bytes)
}

function signingKey(env: Env): string {
  const key = env.SIGNING_PRIVATE_KEY || env.LICENSE_PRIVATE_KEY
  if (!key) throw new Error('signing key is not configured')
  return key
}

async function issueArtifacts(env: Env, license: License, nowMs = Date.now()) {
  const serverTime = Math.floor(nowMs / 1000)
  const kid = env.LICENSE_KID || 'k1'
  const state = effective(license, nowMs)
  const common = {
    v: 1 as const,
    kid,
    mid: license.machine_id,
    st: state.st,
    plan: license.plan,
    sub: state.sub,
    rev: Number(license.revision),
    name: license.restaurant_name,
    iat: serverTime
  }
  const accessClaims: ArtifactClaims = {
    ...common,
    typ: 'access',
    exp: serverTime + 3600
  }
  const entitlementClaims: ArtifactClaims = {
    ...common,
    typ: 'entitlement',
    exp: serverTime + positiveEnvInteger(env.TOKEN_TTL_DAYS, 7) * 86_400
  }
  const privateKey = signingKey(env)
  const [accessToken, entitlement] = await Promise.all([
    signArtifact(accessClaims, privateKey),
    signArtifact(entitlementClaims, privateKey)
  ])
  return { accessToken, entitlement, state, serverTime }
}

async function licenseResponse(env: Env, license: License, status: number, rawSecret?: string): Promise<Response> {
  const issued = await issueArtifacts(env, license)
  return json(
    {
      ...(rawSecret ? { deviceSecret: rawSecret } : {}),
      accessToken: issued.accessToken,
      entitlement: issued.entitlement,
      status: issued.state.st,
      plan: license.plan,
      subscriptionUntil: issued.state.sub,
      revision: Number(license.revision),
      serverTime: issued.serverTime
    },
    status
  )
}

function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

async function consumeRateLimits(
  env: Env,
  buckets: Array<{ key: string; windowSeconds: number; limit: number }>,
  nowMs = Date.now()
): Promise<RateLimitResult> {
  const timestamp = nowIso(nowMs)
  const statements = buckets.map(({ key, windowSeconds }) =>
    env.DB.prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN unixepoch(excluded.window_start) - unixepoch(rate_limits.window_start) >= ? THEN 1
           ELSE rate_limits.count + 1
         END,
         window_start = CASE
           WHEN unixepoch(excluded.window_start) - unixepoch(rate_limits.window_start) >= ? THEN excluded.window_start
           ELSE rate_limits.window_start
         END
       RETURNING window_start, count`
    ).bind(key, timestamp, windowSeconds, windowSeconds)
  )
  const results = await env.DB.batch<{ window_start: string; count: number }>(statements)
  let retryAfter = 0
  let limited = false
  for (let index = 0; index < results.length; index += 1) {
    const row = results[index].results[0]
    if (row && Number(row.count) > buckets[index].limit) {
      limited = true
      const elapsedSeconds = Math.floor((nowMs - Date.parse(row.window_start)) / 1000)
      retryAfter = Math.max(retryAfter, Math.max(1, buckets[index].windowSeconds - elapsedSeconds))
    }
  }
  return { limited, retryAfter }
}

function rateLimited(retryAfter: number): Response {
  return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(Math.max(1, retryAfter)) })
}

async function handleTrialStart(request: Request, env: Env): Promise<Response> {
  const parsed = await readJson(request)
  if (parsed instanceof Response) return parsed
  const machineId = machineIdFrom(parsed.machineId)
  if (!machineId) return json({ error: 'bad_machine_id' }, 400)

  const throttle = await consumeRateLimits(env, [
    { key: `trialstart:ip:${clientIp(request)}:h`, windowSeconds: 3600, limit: 5 },
    { key: `trialstart:mid:${machineId}:d`, windowSeconds: 86_400, limit: 3 }
  ])
  if (throttle.limited) return rateLimited(throttle.retryAfter)

  const restaurantName = cleanOptionalString(parsed.restaurantName, 200)
  const phone = cleanOptionalString(parsed.phone, 40)
  const appVersion = cleanOptionalString(parsed.appVersion, 40)
  let license = await getLicense(env, machineId)

  if (!license) {
    const timestampMs = Date.now()
    const timestamp = nowIso(timestampMs)
    const rawSecret = newDeviceSecret()
    const secretHash = await sha256Hex(rawSecret)
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO licenses (
           machine_id, status, plan, subscription_until, restaurant_name, phone, app_version,
           created_at, updated_at, device_secret_hash, device_bound_at, revision
         ) VALUES (?, 'trial', 'trial', ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).bind(
        machineId,
        addDaysIso(timestampMs, positiveEnvInteger(env.TRIAL_DAYS, 7)),
        restaurantName,
        phone,
        appVersion,
        timestamp,
        timestamp,
        secretHash,
        timestamp
      )
    ])
    license = await getLicense(env, machineId)
    if (!license) throw new Error('created license was not readable')
    return licenseResponse(env, license, 201, rawSecret)
  }

  if (license.device_secret_hash) {
    if (!(await secretMatches(request, license.device_secret_hash))) {
      return json({ error: 'device_bound' }, 403)
    }
    if (license.status !== 'trial' && license.status !== 'active') {
      return json({ error: 'trial_not_available' }, 409)
    }
    return licenseResponse(env, license, 200)
  }

  // Addendum #9: killed and expired rows are not eligible for TOFU binding.
  if (license.status !== 'trial' && license.status !== 'active') {
    return json({ error: 'not_eligible' }, 403)
  }

  const timestamp = nowIso()
  const rawSecret = newDeviceSecret()
  const secretHash = await sha256Hex(rawSecret)
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE licenses SET
         device_secret_hash = ?, device_bound_at = ?, revision = revision + 1, updated_at = ?,
         restaurant_name = COALESCE(?, restaurant_name), phone = COALESCE(?, phone),
         app_version = COALESCE(?, app_version)
       WHERE machine_id = ? AND device_secret_hash IS NULL`
    ).bind(secretHash, timestamp, timestamp, restaurantName, phone, appVersion, machineId)
  ])
  license = await getLicense(env, machineId)
  if (!license || license.device_secret_hash !== secretHash) throw new Error('device binding did not complete')
  return licenseResponse(env, license, 200, rawSecret)
}

async function handleLicenseCheck(request: Request, env: Env): Promise<Response> {
  const parsed = await readJson(request)
  if (parsed instanceof Response) return parsed
  const machineId = machineIdFrom(parsed.machineId)
  if (!machineId) return json({ error: 'bad_machine_id' }, 400)

  const license = await getLicense(env, machineId)
  if (!license) return json({ error: 'not_found' }, 404)
  if (!license.device_secret_hash) return json({ error: 'unauthorized', enroll: true }, 401)
  if (!deviceSecret(request)) return json({ error: 'unauthorized' }, 401)
  if (!(await secretMatches(request, license.device_secret_hash))) return json({ error: 'device_bound' }, 403)

  const throttle = await consumeRateLimits(env, [
    { key: `licensecheck:mid:${machineId}:h`, windowSeconds: 3600, limit: 60 }
  ])
  if (throttle.limited) return rateLimited(throttle.retryAfter)

  const appVersion = cleanOptionalString(parsed.appVersion, 40)
  await env.DB.prepare(
    `UPDATE licenses SET
       last_seen = ?, last_ip = ?, check_count = check_count + 1,
       app_version = COALESCE(?, app_version)
     WHERE machine_id = ?`
  )
    .bind(nowIso(), clientIp(request), appVersion, machineId)
    .run()

  // Addendum #10 deliberately keeps revoked checks on this signed 200 path.
  return licenseResponse(env, license, 200)
}

function adminCredential(env: Env): string {
  return env.ADMIN_BEARER || env.ADMIN_API_KEY || ''
}

function requireAdmin(request: Request, env: Env): boolean {
  const authorization = request.headers.get('Authorization') || ''
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const expected = adminCredential(env)
  if (!supplied || !expected || supplied.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < supplied.length; index += 1) {
    difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}

function publicLicense(license: License) {
  const { device_secret_hash: _secretHash, ...visible } = license
  return { ...visible, bound: Boolean(license.device_secret_hash), effective: effective(license).st }
}

function validFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function partsInTimeZone(timestampMs: number, timeZone: string): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  return Object.fromEntries(
    formatter
      .formatToParts(new Date(timestampMs))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  )
}

/** Convert a local civil time through the runtime's IANA timezone database. */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string
): number | null {
  // Offset calculations operate at whole-second precision; add the requested
  // millisecond only after the civil-time round trip has been validated.
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0)
  let candidate = wallClockAsUtc
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = partsInTimeZone(candidate, timeZone)
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    candidate += wallClockAsUtc - represented
  }
  const finalParts = partsInTimeZone(candidate, timeZone)
  if (
    finalParts.year !== year ||
    finalParts.month !== month ||
    finalParts.day !== day ||
    finalParts.hour !== hour ||
    finalParts.minute !== minute ||
    finalParts.second !== second
  ) {
    return null
  }
  return candidate + millisecond
}

function normalizeUntil(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const dateOnlyMatch = DATE_ONLY.exec(value)
  if (dateOnlyMatch) {
    const [, yearText, monthText, dayText] = dateOnlyMatch
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    if (!validCalendarDate(year, month, day)) return null
    const utc = zonedTimeToUtc(year, month, day, 23, 59, 59, 999, ALGIERS_TIME_ZONE)
    return utc === null ? null : new Date(utc).toISOString()
  }
  const isoMatch = STRICT_ISO.exec(value)
  if (!isoMatch) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = isoMatch
  if (
    !validCalendarDate(Number(yearText), Number(monthText), Number(dayText)) ||
    Number(hourText) > 23 ||
    Number(minuteText) > 59 ||
    Number(secondText) > 59 ||
    (offsetHourText !== undefined && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59))
  ) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function appendTombstone(notes: string | null, timestamp: string): string {
  const marker = `tombstoned ${timestamp}`
  return notes ? `${notes}\n${marker}` : marker
}

const ADMIN_ACTIONS = new Set([
  'setPlan',
  'extend',
  'grantTrial',
  'revoke',
  'reinstate',
  'rebindDevice',
  'tombstone',
  'setInfo'
])

async function handleAdmin(request: Request, env: Env, path: string): Promise<Response> {
  if (!requireAdmin(request, env)) return json({ error: 'unauthorized' }, 401)
  const parsed = await readJson(request)
  if (parsed instanceof Response) return parsed

  if (path === '/v1/admin/list') {
    const searchText = typeof parsed.search === 'string' ? parsed.search.slice(0, 200) : ''
    const search = `%${searchText}%`
    const requestedLimit = Number(parsed.limit)
    const requestedOffset = Number(parsed.offset)
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(500, requestedLimit) : 200
    const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0
    const result = await env.DB.prepare(
      `SELECT * FROM licenses
       WHERE machine_id LIKE ? OR IFNULL(restaurant_name, '') LIKE ? OR IFNULL(phone, '') LIKE ?
       ORDER BY CASE WHEN last_seen IS NULL THEN 1 ELSE 0 END, last_seen DESC, created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(search, search, search, limit, offset)
      .all<License>()
    return json({ licenses: (result.results || []).map(publicLicense) })
  }

  if (path === '/v1/admin/get') {
    const machineId = machineIdFrom(parsed.machineId)
    if (!machineId) return json({ error: 'bad_machine_id' }, 400)
    const license = await getLicense(env, machineId)
    return license ? json({ license: publicLicense(license) }) : json({ error: 'not_found' }, 404)
  }

  if (path !== '/v1/admin/mutate') return json({ error: 'not_found' }, 404)

  const machineId = machineIdFrom(parsed.machineId)
  if (!machineId) return json({ error: 'bad_machine_id' }, 400)
  const action = typeof parsed.action === 'string' ? parsed.action : ''
  if (!ADMIN_ACTIONS.has(action)) return json({ error: 'unknown_action' }, 400)

  let license = await getLicense(env, machineId)
  const mayProvision = action === 'setPlan' || action === 'grantTrial'
  if (!license && !mayProvision) return json({ error: 'not_found' }, 404)

  const timestampMs = Date.now()
  const timestamp = nowIso(timestampMs)
  const shell: License = {
    machine_id: machineId,
    status: 'expired',
    plan: null,
    subscription_until: null,
    restaurant_name: null,
    phone: null,
    app_version: null,
    notes: null,
    created_at: timestamp,
    updated_at: timestamp,
    last_seen: null,
    last_ip: null,
    check_count: 0,
    device_secret_hash: null,
    device_bound_at: null,
    revision: 1
  }
  const current = license || shell
  const updates: Record<string, string | number | null> = {}

  switch (action) {
    case 'setPlan': {
      const plan = parsed.plan
      if (plan !== 'monthly' && plan !== 'yearly' && plan !== 'lifetime') {
        return json({ error: 'bad_input' }, 400)
      }
      updates.status = 'active'
      updates.plan = plan
      if (plan === 'lifetime') {
        updates.subscription_until = null
        break
      }
      const hasUntil = parsed.until !== undefined
      const hasDays = parsed.days !== undefined
      if (hasUntil === hasDays) return json({ error: 'bad_input' }, 400)
      if (hasUntil) {
        const normalized = normalizeUntil(parsed.until)
        if (!normalized) return json({ error: 'bad_input' }, 400)
        updates.subscription_until = normalized
      } else {
        if (!validFiniteNumber(parsed.days)) return json({ error: 'bad_input' }, 400)
        updates.subscription_until = addDaysIso(timestampMs, parsed.days)
      }
      break
    }
    case 'extend': {
      if (!validFiniteNumber(parsed.days) || parsed.days === 0) return json({ error: 'bad_input' }, 400)
      const currentExpiry = current.subscription_until === null ? Number.NaN : Date.parse(current.subscription_until)
      const base = Number.isFinite(currentExpiry) ? Math.max(timestampMs, currentExpiry) : timestampMs
      updates.status = 'active'
      updates.subscription_until = addDaysIso(base, parsed.days)
      break
    }
    case 'grantTrial': {
      if (parsed.days !== undefined && (!validFiniteNumber(parsed.days) || parsed.days <= 0)) {
        return json({ error: 'bad_input' }, 400)
      }
      const days = parsed.days === undefined ? positiveEnvInteger(env.TRIAL_DAYS, 7) : parsed.days
      updates.status = 'trial'
      updates.plan = 'trial'
      updates.subscription_until = addDaysIso(timestampMs, days)
      break
    }
    case 'revoke':
      updates.status = 'revoked'
      break
    case 'reinstate': {
      if (parsed.days !== undefined && !validFiniteNumber(parsed.days)) return json({ error: 'bad_input' }, 400)
      const subscriptionUntil =
        current.plan === 'lifetime'
          ? null
          : parsed.days === undefined
            ? current.subscription_until
            : addDaysIso(timestampMs, parsed.days)
      if (
        current.plan !== 'lifetime' &&
        (subscriptionUntil === null || !Number.isFinite(Date.parse(subscriptionUntil)) || Date.parse(subscriptionUntil) <= timestampMs)
      ) {
        return json({ error: 'bad_state' }, 409)
      }
      updates.status = 'active'
      updates.subscription_until = subscriptionUntil
      break
    }
    case 'rebindDevice':
      updates.device_secret_hash = null
      updates.device_bound_at = null
      break
    case 'tombstone':
      updates.status = 'revoked'
      updates.notes = appendTombstone(current.notes, timestamp)
      break
    case 'setInfo':
      if (parsed.restaurantName !== undefined) updates.restaurant_name = cleanOptionalString(parsed.restaurantName, 200)
      if (parsed.phone !== undefined) updates.phone = cleanOptionalString(parsed.phone, 40)
      if (parsed.notes !== undefined) updates.notes = cleanOptionalString(parsed.notes, 4000)
      break
  }

  const statements: D1PreparedStatement[] = []
  if (!license) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO licenses (machine_id, status, plan, created_at, updated_at, revision)
         VALUES (?, 'expired', NULL, ?, ?, 1)`
      ).bind(machineId, timestamp, timestamp)
    )
  }

  const columns = Object.keys(updates)
  const assignments = columns.map((column) => `${column} = ?`)
  assignments.push('updated_at = ?')
  const bumpsRevision = action !== 'setInfo'
  if (bumpsRevision) assignments.push('revision = revision + 1')
  statements.push(
    env.DB.prepare(`UPDATE licenses SET ${assignments.join(', ')} WHERE machine_id = ?`).bind(
      ...columns.map((column) => updates[column]),
      timestamp,
      machineId
    )
  )
  statements.push(
    env.DB.prepare('INSERT INTO admin_log (machine_id, action, detail, at) VALUES (?, ?, ?, ?)').bind(
      machineId,
      action,
      JSON.stringify(updates),
      timestamp
    )
  )

  await env.DB.batch(statements)
  license = await getLicense(env, machineId)
  if (!license) throw new Error('mutated license was not readable')
  return json({ ok: true, license: publicLicense(license) })
}

async function runScheduled(env: Env): Promise<void> {
  const operations: Promise<unknown>[] = [
    env.DB.prepare("DELETE FROM rate_limits WHERE datetime(window_start) < datetime('now', '-48 hours')").run()
  ]
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    const keepalive = new URL('/rest/v1/', env.SUPABASE_URL)
    keepalive.searchParams.set('apikey', env.SUPABASE_ANON_KEY)
    operations.push(fetch(keepalive.toString(), { method: 'GET' }))
  }
  await Promise.allSettled(operations)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname.replace(/\/$/, '') || '/'
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method === 'GET' && path === '/health') return json({ ok: true, service: 'ffm-license' })

    try {
      if (request.method === 'POST' && path === '/v1/trial/start') return await handleTrialStart(request, env)
      if (request.method === 'POST' && path === '/v1/license/check') return await handleLicenseCheck(request, env)
      if (request.method === 'POST' && path.startsWith('/v1/admin/')) return await handleAdmin(request, env, path)
      return json({ error: 'not_found' }, 404)
    } catch (error) {
      console.error('license-server request failed', error)
      return json({ error: 'db_failure' }, 503)
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext): Promise<void> {
    context.waitUntil(runScheduled(env))
  }
}
