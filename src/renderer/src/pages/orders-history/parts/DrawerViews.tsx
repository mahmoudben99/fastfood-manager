import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer, Save } from 'lucide-react'
import { Button } from '../../../components/ui'
import { DrawerBody, DrawerFooter } from './Drawer'
import { InvoiceFields, useInvoiceForm } from './InvoiceForm'
import { OrderEditor, toEditLines } from './OrderEditor'
import type { EditLine, HistoryOrder } from './types'

/** Edit mode: quantities / removals on today's ongoing order, saved at the recorded prices. */
export function EditView({
  order,
  onSave,
  onDone
}: {
  order: HistoryOrder
  /** '' = saved, null = approval dismissed, string = error to show. */
  onSave: (lines: EditLine[]) => Promise<string | null>
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [lines, setLines] = useState<EditLine[]>(() => toEditLines(order))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (lines.length === 0) return
    setSaving(true)
    setError('')
    const result = await onSave(lines)
    setSaving(false)
    // Keep the edit on screen and say why when it was refused (e.g. a previous business day).
    if (result === '') onDone()
    else if (result) setError(result)
  }

  return (
    <>
      <DrawerBody>
        <OrderEditor order={order} lines={lines} onChange={setLines} error={error} onDismissError={() => setError('')} />
      </DrawerBody>
      <DrawerFooter>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" onClick={onDone} disabled={saving} className="flex-1">
            {t('common.cancel')}
          </Button>
          <Button
            size="lg"
            icon={<Save className="h-5 w-5" />}
            onClick={save}
            loading={saving}
            disabled={lines.length === 0}
            className="flex-[2]"
          >
            {t('common.save')}
          </Button>
        </div>
      </DrawerFooter>
    </>
  )
}

/** Invoice ("facture") form + print. Cancelled orders cannot be invoiced (main process rule). */
export function InvoiceView({ order, onBack }: { order: HistoryOrder; onBack: () => void }) {
  const { t } = useTranslation()
  const form = useInvoiceForm(order)
  const cancelled = order.status === 'cancelled'

  return (
    <>
      <DrawerBody>
        {cancelled ? (
          <p className="rounded-2xl bg-danger-soft p-4 text-sm font-medium text-danger-ink">
            {t('orderHistory.invoice.cancelled')}
          </p>
        ) : (
          <InvoiceFields form={form} />
        )}
      </DrawerBody>
      <DrawerFooter>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" onClick={onBack} className="flex-1">
            {t('common.back')}
          </Button>
          <Button
            size="lg"
            icon={<Printer className="h-5 w-5" />}
            onClick={() => void form.print()}
            loading={form.printing}
            disabled={cancelled}
            cooldownMs={800}
            className="flex-[2]"
          >
            {t('orderHistory.invoice.print')}
          </Button>
        </div>
      </DrawerFooter>
    </>
  )
}
