/**
 * Prints X / Z reports and invoices on the customer-receipt printer (same routing as receipts:
 * print-routing targetPrinters → print-window printHtml) and sends the owner's Telegram shift
 * summary through the existing bot's chat (sendMessageToChat; no second bot).
 */
import { getDb } from '../database/connection'
import { ordersRepo } from '../database/repositories/orders.repo'
import { printerAssignmentsRepo } from '../database/repositories/printer-assignments.repo'
import { settingsRepo } from '../database/repositories/settings.repo'
import { sendMessageToChat } from '../telegram/bot'
import type { ShiftReport } from '../../shared/shift-report'
import { issueInvoice, buildInvoiceHTML, type InvoiceCustomer } from './invoice'
import { routing } from './print-dispatch'
import { targetPrinters } from './print-routing'
import { printHtml, type PrintResult } from './print-window'
import { buildShiftReportHTML, buildShiftTelegramSummary } from './shift-report-format'
import { shiftReport } from './shifts'

function receiptPrinter(explicit?: string | null): string | null {
  if (explicit) return explicit
  return targetPrinters(routing(), { documentType: 'receipt', scope: 'all', workerId: null })[0] ?? null
}

export function shiftReportHTML(report: ShiftReport, printerName: string | null): string {
  const printer = printerName
    ? printerAssignmentsRepo.getSettingsForPrinter(printerName, 'receipt')
    : printerAssignmentsRepo.getReceiptSettings()
  return buildShiftReportHTML(report, settingsRepo.getAll(), {
    paperWidth: printer?.paper_width || null,
    fontSize: printer?.receipt_font_size || null
  })
}

export async function printShiftReport(report: ShiftReport, printerName?: string | null): Promise<PrintResult> {
  const printer = receiptPrinter(printerName)
  if (!printer) return { success: false, error: 'No printer configured for the customer receipt' }
  return printHtml(shiftReportHTML(report, printer), printer)
}

/** Durable-outbox consumer: failures throw so the event is retried. */
export async function sendShiftSummaryStrict(shiftId: number): Promise<void> {
  if (settingsRepo.get('telegram_shift_report') === 'false') return
  if (!settingsRepo.get('telegram_bot_token') || !settingsRepo.get('telegram_chat_id')) return
  const report = shiftReport(getDb(), shiftId)
  const sent = await sendMessageToChat(buildShiftTelegramSummary(report, settingsRepo.getAll()), 'HTML')
  if (!sent) throw new Error('Telegram shift summary failed')
}

export function invoiceHTML(orderId: number, customer: InvoiceCustomer, format: 'receipt' | 'a4', printerName: string | null): string {
  const invoice = issueInvoice(getDb(), orderId, customer)
  const order = ordersRepo.getById(orderId)
  if (!order) throw new Error('Order not found')
  const printer = printerName ? printerAssignmentsRepo.getSettingsForPrinter(printerName, 'receipt') : printerAssignmentsRepo.getReceiptSettings()
  return buildInvoiceHTML(order, invoice, settingsRepo.getAll(), { paperWidth: printer?.paper_width || null, format })
}

export async function printInvoice(
  orderId: number,
  customer: InvoiceCustomer,
  options: { printerName?: string | null; format?: 'receipt' | 'a4' } = {}
): Promise<PrintResult> {
  const printer = receiptPrinter(options.printerName)
  if (!printer) return { success: false, error: 'No printer configured for the customer receipt' }
  return printHtml(invoiceHTML(orderId, customer, options.format || 'receipt', printer), printer)
}
