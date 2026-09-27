import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Banknote, CheckCircle2, Coins, EyeOff, Lock, Printer, Scale, TrendingUp } from 'lucide-react'
import { DZD_DENOMINATIONS, type DenominationCounts, type DenominationKey } from '../../../../shared/cash'
import type { Shift, ShiftReport } from '../../../../shared/shift-report'
import { Button, Money, SegmentedControl, Toggle, cn, toast } from '../ui'
import { errorText } from './methods'
import { AmountDisplay, Numpad, SideKey, SignedMoney, keepFocus, useNumpadKeys } from './Numpad'
import { useShiftStore } from './shiftStore'
import { applyKey, countedTotal, nonZeroCounts, overShortTone } from './tender'
import { useTouchKeyboard } from './useTouchKeyboard'

type Mode = 'count' | 'total'
/** What shifts.close returned (shown until the cashier taps Done). */
export interface CloseOutcome { shiftId: number; report: ShiftReport; printed?: { success: boolean; error?: string } }

/**
 * Close the shift: count the drawer by Algerian denomination (or type the total), BLIND by default
 * (setting shift_blind_close: the expected cash stays hidden until the count is submitted), then
 * show over / short and print the Z report.
 */
export function ShiftClose({ shift, active = true, onClosed }: { shift: Shift; active?: boolean; onClosed: (outcome: CloseOutcome) => void }) {
  const { t } = useTranslation()
  const kb = useTouchKeyboard()
  const blind = useShiftStore((s) => s.blindClose)
  const [mode, setMode] = useState<Mode>('count')
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [current, setCurrent] = useState<DenominationKey>('n2000')
  const [total, setTotal] = useState('')
  const [closedBy, setClosedBy] = useState(shift.cashier_name)
  const [print, setPrint] = useState(true)
  const [expected, setExpected] = useState<number | null>(null)
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Not blind: the expected cash is shown while counting (X report).
  useEffect(() => {
    if (blind) return
    window.api.shifts.xReport().then((report) => setExpected(report.cash.expected)).catch(() => setExpected(null))
  }, [blind])
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current) }, [])

  const numeric: DenominationCounts = Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value) || 0]))
  const counted = mode === 'count' ? countedTotal(numeric) : Number(total) || 0
  const hasCount = mode === 'count' ? Object.values(numeric).some((n) => Number(n) > 0) : total !== ''

  const press = (key: Parameters<typeof applyKey>[1]): void => {
    setArmed(false)
    if (mode === 'total') setTotal((value) => applyKey(value, key))
    else setCounts((all) => ({ ...all, [current]: applyKey(all[current] ?? '', key, 5) }))
  }
  const next = (): void => {
    const index = DZD_DENOMINATIONS.findIndex((d) => d.key === current)
    if (index < DZD_DENOMINATIONS.length - 1) setCurrent(DZD_DENOMINATIONS[index + 1].key)
  }

  const close = async (): Promise<void> => {
    if (busy || !hasCount) return
    if (!armed) {
      // Two taps: closing a shift cannot be undone.
      setArmed(true)
      if (armTimer.current) clearTimeout(armTimer.current)
      armTimer.current = setTimeout(() => setArmed(false), 4000)
      return
    }
    setBusy(true)
    try {
      const outcome = await window.api.shifts.close({
        ...(mode === 'count' ? { denominations: nonZeroCounts(numeric) } : { counted_cash: counted }),
        closed_by: closedBy.trim() || undefined,
        print
      })
      onClosed({ shiftId: shift.id, report: outcome.report, printed: outcome.print })
    } catch (error) {
      toast.error(t('checkout.shift.closeError'), { description: errorText(error, '') })
      setArmed(false)
    } finally {
      setBusy(false)
    }
  }

  useNumpadKeys(active && !busy, press, mode === 'count' && current !== 'c5' ? next : close, rootRef)

  const overShort = expected === null ? null : counted - expected
  return (
    <div ref={rootRef} className="grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" data-testid="shift-close">
      <div className="space-y-3 min-w-0">
        <SegmentedControl<Mode>
          fullWidth
          value={mode}
          onChange={(value) => { setMode(value); setArmed(false) }}
          options={[{ value: 'count', label: t('checkout.shift.byDenomination') }, { value: 'total', label: t('checkout.shift.totalOnly') }]}
        />
        {mode === 'count' ? (
          <div className="grid grid-cols-2 gap-2" data-testid="denominations">
            {DZD_DENOMINATIONS.map((d) => {
              const n = Number(counts[d.key]) || 0
              const selected = current === d.key
              return (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCurrent(d.key)}
                  onMouseDown={keepFocus}
                  className={cn(
                    'tap min-h-13 rounded-xl border-2 px-2.5 flex items-center gap-2 text-start',
                    selected ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:bg-surface-2 dark:bg-surface-2'
                  )}
                >
                  <span className={cn('shrink-0 [&_svg]:h-5 [&_svg]:w-5', d.kind === 'note' ? 'text-success-ink' : 'text-warning-ink')}>
                    {d.kind === 'note' ? <Banknote /> : <Coins />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <bdi dir="ltr" className="num block text-base font-extrabold text-ink leading-tight">{d.value}</bdi>
                    <span className="block text-[11px] text-muted leading-tight">{t(`checkout.shift.${d.kind}`)}</span>
                  </span>
                  <bdi dir="ltr" className={cn('num text-lg font-extrabold', n ? 'text-ink' : 'text-faint')}>×{counts[d.key] || 0}</bdi>
                </button>
              )
            })}
          </div>
        ) : (
          <AmountDisplay label={t('checkout.shift.countedTotal')} entry={total} placeholder={0} />
        )}
        <input
          data-ui="input"
          maxLength={80}
          aria-label={t('checkout.shift.closedBy')}
          placeholder={t('checkout.shift.closedBy')}
          className="w-full min-h-12 rounded-xl border border-line-strong bg-surface dark:bg-surface-2 px-3.5 text-base text-ink placeholder:text-faint focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          {...kb.field('closed-by', closedBy, setClosedBy)}
        />
      </div>
      <div className="space-y-3 min-w-0">
        <div className="rounded-2xl bg-surface-2 px-4 py-2.5">
          <p className="flex items-center justify-between gap-2 text-sm font-semibold text-ink-2">
            {t('checkout.shift.counted')}
            {blind && (
              <span title={t('checkout.shift.blindHintLong')} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs text-muted">
                <EyeOff className="h-3.5 w-3.5" />{t('checkout.shift.blindHint')}
              </span>
            )}
          </p>
          <p className="text-kpi text-ink"><Money value={counted} decimals={0} /></p>
          {!blind && expected !== null && overShort !== null ? (
            <p className="mt-1 text-sm text-ink-2">
              {t('checkout.shift.expected')} <Money value={expected} decimals={0} /> ·{' '}
              <span className={cn('font-bold', overShort === 0 ? 'text-success-ink' : overShort > 0 ? 'text-warning-ink' : 'text-danger-ink')}>
                <SignedMoney value={overShort} />
              </span>
            </p>
          ) : null}
        </div>
        <Numpad
          size="md"
          disabled={busy}
          onKey={press}
          side={<SideKey tone="danger" onClick={() => press('clear')} label={t('checkout.pad.clear')}>C</SideKey>}
        />
        <Toggle size="md" checked={print} onChange={setPrint} label={t('checkout.shift.printZ')} />
        <Button
          size="touch"
          fullWidth
          variant={armed ? 'danger' : 'primary'}
          icon={<Lock className="h-6 w-6" />}
          onClick={close}
          disabled={!hasCount}
          loading={busy}
        >
          {armed ? t('checkout.shift.confirmClose') : t('checkout.shift.close')}
        </Button>
      </div>
      {kb.keyboard}
    </div>
  )
}

