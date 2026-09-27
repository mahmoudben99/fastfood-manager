import { getClient } from '../activation/cloud'
import { getMachineId } from '../activation/activation'
import { localDate } from '../database/repositories/orders.repo'
import { settingsRepo } from '../database/repositories/settings.repo'
import { net } from 'electron'
import { formatItemsSummary, summaryLang, topLevelLineCount } from './order-summary'

/**
 * v4: the summary names each line's options and combo picks ("1x Burger (+Cheese; NO Onions)") and
 * ends with the delivery fee ("Delivery fee 200") — owner_orders has no delivery column and the
 * total already includes the fee. item_count counts sold lines, not combo pick rows.
 */
function ownerSummary(order: any): { itemsSummary: string; itemCount: number } {
  let lang = summaryLang('en')
  try { lang = summaryLang(settingsRepo.get('language')) } catch { /* settings unavailable: English */ }
  return {
    itemsSummary: formatItemsSummary(order.items, { lang, deliveryFee: order.delivery_fee }),
    itemCount: topLevelLineCount(order.items)
  }
}

/** Strict, retryable owner-order upsert for the durable outbox consumer. */
export async function syncOrderToCloudStrict(order: any): Promise<void> {
  if (!net.isOnline()) throw new Error('Owner sync is offline')
  const { itemsSummary, itemCount } = ownerSummary(order)
  const { error } = await getClient().from('owner_orders').upsert(
    {
      machine_id: getMachineId(),
      order_number: order.daily_number,
      order_type: order.order_type,
      total: order.total,
      item_count: itemCount,
      items_summary: itemsSummary,
      status: order.status || 'preparing',
      discount_amount: order.discount_amount || 0,
      order_date: order.order_date || localDate(),
      created_at: order.created_at || new Date().toISOString()
    },
    { onConflict: 'machine_id,order_number,order_date' }
  )
  if (error) throw new Error(`Owner sync failed: ${error.message}`)
}

export async function syncOrderToCloud(order: any): Promise<void> {
  if (!net.isOnline()) return
  try {
    const machineId = getMachineId()
    const supabase = getClient()

    const { itemsSummary, itemCount } = ownerSummary(order)

    // Key on the restaurant-LOCAL order_date, not UTC(created_at). The local daily_number
    // counter restarts by local day, and the upsert conflict key is
    // (machine_id, order_number, order_date) — deriving the date from UTC created_at put
    // any order placed 00:00–00:59 local onto the previous UTC day, colliding with (and
    // overwriting) that day's real order #1 in the owner dashboard.
    const orderDate = order.order_date || localDate()
    await supabase.from('owner_orders').upsert(
      {
        machine_id: machineId,
        order_number: order.daily_number,
        order_type: order.order_type,
        total: order.total,
        item_count: itemCount,
        items_summary: itemsSummary,
        status: order.status || 'preparing',
        discount_amount: order.discount_amount || 0,
        order_date: orderDate,
        created_at: order.created_at || new Date().toISOString()
      },
      { onConflict: 'machine_id,order_number,order_date' }
    )
  } catch {
    // Silent fail — non-critical
  }
}

export async function syncOrderStatusToCloud(orderId: number, status: string): Promise<void> {
  if (!net.isOnline()) return
  try {
    const machineId = getMachineId()
    const supabase = getClient()
    const today = localDate()

    // Get the order's daily_number from local DB
    const { ordersRepo } = await import('../database/repositories/orders.repo')
    const order = ordersRepo.getById(orderId)
    if (!order) return

    const orderDate = (order as any).order_date || today
    await supabase
      .from('owner_orders')
      .update({ status })
      .eq('machine_id', machineId)
      .eq('order_number', (order as any).daily_number)
      .eq('order_date', orderDate)
  } catch {
    /* silent */
  }
}

// Sync owner PIN to cloud (hashed) — LEGACY, kept for backward compat with older callers.
export async function syncOwnerPin(_pin: string): Promise<void> {
  await syncAdminPassword()
}

/**
 * LEGACY no-op (finding #5). This used to upsert the admin bcrypt hash into `owner_pins`, but the
 * remote owner dashboard (WP-E) authenticates ONLY against `owner_credentials`, and nothing reads
 * `owner_pins` anymore — so writing it was security-theatre that made the dashboard look provisioned
 * when it was not. The real remote-owner credential is now provisioned via `provisionOwnerCredential`
 * at password set/change time (device-token authed). Kept as a no-op so existing fire-and-forget
 * callers stay valid without silently re-introducing the dead table.
 */
export async function syncAdminPassword(): Promise<void> {
  /* no-op: owner dashboard auth is provisioned through provisionOwnerCredential (owner_credentials) */
}

// Admin origin the desktop reaches its device-token-authed endpoints through (matches the
// remote-order listener's ADMIN_BASE_URL). TODO(integration): read from config/endpoints.ts.
const ADMIN_BASE_URL = 'https://fastfood-manager.vercel.app'

/** The remote owner dashboard credential must be at least this long (mirrors WP-E MIN_CREDENTIAL_LENGTH). */
export const MIN_OWNER_DASHBOARD_CREDENTIAL_LENGTH = 8

export type OwnerCredentialProvisionResult =
  | { ok: true }
  | { ok: false; reason: 'offline' | 'too_short' | 'unlicensed' | 'failed' }

/**
 * Provision (or rotate) the remote owner-dashboard credential in the cloud `owner_credentials`
 * table via the admin endpoint, authenticated with the device ACCESS token. This is the bridge
 * that makes the owner dashboard reachable (finding #2). The plaintext credential is sent over TLS
 * and bcrypt-hashed SERVER-side; it is never persisted here and NEVER logged.
 *
 * Reasons: 'too_short' — the credential is < 8 chars (the caller must surface an i18n hint and MUST
 * NOT fall back to any weaker auth); 'offline'/'unlicensed'/'failed' — transient, retry later.
 */
export async function provisionOwnerCredential(password: string): Promise<OwnerCredentialProvisionResult> {
  if (typeof password !== 'string' || password.length < MIN_OWNER_DASHBOARD_CREDENTIAL_LENGTH) {
    return { ok: false, reason: 'too_short' }
  }
  if (!net.isOnline()) return { ok: false, reason: 'offline' }
  try {
    const { getDeviceAccessToken } = await import('../activation/license-service')
    const token = await getDeviceAccessToken()
    if (!token) return { ok: false, reason: 'unlicensed' }
    const machineId = getMachineId()
    const res = await fetch(`${ADMIN_BASE_URL}/api/owner-credential/provision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ machineId, credential: password })
    })
    if (!res.ok) return { ok: false, reason: 'failed' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
