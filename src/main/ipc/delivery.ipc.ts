import { ipcMain } from 'electron'
import { getDb } from '../database/connection'
import { ordersRepo } from '../database/repositories/orders.repo'
import type {
  CustomerAddressInput, DeliveryStatus, DeliveryZoneInput, OrderDeliveryInput
} from '../../shared/delivery'
import {
  assignDriver, deleteAddress, deleteZone, getOrderDelivery, listAddresses, listAddressesByPhone, listDeliveries,
  listDrivers, listZones, saveAddress, saveZone, setDeliveryStatus
} from '../services/delivery'
import { driverSettlementPreview, listSettlements, settleDriver } from '../services/driver-settlement'
import { mapDeliveryInput } from '../services/order-level'
import { createOrderService } from '../services/order-service'

/** v4 delivery IPC (preload namespace `delivery`). */
export function registerDeliveryHandlers(): void {
  ipcMain.handle('delivery:getZones', (_, includeInactive?: boolean) => listZones(getDb(), includeInactive))
  ipcMain.handle('delivery:saveZone', (_, input: DeliveryZoneInput) => saveZone(getDb(), input))
  ipcMain.handle('delivery:deleteZone', (_, id: number) => deleteZone(getDb(), id))

  ipcMain.handle('delivery:getAddresses', (_, customerId: number) => listAddresses(getDb(), customerId))
  ipcMain.handle('delivery:getAddressesByPhone', (_, phone: string) => listAddressesByPhone(getDb(), phone))
  ipcMain.handle('delivery:saveAddress', (_, input: CustomerAddressInput) => saveAddress(getDb(), input))
  ipcMain.handle('delivery:deleteAddress', (_, id: number) => deleteAddress(getDb(), id))

  /** Active workers whose role is 'driver'. */
  ipcMain.handle('delivery:getDrivers', () => listDrivers(getDb()))
  ipcMain.handle('delivery:getOrder', (_, orderId: number) => getOrderDelivery(getDb(), orderId))
  ipcMain.handle('delivery:list', (_, options?: { date?: string; status?: DeliveryStatus; driverId?: number }) =>
    listDeliveries(getDb(), options)
  )

  /**
   * Patch address / zone / fee / driver / notes of an order. A fee change goes through the order
   * service (total, loyalty, owner sync) and is refused on completed / cancelled / past-day orders.
   */
  ipcMain.handle('delivery:updateDetails', (_, orderId: number, patch: OrderDeliveryInput) => {
    const result = createOrderService({ db: getDb() }).updateOrderHeader({ orderId, delivery: mapDeliveryInput(patch ?? {}) })
    if (!result.ok) throw new Error(result.message)
    return ordersRepo.getById(orderId)
  })

  ipcMain.handle('delivery:assignDriver', (_, orderId: number, driverId: number | null) => assignDriver(getDb(), orderId, driverId))

  /** Timeline step; 'delivered' also completes a pending / preparing order. */
  ipcMain.handle('delivery:setStatus', (_, orderId: number, status: DeliveryStatus, reason?: string) => {
    const db = getDb()
    const row = setDeliveryStatus(db, orderId, status, { reason })
    if (status === 'delivered') {
      const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string } | undefined
      if (order && (order.status === 'pending' || order.status === 'preparing')) {
        const result = createOrderService({ db }).updateOrderStatus(orderId, 'completed')
        if (!result.ok) throw new Error(result.message)
      }
    }
    return row
  })

  ipcMain.handle('delivery:settlementPreview', (_, driverId: number) => driverSettlementPreview(getDb(), driverId))
  ipcMain.handle(
    'delivery:settleDriver',
    (_, input: { driver_id: number; collected_cash: number; note?: string; operator?: string }) => settleDriver(getDb(), input)
  )
  ipcMain.handle('delivery:listSettlements', (_, options?: { date?: string; shiftId?: number }) => listSettlements(getDb(), options))
}