/** Over / short after closing + Z print status. */
export function ShiftCloseResult({ outcome: result, onDone }: { outcome: CloseOutcome; onDone: () => void }) {
  const { t } = useTranslation()
  const [printing, setPrinting] = useState(false)
  const cash = result.report.cash
  const tone = overShortTone(cash.over_short)
  const reprint = async (): Promise<void> => {
    setPrinting(true)
    try {
      const printed = await window.api.shifts.printReport(result.shiftId)
      if (printed.success) toast.success(t('checkout.shift.zPrinted'))
      else toast.error(t('checkout.shift.printFailed'), { description: printed.error })
    } catch (error) {
      toast.error(t('checkout.shift.printFailed'), { description: errorText(error, '') })
    } finally {
      setPrinting(false)
    }
  }
  const box = {
    balanced: { cls: 'bg-success-soft text-success-ink', icon: <CheckCircle2 />, label: t('checkout.shift.balanced') },
    over: { cls: 'bg-warning-soft text-warning-ink', icon: <TrendingUp />, label: t('checkout.shift.over') },
    short: { cls: 'bg-danger-soft text-danger-ink', icon: <AlertTriangle />, label: t('checkout.shift.short') }
  }[tone]
  return (
    <div className="space-y-4" data-testid="shift-result">
      <div className={cn('rounded-2xl px-5 py-4 flex items-center justify-between gap-4', box.cls)}>
        <span className="flex items-center gap-2 text-lg font-bold [&_svg]:h-6 [&_svg]:w-6">{box.icon}{box.label}</span>
        <span className="text-[2.75rem] leading-none font-extrabold">
          <SignedMoney value={cash.over_short ?? 0} />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <p className="text-xs font-semibold text-muted">{t('checkout.shift.counted')}</p>
          <p className="text-kpi text-ink"><Money value={cash.counted ?? 0} decimals={0} /></p>
        </div>
        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <p className="text-xs font-semibold text-muted flex items-center gap-1"><Scale className="h-3.5 w-3.5" />{t('checkout.shift.expected')}</p>
          <p className="text-kpi text-ink"><Money value={cash.expected ?? 0} decimals={0} /></p>
        </div>
      </div>
      {result.printed && (
        <p className={cn('rounded-xl px-4 py-2.5 text-sm font-semibold', result.printed.success ? 'bg-success-soft text-success-ink' : 'bg-danger-soft text-danger-ink')}>
          {result.printed.success ? t('checkout.shift.zPrinted') : `${t('checkout.shift.printFailed')} ${result.printed.error ?? ''}`}
        </p>
      )}
      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="secondary" size="lg" icon={<Printer className="h-5 w-5" />} onClick={reprint} loading={printing} cooldownMs={800}>
          {t('checkout.shift.printZAgain')}
        </Button>
        <Button size="xl" onClick={onDone}>{t('checkout.shift.done')}</Button>
      </div>
    </div>
  )
}
