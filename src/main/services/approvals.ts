import type Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { APPROVAL_ACTIONS, type ApprovalAction, type ApprovalInput, type ApprovalPolicy } from '../../shared/cash'
import { CashError, cleanText, settingValue } from './cash-error'
import { actingOperator, openShiftId } from './shifts'

/**
 * Manager approval for anti-theft actions: order cancellation, line voids, discounts above
 * `approval_discount_percent` of the subtotal (beyond active promotions), drawer pay-outs, refunds and
 * revealing the expected cash during a blind count. Enforced in the main process (IPC); the UI
 * asks `approvals:check` first and prompts for the PIN + reason.
 *
 * Settings: `approval_enabled` ('false' default — the pre-v4 UI sends no PIN),
 * `approval_actions` (comma list), `approval_discount_percent` (default 10),
 * `manager_pin_hash` (bcrypt; the admin password is always accepted too).
 * Every approval is written to the append-only `approvals` table (who asked, who approved, why, when).
 */
export function approvalPolicy(db: Database.Database): ApprovalPolicy {
  const actions = (settingValue(db, 'approval_actions') ?? 'cancel_order,void_line,discount,pay_out,refund')
    .split(',').map((action) => action.trim())
    .filter((action): action is ApprovalAction => (APPROVAL_ACTIONS as readonly string[]).includes(action))
  const percent = Number(settingValue(db, 'approval_discount_percent') ?? 10)
  return {
    enabled: settingValue(db, 'approval_enabled') === 'true',
    actions,
    discountPercent: Number.isFinite(percent) && percent >= 0 ? percent : 10,
    hasManagerPin: Boolean(settingValue(db, 'manager_pin_hash')),
    blindClose: settingValue(db, 'shift_blind_close') !== 'false'
  }
}

export function isGuarded(db: Database.Database, action: ApprovalAction): boolean {
  if (action === 'view_expected') return approvalPolicy(db).blindClose
  const policy = approvalPolicy(db)
  return policy.enabled && policy.actions.includes(action)
}

// Brute-force brake for a 4-digit PIN: 5 wrong attempts lock approvals for 5 minutes.
const failures: number[] = []
const LOCK_WINDOW_MS = 5 * 60_000

/** 'manager' (manager PIN) | 'admin' (admin password) | null. */
export function verifyApprovalCredential(db: Database.Database, pin: string, now: Date = new Date()): 'manager' | 'admin' | null {
  const recent = failures.filter((at) => now.getTime() - at < LOCK_WINDOW_MS)
  failures.splice(0, failures.length, ...recent)
  if (failures.length >= 5) throw new CashError('not_allowed', 'Too many wrong PIN attempts; wait 5 minutes')
  const secret = String(pin ?? '')
  if (secret) {
    const managerHash = settingValue(db, 'manager_pin_hash')
    if (managerHash && bcrypt.compareSync(secret, managerHash)) return 'manager'
    const adminHash = settingValue(db, 'admin_password_hash')
    if (adminHash && bcrypt.compareSync(secret, adminHash)) return 'admin'
  }
  failures.push(now.getTime())
  return null
}

/**
 * Throws `APPROVAL_REQUIRED:<action>` / `APPROVAL_INVALID:<action>` when the action is guarded
 * and the approval is missing / wrong; records the approval when it is accepted.
 */
