import type http from 'http'
import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { resolveModifierGroups } from '../services/modifiers'
import { createCombosService } from '../services/combos'
import { soldOutSql } from '../services/catalog-common'
import { createOrderService } from '../services/order-service'
import { computeAutoDiscount, sanitizeOrderItems } from '../services/order-promotions'
import { resolveOrderChannel } from '../services/channels'
import { orderReadiness } from '../services/kds/kds-query'

/**
 * v4 waiter-tablet read endpoints (served by server.ts on the LAN):
 *   GET  /api/menu                 categories (+ stable colour index) and items (+ has_modifiers,
 *                                  sold_out, is_combo; any extra menu-read fields pass through)
 *   GET  /api/items/:id/options    resolved modifier groups, combo slots (+ the groups of every
 *                                  combo choice that has options) — same logic as the POS
 *   POST /api/quote                dry-run of the exact order the tablet would send: the real order
 *                                  service runs inside a rolled-back transaction, so prices,
 *                                  promotions, sold-out / option rules and the open-shift rule are
 *                                  the ones POST /api/order will apply. Nothing is written.
 *   GET  /api/orders/status?ids=   preparing / ready (KDS) / completed / cancelled per order id
 * Prices always come from the database; the client only sends ids and quantities.
 */
export interface TabletApiDeps {
  getDb: () => Database.Database
  /** PIN session check (server.ts validateSession); quote + status need it like /api/order. */
  isAuthorized: (req: http.IncomingMessage) => boolean
  /** Menu reads (menuRepo / categoriesRepo) so fields other modules add flow through. */
  listMenu: () => { categories: any[]; items: any[] }
  currency: () => string
}

type QuoteCode = 'invalid_input' | 'inactive_item' | 'incompatible_unit' | 'db_failure' | 'no_open_shift' | 'not_allowed' | 'unauthorized'

const ORDER_TYPES = ['local', 'takeout', 'delivery'] as const
const MAX_BODY = 256 * 1024
const MAX_STATUS_IDS = 30

export function isTabletApiRoute(pathname: string): boolean {
  return pathname === '/api/menu' || pathname === '/api/quote' || pathname === '/api/orders/status' ||
    /^\/api\/items\/\d+\/options$/.test(pathname)
}

function send(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(JSON.stringify(data))
}

function readJson(req: http.IncomingMessage, res: http.ServerResponse, onParsed: (data: any) => void): void {
  const chunks: Buffer[] = []
  let received = 0
  let aborted = false
  req.on('data', (chunk: Buffer) => {
    if (aborted) return
    received += chunk.length
    if (received > MAX_BODY) {
      aborted = true
      send(res, 413, { error: 'Payload too large' })
      req.destroy()
      return
    }
    chunks.push(chunk)
  })
  req.on('end', () => {
    if (aborted) return
    let data: unknown
    try {
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      send(res, 400, { error: 'Invalid request', code: 'invalid_input' })
      return
    }
    onParsed(data)
  })
}

/** Same stable 1..10 index as the renderer's categoryColorIndex(cat.id) (theme/categoryColors.ts). */
export function categoryColorIndex(id: unknown): number {
  const n = Math.abs(Math.trunc(Number(id)))
  if (!Number.isFinite(n)) return 10
  return (((n - 1) % 10) + 10) % 10 + 1
}

/** Items that show an options sheet: at least one active group with an active option applies. */
function itemsWithModifiers(db: Database.Database): Set<number> {
  const rows = db.prepare(
    `SELECT mi.id FROM menu_items mi WHERE mi.is_active = 1 AND (
       EXISTS (SELECT 1 FROM menu_item_modifier_groups x JOIN modifier_groups g ON g.id = x.group_id AND g.is_active = 1
               WHERE x.menu_item_id = mi.id AND x.is_excluded = 0
                 AND EXISTS (SELECT 1 FROM modifier_options o WHERE o.group_id = g.id AND o.is_active = 1))
       OR EXISTS (SELECT 1 FROM category_modifier_groups cg JOIN modifier_groups g ON g.id = cg.group_id AND g.is_active = 1
               WHERE cg.category_id = mi.category_id
                 AND NOT EXISTS (SELECT 1 FROM menu_item_modifier_groups ex
                                 WHERE ex.menu_item_id = mi.id AND ex.group_id = cg.group_id AND ex.is_excluded = 1)
                 AND EXISTS (SELECT 1 FROM modifier_options o WHERE o.group_id = g.id AND o.is_active = 1)))`
  ).all() as { id: number }[]
  return new Set(rows.map((row) => row.id))
}

