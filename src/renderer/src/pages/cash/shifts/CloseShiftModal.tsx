import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banknote, Coins, Lock } from 'lucide-react'
import { DZD_DENOMINATIONS, type DenominationCounts, type DenominationKey } from '../../../../../shared/cash'
import type { Shift, ShiftReport } from '../../../../../shared/shift-report'
import { Button, Input, Modal, Money, SegmentedControl, Toggle, cn, formatAmount, toast } from '../../../components/ui'
import { errorText } from '../cashShared'

interface CloseShiftModalProps {
  isOpen: boolean
  shift: Shift
  onClose: () => void
  onDone: (result: { shift: Shift; report: ShiftReport }) => void
}

type Counts = Partial<Record<DenominationKey, string>>

/** Blind close: count the drawer by note/coin (or type the total), then store the Z report. */
export function CloseShiftModal({ isOpen, shift, onClose, onDone }: CloseShiftModalProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'count' | 'total'>('count')
  const [counts, setCounts] = useState<Counts>({})
  const [total, setTotal] = useState('')
  const [closedBy, setClosedBy] = useState(shift.cashier_name)
  const [note, setNote] = useState('')
  const [print, setPrint] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setCounts({})
    setTotal('')
    setNote('')
    setError('')
    setClosedBy(shift.cashier_name)
  }, [isOpen, shift.cashier_name])

  const counted = useMemo(() => {
    if (mode === 'total') return Number(total) || 0
    return DZD_DENOMINATIONS.reduce((acc, d) => acc + d.value * (Number(counts[d.key]) || 0), 0)
  }, [mode, total, counts])

  const submit = async (): Promise<void> => {
    setError('')
    let input: { counted_cash?: number; denominations?: DenominationCounts }
    if (mode === 'total') {
      const value = Number(total)
      if (total === '' || !Number.isInteger(value) || value < 0) return setError(t('cashAdmin.errors.wholeAmount'))
      input = { counted_cash: value }
    } else {
      const denominations: DenominationCounts = {}
      for (const d of DZD_DENOMINATIONS) {
        const raw = counts[d.key]
        if (raw === undefined || raw === '') continue
        const n = Number(raw)
        if (!Number.isInteger(n) || n < 0) return setError(t('cashAdmin.errors.wholeCount'))
        if (n > 0) denominations[d.key] = n
      }
      input = { denominations }
    }
    setBusy(true)
    try {
      const result = await window.api.shifts.close({ ...input, closed_by: closedBy.trim() || undefined, note: note.trim() || undefined, print })
      toast.success(t('cashAdmin.close.done'))
      if (result.print && !result.print.success) toast.warning(t('cashAdmin.printFailed'), { description: result.print.error })
      onDone({ shift: result.shift, report: result.report })
      onClose()
    } catch (e) {
      setError(errorText(e, t('common.error')))
    } finally {
      setBusy(false)
    }
  }

  const row = (d: (typeof DZD_DENOMINATIONS)[number]) => {
    const n = Number(counts[d.key]) || 0
    return (
      <div key={d.key} className="flex items-center gap-3">
        <div
          className={cn(
            'num shrink-0 w-24 h-11 rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold border',
            d.kind === 'note' ? 'bg-success-soft text-success-ink border-transparent' : 'bg-surface-2 text-ink-2 border-line'
          )}
        >
          {d.kind === 'note' ? <Banknote className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
          <bdi dir="ltr">{formatAmount(d.value, 0)}</bdi>
        </div>
        <span className="text-faint text-sm" aria-hidden="true">×</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          data-ui="input"
          aria-label={`${formatAmount(d.value, 0)} × `}
          value={counts[d.key] ?? ''}
          placeholder="0"
          onChange={(e) => setCounts((c) => ({ ...c, [d.key]: e.target.value }))}
          className="num w-20 h-11 rounded-xl border border-line-strong bg-surface px-3 text-center text-base font-semibold text-ink focus:outline-2 focus:outline-focus"
        />
        <span className="ms-auto text-sm font-semibold text-ink-2 text-end">
          {n > 0 ? <Money value={n * d.value} decimals={0} /> : <span className="text-faint">—</span>}
        </span>
      </div>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      size="lg"
      closeOnBackdrop={false}
      title={t('cashAdmin.close.title', { name: shift.cashier_name })}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button size="lg" loading={busy} cooldownMs={800} icon={<Lock className="h-5 w-5" />} onClick={submit}>
            {t('cashAdmin.close.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'count', label: t('cashAdmin.close.byDenomination') },
            { value: 'total', label: t('cashAdmin.close.byTotal') }
          ]}
        />
        {mode === 'count' ? (
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-2.5">
            <div className="space-y-2.5">
              <p className="text-[13px] font-semibold text-muted">{t('cashAdmin.close.notes')}</p>
              {DZD_DENOMINATIONS.filter((d) => d.kind === 'note').map(row)}
            </div>
            <div className="space-y-2.5">
              <p className="text-[13px] font-semibold text-muted">{t('cashAdmin.close.coins')}</p>
              {DZD_DENOMINATIONS.filter((d) => d.kind === 'coin').map(row)}
            </div>
          </div>
        ) : (
          <Input
            label={t('cashAdmin.report.counted')}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            inputSize="lg"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            autoFocus
          />
        )}

        <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface-2 border border-line px-5 py-4">
          <span className="text-sm font-semibold text-ink-2">{t('cashAdmin.close.countedTotal')}</span>
          <span className="text-total text-ink"><Money value={counted} decimals={0} /></span>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Input label={t('cashAdmin.close.closedBy')} value={closedBy} onChange={(e) => setClosedBy(e.target.value)} maxLength={80} />
          <Input label={t('cashAdmin.note')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </div>
        <Toggle checked={print} onChange={setPrint} label={t('cashAdmin.close.printZ')} />
        {error && <p className="text-sm font-medium text-danger-ink bg-danger-soft rounded-xl p-3">{error}</p>}
      </div>
    </Modal>
  )
}
