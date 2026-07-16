// Frozen acceptance-test contract for WP-F (order effects + edit safety).
//
// This file is DATA/SPEC for the test suite in this folder — it is NOT an implementation
// and it is not wired into the build. It pins the exact module surface the WP-F
// implementer must produce so the *.test.mjs files in this folder compile/import against
// a stable shape instead of guessing at file paths and function names.
//
// CONTRACT.md §3 is authoritative and is reproduced verbatim below where it speaks.
// Everywhere CONTRACT.md is SILENT, this file states the test author's minimal choice
// under an "ASSUMPTION N" comment. Those are genuine ambiguities, not implementation
// details — see the test-author report for the full list and rationale. Disputes over
// an ASSUMPTION go to the orchestrator; the implementer may not silently change one.
//
// Hard environment fact driving several of these assumptions: `src/main/database/
// connection.ts` imports Electron's `app` at module scope, and every existing repo
// (`orders.repo.ts`, `menu.repo.ts`, `customers.repo.ts`, `stock.repo.ts`, `workers.repo.ts`,
// `promotions.repo.ts`) imports `getDb` from that module. Empirically (see report),
// importing any of those files crashes under plain `node:test`, even when run through
// Electron's own bundled Node via ELECTRON_RUN_AS_NODE=1 (electron's CJS export shape
// doesn't survive the ESM loader chain outside a real Electron bootstrap). Per the brief
// ("Test through the service/repo layer ... never through Electron UI"), every new
// WP-F module must therefore take its database handle as an explicit constructor
// argument and must NEVER import `../connection` (directly or transitively) — this is
// not a style preference, it is the only way this package is unit-testable at all.

import type Database from 'better-sqlite3'

// ---------------------------------------------------------------------------------
// §3 verbatim types (CONTRACT.md is authoritative here — implementer must not diverge)
// ---------------------------------------------------------------------------------

export type OrderSource = 'pos' | 'tablet' | 'remote'

export interface OrderLineInput {
  menuItemId: number
  quantity: number // finite positive integer, 1..999
  unitPriceOverride?: number // POS-only; ignored for tablet/remote
  note?: string
  workerId?: number // explicit assignment; must be an ACTIVE worker
}

export interface CreateOrderInput {
  source: OrderSource
  sourceRequestId: string // uuid; POS generates one per checkout too
  orderType: 'local' | 'takeout' | 'delivery'
  tableNumber?: string
  lines: OrderLineInput[] // 1..100 lines, aggregate units <= 999
  customer?: { phone?: string; name?: string }
  note?: string
  applyAutoPromotions: boolean
}

export interface CreateOrderSuccess {
  ok: true
  duplicate: boolean
  orderId: number
  dailyNumber: number
  orderDate: string // 'YYYY-MM-DD' Africa/Algiers — captured ONCE
  subtotal: number
  discountAmount: number
  total: number
  printJobIds: number[]
}

export interface CreateOrderFailure {
  ok: false
  code: 'invalid_input' | 'inactive_item' | 'incompatible_unit' | 'db_failure'
  message: string
  lineIndex?: number
}

// ---------------------------------------------------------------------------------
// ASSUMPTION 1 (testability seam — CONTRACT is silent on dependency injection):
// A factory that binds the service to an EXPLICIT db handle (+ optional injectable
// clock), following the precedent already established by
// `createCustomersRepository(database = getDb)` in customers.repo.ts. Production
// wiring (ipc/orders.ipc.ts, tablet/server.ts, remote-order-listener.ts) calls
// `createOrderService({ db: getDb() })` once at startup; a bare `createOrder` bound
// to the production singleton may also exist for CONTRACT-signature compatibility,
// but it is Electron-only and this test suite NEVER imports it.
// ---------------------------------------------------------------------------------

export interface OrderServiceDeps {
  db: Database.Database
  /** Defaults to `() => new Date()`. Tests inject a fixed/advancing clock. */
  now?: () => Date
}

// ASSUMPTION 8 (edit-safety surface — CONTRACT §3's closing paragraph describes the
// required BEHAVIOR of edits but gives no function signature). Split header vs. line
// edits into two entry points, mirroring the SOL_TO_CLAUDE_CURRENT_STATE.md §4.10
// instruction to "separate header edits from line edits" and the existing
// orders.repo.ts:428-506 parameter shape, translated to the CONTRACT's camelCase style.

export interface UpdateOrderHeaderInput {
  orderId: number
  note?: string
  tableNumber?: string
  customer?: { phone?: string; name?: string }
}

export interface OrderLineEditInput extends OrderLineInput {
  /** Existing database line identity. Omit only when adding a genuinely new line. */
  orderItemId?: number
}

