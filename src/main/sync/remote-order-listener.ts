import { getClient } from '../activation/cloud'
import { getMachineId } from '../activation/activation'
import { ordersRepo } from '../database/repositories/orders.repo'
import { syncOrderToCloud } from './owner-sync'
import { performAutoBackup } from '../ipc/backup.ipc'
import { sendOrderNotification } from '../telegram/bot'
import { settingsRepo } from '../database/repositories/settings.repo'
import { computeAutoDiscount, sanitizeOrderItems } from '../services/order-promotions'
import { BrowserWindow } from 'electron'

let subscription: any = null
let mainWin: BrowserWindow | null = null

let pollInterval: ReturnType<typeof setInterval> | null = null

// True once stopRemoteOrderListener() runs (e.g. during an update-install teardown). Guards
// against an in-flight poll/Realtime callback trying to create an order against a DB that has
// already been closed — which would throw and permanently mark a real pending order 'failed'.
let stopped = false
// Rows currently being processed, so the Realtime handler and the 10s poll can't create the
// same remote order twice (double stock deduction + double loyalty + duplicate daily number).
const inFlight = new Set<string | number>()
// Prevents overlapping poll ticks when a batch is slow.
let isPolling = false

/**
 * Remote-order ids we have already turned into local orders, persisted across restarts.
 *
 * The cloud row's `status` alone cannot be trusted as the dedup key: if the app creates the local
 * order and then the "mark processed" write fails (WiFi drop, Supabase 5xx), the row stays
 * 'pending' and the next launch happily creates the SAME order again — duplicate daily number,
 * stock deducted twice, loyalty credited twice. Recording it locally first makes creation
 * idempotent regardless of what the cloud write does.
 */
const PROCESSED_KEY = 'remote_orders_processed_ids'
const PROCESSED_KEEP = 500
let processedIds = new Set<string>()

function loadProcessedIds(): void {
  try {
    const raw = settingsRepo.get(PROCESSED_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) processedIds = new Set(parsed.map(String))
    }
  } catch { processedIds = new Set() }
}

function rememberProcessed(id: string | number): void {
  processedIds.add(String(id))
  if (processedIds.size > PROCESSED_KEEP) {
    processedIds = new Set([...processedIds].slice(-PROCESSED_KEEP))
  }
  try { settingsRepo.set(PROCESSED_KEY, JSON.stringify([...processedIds])) } catch { /* ignore */ }
}

/** The remote page's vocabulary has drifted from the POS's. Normalize instead of silently
 *  storing an order_type the receipt/analytics code doesn't recognize. */
const ORDER_TYPES: Record<string, string> = {
  local: 'local', 'dine-in': 'local', dinein: 'local', 'dine_in': 'local',
  takeout: 'takeout', takeaway: 'takeout', 'take-away': 'takeout',
  delivery: 'delivery'
}
function normalizeOrderType(raw: unknown): string {
  return ORDER_TYPES[String(raw || '').toLowerCase().trim()] || 'takeout'
}

export function startRemoteOrderListener(win: BrowserWindow): void {
  mainWin = win
  stopped = false
  loadProcessedIds()
  const machineId = getMachineId()
  const supabase = getClient()

  // Try Supabase Realtime first
  try {
    subscription = supabase
      .channel('remote-orders')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'remote_orders',
        filter: `machine_id=eq.${machineId}`
      }, (payload: any) => {
        handleRemoteOrder(payload.new)
      })
      .subscribe((status: string) => {
        console.log('[Remote Order] Realtime subscription:', status)
      })
  } catch (err) {
    console.error('[Remote Order] Realtime setup failed:', err)
  }

  // Also poll every 10 seconds as fallback (in case Realtime isn't enabled)
  pollInterval = setInterval(async () => {
    if (stopped || isPolling) return
    isPolling = true
    try {
      const { data } = await supabase
        .from('remote_orders')
        .select('*')
        .eq('machine_id', machineId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(5)

      if (data && data.length > 0) {
        for (const order of data) {
          await handleRemoteOrder(order)
        }
      }
    } catch { /* silent */ }
    finally { isPolling = false }
  }, 10000)
}

