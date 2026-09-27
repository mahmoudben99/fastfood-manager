/**
 * v4 fiscal compliance (Algeria, loi de finances 2026 art. 74): shared types for the main process
 * (src/main/services/fiscal/**) and the Compliance page. See migration 025 for the schema.
 */

/** Records must be kept 6 years; the software never purges them automatically. */
export const FISCAL_RETENTION_YEARS = 6

/** Journal event kinds. 'journal_open' is the first entry, written once by migration 025. */
export type FiscalEventType =
  | 'journal_open'
  | 'create'
  | 'line_edit'
  | 'header_edit'
  | 'cancel'
  | 'restore'
  | 'payment'
  | 'refund'
  | 'void'

export interface FiscalJournalEntry {
  seq: number
  created_at: string
  event_type: FiscalEventType
  order_id: number | null
  fiscal_number: number | null
  /** Canonical JSON (sorted keys, no spaces). */
  payload: string
  prev_hash: string
  hash: string
}

export type JournalBreakKind =
  | 'sequence_gap'
  | 'chain_broken'
  | 'hash_mismatch'
  | 'head_mismatch'
  | 'order_deleted'
  | 'order_altered'
  | 'missing_create'
  | 'fiscal_gap'
  | 'fiscal_duplicate'
  | 'unreadable'

export interface JournalBreak {
  kind: JournalBreakKind
  seq?: number
  orderId?: number
  fiscalNumber?: number
  /** Plain English detail (the page shows a translated sentence per kind). */
  detail: string
}

export interface JournalVerification {
  ok: boolean
  verifiedAt: string
  /** Journal entries checked. */
  events: number
  /** Orders whose current content was compared with their last journaled fingerprint. */
  ordersChecked: number
  /** Orders taken before the journal existed (migration 025): numbered, not fingerprinted. */
  preJournalOrders: number
  lastSeq: number
  headHash: string | null
  lastFiscalNumber: number
  /** At most 50 breaks are listed; `truncated` tells there were more. */
  breaks: JournalBreak[]
  truncated: boolean
}

export interface FiscalStatus {
  lastFiscalNumber: number
  journalEvents: number
  journalStartedAt: string | null
  lastEventAt: string | null
  headHash: string | null
  preJournalOrders: number
  /** Years that have orders (for the archive export). */
  years: number[]
  oldestOrderDate: string | null
  retentionYears: number
  lastVerification: JournalVerification | null
}

/** Software vendor ("éditeur") + software identity printed on the attestation. */
export interface VendorInfo {
  vendor_name: string
  vendor_legal_form: string
  vendor_nif: string
  vendor_nis: string
  vendor_rc: string
  vendor_ai: string
  vendor_address: string
  vendor_email: string
  vendor_phone: string
  vendor_signatory: string
  software_name: string
  software_version: string
}

export const VENDOR_KEYS: (keyof VendorInfo)[] = [
  'vendor_name', 'vendor_legal_form', 'vendor_nif', 'vendor_nis', 'vendor_rc', 'vendor_ai', 'vendor_address',
  'vendor_email', 'vendor_phone', 'vendor_signatory', 'software_name', 'software_version'
]

export interface ArchiveYearSummary {
  year: number
  orders: number
  lines: number
  payments: number
  journalEvents: number
  folder: string
}

export type ArchiveExportResult =
  | { ok: true; folder: string; years: ArchiveYearSummary[] }
  | { ok: false; canceled?: boolean; error?: string }

export type AttestationLang = 'fr' | 'ar'

export type AttestationResult = { ok: true; path: string } | { ok: false; canceled?: boolean; error?: string }

/** "00001234" — the printed form of a fiscal ticket number. */
export function formatFiscalNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return '—'
  return String(Math.trunc(value)).padStart(8, '0')
}
