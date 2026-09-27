import { createHash } from 'crypto'

/**
 * Canonical JSON for the fiscal journal: object keys sorted, no whitespace, `undefined` fields
 * dropped. The same value always serialises to the same bytes, so its SHA-256 is stable.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Fiscal journal values must be finite numbers')
    return JSON.stringify(value)
  }
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  throw new Error(`Unsupported value in the fiscal journal: ${typeof value}`)
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** prev_hash of the very first journal entry. */
export const GENESIS_HASH = '0'.repeat(64)

export interface HashedFields {
  seq: number
  created_at: string
  event_type: string
  order_id: number | null
  fiscal_number: number | null
  payload: string
  prev_hash: string
}

/** hash = SHA-256 of the canonical JSON of every stored column except the hash itself. */
export function entryHash(fields: HashedFields): string {
  return sha256(canonicalJson({
    seq: fields.seq,
    created_at: fields.created_at,
    event_type: fields.event_type,
    order_id: fields.order_id ?? null,
    fiscal_number: fields.fiscal_number ?? null,
    payload: fields.payload,
    prev_hash: fields.prev_hash
  }))
}
