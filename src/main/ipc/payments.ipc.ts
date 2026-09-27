import { ipcMain } from 'electron'
import { getDb } from '../database/connection'
import { cashBreakdown, type ApprovalInput, type OrderPaymentInput, type RefundInput } from '../../shared/cash'
import { requireApproval } from '../services/approvals'
import { cashRoundingStep, getPaymentMethods, savePaymentMethods } from '../services/payment-methods'
import { listUnpaidOrders, paymentSummary, recordPayments, recordRefund, salesByMethod } from '../services/payments'
import { actingOperator, openShiftId } from '../services/shifts'
import { getInvoice, type InvoiceCustomer } from '../services/invoice'
import { invoiceHTML, printInvoice } from '../services/shift-report'

/** v4 payments IPC (preload namespace `payments`). */
export function registerPaymentsHandlers(): void {
  ipcMain.handle('payments:getMethods', () => getPaymentMethods(getDb()))
  ipcMain.handle('payments:saveMethods', (_, methods: unknown) => savePaymentMethods(getDb(), methods))

  /** Cash rounding + change for a cash payment of `amount` (uses setting cash_rounding). */
  ipcMain.handle('payments:previewCash', (_, amount: number, tendered?: number) =>
    ({ ...cashBreakdown(Number(amount) || 0, tendered, cashRoundingStep(getDb())), step: cashRoundingStep(getDb()) })
  )

  ipcMain.handle('payments:forOrder', (_, orderId: number) => paymentSummary(getDb(), orderId))

  /** Pay-later / partial / COD: add payment lines to an existing order (split allowed). */
  ipcMain.handle('payments:add', (_, orderId: number, lines: OrderPaymentInput[], operator?: string) => {
    const db = getDb()
    return db.transaction(() => recordPayments(db, orderId, lines, {
      shiftId: openShiftId(db), operator: actingOperator(db, operator), now: new Date()
    }))()
  })

  /** Hand money back on one method (manager approval 'refund' when guarded). */
  ipcMain.handle('payments:refund', (_, orderId: number, refund: RefundInput, approval?: ApprovalInput) => {
    const db = getDb()
    return db.transaction(() => {
      const approved = requireApproval(db, 'refund', approval, { orderId, detail: refund })
      return recordRefund(db, orderId, refund, {
        shiftId: openShiftId(db),
        operator: approved?.operator ?? actingOperator(db, approval?.operator),
        reason: refund?.reason ?? approved?.reason ?? null,
        now: new Date()
      })
    })()
  })

  ipcMain.handle('payments:listUnpaid', (_, options?: { date?: string; shiftId?: number }) => listUnpaidOrders(getDb(), options))
  ipcMain.handle('payments:salesByMethod', (_, startDate: string, endDate: string) => salesByMethod(getDb(), startDate, endDate))

  // Invoice ("facture") on customer request: numbered once per order, reprints reuse it.
  ipcMain.handle('payments:getInvoice', (_, orderId: number) => getInvoice(getDb(), orderId))
  ipcMain.handle('payments:invoiceHTML', (_, orderId: number, customer: InvoiceCustomer, format?: 'receipt' | 'a4') =>
    invoiceHTML(orderId, customer, format === 'a4' ? 'a4' : 'receipt', null)
  )
  ipcMain.handle(
    'payments:printInvoice',
    (_, orderId: number, customer: InvoiceCustomer, options?: { printerName?: string; format?: 'receipt' | 'a4' }) =>
      printInvoice(orderId, customer, options)
  )
}
