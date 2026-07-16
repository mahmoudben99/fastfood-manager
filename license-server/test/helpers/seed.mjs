/**
 * Test-only D1 seeding/inspection. The automated runner supplies the exact
 * SQLite file used by its live workerd process so setup writes cannot launch a
 * second Miniflare instance against that database. The Wrangler CLI remains the
 * fallback for the manual workflow documented in test/README.md.
 *
 * Requires: license-server/wrangler.toml configured with a D1 binding whose
 * `database_name` matches TEST_D1_DATABASE_NAME (default below). See test/README.md.
 */

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LICENSE_SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DB_NAME = process.env.TEST_D1_DATABASE_NAME || 'ffm_license_test'
const WRANGLER_BIN = path.join(LICENSE_SERVER_DIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const PERSIST_TO = path.resolve(
  process.env.TEST_WRANGLER_PERSIST_TO || path.join(LICENSE_SERVER_DIR, '.wrangler', 'state')
)
const SQLITE_PATH = process.env.TEST_D1_SQLITE_PATH
let DatabaseSync

if (SQLITE_PATH) ({ DatabaseSync } = await import('node:sqlite'))

function runWrangler(args) {
  return execFileSync(
    process.execPath,
    [WRANGLER_BIN, 'd1', 'execute', DB_NAME, '--local', '--persist-to', PERSIST_TO, ...args],
    {
      cwd: LICENSE_SERVER_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
}

function withSqlite(callback) {
  const db = new DatabaseSync(SQLITE_PATH)
  try {
    db.exec('PRAGMA busy_timeout = 10000')
    return callback(db)
  } finally {
    db.close()
  }
}

/** Execute a write/DDL statement against the local D1. No return value. */
export function d1Exec(sql) {
  if (SQLITE_PATH) {
    withSqlite((db) => db.exec(sql))
    return
  }
  runWrangler(['--command', sql])
}

/**
 * Execute a SELECT and return the parsed rows.
 * NOTE: parses `wrangler d1 execute --json` output as `JSON.parse(stdout)[0].results`.
 * This shape has been stable across recent wrangler v3/v4 releases; if the
 * orchestrator's installed wrangler emits a different shape, adjust THIS helper
 * (infrastructure), not the test assertions that call it.
 */
export function d1Query(sql) {
  if (SQLITE_PATH) {
    return withSqlite((db) => db.prepare(sql).all().map((row) => ({ ...row })))
  }
  const stdout = runWrangler(['--json', '--command', sql])
  const parsed = JSON.parse(stdout)
  const first = Array.isArray(parsed) ? parsed[0] : parsed
  return first?.results ?? []
}

export function nowIso() {
  return new Date().toISOString()
}

export function addDaysIso(fromIso, days) {
  const base = fromIso ? new Date(fromIso) : new Date()
  return new Date(base.getTime() + days * 86_400_000).toISOString()
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}

/**
 * Insert (or replace) a licenses row directly, bypassing the API, so tests can
 * set up preconditions the CONTRACT itself has no endpoint to create (e.g. a
 * pre-seeded unbound paid row simulating the La ZONE migration case).
 */
export function seedLicenseRow(machineId, fields = {}) {
  const now = nowIso()
  const row = {
    machine_id: machineId,
    status: fields.status ?? 'trial',
    plan: fields.plan ?? null,
    subscription_until: fields.subscriptionUntil ?? null,
    device_secret_hash: fields.deviceSecretHash ?? null,
    device_bound_at: fields.deviceBoundAt ?? (fields.deviceSecretHash ? now : null),
    revision: fields.revision ?? 1,
    restaurant_name: fields.restaurantName ?? null,
    phone: fields.phone ?? null,
    app_version: fields.appVersion ?? null,
    notes: fields.notes ?? null,
    created_at: fields.createdAt ?? now,
    updated_at: fields.updatedAt ?? now,
    last_seen: fields.lastSeen ?? null,
    last_ip: fields.lastIp ?? null,
    check_count: fields.checkCount ?? 0
  }
  d1Exec('DELETE FROM licenses WHERE machine_id = ' + esc(machineId))
  const cols = Object.keys(row)
  // revision / check_count are numeric columns; everything else is a quoted literal (or NULL).
  const values = cols
    .map((c) => (c === 'revision' || c === 'check_count' ? String(row[c]) : esc(row[c])))
    .join(', ')
  d1Exec(`INSERT INTO licenses (${cols.join(', ')}) VALUES (${values})`)
}

/** Full reset of the throttle bucket. Call before every test that hits a throttled endpoint. */
export function resetRateLimits() {
  d1Exec('DELETE FROM rate_limits')
}

/** Count admin_log rows for a machine (+ optional action), used to assert exactly-one-row audits. */
export function countAdminLog(machineId, action) {
  const rows = d1Query(
    `SELECT COUNT(*) as n FROM admin_log WHERE machine_id = ${esc(machineId)}` +
      (action ? ` AND action = ${esc(action)}` : '')
  )
  return Number(rows[0]?.n ?? 0)
}

export function getRawLicenseRow(machineId) {
  const rows = d1Query(`SELECT * FROM licenses WHERE machine_id = ${esc(machineId)}`)
  return rows[0] ?? null
}
