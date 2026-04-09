import { getClient } from '../activation/cloud'
import { getMachineId } from '../activation/activation'
import { ordersRepo } from '../database/repositories/orders.repo'
import { BrowserWindow } from 'electron'

let subscription: any = null
let mainWin: BrowserWindow | null = null

export function startRemoteOrderListener(win: BrowserWindow): void {
  mainWin = win
  const machineId = getMachineId()
  const supabase = getClient()

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
    .subscribe()
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
    subscription.unsubscribe()
    subscription = null
  }
}