export interface UpdateOrderLinesInput {
  orderId: number
  lines: OrderLineEditInput[]
  /** Explicit reprice request. Omitted => preserve the order's stored discount exactly. */
  discountAmount?: number
}

export interface UpdateOrderSuccess {
  ok: true
  orderId: number
  subtotal: number
  discountAmount: number
  total: number
}

export interface UpdateOrderFailure {
  ok: false
  code:
    | 'not_found'
    | 'invalid_input'
    | 'inactive_item'
    | 'incompatible_unit'
    | 'line_edit_not_allowed' // same-day/non-finalized policy violation (§4.10, item 11)
    | 'db_failure'
  message: string
}

export type UpdateOrderResult = UpdateOrderSuccess | UpdateOrderFailure

export type OrderStatus = 'pending' | 'preparing' | 'completed' | 'cancelled'

export interface OrderService {
  createOrder(input: CreateOrderInput): CreateOrderSuccess | CreateOrderFailure
  updateOrderHeader(input: UpdateOrderHeaderInput): UpdateOrderResult
  updateOrderLines(input: UpdateOrderLinesInput): UpdateOrderResult
  /** Status transition matrix per SOL §4.10: restoring to an active status clears completed_at. */
  updateOrderStatus(orderId: number, status: OrderStatus): UpdateOrderResult
}

export function createOrderService(deps: OrderServiceDeps): OrderService

/**
 * Bound to the production getDb() singleton. Electron-only — matches CONTRACT §3's
 * exact top-level signature for callers that don't need injection. Tests never import
 * this export.
 */
export function createOrder(input: CreateOrderInput): CreateOrderSuccess | CreateOrderFailure

// ---------------------------------------------------------------------------------
// Print queue worker. CONTRACT §3 requires "print_jobs rows ... consumed [after commit]
// with attempts/backoff/last_error; ambiguous OS-spool timeout => job state 'attention'
// (never blind auto-retry)". CONTRACT does not name this module.
// ASSUMPTION 2: lives at src/main/services/print-queue.ts. It reuses the exact
// classification rules already implemented (but Electron-coupled) in
// printer.ipc.ts's processPendingPrintJobs: timeout/"closed while printing" and
// "no printer configured"/"no items" errors escalate to 'attention' on the FIRST
// failed attempt; any other error retries with backoff up to `maxAttempts` (default 3)
// before giving up to 'attention'. The actual print side effect is an injected async
// function so the worker is Electron-free and deterministic.
// ASSUMPTION 9: migration015's print_jobs.status CHECK constraint has no 'failed'
// value — the brief's "failed" for print jobs is read as this schema's terminal
// 'attention' state (a human-visible, non-silent failure), never 'succeeded'.
// ---------------------------------------------------------------------------------

export interface PrintJobRow {
  id: number
  order_id: number
  event_type: 'new' | 'updated' | 'cancelled' | 'restored'
  document_type: 'receipt' | 'kitchen'
  scope: 'all' | 'worker' | 'unassigned'
  worker_id: number | null
  status: 'pending' | 'printing' | 'succeeded' | 'attention' | 'cancelled'
  attempts: number
  last_error: string | null
}

export interface PrintAttemptResult {
  success: boolean
  error?: string
}

export type PrintAttempter = (
  job: PrintJobRow
) => Promise<PrintAttemptResult> | PrintAttemptResult

export interface PrintQueueDeps {
  db: Database.Database
  attemptPrint: PrintAttempter
  now?: () => Date
  maxAttempts?: number // default 3
}

export interface PrintQueueWorker {
  /** Process up to `limit` (default 10) eligible jobs once. No interval/timer — deterministic. */
  processOnce(limit?: number): Promise<{ processed: number }>
}

export function createPrintQueueWorker(deps: PrintQueueDeps): PrintQueueWorker

// ---------------------------------------------------------------------------------
// Outbox worker. CONTRACT §3 requires "outbox_events rows (owner-sync, analytics-dirty,
// telegram, queue-broadcast)" created in the same transaction as the order, consumed
// with "idempotent consumers" (SOL §4.9). CONTRACT does not specify a table or module.
// ASSUMPTION 5: table `outbox_events` (new migration, not yet written — this test suite
// does not add it; it will exist by the time these tests can pass) with columns
// (id, event_type, payload TEXT json, status 'pending'|'done'|'failed', attempts,
// last_error, created_at).
// ASSUMPTION 6: the worker only guarantees AT-LEAST-ONCE delivery (a row already
// 'done' is never reprocessed by processOnce()); making the downstream EFFECT
// exactly-once when the SAME row is somehow re-delivered (e.g. an operator/crash
// replay that resets a row back to 'pending') is the injected consumer's job, keyed
// by the event's own id — this mirrors real owner-sync/telegram consumers needing a
// dedupe key at the destination, and is exactly what item 7 exercises.
// ---------------------------------------------------------------------------------

