import type Database from 'better-sqlite3'
import { businessDateInAlgiers } from '../../shared/order-edit'
import { denominationsTotal, type DenominationCounts } from '../../shared/cash'
import type {
  CashMovement, CashMovementInput, CloseShiftInput, OpenShiftInput, Shift, ShiftReport
} from '../../shared/shift-report'
import { CashError, cleanText, settingValue, wholeDinars } from './cash-error'
import { buildShiftReport } from './shift-report-data'

/**
 * Shifts / cash drawer (Loyverse / Foodics style). One open shift per register; orders and
 * payments taken while it is open carry its id. Setting `register_id` names this till
 * (default 'main'); `require_open_shift` = 'true' refuses new orders while no shift is open.
 */

export function registerId(db: Database.Database): string {
  return cleanText(settingValue(db, 'register_id'), 40) || 'main'
}

export function getOpenShift(db: Database.Database): Shift | null {
  return (db.prepare("SELECT * FROM shifts WHERE register_id = ? AND status = 'open'").get(registerId(db)) as Shift | undefined) ?? null
}

export function openShiftId(db: Database.Database): number | null {
  return getOpenShift(db)?.id ?? null
}

export function requireOpenShift(db: Database.Database): boolean {
  return settingValue(db, 'require_open_shift') === 'true'
}

/** Blind close (default on): the expected cash stays hidden until the drawer has been counted. */
export function blindClose(db: Database.Database): boolean {
  return settingValue(db, 'shift_blind_close') !== 'false'
}

/** Who performed an action: the explicit operator, else the open shift's cashier, else 'system'. */
export function actingOperator(db: Database.Database, operator?: string | null): string {
  return cleanText(operator, 80) || getOpenShift(db)?.cashier_name || 'system'
}

export function getShift(db: Database.Database, id: number): Shift | null {
  return (db.prepare('SELECT * FROM shifts WHERE id = ?').get(id) as Shift | undefined) ?? null
}

export function listShifts(
  db: Database.Database,
  options: { from?: string; to?: string; limit?: number } = {}
): Shift[] {
  const limit = Math.min(Math.max(Math.floor(Number(options.limit) || 50), 1), 500)
  return db.prepare(
    `SELECT * FROM shifts
     WHERE (? IS NULL OR business_date >= ?) AND (? IS NULL OR business_date <= ?)
     ORDER BY opened_at DESC, id DESC LIMIT ?`
  ).all(options.from ?? null, options.from ?? null, options.to ?? null, options.to ?? null, limit) as Shift[]
}

export function openShift(db: Database.Database, input: OpenShiftInput, now: Date = new Date()): Shift {
  const openingFloat = wholeDinars(input?.opening_float ?? 0, 'Opening float')
  let cashierName = cleanText(input?.cashier_name, 80)
  let workerId: number | null = null
  if (input?.cashier_worker_id !== undefined && input.cashier_worker_id !== null) {
    const worker = db.prepare('SELECT id, name FROM workers WHERE id = ? AND is_active = 1')
      .get(Number(input.cashier_worker_id)) as { id: number; name: string } | undefined
    if (!worker) throw new CashError('invalid_input', 'The selected cashier is not an active worker')
    workerId = worker.id
    cashierName = cashierName || worker.name
  }
  if (!cashierName) throw new CashError('invalid_input', 'A cashier name is required to open a shift')

  return db.transaction(() => {
    const open = getOpenShift(db)
    if (open) {
      throw new CashError('shift_open', `SHIFT_ALREADY_OPEN: shift #${open.id} (${open.cashier_name}) is still open`)
    }
    const id = Number(db.prepare(
      `INSERT INTO shifts (register_id, status, cashier_name, cashier_worker_id, opening_float, opened_at,
                           business_date, open_note)
       VALUES (?, 'open', ?, ?, ?, ?, ?, ?)`
    ).run(
      registerId(db), cashierName, workerId, openingFloat, now.toISOString(),
      businessDateInAlgiers(now), cleanText(input?.note, 300)
    ).lastInsertRowid)
    return getShift(db, id)!
  })()
}

function currentShiftOrThrow(db: Database.Database): Shift {
  const shift = getOpenShift(db)
  if (!shift) throw new CashError('no_open_shift', 'NO_OPEN_SHIFT: open a shift first')
  return shift
}