export function requireApproval(
  db: Database.Database,
  action: ApprovalAction,
  approval: ApprovalInput | undefined | null,
  context: { orderId?: number | null; detail?: unknown } = {},
  now: Date = new Date()
): { approvedBy: 'manager' | 'admin'; operator: string; reason: string } | null {
  if (!isGuarded(db, action)) return null
  const reason = cleanText(approval?.reason, 200)
  if (!approval?.pin || !reason) throw new Error(`APPROVAL_REQUIRED:${action}`)
  const approvedBy = verifyApprovalCredential(db, approval.pin, now)
  if (!approvedBy) throw new Error(`APPROVAL_INVALID:${action}`)
  const operator = actingOperator(db, approval.operator)
  db.prepare(
    `INSERT INTO approvals (action, order_id, shift_id, requested_by, approved_by, reason, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    action, context.orderId ?? null, openShiftId(db), operator, approvedBy, reason,
    context.detail === undefined ? null : JSON.stringify(context.detail), now.toISOString()
  )
  return { approvedBy, operator, reason }
}

/** Keys only the approval IPC may write (settings:set refuses them; see settings.ipc PROTECTED_KEYS). */
export const APPROVAL_SETTING_KEYS = [
  'manager_pin_hash', 'approval_enabled', 'approval_actions', 'approval_discount_percent', 'shift_blind_close'
]

function assertAdmin(db: Database.Database, adminPassword: string): void {
  const adminHash = settingValue(db, 'admin_password_hash')
  if (!adminHash || !bcrypt.compareSync(String(adminPassword ?? ''), adminHash)) {
    throw new CashError('not_allowed', 'The admin password is incorrect')
  }
}

/** Change the approval policy; the admin password authorises it (a cashier cannot switch it off). */
export function saveApprovalPolicy(
  db: Database.Database,
  adminPassword: string,
  policy: Partial<Pick<ApprovalPolicy, 'enabled' | 'actions' | 'discountPercent' | 'blindClose'>>
): ApprovalPolicy {
  assertAdmin(db, adminPassword)
  const write = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  if (policy.enabled !== undefined) write.run('approval_enabled', policy.enabled ? 'true' : 'false')
  if (policy.blindClose !== undefined) write.run('shift_blind_close', policy.blindClose ? 'true' : 'false')
  if (policy.actions !== undefined) {
    const actions = (Array.isArray(policy.actions) ? policy.actions : [])
      .filter((action) => (APPROVAL_ACTIONS as readonly string[]).includes(action) && action !== 'view_expected')
    write.run('approval_actions', [...new Set(actions)].join(','))
  }
  if (policy.discountPercent !== undefined) {
    const percent = Number(policy.discountPercent)
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new CashError('invalid_input', 'Invalid discount percent')
    write.run('approval_discount_percent', String(percent))
  }
  return approvalPolicy(db)
}

/** Set (or with an empty pin, clear) the manager PIN; the admin password authorises the change. */
export function setManagerPin(db: Database.Database, adminPassword: string, pin: string): void {
  assertAdmin(db, adminPassword)
  const value = String(pin ?? '').trim()
  if (value && !/^\d{4,8}$/.test(value)) throw new CashError('invalid_input', 'The manager PIN must be 4 to 8 digits')
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run('manager_pin_hash', value ? bcrypt.hashSync(value, 10) : '')
}

/**
 * A discount needs approval when it goes beyond `allowance` (the active promotions, or the
 * order's stored discount on an edit) AND exceeds approval_discount_percent of the subtotal.
 */
export function discountNeedsApproval(
  db: Database.Database,
  input: { subtotal: number; discount: number; allowance: number }
): boolean {
  if (!isGuarded(db, 'discount')) return false
  const discount = Math.round(Number(input.discount) || 0)
  if (discount <= Math.round(Number(input.allowance) || 0) + 1) return false
  const subtotal = Math.max(0, Number(input.subtotal) || 0)
  return subtotal > 0 && (discount / subtotal) * 100 > approvalPolicy(db).discountPercent
}

/** True when an edit removes an existing line or lowers its quantity. */
export function editVoidsLines(
  existing: { id: number; quantity: number }[],
  incoming: { order_item_id?: number; quantity: number }[]
): boolean {
  const next = new Map(incoming.filter((line) => line.order_item_id !== undefined).map((line) => [line.order_item_id!, line.quantity]))
  return existing.some((item) => !next.has(item.id) || Number(next.get(item.id)) < item.quantity)
}

export function listApprovals(db: Database.Database, options: { shiftId?: number; orderId?: number } = {}): unknown[] {
  return db.prepare(
    `SELECT * FROM approvals WHERE (? IS NULL OR shift_id = ?) AND (? IS NULL OR order_id = ?) ORDER BY id DESC LIMIT 500`
  ).all(options.shiftId ?? null, options.shiftId ?? null, options.orderId ?? null, options.orderId ?? null)
}
