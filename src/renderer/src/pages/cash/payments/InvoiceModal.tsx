import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, FileText, Printer } from 'lucide-react'
import type { InvoiceCustomer, InvoiceRow } from '../../../../../shared/cash'
import { Button, Input, Modal, SegmentedControl, toast } from '../../../components/ui'
import { errorText } from '../cashShared'

const EMPTY: InvoiceCustomer = { name: '', address: '', nif: '', nis: '', rc: '', ai: '' }
/** Natural CSS width of the printed page (190mm A4 body / ~80mm receipt) used to zoom the preview to fit. */
const PAPER_PX = { a4: 740, receipt: 320 }

/**
 * Invoice ("facture") on customer request. The number is issued once, on the first preview/print;
 * later previews and reprints reuse the stored customer details.
 */
export function InvoiceModal({ isOpen, orderId, dailyNumber, defaultName, invoice, onClose, onIssued }: {
  isOpen: boolean
  orderId: number
  dailyNumber: number
  defaultName: string
  invoice: InvoiceRow | null
  onClose: () => void
  onIssued: () => void
}) {
  const { t } = useTranslation()
  const [customer, setCustomer] = useState<InvoiceCustomer>(EMPTY)
  const [format, setFormat] = useState<'receipt' | 'a4'>('a4')
  const [html, setHtml] = useState('')
  const [busy, setBusy] = useState<'preview' | 'print' | null>(null)
  const [error, setError] = useState('')
  const locked = invoice !== null
  const box = useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = useState(0)

  useEffect(() => {
    const el = box.current
    if (!isOpen || !el) return
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [isOpen])

  const zoom = boxWidth ? Math.min(1, (boxWidth - 12) / PAPER_PX[format]) : 1
  const srcDoc = html ? html.replace('</head>', `<style>html{zoom:${zoom.toFixed(3)}}body{margin:0 auto}</style></head>`) : ''

  useEffect(() => {
    if (!isOpen) return
    setHtml('')
    setError('')
  }, [isOpen])

  // The stored customer wins once the number exists (issuing it re-renders with `invoice` set).
  useEffect(() => {
    if (!isOpen) return
    if (invoice) {
      try {
        setCustomer({ ...EMPTY, ...(JSON.parse(invoice.customer || '{}') as InvoiceCustomer) })
      } catch {
        setCustomer(EMPTY)
      }
    } else {
      setCustomer({ ...EMPTY, name: defaultName })
    }
  }, [isOpen, invoice, defaultName])

  // Re-render the preview when the paper format changes (the number already exists by then).
  useEffect(() => {
    if (!isOpen || !html) return
    window.api.payments.invoiceHTML(orderId, customer, format).then(setHtml).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format])

  const clean = (): InvoiceCustomer | null => {
    if (!customer.name.trim()) {
      setError(t('cashAdmin.invoice.nameRequired'))
      return null
    }
    return Object.fromEntries(Object.entries(customer).map(([k, v]) => [k, String(v ?? '').trim()])) as unknown as InvoiceCustomer
  }

  const preview = async (): Promise<void> => {
    const c = clean()
    if (!c) return
    setBusy('preview')
    setError('')
    try {
      setHtml(await window.api.payments.invoiceHTML(orderId, c, format))
      if (!locked) onIssued()
    } catch (e) {
      setError(errorText(e, t('common.error')))
    } finally {
      setBusy(null)
    }
  }

  const print = async (): Promise<void> => {
    const c = clean()
    if (!c) return
    setBusy('print')
    setError('')
    try {
      const result = await window.api.payments.printInvoice(orderId, c, { format })
      if (result.success) toast.success(t('cashAdmin.invoice.printed'))
      else toast.error(t('cashAdmin.printFailed'), { description: result.error })
      if (!locked) onIssued()
    } catch (e) {
      setError(errorText(e, t('common.error')))
    } finally {
      setBusy(null)
    }
  }

  const field = (key: keyof InvoiceCustomer, label: string, extra: { maxLength?: number; dir?: 'ltr' | 'auto' } = {}) => (
    <Input
      label={label}
      value={customer[key] ?? ''}
      disabled={locked}
      maxLength={extra.maxLength ?? 30}
      dir={extra.dir}
      onChange={(e) => setCustomer((c) => ({ ...c, [key]: e.target.value }))}
    />
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      closeOnBackdrop={false}
      title={t('cashAdmin.invoice.title', { number: dailyNumber })}
      description={invoice ? t('cashAdmin.invoice.existing', { number: invoice.invoice_number }) : undefined}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('common.close')}</Button>
          <Button variant="secondary" size="lg" icon={<Eye className="h-5 w-5" />} loading={busy === 'preview'} onClick={preview}>
            {t('cashAdmin.invoice.preview')}
          </Button>
          <Button size="lg" icon={<Printer className="h-5 w-5" />} cooldownMs={800} loading={busy === 'print'} onClick={print}>
            {t('cashAdmin.invoice.print')}
          </Button>
        </>
      }
    >
      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
        <div className="space-y-4">
          <SegmentedControl
            value={format}
            onChange={setFormat}
            options={[
              { value: 'a4', label: t('cashAdmin.invoice.a4') },
              { value: 'receipt', label: t('cashAdmin.invoice.receipt') }
            ]}
          />
          {field('name', t('cashAdmin.invoice.customerName'), { maxLength: 120, dir: 'auto' })}
          {field('address', t('cashAdmin.invoice.address'), { maxLength: 200, dir: 'auto' })}
          <div className="grid grid-cols-2 gap-3">
            {field('nif', 'NIF', { dir: 'ltr' })}
            {field('nis', 'NIS', { dir: 'ltr' })}
            {field('rc', 'RC', { dir: 'ltr' })}
            {field('ai', 'AI', { dir: 'ltr' })}
          </div>
          {!locked && <p className="text-xs text-muted">{t('cashAdmin.invoice.numberHint')}</p>}
          {error && <p className="text-sm font-medium text-danger-ink bg-danger-soft rounded-xl p-3">{error}</p>}
        </div>
        <div ref={box} className="rounded-2xl border border-line bg-surface-2 p-3 min-h-[460px] flex">
          {html ? (
            <iframe
              title={t('cashAdmin.invoice.preview')}
              sandbox=""
              srcDoc={srcDoc}
              className="receipt-paper w-full min-h-[460px] rounded-xl bg-white border border-line"
            />
          ) : (
            <div className="m-auto text-center text-sm text-muted max-w-56 flex flex-col items-center gap-3">
              <FileText className="h-10 w-10 text-primary-ink" />
              {t('cashAdmin.invoice.previewHint')}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