/** Mark a remote_orders row with a terminal status so the 10s 'pending' poll stops retrying it. */
async function markRemoteOrder(id: any, status: 'processed' | 'failed'): Promise<boolean> {
  // Retry a few times: the previous version fired one update and ignored both the thrown error
  // AND the returned `error` field, so a transient failure silently left the row 'pending'.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (stopped) return false
    try {
      const supabase = getClient()
      const { error } = await supabase.from('remote_orders').update({ status }).eq('id', id)
      if (!error) return true
      console.error('[Remote Order] Status update rejected:', error.message)
    } catch (err) {
      console.error('[Remote Order] Failed to update status:', err)
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
  }
  return false
}

async function handleRemoteOrder(remoteOrder: any): Promise<void> {
  // If the app is tearing down (DB closed), don't touch the DB — a create() would throw and
  // this order would be wrongly marked 'failed', losing a real customer order permanently.
  if (stopped) return

  const id = remoteOrder?.id
  // Dedup: skip if this row is already being processed (Realtime + poll race) or was handled
  // this session. Processed/failed are both terminal, so keeping the id parked is safe.
  if (id == null || inFlight.has(id)) return

  // Created on a previous run but never successfully marked in the cloud. Do NOT create it
  // again — just retry the bookkeeping so the row stops being re-selected by the poll.
  if (processedIds.has(String(id))) {
    inFlight.add(id)
    try { await markRemoteOrder(id, 'processed') } finally { inFlight.delete(id) }
    return
  }

  inFlight.add(id)

  const orderData = remoteOrder?.order_data

  // Validate the cloud payload BEFORE touching the DB. A malformed row (missing items,
  // non-array, bad ids) used to throw inside create(), never get marked processed, and be
  // re-selected by the 10s poll forever. Mark such rows 'failed' so they can't poison the loop.
  // sanitizeOrderItems also rejects fractional / Infinity / absurd quantities.
  const validItems = sanitizeOrderItems(orderData?.items)

  if (!orderData || validItems.length === 0) {
    console.error('[Remote Order] Invalid payload, marking failed:', id)
    await markRemoteOrder(id, 'failed')
    return
  }

  try {
    // Apply active promotions, same as the POS cart and the LAN tablet — a remote customer
    // used to be charged full price for a promoted item.
    const discount = computeAutoDiscount(validItems)

    // forceMenuPrice: never trust client-supplied prices from a remote order.
    const order = ordersRepo.create({
      order_type: normalizeOrderType(orderData.orderType),
      table_number: orderData.tableNumber || undefined,
      customer_phone: orderData.customerPhone || undefined,
      customer_name: orderData.customerName || undefined,
      forceMenuPrice: true,
      discount_amount: discount.amount || undefined,
      discount_details: discount.details || undefined,
      items: validItems
    })

    // Record locally BEFORE the cloud write. If the app dies (or the network does) between
    // create() and the mark, the next launch must not create this order a second time.
    rememberProcessed(id)

    // Same side-effects as a normal (local/tablet) order, so a cloud order isn't silently
    // missed: owner-dashboard sync, auto-backup, Telegram alert, and auto-print. Previously
    // only the renderer got a 5s toast — if staff weren't watching the POS, the order was
    // never cooked. All fire-and-forget so none can throw the order into the 'failed' path.
    syncOrderToCloud(order).catch(() => {})
    try { performAutoBackup() } catch { /* ignore */ }
    try { sendOrderNotification(order) } catch { /* ignore */ }
    // Durable automatic print jobs were committed by ordersRepo.create().

    // Notify the renderer
    mainWin?.webContents.send('remote:new-order', order)

    // Mark as processed in Supabase. If this never succeeds, processedIds keeps us honest.
    const marked = await markRemoteOrder(id, 'processed')
    if (!marked) {
      console.error('[Remote Order] Created locally but could not mark processed — will retry:', id)
    }
  } catch (err) {
    // create() throwing here is almost always a permanent data problem (e.g. an unknown
    // menu_item_id), so mark failed rather than retry the same bad order every 10s.
    console.error('[Remote Order] Failed to process, marking failed:', err)
    await markRemoteOrder(id, 'failed')
  }
}

export function stopRemoteOrderListener(): void {
  stopped = true
  if (subscription) {
    try { subscription.unsubscribe() } catch { /* ignore */ }
    subscription = null
  }
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  inFlight.clear()
}
