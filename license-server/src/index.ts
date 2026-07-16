/**
 * Fast Food Manager — licensing Worker (Cloudflare).
 *
 * The single source of truth for every machine's license. The desktop app POSTs its machine
 * id to /v1/license/check and gets back a short-lived Ed25519-SIGNED token describing its
 * state (active / trial / expired / revoked) and a paid-through date. The app can verify the
 * signature but cannot forge one, so it can no longer lie about being licensed. You control
 * every machine from the admin endpoints — activate, extend, grant trial, expire, revoke.
 */

import { signToken } from './crypto'

export interface Env {
  DB: D1Database
  LICENSE_PRIVATE_KEY: string // PKCS8 base64 (secret)
  ADMIN_API_KEY: string // secret
  TRIAL_DAYS?: string // default 7
  TOKEN_TTL_DAYS?: string // default 7 (offline grace window)
  AUTO_TRIAL?: string // 'true' (default) = unknown machines auto-start a trial
}

type EffectiveStatus = 'active' | 'trial' | 'expired' | 'revoked'

interface License {
  machine_id: string
  status: string
  plan: string | null
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
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  })

const nowIso = () => new Date().toISOString()
const addDaysIso = (fromIso: string | null, days: number): string => {
  const base = fromIso ? new Date(fromIso) : new Date()
  return new Date(base.getTime() + days * 86400_000).toISOString()
}

/** Derive the effective status the app should act on, from admin intent + dates. */
function effective(lic: License, now = new Date()): { st: EffectiveStatus; sub: string | null } {
  const sub = lic.subscription_until
  if (lic.status === 'revoked') return { st: 'revoked', sub }
  const subDate = sub ? new Date(sub) : null
  if (lic.status === 'active') {
    if (!subDate) return { st: 'active', sub: null } // lifetime
    return now <= subDate ? { st: 'active', sub } : { st: 'expired', sub }
  }
  if (lic.status === 'trial') {
    return subDate && now <= subDate ? { st: 'trial', sub } : { st: 'expired', sub }
  }
  return { st: 'expired', sub }
}

async function getLicense(env: Env, machineId: string): Promise<License | null> {
  return env.DB.prepare('SELECT * FROM licenses WHERE machine_id = ?')
    .bind(machineId)
    .first<License>()
}

async function logAdmin(env: Env, machineId: string, action: string, detail: string): Promise<void> {
  await env.DB.prepare('INSERT INTO admin_log (machine_id, action, detail, at) VALUES (?, ?, ?, ?)')
    .bind(machineId, action, detail, nowIso())
    .run()
}

