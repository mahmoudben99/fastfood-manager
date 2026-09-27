import type Database from 'better-sqlite3'
import { FISCAL_RETENTION_YEARS, VENDOR_KEYS, type FiscalStatus, type JournalVerification, type VendorInfo } from '../../../shared/fiscal'
import { fiscalMeta, fiscalReady, lastFiscalNumber } from './journal'

/** Compliance page header numbers (cheap: no hashing; the verification is a separate call). */
export function getFiscalStatus(db: Database.Database): FiscalStatus {
  const years = (db.prepare(
    "SELECT DISTINCT CAST(substr(order_date, 1, 4) AS INTEGER) AS year FROM orders WHERE order_date IS NOT NULL ORDER BY year DESC"
  ).all() as { year: number }[]).map((row) => row.year).filter((year) => Number.isInteger(year) && year > 2000)
  const oldest = (db.prepare('SELECT MIN(order_date) AS d FROM orders').get() as { d: string | null }).d
  if (!fiscalReady(db)) {
    return {
      lastFiscalNumber: 0, journalEvents: 0, journalStartedAt: null, lastEventAt: null, headHash: null, preJournalOrders: 0,
      years, oldestOrderDate: oldest, retentionYears: FISCAL_RETENTION_YEARS, lastVerification: null
    }
  }
  const head = db.prepare('SELECT seq, hash, created_at FROM fiscal_journal ORDER BY seq DESC LIMIT 1').get() as
    | { seq: number; hash: string; created_at: string }
    | undefined
  let lastVerification: JournalVerification | null = null
  try {
    const raw = fiscalMeta(db, 'last_verification')
    lastVerification = raw ? JSON.parse(raw) : null
  } catch {
    lastVerification = null
  }
  return {
    lastFiscalNumber: lastFiscalNumber(db),
    journalEvents: head?.seq ?? 0,
    journalStartedAt: fiscalMeta(db, 'journal_started_at'),
    lastEventAt: head?.created_at ?? null,
    headHash: head?.hash ?? null,
    preJournalOrders: Number(fiscalMeta(db, 'pre_journal_orders')) || 0,
    years,
    oldestOrderDate: oldest,
    retentionYears: FISCAL_RETENTION_YEARS,
    lastVerification
  }
}

const TEXT_MAX = 200

export function getVendorInfo(db: Database.Database, appVersion: string): VendorInfo {
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (${VENDOR_KEYS.map(() => '?').join(',')})`)
    .all(...VENDOR_KEYS) as { key: keyof VendorInfo; value: string }[]
  const info = Object.fromEntries(VENDOR_KEYS.map((key) => [key, ''])) as unknown as VendorInfo
  for (const row of rows) info[row.key] = row.value ?? ''
  if (!info.software_name) info.software_name = 'Fast Food Manager'
  if (!info.software_version) info.software_version = appVersion
  return info
}

export function saveVendorInfo(db: Database.Database, patch: Partial<VendorInfo>, appVersion: string): VendorInfo {
  if (!patch || typeof patch !== 'object') throw new Error('Invalid vendor information')
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  db.transaction(() => {
    for (const key of VENDOR_KEYS) {
      const value = patch[key]
      if (value === undefined) continue
      if (typeof value !== 'string') throw new Error(`Invalid ${key}`)
      upsert.run(key, value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, TEXT_MAX))
    }
  })()
  return getVendorInfo(db, appVersion)
}
