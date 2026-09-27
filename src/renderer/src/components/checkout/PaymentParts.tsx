import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, CheckCircle2, X } from 'lucide-react'
import type { PaymentMethodConfig } from '../../../../shared/cash'
import { Money, cn } from '../ui'
import { AmountDisplay, Numpad, SideKey, keepFocus } from './Numpad'
import { methodIcon, methodName } from './methods'
import { applyKey, quickTenders, type NumpadKey, type TenderLine, type TenderView } from './tender'
import type { TouchFieldProps } from './useTouchKeyboard'

/** Big method buttons (left column of the payment sheet). */
export function MethodList({ methods, value, onChange }: {
  methods: PaymentMethodConfig[]
  value: string
  onChange: (id: string) => void
}) {
  const { i18n, t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('checkout.pay.method')} className="grid gap-1.5">
      {methods.map((method) => {
        const active = method.id === value
        return (
          <button
            key={method.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(method.id)}
            onMouseDown={keepFocus}
            className={cn(
              'tap min-h-12 w-full flex items-center gap-3 rounded-xl border-2 px-3 text-start font-semibold',
              '[&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0',
              active
                ? 'border-primary bg-primary-soft text-primary-ink'
                : 'border-line bg-surface text-ink hover:bg-surface-2 dark:bg-surface-2 dark:hover:bg-surface-3'
            )}
          >
            <span className={cn('h-8 w-8 rounded-lg flex items-center justify-center', active ? 'bg-primary text-on-primary' : 'bg-surface-2 text-ink-2 dark:bg-surface-3')}>
              {methodIcon(method.id)}
            </span>
            <span className="flex-1 min-w-0 truncate">{methodName(method, i18n.language)}</span>
            {active && <Check className="text-primary-ink" />}
          </button>
        )
      })}
    </div>
  )
}

