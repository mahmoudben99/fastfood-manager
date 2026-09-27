import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import type { CashMovement, Shift } from '../../../../shared/shift-report'
import { Button, SegmentedControl, cn, toast } from '../ui'
import { withApproval } from './approval'
import { timeOf } from './format'
import { errorText } from './methods'
import { AmountDisplay, Numpad, SideKey, SignedMoney, keepFocus, useNumpadKeys } from './Numpad'
import { applyKey } from './tender'
import { useTouchKeyboard } from './useTouchKeyboard'

type Kind = 'pay_out' | 'pay_in'

/** Pay-in / pay-out on the open shift (a pay-out goes through the manager approval when guarded). */
export function ShiftMovements({ shift, active = true }: { shift: Shift; active?: boolean }) {
  const { t, i18n } = useTranslation()
  const kb = useTouchKeyboard()
  const [kind, setKind] = useState<Kind>('pay_out')
  const [entry, setEntry] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [list, setList] = useState<CashMovement[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  const load = (): void => {
    window.api.shifts.listMovements(shift.id).then(setList).catch(() => setList([]))
  }
  useEffect(load, [shift.id])

  const amount = Number(entry) || 0
  const ready = amount > 0 && reason.trim().length > 0 && !busy
  const quick = t(`checkout.shift.reasons.${kind}`, { returnObjects: true }) as unknown
  const reasons = Array.isArray(quick) ? (quick as string[]) : []

  const record = async (): Promise<void> => {
    if (!ready) return
    setBusy(true)
    const input = { kind, amount, reason: reason.trim(), operator: shift.cashier_name }
    try {
      const saved = kind === 'pay_out'
        ? await withApproval((approval) => window.api.shifts.addMovement(input, approval), { action: 'pay_out', reason: input.reason })
        : await window.api.shifts.addMovement(input)
      if (!saved) return
      toast.success(kind === 'pay_out' ? t('checkout.shift.payOutSaved') : t('checkout.shift.payInSaved'))
      setEntry('')
      setReason('')
      load()
    } catch (error) {
      toast.error(t('checkout.shift.movementError'), { description: errorText(error, '') })
    } finally {
      setBusy(false)
    }
  }

  useNumpadKeys(active && !busy, (key) => setEntry((value) => applyKey(value, key)), record, rootRef)

  return (
    <div ref={rootRef} className="grid gap-5 md:grid-cols-2" data-testid="shift-movements">
      <div className="space-y-3 min-w-0">
        <SegmentedControl<Kind>
          fullWidth
          size="lg"
          value={kind}
          onChange={(next) => {
            setKind(next)
            setReason('')
          }}
          options={[
            { value: 'pay_out', label: t('checkout.shift.payOut'), icon: <ArrowUpFromLine /> },
            { value: 'pay_in', label: t('checkout.shift.payIn'), icon: <ArrowDownToLine /> }
          ]}
        />
        <AmountDisplay label={t('checkout.shift.amount')} entry={entry} placeholder={0} />
        <Numpad
          size="md"
          disabled={busy}
          onKey={(key) => setEntry((value) => applyKey(value, key))}
          side={<SideKey tone="danger" onClick={() => setEntry('')} label={t('checkout.pad.clear')}>C</SideKey>}
        />
      </div>
      <div className="space-y-3 min-w-0">
        <div className="flex flex-wrap gap-2">
          {reasons.map((label) => (
            <button
              key={label}
              type="button"
              aria-pressed={reason === label}
              onClick={() => setReason(label)}
              onMouseDown={keepFocus}
              className={cn(
                'tap min-h-11 px-3.5 rounded-full border text-sm font-semibold',
                reason === label ? 'bg-inverse text-on-inverse border-transparent' : 'bg-surface-2 text-ink-2 border-line hover:bg-surface-3'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          data-ui="input"
          maxLength={200}
          aria-label={t('checkout.shift.reasonPlaceholder')}
          placeholder={t('checkout.shift.reasonPlaceholder')}
          className="w-full min-h-12 rounded-xl border border-line-strong bg-surface dark:bg-surface-2 px-3.5 text-base text-ink placeholder:text-faint focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          {...kb.field('movement-reason', reason, setReason)}
        />
        <Button size="xl" fullWidth onClick={record} disabled={!ready} loading={busy} cooldownMs={800}
          icon={kind === 'pay_out' ? <ArrowUpFromLine className="h-5 w-5" /> : <ArrowDownToLine className="h-5 w-5" />}>
          {t('checkout.shift.record')}
        </Button>
        <div className="rounded-xl border border-line divide-y divide-line max-h-48 overflow-y-auto">
          {list.length === 0 && <p className="px-3 py-3 text-sm text-muted">{t('checkout.shift.noMovements')}</p>}
          {[...list].reverse().map((movement) => (
            <div key={movement.id} className="flex items-center gap-2 px-3 min-h-11">
              <span className="num text-xs text-muted w-11 shrink-0">{timeOf(movement.created_at, i18n.language)}</span>
              <span className="flex-1 min-w-0 truncate text-sm text-ink">{movement.reason}</span>
              <span className={cn('text-sm font-bold', movement.kind === 'pay_out' ? 'text-danger-ink' : 'text-success-ink')}>
                <SignedMoney value={movement.amount} sign={movement.kind === 'pay_out' ? 'minus' : 'plus'} />
              </span>
            </div>
          ))}
        </div>
      </div>
      {kb.keyboard}
    </div>
  )
}