export function buildTabletMenu(db: Database.Database, deps: Pick<TabletApiDeps, 'listMenu' | 'currency'>): Record<string, unknown> {
  const { categories, items } = deps.listMenu()
  const withModifiers = itemsWithModifiers(db)
  return {
    categories: categories.map((category) => ({ ...category, color: categoryColorIndex(category.id) })),
    items: items
      .filter((item) => Number(item.is_active ?? 1) === 1)
      .map((item) => ({
        ...item,
        is_combo: Number(item.is_combo) === 1 ? 1 : 0,
        sold_out: Number(item.sold_out) === 1 ? 1 : 0,
        has_modifiers: withModifiers.has(Number(item.id))
      })),
    currency: deps.currency()
  }
}

/** Options sheet data for one item; null when it is not an active menu item. */
export function buildItemOptions(db: Database.Database, menuItemId: number): Record<string, unknown> | null {
  const item = db.prepare(
    `SELECT mi.id, mi.name, mi.name_ar, mi.name_fr, mi.price, mi.emoji, mi.category_id, mi.is_combo,
            ${soldOutSql('mi')} AS sold_out
     FROM menu_items mi JOIN categories c ON c.id = mi.category_id
     WHERE mi.id = ? AND mi.is_active = 1 AND c.is_active = 1`
  ).get(menuItemId) as any
  if (!item) return null
  const combo = item.is_combo === 1 ? createCombosService(db).getForMenuItem(menuItemId) : null
  const childGroups: Record<number, unknown> = {}
  for (const slot of combo?.slots ?? []) {
    for (const choice of slot.choices) {
      if (choice.has_modifiers && childGroups[choice.menu_item_id] === undefined) {
        childGroups[choice.menu_item_id] = resolveModifierGroups(db, choice.menu_item_id)
      }
    }
  }
  return {
    item: { ...item, sold_out: item.sold_out === 1, is_combo: item.is_combo === 1 },
    groups: resolveModifierGroups(db, menuItemId),
    combo,
    child_groups: childGroups
  }
}

class QuoteRollback extends Error {
  constructor(public readonly result: unknown) {
    super('quote rollback')
  }
}

export type TabletQuote =
  | {
      ok: true
      subtotal: number
      discount: number
      discount_details: string
      delivery_fee: number
      total: number
      lines: { index: number; unit_price: number; total: number }[]
    }
  | { ok: false; code: QuoteCode; message: string; line_index?: number }

/**
 * Prices and validates a tablet cart exactly like POST /api/order (same sanitizer, same explicit
 * promotion snapshot, same order service), inside a transaction that is always rolled back.
 */
