import type Database from 'better-sqlite3'
import type { FiscalJournalEntry, JournalBreak, JournalVerification } from '../../../shared/fiscal'
import { entryHash, GENESIS_HASH } from './hash'
import { fiscalMeta, fiscalReady, journalStartOrderId, lastFiscalNumber, setFiscalMeta } from './journal'
import { orderSnapshot, snapshotHash } from './snapshot'

const MAX_BREAKS = 50

/**
 * Checks everything the journal promises:
 *  1. entries are numbered 1..N without a hole, each prev_hash is the previous hash, and each
 *     hash still matches its content (an edited / removed / inserted entry breaks here);
 *  2. the head anchor (fiscal_meta 'head') matches the last entry (removed tail entries);
 *  3. fiscal numbers run 1..N without gaps or duplicates and match the counter;
 *  4. every order taken since the journal opened has its 'create' entry with the same number,
 *     and every journaled order still exists (orders are never deleted);
 *  5. each journaled order's current fiscal content still hashes to the state hash of its last
 *     journal entry (a direct database edit of lines, prices, totals or payments shows here).
 */
export function verifyJournal(db: Database.Database, now: Date = new Date()): JournalVerification {
  const breaks: JournalBreak[] = []
  let truncated = false
  const add = (entry: JournalBreak): void => {
    if (breaks.length < MAX_BREAKS) breaks.push(entry)
    else truncated = true
  }
  const result = (extra: Partial<JournalVerification>): JournalVerification => ({
    ok: breaks.length === 0,
    verifiedAt: now.toISOString(),
    events: 0,
    ordersChecked: 0,
    preJournalOrders: 0,
    lastSeq: 0,
    headHash: null,
    lastFiscalNumber: 0,
    breaks,
    truncated,
    ...extra
  })
  if (!fiscalReady(db)) {
    add({ kind: 'unreadable', detail: 'The fiscal journal is not installed (migration 025 missing)' })
    return result({})
  }

  let expected = 1
  let previous = GENESIS_HASH
  let events = 0
  let lastSeq = 0
  let headHash: string | null = null
  const lastState = new Map<number, { seq: number; hash: string }>()
  const created = new Map<number, number | null>()
  for (const row of db.prepare('SELECT * FROM fiscal_journal ORDER BY seq').all() as FiscalJournalEntry[]) {
    events += 1
    const at = { seq: row.seq, orderId: row.order_id ?? undefined, fiscalNumber: row.fiscal_number ?? undefined }
    if (row.seq !== expected) add({ kind: 'sequence_gap', ...at, detail: `Entry ${expected} is missing (next entry is ${row.seq})` })
    if (row.prev_hash !== previous) add({ kind: 'chain_broken', ...at, detail: `Entry ${row.seq} does not follow the previous entry` })
    if (entryHash(row) !== row.hash) add({ kind: 'hash_mismatch', ...at, detail: `Entry ${row.seq} was changed after it was written` })
    let payload: { state_hash?: string } | null = null
    try {
      payload = JSON.parse(row.payload)
    } catch {
      add({ kind: 'unreadable', ...at, detail: `Entry ${row.seq} cannot be read` })
    }
    if (row.order_id !== null && payload?.state_hash) lastState.set(row.order_id, { seq: row.seq, hash: payload.state_hash })
    if (row.event_type === 'create' && row.order_id !== null) {
      if (created.has(row.order_id)) add({ kind: 'fiscal_duplicate', ...at, detail: `Order ${row.order_id} was created twice in the journal` })
      created.set(row.order_id, row.fiscal_number)
    }
    previous = row.hash
    expected = row.seq + 1
    lastSeq = row.seq
    headHash = row.hash
  }
  const anchor = fiscalMeta(db, 'head')
  if (anchor && anchor !== `${lastSeq}:${headHash}`) {
    add({ kind: 'head_mismatch', detail: `The journal ends at entry ${lastSeq} but entry ${anchor.split(':')[0]} was written` })
  }

  const startId = journalStartOrderId(db)
  const orders = db.prepare('SELECT id, fiscal_number FROM orders ORDER BY fiscal_number IS NULL, fiscal_number, id').all() as
    { id: number; fiscal_number: number | null }[]
  let nextNumber = 1
  let ordersChecked = 0
  let preJournalOrders = 0
  const present = new Set<number>()
  for (const order of orders) {
    present.add(order.id)
    const at = { orderId: order.id, fiscalNumber: order.fiscal_number ?? undefined }
    if (order.fiscal_number === null) {
      add({ kind: 'fiscal_gap', ...at, detail: `Order ${order.id} has no fiscal number` })
    } else {
      if (order.fiscal_number > nextNumber) {
        add({ kind: 'fiscal_gap', ...at, detail: `Fiscal numbers ${nextNumber}–${order.fiscal_number - 1} are missing` })
      }
      nextNumber = order.fiscal_number + 1
    }
    if (order.id > startId) {
      const number = created.get(order.id)
      if (number === undefined) add({ kind: 'missing_create', ...at, detail: `Order ${order.id} has no journal entry` })
      else if (number !== order.fiscal_number) add({ kind: 'order_altered', ...at, detail: `Order ${order.id} changed fiscal number` })
    }
    const state = lastState.get(order.id)
    if (!state) {
      if (order.id <= startId) preJournalOrders += 1
      continue
    }
    ordersChecked += 1
    if (snapshotHash(orderSnapshot(db, order.id)) !== state.hash) {
      add({ kind: 'order_altered', ...at, seq: state.seq, detail: `Order ${order.id} differs from its journal entry ${state.seq}` })
    }
  }
  const counter = lastFiscalNumber(db)
  if (counter > nextNumber - 1) {
    add({ kind: 'fiscal_gap', fiscalNumber: nextNumber, detail: `Fiscal numbers ${nextNumber}–${counter} were issued but their orders are missing` })
  } else if (counter < nextNumber - 1) {
    add({ kind: 'fiscal_duplicate', fiscalNumber: counter, detail: `The fiscal counter (${counter}) is behind the last ticket (${nextNumber - 1})` })
  }
  for (const [orderId, fiscalNumber] of created) {
    if (!present.has(orderId)) {
      add({ kind: 'order_deleted', orderId, fiscalNumber: fiscalNumber ?? undefined, detail: `Order ${orderId} was deleted` })
    }
  }

  const verification = result({ events, ordersChecked, preJournalOrders, lastSeq, headHash, lastFiscalNumber: nextNumber - 1 })
  try {
    setFiscalMeta(db, 'last_verification', JSON.stringify(verification))
  } catch {
    /* read-only connection: the result is still returned */
  }
  return verification
}
