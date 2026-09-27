import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../../components/ui'
import { withApproval } from '../../../components/checkout'
import type { OrderPaymentSummary } from '../../../../../shared/cash'
import type { OrderDelivery } from '../../../../../shared/delivery'
import { parseOrderEditRejection } from '../../../../../shared/order-edit'
import { stripIpcPrefix } from './labels'
import type { EditLine, HistoryOrder, PrintResult } from './types'

/** Manual prints from history always carry the REPRINT banner. */
const REPRINT = { reprint: true } as const

/**
 * Loads one order for the drawer (orders.getById + payments.forOrder + delivery.getOrder) and
 * runs its actions. Every mutation re-reads the order and tells the list to reload.
 */
export function useOrderDetail(orderId: number | null, onChanged: () => void) {
  const { t } = useTranslation()
  const [order, setOrder] = useState<HistoryOrder | null>(null)
  const [payment, setPayment] = useState<OrderPaymentSummary | null>(null)
  const [delivery, setDelivery] = useState<OrderDelivery | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [version, setVersion] = useState(0)
  /** Document being sent to the printer (double-tap guard + spinner). */
  const [printing, setPrinting] = useState<'receipt' | 'kitchen' | null>(null)
  const token = useRef(0)

  const load = useCallback(async (id: number, quiet = false) => {
    const mine = ++token.current
    if (!quiet) setLoading(true)
    setFailed(false)
    try {
      const [loaded, summary] = await Promise.all([
        window.api.orders.getById(id) as Promise<HistoryOrder | undefined>,
        window.api.payments.forOrder(id).catch(() => null)
      ])
      let details: OrderDelivery | null = null
      if (loaded?.order_type === 'delivery') {
        details = await window.api.delivery.getOrder(id).catch(() => loaded.delivery ?? null)
      }
      if (mine !== token.current) return
      setOrder(loaded ?? null)
      setPayment(summary)
      setDelivery(details)
      setFailed(!loaded)
      setVersion((v) => v + 1)
    } catch {
      if (mine === token.current) setFailed(true)
    } finally {
      if (mine === token.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (orderId === null) {
      token.current++
      setOrder(null)
      setPayment(null)
      setDelivery(null)
      return
    }
    void load(orderId)
  }, [orderId, load])

  const refresh = async () => {
    if (orderId !== null) await load(orderId, true)
    onChanged()
  }

  const runPrint = async (kind: 'receipt' | 'kitchen', request: () => Promise<PrintResult>, document: string) => {
    if (printing) return
    setPrinting(kind)
    try {
      const result = await request()
      if (result?.success) {
        toast.success(
          result.printerName
            ? t('orders.reprint.sent', { document, printer: result.printerName })
            : t('orders.reprint.sentDefault', { document })
        )
      } else {
        toast.error(t('orders.reprint.failed', { document, error: result?.error || t('orders.reprint.failedUnknown') }))
      }
    } catch (error) {
      toast.error(t('orders.reprint.failed', { document, error: stripIpcPrefix(error) }))
    } finally {
      setPrinting(null)
    }
  }

  const printReceipt = (id: number) =>
    runPrint('receipt', () => window.api.printer.printReceipt(id, REPRINT), t('orders.reprint.receipt'))
  const printKitchen = (id: number) =>
    runPrint('kitchen', () => window.api.printer.printKitchen(id, REPRINT), t('orders.reprint.kitchen'))

  const markDone = async (target: HistoryOrder) => {
    try {
      await window.api.orders.updateStatus(target.id, 'completed')
      toast.success(t('orderHistory.toast.done', { number: target.daily_number }))
    } catch (error) {
      toast.error(t('orderHistory.toast.actionFailed', { message: stripIpcPrefix(error) }))
    }
    await refresh()
  }

  /** Resolves true when cancelled; throws the readable reason otherwise (shown in the dialog). */
  const cancelOrder = async (target: HistoryOrder): Promise<boolean> => {
    try {
      const result = await withApproval((approval) => window.api.orders.cancel(target.id, approval), {
        action: 'cancel_order'
      })
      if (result === null) return false
      toast.success(t('orderHistory.toast.cancelled', { number: target.daily_number }))
      await refresh()
      return true
    } catch (error) {
      throw new Error(stripIpcPrefix(error))
    }
  }

  /** Resolves '' on success, null when the approval was dismissed, else the error to show. */
  const saveEdit = async (target: HistoryOrder, lines: EditLine[]): Promise<string | null> => {
    const items = lines.map((item) => ({
      order_item_id: item.order_item_id,
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      notes: item.notes || undefined,
      worker_id: item.worker_id || undefined,
      // Keep each line's recorded price (don't silently re-price to current menu)
      unit_price: item.unit_price
    }))
    try {
      // Preserve the stored legacy discount; do not apply today's promotion rules.
      const updated = await withApproval(
        (approval) => window.api.orders.updateItems(target.id, items, undefined, undefined, undefined, approval),
        { action: 'void_line' }
      )
      if (updated === null) return null
      toast.success(t('orderHistory.toast.saved', { number: target.daily_number }))
      await refresh()
      return ''
    } catch (err) {
      console.error('Failed to update order:', err)
      const rejection = parseOrderEditRejection(err)
      return rejection
        ? t(`orders.editRejected.${rejection}`, { number: target.daily_number })
        : t('orders.editRejected.generic', { message: stripIpcPrefix(err) })
    }
  }

  return { order, payment, delivery, loading, failed, version, printing, printReceipt, printKitchen, markDone, cancelOrder, saveEdit }
}