export function quoteTabletOrder(db: Database.Database, raw: any): TabletQuote {
  const items = sanitizeOrderItems(raw?.items)
  if (items.length === 0) return { ok: false, code: 'invalid_input', message: 'No valid items' }
  const orderType = (ORDER_TYPES as readonly string[]).includes(raw?.order_type) ? raw.order_type : 'takeout'
  const discount = computeAutoDiscount(items, db, resolveOrderChannel(db, orderType, null))
  const phone = raw?.customer_phone ? String(raw.customer_phone).slice(0, 50) : undefined
  const name = raw?.customer_name ? String(raw.customer_name).slice(0, 100) : undefined
  const service = createOrderService({ db })
  try {
    db.transaction(() => {
      const result = service.createOrder({
        source: 'tablet',
        sourceRequestId: `quote-${randomUUID()}`,
        orderType,
        tableNumber: raw?.table_number ? String(raw.table_number).slice(0, 50) : undefined,
        customer: phone || name ? { phone, name } : undefined,
        note: raw?.notes ? String(raw.notes).slice(0, 500) : undefined,
        lines: items.map((item) => ({
          menuItemId: item.menu_item_id,
          quantity: item.quantity,
          note: item.notes,
          modifiers: item.modifiers,
          children: item.children
        })),
        applyAutoPromotions: !(discount.amount > 0),
        explicitDiscountAmount: discount.amount > 0 ? discount.amount : undefined,
        discountDetails: discount.details || undefined
      })
      if (!result.ok) throw new QuoteRollback({ ok: false, code: result.code, message: result.message, line_index: result.lineIndex })
      const lines = (db.prepare(
        'SELECT unit_price, total_price FROM order_items WHERE order_id = ? AND parent_order_item_id IS NULL ORDER BY id'
      ).all(result.orderId) as { unit_price: number; total_price: number }[])
        .map((line, index) => ({ index, unit_price: line.unit_price, total: line.total_price }))
      const order = db.prepare('SELECT discount_details FROM orders WHERE id = ?').get(result.orderId) as
        { discount_details: string | null } | undefined
      throw new QuoteRollback({
        ok: true,
        subtotal: result.subtotal,
        discount: result.discountAmount,
        discount_details: order?.discount_details ?? '',
        delivery_fee: result.deliveryFee,
        total: result.total,
        lines
      })
    })()
  } catch (error) {
    if (error instanceof QuoteRollback) return error.result as TabletQuote
    return { ok: false, code: 'db_failure', message: error instanceof Error ? error.message : String(error) }
  }
  return { ok: false, code: 'db_failure', message: 'Quote failed' }
}

function quoteStatus(quote: TabletQuote): number {
  if (quote.ok) return 200
  if (quote.code === 'db_failure') return 503
  if (quote.code === 'inactive_item' || quote.code === 'no_open_shift' || quote.code === 'not_allowed') return 409
  return 422
}

/** Live status of orders this tablet sent (ready = every kitchen ticket bumped/ready on the KDS). */
export function tabletOrderStatuses(db: Database.Database, ids: number[]): { id: number; daily_number: number; status: string }[] {
  const out: { id: number; daily_number: number; status: string }[] = []
  for (const id of ids) {
    const order = db.prepare("SELECT id, daily_number, status FROM orders WHERE id = ? AND source = 'tablet'").get(id) as
      { id: number; daily_number: number; status: string } | undefined
    if (!order) continue
    let status = order.status === 'pending' ? 'preparing' : order.status
    if (status === 'preparing') {
      try {
        if (orderReadiness(db, id)?.ready) status = 'ready'
      } catch { /* KDS tables missing on an old schema: stay "preparing" */ }
    }
    out.push({ id: order.id, daily_number: order.daily_number, status })
  }
  return out
}

export function handleTabletApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: TabletApiDeps
): void {
  const method = req.method ?? 'GET'
  try {
    if (method === 'GET' && url.pathname === '/api/menu') {
      send(res, 200, buildTabletMenu(deps.getDb(), deps))
      return
    }
    const optionsMatch = /^\/api\/items\/(\d+)\/options$/.exec(url.pathname)
    if (method === 'GET' && optionsMatch) {
      const data = buildItemOptions(deps.getDb(), Number(optionsMatch[1]))
      if (!data) send(res, 404, { error: 'Item unavailable', code: 'inactive_item' })
      else send(res, 200, data)
      return
    }
    if (method === 'POST' && url.pathname === '/api/quote') {
      if (!deps.isAuthorized(req)) {
        send(res, 401, { ok: false, code: 'unauthorized', message: 'Session expired' })
        return
      }
      readJson(req, res, (raw) => {
        try {
          const quote = quoteTabletOrder(deps.getDb(), raw)
          send(res, quoteStatus(quote), quote)
        } catch (error) {
          send(res, 503, { ok: false, code: 'db_failure', message: String(error) })
        }
      })
      return
    }
    if (method === 'GET' && url.pathname === '/api/orders/status') {
      if (!deps.isAuthorized(req)) {
        send(res, 401, { error: 'Session expired', code: 'unauthorized' })
        return
      }
      const ids = [...new Set((url.searchParams.get('ids') || '').split(',').map(Number))]
        .filter((id) => Number.isInteger(id) && id > 0)
        .slice(0, MAX_STATUS_IDS)
      send(res, 200, { orders: tabletOrderStatuses(deps.getDb(), ids) })
      return
    }
    send(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}
