import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCheck2 } from 'lucide-react'
import { Input, SegmentedControl, Select, toast } from '../../../components/ui'
import { VirtualKeyboard } from '../../../components/VirtualKeyboard'
import { useAppStore } from '../../../store/appStore'
import type { InvoiceCustomer, InvoiceRow } from '../../../../../shared/cash'
import { stripIpcPrefix } from './labels'
import type { HistoryOrder } from './types'

type Field = keyof InvoiceCustomer
const FIELDS: Field[] = ['name', 'address', 'nif', 'nis', 'rc', 'ai']
const EMPTY: InvoiceCustomer = { name: '', address: '', nif: '', nis: '', rc: '', ai: '' }

/** State + print action of the invoice ("facture") view; the drawer renders the footer. */
export function useInvoiceForm(order: HistoryOrder) {
  const { t } = useTranslation()
  const [existing, setExisting] = useState<InvoiceRow | null>(null)
  const [customer, setCustomer] = useState<InvoiceCustomer>(EMPTY)
  const [format, setFormat] = useState<'receipt' | 'a4'>('receipt')
  const [printerName, setPrinterName] = useState('')
  const [printers, setPrinters] = useState<{ name: string; isDefault?: boolean }[]>([])
  const [printing, setPrinting] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    let live = true
    window.api.payments.getInvoice(order.id)
      .then((row) => {
        if (!live) return
        setExisting(row)
        if (row) {
          try { setCustomer({ ...EMPTY, ...(JSON.parse(row.customer || '{}') as InvoiceCustomer) }) } catch { /* keep empty */ }
        } else {
          setCustomer({ ...EMPTY, name: order.customer_name ?? '' })
        }
      })
      .catch(() => { if (live) setCustomer({ ...EMPTY, name: order.customer_name ?? '' }) })
    return () => { live = false }
  }, [order.id, order.customer_name])

  useEffect(() => {
    if (format !== 'a4' || printers.length > 0) return
    Promise.resolve(window.api.printer.getPrinters())
      .then((list: { name: string; isDefault?: boolean }[]) => setPrinters(Array.isArray(list) ? list : []))
      .catch(() => setPrinters([]))
  }, [format, printers.length])

  const print = async (): Promise<void> => {
    if (!existing && !customer.name.trim()) {
      setNameError(t('orderHistory.invoice.nameRequired'))
      return
    }
    setPrinting(true)
    const document = t('orderHistory.action.invoice')
    try {
      const clean: InvoiceCustomer = { name: customer.name.trim() }
      for (const key of FIELDS) {
        const value = customer[key]?.trim()
        if (key !== 'name' && value) clean[key] = value
      }
      const options = format === 'a4' ? { format, ...(printerName ? { printerName } : {}) } : { format }
      const result = await window.api.payments.printInvoice(order.id, clean, options)
      if (result?.success) {
        toast.success(
          result.printerName
            ? t('orders.reprint.sent', { document, printer: result.printerName })
            : t('orders.reprint.sentDefault', { document })
        )
        const row = await window.api.payments.getInvoice(order.id).catch(() => null)
        if (row) setExisting(row)
      } else {
        toast.error(t('orders.reprint.failed', { document, error: result?.error || t('orders.reprint.failedUnknown') }))
      }
    } catch (error) {
      toast.error(t('orders.reprint.failed', { document, error: stripIpcPrefix(error) }))
    } finally {
      setPrinting(false)
    }
  }

  const update = (key: Field, value: string) => {
    setCustomer((prev) => ({ ...prev, [key]: value }))
    if (key === 'name') setNameError('')
  }

  return { existing, customer, update, format, setFormat, printerName, setPrinterName, printers, printing, nameError, print }
}

export type InvoiceFormState = ReturnType<typeof useInvoiceForm>

export function InvoiceFields({ form }: { form: InvoiceFormState }) {
  const { t } = useTranslation()
  const isTouch = useAppStore((s) => s.inputMode) === 'touchscreen'
  const [keyboardFor, setKeyboardFor] = useState<Field | null>(null)
  const locked = Boolean(form.existing)

  const field = (key: Field, extra: { required?: boolean; wide?: boolean } = {}) => (
    <div className={extra.wide ? 'sm:col-span-2' : undefined}>
      <Input
        label={t(`orderHistory.invoice.${key}`) + (extra.required && !locked ? ' *' : '')}
        value={form.customer[key] ?? ''}
        disabled={locked}
        readOnly={isTouch}
        onClick={isTouch && !locked ? () => setKeyboardFor(key) : undefined}
        onChange={(e) => form.update(key, e.target.value)}
        error={key === 'name' ? form.nameError : undefined}
        maxLength={key === 'name' ? 120 : key === 'address' ? 200 : 30}
      />
    </div>
  )

  return (
    <div className="space-y-5">
      {form.existing && (
        <p className="flex items-center gap-2.5 rounded-2xl bg-success-soft p-3 text-sm font-bold text-success-ink">
          <FileCheck2 className="h-5 w-5 shrink-0" />
          <bdi>{t('orderHistory.invoice.existing', { number: form.existing.invoice_number })}</bdi>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        {field('name', { required: true, wide: true })}
        {field('address', { wide: true })}
        {field('nif')}
        {field('nis')}
        {field('rc')}
        {field('ai')}
      </div>

      <div className="grid items-end gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-2">{t('orderHistory.invoice.format')}</p>
          <SegmentedControl
            value={form.format}
            onChange={form.setFormat}
            fullWidth
            ariaLabel={t('orderHistory.invoice.format')}
            options={[
              { value: 'receipt', label: t('orderHistory.invoice.formatReceipt') },
              { value: 'a4', label: t('orderHistory.invoice.formatA4') }
            ]}
          />
        </div>
        {form.format === 'a4' && (
          <Select
            label={t('orderHistory.invoice.printer')}
            value={form.printerName}
            onChange={(e) => form.setPrinterName(e.target.value)}
            options={[
              { value: '', label: t('orderHistory.invoice.defaultPrinter') },
              ...form.printers.map((p) => ({ value: p.name, label: p.name }))
            ]}
          />
        )}
      </div>

      {isTouch && keyboardFor && (
        <VirtualKeyboard
          visible
          type="text"
          extended
          value={form.customer[keyboardFor] ?? ''}
          onChange={(value) => form.update(keyboardFor, value)}
          onClose={() => setKeyboardFor(null)}
        />
      )}
    </div>
  )
}