/** Parts already paid in a split payment. */
export function SplitLines({ lines, onRemove, busy }: { lines: TenderLine[]; onRemove: (index: number) => void; busy?: boolean }) {
  const { i18n, t } = useTranslation()
  if (lines.length === 0) return null
  return (
    <div className="rounded-xl border border-dashed border-line-strong p-1.5 space-y-1" data-testid="split-lines" aria-label={t('checkout.pay.paidParts')}>
      {lines.map((line, index) => (
        <div key={index} className="flex items-center gap-2 rounded-lg bg-surface-2 ps-2.5 pe-1 min-h-11">
          <span className="text-muted [&_svg]:h-4 [&_svg]:w-4">{methodIcon(line.method)}</span>
          <span className="flex-1 min-w-0 py-1">
            <span className="block truncate text-sm font-semibold text-ink">{methodName(line.method, i18n.language)}</span>
            {line.reference && <bdi dir="ltr" className="num block truncate text-xs text-muted">#{line.reference}</bdi>}
          </span>
          <span className="text-sm font-bold text-ink"><Money value={line.amount} decimals={0} /></span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(index)}
            aria-label={t('checkout.pay.removePart')}
            className="tap h-10 w-10 rounded-lg flex items-center justify-center text-muted hover:text-danger-ink hover:bg-danger-soft disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Cash: received | change side by side, quick notes, numpad (+100 / +200 / +1000 / C). Fits 1280x720. */
export function CashPad({ view, entry, setEntry, disabled }: {
  view: TenderView
  entry: string
  setEntry: (entry: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const add = (step: number): void => setEntry(String(Math.min(9_999_999, (Number(entry) || 0) + step)))
  const notes = quickTenders(view.due, 3)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <AmountDisplay
          stacked
          label={t('checkout.pay.cashReceived')}
          entry={entry}
          placeholder={view.due}
          placeholderHint={t('checkout.pay.exactHint')}
          tone={view.complete ? 'default' : 'danger'}
        />
        <ChangeBox view={view} />
      </div>
      <div className="grid grid-cols-4 gap-2" data-testid="quick-tenders">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setEntry('')}
          onMouseDown={keepFocus}
          data-passive
          className={cn(
            'tap min-h-14 rounded-xl border-2 font-bold text-base leading-tight px-1',
            entry === '' ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line bg-surface-2 text-ink hover:bg-surface-3'
          )}
        >
          {t('checkout.pay.exact')}
        </button>
        {notes.map((note) => (
          <button
            key={note}
            type="button"
            disabled={disabled}
            onClick={() => setEntry(String(note))}
            onMouseDown={keepFocus}
            data-passive
            className={cn(
              'tap min-h-14 rounded-xl border-2 text-lg font-extrabold',
              entry === String(note) ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line bg-surface-2 text-ink hover:bg-surface-3'
            )}
          >
            <Money value={note} decimals={0} />
          </button>
        ))}
      </div>
      <Numpad
        disabled={disabled}
        onKey={(key: NumpadKey) => setEntry(applyKey(entry, key))}
        side={
          <>
            <SideKey tone="soft" onClick={() => add(100)} disabled={disabled}>+100</SideKey>
            <SideKey tone="soft" onClick={() => add(200)} disabled={disabled}>+200</SideKey>
            <SideKey tone="soft" onClick={() => add(1000)} disabled={disabled}>+1000</SideKey>
            <SideKey tone="danger" onClick={() => setEntry('')} disabled={disabled} label={t('checkout.pad.clear')}>C</SideKey>
          </>
        }
      />
    </div>
  )
}

/** Change due — huge (40px), success colour — or what is still missing. */
export function ChangeBox({ view }: { view: TenderView }) {
  const { t } = useTranslation()
  const short = !view.complete
  const tone = short ? 'bg-danger-soft text-danger-ink' : view.change > 0 ? 'bg-success-soft text-success-ink' : 'bg-surface-2 text-ink-2'
  return (
    <div role="status" className={cn('rounded-2xl px-4 py-2 min-h-20 flex flex-col justify-between gap-1', tone)} data-testid="change-box">
      <span className="flex items-center gap-1.5 text-sm font-bold">
        {short ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
        {short ? t('checkout.pay.short') : view.change > 0 ? t('checkout.pay.change') : t('checkout.pay.noChange')}
      </span>
      <span className={cn('self-end text-[2.5rem] leading-none font-extrabold', !short && view.change === 0 && 'text-muted')}>
        <Money value={short ? view.short : view.change} decimals={0} />
      </span>
    </div>
  )
}

/** Card / BaridiPay / transfer: amount charged (default = balance) | rest to pay, slip reference, numpad. */
export function CardPad({ view, methodLabel, entry, setEntry, referenceField, showReference, disabled }: {
  view: TenderView
  methodLabel: string
  entry: string
  setEntry: (entry: string) => void
  referenceField: TouchFieldProps
  showReference: boolean
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <AmountDisplay
          stacked
          label={t('checkout.pay.amountOn', { method: methodLabel })}
          entry={entry}
          placeholder={view.balance}
          placeholderHint={t('checkout.pay.fullBalance')}
          tone={view.overBalance ? 'danger' : 'default'}
        />
        {view.overBalance ? (
          <p role="alert" className="flex items-center gap-2 rounded-2xl bg-danger-soft px-4 min-h-20 text-sm font-semibold text-danger-ink">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t('checkout.pay.overBalance')}
          </p>
        ) : (
          <div
            role="status"
            className={cn('rounded-2xl px-4 py-2 min-h-20 flex flex-col justify-between gap-1', view.short > 0 ? 'bg-info-soft text-info-ink' : 'bg-surface-2 text-muted')}
          >
            <span className="text-sm font-bold">{t('checkout.pay.leftAfter')}</span>
            <span className="self-end text-[2rem] leading-none font-extrabold"><Money value={view.short} decimals={0} /></span>
          </div>
        )}
      </div>
      {showReference && (
        <label className="block">
          <span className="block text-sm font-semibold text-ink-2 mb-1.5">{t('checkout.pay.reference')}</span>
          <input
            data-ui="input"
            maxLength={100}
            placeholder={t('checkout.pay.referencePlaceholder')}
            className="w-full min-h-12 rounded-xl border border-line-strong bg-surface dark:bg-surface-2 px-3.5 text-base text-ink placeholder:text-faint focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            {...referenceField}
          />
        </label>
      )}
      <Numpad
        disabled={disabled}
        onKey={(key: NumpadKey) => setEntry(applyKey(entry, key))}
        side={<SideKey tone="danger" onClick={() => setEntry('')} disabled={disabled} label={t('checkout.pad.clear')}>C</SideKey>}
      />
    </div>
  )
}
