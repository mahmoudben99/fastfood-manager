/**
 * diagnostics:machine-id — customer-PC preflight before D1 seeding (brief WP-D §3).
 *
 * Prints the OLD (persisted) vs NEW (freshly recomputed) machine-identity derivation and the
 * machine-id PINNING decision the license client will make. STRICTLY READ-ONLY: it never writes to
 * the settings DB, never contacts the network, and never touches the device secret.
 *
 * Pinning rule (matches the frozen machine_id_pinned test): prefer the STORED id over a recompute;
 * on mismatch keep the stored id and surface a diagnostic flag. Seeding D1 must use the `effective`
 * id below.
 *
 * Usage: node scripts/diagnostics-machine-id.mjs [--json]
 */
import { createHash } from 'node:crypto'
import { cpus, hostname, userInfo } from 'node:os'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const asJson = process.argv.includes('--json')

// Recompute exactly as src/main/activation/activation.ts getMachineId() does.
function recomputeMachineId() {
  const override = process.env.FFM_MACHINE_ID_OVERRIDE
  const cpuModel = cpus()[0]?.model || 'unknown'
  const host = hostname()
  const user = userInfo().username
  const raw = `${cpuModel}::${host}::${user}`
  const derived = createHash('sha256').update(raw).digest('hex').substring(0, 16).toUpperCase()
  return {
    override: override ? override.toUpperCase() : null,
    inputs: { cpuModel, host, user },
    derived
  }
}

// Best-effort READ-ONLY lookup of the persisted machine_id (and device-secret presence) so support
// can see what a reinstall/clone would inherit. Absent DB → stored: null (never an error).
function readStored() {
  const candidates = [
    process.env.FFM_SETTINGS_DB,
    process.env.APPDATA && join(process.env.APPDATA, 'Fast Food Manager', 'data', 'fastfood-manager.db')
  ].filter(Boolean)
  const dbPath = candidates.find((p) => p && existsSync(p))
  if (!dbPath) return { dbPath: null, machineId: null, deviceSecretPresent: null }
  try {
    const require = createRequire(import.meta.url)
    const Database = require('better-sqlite3')
    const db = new Database(dbPath, { readonly: true, fileMustExist: true })
    const read = (key) => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
      return row ? row.value : null
    }
    const machineId = read('machine_id')
    const deviceSecretPresent = read('license_device_secret') != null
    db.close()
    return { dbPath, machineId, deviceSecretPresent }
  } catch (error) {
    return { dbPath, machineId: null, deviceSecretPresent: null, error: String(error) }
  }
}

const recompute = recomputeMachineId()
const stored = readStored()

// Pinning: override wins (test isolation), then stored, then freshly recomputed.
const effective = recompute.override ?? stored.machineId ?? recompute.derived
const machineIdMismatch = stored.machineId != null && stored.machineId !== recompute.derived

const report = {
  effective,
  machineIdMismatch,
  old: { source: stored.dbPath ? 'settings-db' : 'none', machineId: stored.machineId, dbPath: stored.dbPath },
  new: { source: 'recompute', ...recompute },
  deviceSecretPresent: stored.deviceSecretPresent,
  note: machineIdMismatch
    ? 'MISMATCH: hardware changed vs stored id. Client PINS the stored id; do NOT reseed under the recomputed id.'
    : 'Stored and recomputed ids agree (or no stored id yet).'
}

if (asJson) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
} else {
  console.log('FFM machine-id preflight (read-only)\n')
  console.log(`  effective (use for D1 seeding): ${report.effective}`)
  console.log(`  machineIdMismatch:              ${report.machineIdMismatch}`)
  console.log(`  old (stored):                   ${report.old.machineId ?? '(none)'}  [${report.old.source}]`)
  console.log(`  new (recomputed):               ${report.new.derived}`)
  console.log(`  override (FFM_MACHINE_ID_OVERRIDE): ${report.new.override ?? '(none)'}`)
  console.log(`  device secret present:          ${report.deviceSecretPresent ?? '(unknown)'}`)
  console.log(`\n  ${report.note}`)
}