export type OutboxEventType = 'owner-sync' | 'analytics-dirty' | 'telegram' | 'queue-broadcast'

export interface OutboxEventRow {
  id: number
  event_type: OutboxEventType
  payload: string
  status: 'pending' | 'done' | 'failed'
  attempts: number
  last_error: string | null
}

export type OutboxConsumer = (event: OutboxEventRow) => Promise<void> | void

export interface OutboxWorkerDeps {
  db: Database.Database
  consumers: Partial<Record<OutboxEventType, OutboxConsumer>>
  now?: () => Date
}

export interface OutboxWorker {
  processOnce(limit?: number): Promise<{ processed: number }>
}

export function createOutboxWorker(deps: OutboxWorkerDeps): OutboxWorker

// ---------------------------------------------------------------------------------
// Audit events (SOL §4.12 — "Persist immutable audit events with original/new value,
// reason, operator/approver, and time" for price overrides and voids). CONTRACT §3
// does not mention this table; it is in scope only because the brief's item 14
// requires it and SOL_TO_CLAUDE_CURRENT_STATE.md §4.12 is part of this WP's Authority.
// ASSUMPTION 10: table `audit_events` (new migration) with columns
// (id, event_type 'price_override'|'void', order_id, order_item_id NULL-able,
// original_value, new_value, operator, reason, created_at), immutable via a
// BEFORE UPDATE trigger that RAISE(ABORT)s — mirroring the exact pattern already used
// for `customers.phone_normalized` (migration014) and the daily-number uniqueness
// guard (migration015). ASSUMPTION 11: a thin pure writer function so the test can
// call it without going through connection.ts.
// ---------------------------------------------------------------------------------

export interface AuditEventInput {
  eventType: 'price_override' | 'void'
  orderId: number
  orderItemId?: number
  originalValue: string
  newValue: string
  operator: string
  reason?: string
}

export function recordAuditEvent(db: Database.Database, input: AuditEventInput): void

// ---------------------------------------------------------------------------------
// Recipe-compatibility validation (SOL §4.16). menu.repo.ts's validateMenuItem
// already performs this exact check (active-stock lookup + recipeQuantityInStockUnits
// compatibility) but is unreachable from tests because it imports connection.ts.
// ASSUMPTION 7: the per-ingredient check is extracted to a pure, Electron-free
// function at src/main/services/recipe-validation.ts that menu.repo.ts's
// validateMenuItem delegates to, taking the already-fetched stock row as a plain
// value instead of querying getDb() itself. Error messages/wording are UNCHANGED
// from the current implementation (menu.repo.ts:71-79) so this is a refactor, not a
// behavior change.
// ---------------------------------------------------------------------------------

export interface RecipeStockRow {
  id: number
  name: string
  unit_type: string
  is_active: number
}

export interface RecipeIngredientInput {
  stock_item_id: number
  quantity: number
  unit: string
}

/**
 * Throws when `stock` is undefined/inactive, or when `ingredient.unit` cannot convert
 * into `stock.unit_type` (see stock-units.ts's recipeQuantityInStockUnits). The thrown
 * message names the offending pair. Returns void on success.
 */
export function validateRecipeIngredientAgainstStock(
  ingredient: RecipeIngredientInput,
  stock: RecipeStockRow | undefined
): void

// ---------------------------------------------------------------------------------
// Customer favorites (SOL §4.15 — "getFavoriteItems() does not exclude cancelled
// orders"). customers.repo.ts's actual getFavoriteItems() query ALREADY filters
// `o.status != 'cancelled'` in the current codebase, so item 16 is a regression test
// for existing-and-correct behavior, not a new feature. It is unreachable from tests
// as written because it lives behind `createCustomersRepository`, which still
// transitively imports connection.ts (and therefore Electron) at module scope, same
// as every other repo. ASSUMPTION 12: the same query is additionally exposed as a
// pure, explicit-db function so it is importable without Electron. Behavior/SQL is
// UNCHANGED from customers.repo.ts:64-78 — this is a testability extraction, not a
// behavior change.
// ---------------------------------------------------------------------------------

export interface FavoriteItemRow {
  menu_item_id: number
  total: number
}

export function getFavoriteItems(db: Database.Database, customerId: number): FavoriteItemRow[]
