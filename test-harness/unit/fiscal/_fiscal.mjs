// Shared setup for the v4 fiscal suites (numbering, journal, archive, migration 025).
// Reuses the cash-suite loader (esbuild for the extensionless TS imports). better-sqlite3 is built
// for Electron's ABI, so run:
//   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings --test test-harness/unit/fiscal/*.test.mjs
export * from '../order-effects/cash-test-helpers.mjs'

const src = '../../../src/main'
export const journal = await import(`${src}/services/fiscal/journal.ts`)
export const { verifyJournal } = await import(`${src}/services/fiscal/verify.ts`)
export const { orderSnapshot, snapshotHash } = await import(`${src}/services/fiscal/snapshot.ts`)
export const { buildYearArchive, toCsv } = await import(`${src}/services/fiscal/archive.ts`)
export const { buildAttestationHtml } = await import(`${src}/services/fiscal/attestation.ts`)
export const { getFiscalStatus, getVendorInfo, saveVendorInfo } = await import(`${src}/services/fiscal/status.ts`)
export const channels = await import(`${src}/services/channels.ts`)
export const availability = await import(`${src}/services/availability.ts`)
export const sharedAvailability = await import('../../../src/shared/availability.ts')
export const { decorateMenuItems } = await import(`${src}/services/menu-read-extensions.ts`)

/** Journal rows (payload parsed). */
export function entries(db) {
  return db.prepare('SELECT * FROM fiscal_journal ORDER BY seq').all().map((row) => ({ ...row, data: JSON.parse(row.payload) }))
}

export function fiscalNumbers(db) {
  return db.prepare('SELECT fiscal_number FROM orders ORDER BY fiscal_number').all().map((row) => row.fiscal_number)
}

/** Drops the append-only triggers, as an attacker with direct database access would. */
export function dropFiscalTriggers(db) {
  for (const name of [
    'trg_fiscal_journal_immutable', 'trg_fiscal_journal_no_delete', 'trg_fiscal_journal_contiguous', 'trg_orders_no_delete',
    'trg_orders_fiscal_number_fixed', 'trg_order_payments_fixed', 'trg_order_payments_no_delete'
  ]) db.exec(`DROP TRIGGER IF EXISTS ${name}`)
}

export const range = (n) => Array.from({ length: n }, (_, index) => index + 1)
