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

async function handleRemoteOrder(remoteOrder: any): Promise<void> {
  try {
    const orderData = remoteOrder.order_data
    // Create a real order in the local database
    const order = ordersRepo.create({
      order_type: orderData.orderType || 'takeout',
      table_number: orderData.tableNumber || undefined,
      customer_phone: orderData.customerPhone || undefined,
      customer_name: orderData.customerName || undefined,
      items: orderData.items.map((item: any) => ({
        menu_item_id: item.id,
        quantity: item.quantity,
        unit_price: item.price
      }))
    })

    // Sync to owner dashboard (parity with src/main/ipc/orders.ipc.ts:29 local-create path)
    syncOrderToCloud(order).catch(() => {})

    // Notify the renderer
    mainWin?.webContents.send('remote:new-order', order)

    // Mark as processed in Supabase
    const supabase = getClient()
    await supabase.from('remote_orders').update({ status: 'processed' }).eq('id', remoteOrder.id)
  } catch (err) {
    console.error('[Remote Order] Failed to process:', err)
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
