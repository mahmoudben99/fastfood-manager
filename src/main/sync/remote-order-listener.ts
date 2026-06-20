import { getClient } from '../activation/cloud'
import { getMachineId } from '../activation/activation'
import { ordersRepo } from '../database/repositories/orders.repo'
import { syncOrderToCloud } from './owner-sync'
import { BrowserWindow } from 'electron'

let subscription: any = null
let mainWin: BrowserWindow | null = null

let pollInterval: ReturnType<typeof setInterval> | null = null

export function startRemoteOrderListener(win: BrowserWindow): void {
  mainWin = win
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
  }, 10000)
}

/** Mark a remote_orders row with a terminal status so the 10s 'pending' poll stops retrying it. */
async function markRemoteOrder(id: any, status: 'processed' | 'failed'): Promise<void> {
  try {
    const supabase = getClient()
    // Supabase client is generic-less in this project, so update() types its arg as `never`.
    await supabase.from('remote_orders').update({ status } as never).eq('id', id)
  } catch (err) {
    console.error('[Remote Order] Failed to update status:', err)
  }
}

async function handleRemoteOrder(remoteOrder: any): Promise<void> {
  const orderData = remoteOrder?.order_data

  // Validate the cloud payload BEFORE touching the DB. A malformed row (missing items,
  // non-array, bad ids) used to throw inside create(), never get marked processed, and be
  // re-selected by the 10s poll forever. Mark such rows 'failed' so they can't poison the loop.
  const items = Array.isArray(orderData?.items) ? orderData.items : null
  const validItems = (items || [])
    .filter((it: any) => it && Number.isFinite(Number(it.id)) && Number(it.quantity) > 0)
    .map((it: any) => ({ menu_item_id: Number(it.id), quantity: Number(it.quantity) }))

  if (!orderData || validItems.length === 0) {
    console.error('[Remote Order] Invalid payload, marking failed:', remoteOrder?.id)
    await markRemoteOrder(remoteOrder?.id, 'failed')
    return
  }

  try {
    // forceMenuPrice: never trust client-supplied prices from a remote order.
    const order = ordersRepo.create({
      order_type: orderData.orderType || 'takeout',
      table_number: orderData.tableNumber || undefined,
      customer_phone: orderData.customerPhone || undefined,
      customer_name: orderData.customerName || undefined,
      forceMenuPrice: true,
      items: validItems
    })

    // Sync to owner dashboard (parity with src/main/ipc/orders.ipc.ts local-create path)
    syncOrderToCloud(order).catch(() => {})

    // Notify the renderer
    mainWin?.webContents.send('remote:new-order', order)

    // Mark as processed in Supabase
    await markRemoteOrder(remoteOrder.id, 'processed')
  } catch (err) {
    // create() throwing here is almost always a permanent data problem (e.g. an unknown
    // menu_item_id), so mark failed rather than retry the same bad order every 10s.
    console.error('[Remote Order] Failed to process, marking failed:', err)
    await markRemoteOrder(remoteOrder.id, 'failed')
  }
}

export function stopRemoteOrderListener(): void {
  if (subscription) {
    try { subscription.unsubscribe() } catch { /* ignore */ }
    subscription = null
  }
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}
