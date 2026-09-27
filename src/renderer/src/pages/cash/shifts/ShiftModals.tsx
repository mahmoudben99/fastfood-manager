import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownLeft, ArrowUpRight, Play } from 'lucide-react'
import { parseApprovalError } from '../../../../../shared/cash'
import { Button, Input, Modal, SegmentedControl, Select, Textarea, cn, formatAmount, toast } from '../../../components/ui'
import { withApproval } from '../../../components/checkout'
import { errorText } from '../cashShared'

const OTHER = '__other__'
const FLOAT_PRESETS = [0, 2000, 5000, 10000]

interface BaseProps {
  isOpen: boolean
  onClose: () => void
  onDone: () => void
}

/** Open a shift: cashier (a worker or a free name), opening float, note. */
export function OpenShiftModal({ isOpen, onClose, onDone }: BaseProps) {
  const { t } = useTranslation()
  const [workers, setWorkers] = useState<{ id: number; name: string }[]>([])
  const [who, setWho] = useState('')
  const [otherName, setOtherName] = useState('')
  const [float, setFloat] = useState('0')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setError('')
    window.api.workers.getAll()
      .then((rows: { id: number; name: string; is_active?: number; role?: string }[]) => {
        const active = (rows || []).filter((w) => w.is_active !== 0 && w.role !== 'driver')
        setWorkers(active)
        setWho((prev) => prev || (active[0] ? String(active[0].id) : OTHER))
      })
      .catch(() => setWho(OTHER))
  }, [isOpen])

  const submit = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault()
    const amount = Number(float)
    if (!Number.isInteger(amount) || amount < 0) return setError(t('cashAdmin.errors.wholeAmount'))
    if (who === OTHER && !otherName.trim()) return setError(t('cashAdmin.errors.cashierRequired'))
    setBusy(true)
    try {
      await window.api.shifts.open({
        ...(who === OTHER ? { cashier_name: otherName.trim() } : { cashier_worker_id: Number(who) }),
        opening_float: amount,
        note: note.trim() || undefined
      })
      toast.success(t('cashAdmin.current.opened'))
      setNote('')
      onDone()
      onClose()
    } catch (err) {
      setError(errorText(err, t('common.error')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('cashAdmin.current.open')}
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="lg" loading={busy} icon={<Play className="h-5 w-5 rtl:-scale-x-100" />} onClick={() => submit()}>
            {t('cashAdmin.current.open')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Select
          label={t('cashAdmin.open.cashier')}
          value={who}
          onChange={(e) => setWho(e.target.value)}
          options={[
            ...workers.map((w) => ({ value: String(w.id), label: w.name })),
            { value: OTHER, label: t('cashAdmin.open.otherName') }
          ]}
        />
        {who === OTHER && (
          <Input
            label={t('cashAdmin.open.name')}
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
            maxLength={80}
            autoFocus
          />
        )}
        <div>
          <Input
            label={t('cashAdmin.report.openingFloat')}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={float}
            onChange={(e) => setFloat(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {FLOAT_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setFloat(String(v))}
                className={cn(
                  'tap num min-h-10 px-3.5 rounded-xl border text-sm font-semibold',
                  Number(float) === v ? 'bg-inverse text-on-inverse border-transparent' : 'bg-surface border-line text-ink-2 hover:bg-surface-2'
                )}
              >
                <bdi dir="ltr">{formatAmount(v, 0)}</bdi>
              </button>
            ))}
          </div>
        </div>
        <Textarea label={t('cashAdmin.note')} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
        {error && <p className="text-sm font-medium text-danger-ink bg-danger-soft rounded-xl p-3">{error}</p>}
      </form>
    </Modal>
  )
}

/** Pay-in / pay-out on the open shift (a pay-out asks for the manager PIN when guarded). */
export function MovementModal({ isOpen, onClose, onDone }: BaseProps) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<'pay_in' | 'pay_out'>('pay_out')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setAmount('')
      setReason('')
      setError('')
    }
  }, [isOpen])

  const submit = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault()
    const value = Number(amount)
    if (!Number.isInteger(value) || value < 1) return setError(t('cashAdmin.errors.wholeAmount'))
    if (!reason.trim()) return setError(t('cashAdmin.errors.reasonRequired'))
    setBusy(true)
    setError('')
    try {
      const saved = await withApproval(
        (approval) => window.api.shifts.addMovement({ kind, amount: value, reason: reason.trim() }, approval),
        { action: 'pay_out', reason: reason.trim() }
      )
      if (saved) {
        toast.success(kind === 'pay_in' ? t('cashAdmin.movement.savedIn') : t('cashAdmin.movement.savedOut'))
        onDone()
        onClose()
      }
    } catch (err) {
      setError(parseApprovalError(err) ? t('cashAdmin.approvalNeeded') : errorText(err, t('common.error')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('cashAdmin.current.movement')}
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="lg" loading={busy} onClick={() => submit()}>{t('common.save')}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <SegmentedControl
          fullWidth
          size="lg"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'pay_out', label: t('cashAdmin.movement.payOut'), icon: <ArrowUpRight className="text-danger-ink" /> },
            { value: 'pay_in', label: t('cashAdmin.movement.payIn'), icon: <ArrowDownLeft className="text-success-ink" /> }
          ]}
        />
        <Input
          label={t('cashAdmin.amount')}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputSize="lg"
          autoFocus
        />
        <Input
          label={t('cashAdmin.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder={kind === 'pay_out' ? t('cashAdmin.movement.outPlaceholder') : t('cashAdmin.movement.inPlaceholder')}
        />
        {error && <p className="text-sm font-medium text-danger-ink bg-danger-soft rounded-xl p-3">{error}</p>}
      </form>
    </Modal>
  )
}