// ── App-facing: license check ────────────────────────────────────────────────
async function handleCheck(req: Request, env: Env): Promise<Response> {
  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_json' }, 400)
  }
  const machineId = String(body?.machineId || '').toUpperCase().trim()
  if (!/^[A-Z0-9]{6,64}$/.test(machineId)) return json({ error: 'bad_machine_id' }, 400)

  const restaurantName = body?.restaurantName ? String(body.restaurantName).slice(0, 200) : null
  const phone = body?.phone ? String(body.phone).slice(0, 40) : null
  const appVersion = body?.appVersion ? String(body.appVersion).slice(0, 40) : null
  const ip = req.headers.get('cf-connecting-ip') || null
  const trialDays = parseInt(env.TRIAL_DAYS || '7', 10) || 7
  const ttlDays = parseInt(env.TOKEN_TTL_DAYS || '7', 10) || 7
  const autoTrial = (env.AUTO_TRIAL ?? 'true') !== 'false'

  let lic = await getLicense(env, machineId)

  if (!lic) {
    // Unknown machine → auto-start a trial (or immediately expired if auto-trial is off).
    const now = nowIso()
    const status = autoTrial ? 'trial' : 'expired'
    const subUntil = autoTrial ? addDaysIso(null, trialDays) : now
    await env.DB.prepare(
      `INSERT INTO licenses
       (machine_id, status, plan, subscription_until, restaurant_name, phone, app_version,
        created_at, updated_at, last_seen, last_ip, check_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
      .bind(machineId, status, autoTrial ? 'trial' : null, subUntil, restaurantName, phone, appVersion, now, now, now, ip)
      .run()
    lic = await getLicense(env, machineId)
  } else {
    // Update telemetry + any freshly-reported metadata (don't clobber with nulls).
    await env.DB.prepare(
      `UPDATE licenses SET last_seen = ?, last_ip = ?, check_count = check_count + 1,
         app_version = COALESCE(?, app_version),
         restaurant_name = COALESCE(?, restaurant_name),
         phone = COALESCE(?, phone)
       WHERE machine_id = ?`
    )
      .bind(nowIso(), ip, appVersion, restaurantName, phone, machineId)
      .run()
  }

  const eff = effective(lic!)
  const nowSec = Math.floor(Date.now() / 1000)
  const payload = {
    v: 1,
    mid: machineId,
    st: eff.st,
    plan: lic!.plan || null,
    sub: eff.sub || null,
    name: lic!.restaurant_name || null,
    iat: nowSec,
    exp: nowSec + ttlDays * 86400
  }
  const token = await signToken(payload, env.LICENSE_PRIVATE_KEY)
  // The token is authoritative; the plain fields are just for convenience/telemetry.
  return json({ token, status: eff.st, subscriptionUntil: eff.sub, graceExp: payload.exp })
}

// ── Admin ────────────────────────────────────────────────────────────────────
function requireAdmin(req: Request, env: Env): boolean {
  const auth = req.headers.get('Authorization') || ''
  const key = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  // Constant-time-ish compare
  if (!key || key.length !== env.ADMIN_API_KEY.length) return false
  let diff = 0
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ env.ADMIN_API_KEY.charCodeAt(i)
  return diff === 0
}

async function handleAdmin(req: Request, env: Env, path: string): Promise<Response> {
  if (!requireAdmin(req, env)) return json({ error: 'unauthorized' }, 401)
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* some admin GETs have no body */
  }

  if (path === '/v1/admin/list') {
    const search = body?.search ? `%${String(body.search)}%` : '%'
    const limit = Math.min(500, parseInt(body?.limit, 10) || 200)
    const offset = parseInt(body?.offset, 10) || 0
    const { results } = await env.DB.prepare(
      `SELECT * FROM licenses
       WHERE machine_id LIKE ? OR IFNULL(restaurant_name,'') LIKE ? OR IFNULL(phone,'') LIKE ?
       ORDER BY last_seen DESC NULLS LAST, created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(search, search, search, limit, offset)
      .all<License>()
    const now = new Date()
    const withEff = (results || []).map((l) => ({ ...l, effective: effective(l, now).st }))
    return json({ licenses: withEff })
  }

  if (path === '/v1/admin/get') {
    const machineId = String(body?.machineId || '').toUpperCase().trim()
    const lic = await getLicense(env, machineId)
    if (!lic) return json({ error: 'not_found' }, 404)
    return json({ license: { ...lic, effective: effective(lic).st } })
  }

  if (path === '/v1/admin/mutate') {
    const machineId = String(body?.machineId || '').toUpperCase().trim()
    if (!/^[A-Z0-9]{6,64}$/.test(machineId)) return json({ error: 'bad_machine_id' }, 400)
    const action = String(body?.action || '')

    let lic = await getLicense(env, machineId)
    // Upsert a shell row so you can pre-provision a machine that hasn't checked in yet.
    if (!lic) {
      const now = nowIso()
      await env.DB.prepare(
        `INSERT INTO licenses (machine_id, status, created_at, updated_at) VALUES (?, 'expired', ?, ?)`
      )
        .bind(machineId, now, now)
        .run()
      lic = await getLicense(env, machineId)
    }

    let set: Partial<License> = {}
    const days = parseInt(body?.days, 10)
    switch (action) {
      case 'activate': // paid license: plan + paid-through (days from now, explicit date, or lifetime)
        set = {
          status: 'active',
          plan: body?.plan || lic!.plan || 'monthly',
          subscription_until: body?.until || (Number.isFinite(days) ? addDaysIso(null, days) : lic!.plan === 'lifetime' || body?.plan === 'lifetime' ? null : lic!.subscription_until)
        }
        break
      case 'lifetime':
        set = { status: 'active', plan: 'lifetime', subscription_until: null }
        break
      case 'extend': {
        // Push the paid-through date forward from the later of now / current expiry.
        if (!Number.isFinite(days) || days === 0) return json({ error: 'bad_days' }, 400)
        const base = lic!.subscription_until && new Date(lic!.subscription_until) > new Date() ? lic!.subscription_until : null
        set = { status: 'active', subscription_until: addDaysIso(base, days) }
        break
      }
      case 'grantTrial':
        set = { status: 'trial', plan: 'trial', subscription_until: addDaysIso(null, Number.isFinite(days) ? days : parseInt(env.TRIAL_DAYS || '7', 10) || 7) }
        break
      case 'expire': // subscription ended (soft) — app locks, but can be reinstated
        set = { status: 'expired', subscription_until: nowIso() }
        break
      case 'revoke': // hard kill switch (non-payment / abuse)
        set = { status: 'revoked' }
        break
      case 'reinstate':
        set = { status: 'active', subscription_until: Number.isFinite(days) ? addDaysIso(null, days) : lic!.subscription_until }
        break
      case 'setInfo':
        set = {
          restaurant_name: body?.restaurantName ?? lic!.restaurant_name,
          phone: body?.phone ?? lic!.phone,
          notes: body?.notes ?? lic!.notes
        }
        break
      case 'delete':
        await env.DB.prepare('DELETE FROM licenses WHERE machine_id = ?').bind(machineId).run()
        await logAdmin(env, machineId, 'delete', '')
        return json({ ok: true, deleted: true })
      default:
        return json({ error: 'unknown_action' }, 400)
    }

    const cols = Object.keys(set)
    if (cols.length) {
      const assignments = cols.map((c) => `${c} = ?`).join(', ')
      await env.DB.prepare(`UPDATE licenses SET ${assignments}, updated_at = ? WHERE machine_id = ?`)
        .bind(...cols.map((c) => (set as any)[c]), nowIso(), machineId)
        .run()
    }
    await logAdmin(env, machineId, action, JSON.stringify(set))
    const updated = await getLicense(env, machineId)
    return json({ ok: true, license: { ...updated, effective: effective(updated!).st } })
  }

  return json({ error: 'not_found' }, 404)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname.replace(/\/$/, '') || '/'

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    if (path === '/' || path === '/health') return json({ ok: true, service: 'ffm-license' })

    if (req.method === 'POST' && path === '/v1/license/check') return handleCheck(req, env)

    if (path.startsWith('/v1/admin/')) return handleAdmin(req, env, path)

    return json({ error: 'not_found' }, 404)
  }
}
