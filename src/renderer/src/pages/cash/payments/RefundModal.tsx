import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, RotateCcw } from 'lucide-react'
import { parseApprovalError, type OrderPaymentSummary, type PaymentMethodConfig } from '../../../../../shared/cash'
import { Button, Input, Modal, Select, formatAmount, toast } from '../../../components/ui'
import { withApproval } from '../../../components/checkout'
import { errorText, useMethodLabel } from '../cashShared'

/** Hand money back on one method (manager approval when guarded). */
export function RefundModal({ isOpen, orderId, dailyNumber, summary, methods, onClose, onDone }: {
  isOpen: boolean
  orderId: number
  dailyNumber: number
  summary: OrderPaymentSummary | null
  methods: PaymentMethodConfig[] | null
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const methodLabel = useMethodLabel(methods)
  const [method, setMethod] = useState('cash')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  /** Net collected per method (a pre-v4 order counts as cash for its total). */
  const collected = useMemo(() => {
    const map = new Map<string, number>()
    if (!summary) return map
    if (summary.legacy) map.set('cash', summary.total)
    for (const p of summary.payments) map.set(p.method, (map.get(p.method) ?? 0) + p.amount)
    for (const [k, v] of map) if (v <= 0) map.delete(k)
    return map
  }, [summary])

  useEffect(() => {
    if (!isOpen) return
    const first = [...collected.keys()][0] ?? 'cash'
    setMethod(first)
    setAmount(String(collected.get(first) ?? ''))
    setReason('')
    setError('')
  }, [isOpen, collected])

  const max = collected.get(method) ?? 0

  const submit = async (): Promise<void> => {
    const value = Number(amount)
    if (!Number.isInteger(value) || value < 1) return setError(t('cashAdmin.errors.wholeAmount'))
    if (value > max) return setError(t('cashAdmin.refund.tooMuch', { max: formatAmount(max, 0) }))
    if (!reason.trim()) return setError(t('cashAdmin.errors.reasonRequired'))
    setBusy(true)
    setError('')
    try {
      const result = await withApproval(
        (approval) => window.api.payments.refund(orderId, { method, amount: value, reason: reason.trim() }, approval),
        { action: 'refund', reason: reason.trim() }
      )
      if (result) {
        toast.success(t('cashAdmin.refund.done', { number: dailyNumber }))
        onDone()
        onClose()
      }
    } catch (e) {
      setError(parseApprovalError(e) ? t('cashAdmin.approvalNeeded') : errorText(e, t('common.error')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      closeOnBackdrop={false}
      title={t('cashAdmin.refund.title', { number: dailyNumber })}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="danger" size="lg" loading={busy} cooldownMs={800} icon={<RotateCcw className="h-5 w-5" />} onClick={submit}>
            {t('cashAdmin.refund.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label={t('cashAdmin.method')}
          value={method}
          onChange={(e) => {
            setMethod(e.target.value)
            setAmount(String(collected.get(e.target.value) ?? ''))
          }}
          options={[...collected.entries()].map(([id, v]) => ({ value: id, label: `${methodLabel(id)} · ${formatAmount(v, 0)}` }))}
        />
        <Input
          label={t('cashAdmin.amount')}
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          step={1}
          inputSize="lg"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          helperText={t('cashAdmin.refund.max', { max: formatAmount(max, 0) })}
        />
        <Input label={t('cashAdmin.reason')} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={t('cashAdmin.refund.reasonPlaceholder')} />
        <div className="flex gap-3 rounded-xl bg-info-soft text-info-ink p-3 text-sm">
          <Info className="h-5 w-5 shrink-0" />
          <p>{t('cashAdmin.refund.hint')}</p>
        </div>
        {error && <p className="text-sm font-medium text-danger-ink bg-danger-soft rounded-xl p-3">{error}</p>}
      </div>
    </Modal>
  )
}