/** Pay-in / pay-out (e.g. "bought bread") on the open shift. */
export function addCashMovement(db: Database.Database, input: CashMovementInput, now: Date = new Date()): CashMovement {
  if (input?.kind !== 'pay_in' && input?.kind !== 'pay_out') {
    throw new CashError('invalid_input', 'Cash movement kind must be pay_in or pay_out')
  }
  const amount = wholeDinars(input.amount, 'Amount', 1)
  const reason = cleanText(input.reason, 200)
  if (!reason) throw new CashError('invalid_input', 'A reason is required for a cash movement')
  const shift = currentShiftOrThrow(db)
  const id = Number(db.prepare(
    `INSERT INTO cash_movements (shift_id, kind, amount, reason, operator, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(shift.id, input.kind, amount, reason, actingOperator(db, input.operator), now.toISOString()).lastInsertRowid)
  return db.prepare('SELECT * FROM cash_movements WHERE id = ?').get(id) as CashMovement
}

export function listCashMovements(db: Database.Database, shiftId: number): CashMovement[] {
  return db.prepare('SELECT * FROM cash_movements WHERE shift_id = ? ORDER BY id').all(shiftId) as CashMovement[]
}

/** X report: snapshot of the open shift. `reveal` shows the expected cash during a blind count. */
export function currentShiftReport(db: Database.Database, now: Date = new Date(), reveal = false): ShiftReport {
  const shift = currentShiftOrThrow(db)
  return buildShiftReport(db, shift.id, { kind: 'X', now, blind: blindClose(db) && !reveal })
}

/** Stored Z report of a closed shift, or a live X report of the open one. */
export function shiftReport(db: Database.Database, shiftId: number, now: Date = new Date(), reveal = false): ShiftReport {
  const shift = getShift(db, shiftId)
  if (!shift) throw new CashError('not_found', 'Shift not found')
  if (shift.status === 'closed') {
    const stored = db.prepare('SELECT z_report FROM shifts WHERE id = ?').get(shiftId) as { z_report: string | null }
    if (stored.z_report) return JSON.parse(stored.z_report) as ShiftReport
    return buildShiftReport(db, shiftId, { kind: 'Z', now })
  }
  return buildShiftReport(db, shiftId, { kind: 'X', now, blind: blindClose(db) && !reveal })
}

/**
 * Close the open shift with the counted cash (or a count by denomination). Stores the Z report as
 * an immutable snapshot and queues the owner's Telegram summary (setting `telegram_shift_report`).
 */
export function closeShift(
  db: Database.Database,
  input: CloseShiftInput,
  now: Date = new Date()
): { shift: Shift; report: ShiftReport } {
  let denominations: DenominationCounts | null = null
  let counted: number
  if (input?.denominations && typeof input.denominations === 'object') {
    try {
      counted = denominationsTotal(input.denominations)
    } catch (error) {
      throw new CashError('invalid_input', (error as Error).message)
    }
    denominations = Object.fromEntries(
      Object.entries(input.denominations).filter(([, count]) => Number(count) > 0)
    ) as DenominationCounts
  } else {
    counted = wholeDinars(input?.counted_cash, 'Counted cash')
  }

  return db.transaction(() => {
    const shift = currentShiftOrThrow(db)
    const closedAt = now.toISOString()
    const closedBy = cleanText(input?.closed_by, 80) || shift.cashier_name
    const closing: Shift = { ...shift, status: 'closed', closed_at: closedAt, closed_by: closedBy }
    const report = buildShiftReport(db, shift.id, {
      kind: 'Z', now, counted, denominations, shiftOverride: closing
    })
    db.prepare(
      `UPDATE shifts SET status = 'closed', closed_at = ?, closed_by = ?, counted_cash = ?, denominations = ?,
         expected_cash = ?, over_short = ?, close_note = ?
       WHERE id = ? AND status = 'open'`
    ).run(
      closedAt, closedBy, counted, denominations ? JSON.stringify(denominations) : null,
      report.cash.expected, report.cash.over_short, cleanText(input?.note, 300), shift.id
    )
    const closed = getShift(db, shift.id)!
    const finalReport: ShiftReport = { ...report, shift: closed }
    db.prepare('UPDATE shifts SET z_report = ? WHERE id = ?').run(JSON.stringify(finalReport), shift.id)
    if (settingValue(db, 'telegram_shift_report') !== 'false') {
      db.prepare("INSERT INTO outbox_events (event_type, payload) VALUES ('telegram', ?)")
        .run(JSON.stringify({ kind: 'shift-report', shiftId: shift.id }))
    }
    return { shift: closed, report: finalReport }
  })()
}
