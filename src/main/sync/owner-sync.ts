import { getClient } from '../activation/cloud'
import { getMachineId } from '../activation/activation'
import { net } from 'electron'

export async function syncOrderToCloud(order: any): Promise<void> {
  if (!net.isOnline()) return
  try {
    const machineId = getMachineId()
    const supabase = getClient()

    const itemsSummary = order.items
      ? order.items.map((i: any) => `${i.quantity}x ${i.menu_item_name}`).join(', ')
      : ''

    const orderDate = (order.created_at || new Date().toISOString()).split('T')[0]
    await supabase.from('owner_orders').upsert(
      {
        machine_id: machineId,
        order_number: order.daily_number,
        order_type: order.order_type,
        total: order.total,
        item_count: order.items?.length || 0,
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
    const today = new Date().toISOString().split('T')[0]

    // Get the order's daily_number from local DB
    const { ordersRepo } = await import('../database/repositories/orders.repo')
    const order = ordersRepo.getById(orderId)
    if (!order) return

    await supabase
      .from('owner_orders')
      .update({ status })
      .eq('machine_id', machineId)
      .eq('order_number', (order as any).daily_number)
      .eq('order_date', today)
  } catch {
    /* silent */
  }
}

// Sync owner PIN to cloud (hashed) — LEGACY, kept for backward compat
export async function syncOwnerPin(pin: string): Promise<void> {
  // Now syncs the admin password hash instead of tablet PIN
  await syncAdminPassword()
}

// Sync the admin password bcrypt hash to cloud for owner dashboard authentication
export async function syncAdminPassword(): Promise<void> {
  if (!net.isOnline()) return
  try {
    const machineId = getMachineId()
    const supabase = getClient()
    const { settingsRepo } = await import('../database/repositories/settings.repo')
    const hash = settingsRepo.get('admin_password_hash')
    if (!hash) return

    await supabase.from('owner_pins').upsert(
      {
        machine_id: machineId,
        pin_hash: hash, // Store the bcrypt hash directly
        updated_at: new Date().toISOString()
      },
      { onConflict: 'machine_id' }
    )
  } catch {
    /* silent */
  }
}
