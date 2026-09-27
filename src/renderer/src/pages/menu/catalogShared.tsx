import { ChangeEvent, ReactNode, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'
import { cn, formatAmount } from '../../components/ui'

/**
 * Small building blocks shared by the catalog admin pages (menu, option groups, combos, stock,
 * workers): localized names, the touch-screen keyboard binding, a 48px stepper and number parsing.
 */

export interface Named {
  name: string
  name_ar?: string | null
  name_fr?: string | null
}

/** Name in the food language (falls back to the default name). */
export function useFoodName(): (item: Named | null | undefined) => string {
  const foodLanguage = useAppStore((s) => s.foodLanguage)
  return useCallback(
    (item) => {
      if (!item) return ''
      if (foodLanguage === 'ar' && item.name_ar) return item.name_ar
      if (foodLanguage === 'fr' && item.name_fr) return item.name_fr
      return item.name
    },
    [foodLanguage]
  )
}

/** The currency symbol as a small input suffix ("DA"). */
export function CurrencyTag() {
  const symbol = useAppStore((s) => s.currencySymbol)
  return <span className="px-2 text-sm font-semibold text-muted">{symbol}</span>
}

export function useIsTouch(): boolean {
  return useAppStore((s) => s.inputMode) === 'touchscreen'
}

/** Accepts "12.5", "12,5" and "-3"; NaN for anything else (including empty). */
export function parseAmount(value: string): number {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return Number.NaN
  return Number(/^-?\d*,\d+$/.test(trimmed) ? trimmed.replace(',', '.') : trimmed)
}

/** "+50" / "−30" / "0" for option price changes (plain text, LTR-isolated by the caller). */
export function formatDelta(value: number): string {
  if (!value) return '0'
  return `${value > 0 ? '+' : '−'}${formatAmount(Math.abs(value), Number.isInteger(value) ? 0 : 2)}`
}

type KeyboardType = 'text' | 'numeric'
interface KeyboardTarget {
  value: string
  set: (value: string) => void
  type: KeyboardType
  arabic: boolean
}

/**
 * Touch mode: fields become read-only and open the on-screen keyboard. The keyboard keeps its
 * own copy of the value (so it never lags a render behind); `set` should be a functional update.
 *   const kb = useTouchKeyboard()
 *   <Input {...kb.bind(name, setName)} />   …   {kb.keyboard}
 */
export function useTouchKeyboard() {
  const isTouch = useIsTouch()
  const [target, setTarget] = useState<KeyboardTarget | null>(null)

  const bind = (value: string, set: (value: string) => void, type: KeyboardType = 'text', arabic = false) => {
    if (!isTouch) return { value, onChange: (e: ChangeEvent<HTMLInputElement>) => set(e.target.value) }
    return { value, readOnly: true, onClick: () => setTarget({ value, set, type, arabic }) }
  }

  const keyboard =
    isTouch && target ? (
      <VirtualKeyboard
        visible
        type={target.type}
        value={target.value}
        extended={target.type === 'text'}
        initialLayout={target.arabic ? 'arabic' : 'latin'}
        onChange={(value) => {
          target.set(value)
          setTarget((prev) => (prev ? { ...prev, value } : prev))
        }}
        onClose={() => setTarget(null)}
      />
    ) : null

  return { bind, keyboard, isTouch, close: () => setTarget(null) }
}

interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  label?: ReactNode
  /** Accessible names for the − / + buttons. */
  decLabel?: string
  incLabel?: string
  disabled?: boolean
  className?: string
}

/** − n + with 48px targets (selection rules, slot min/max). */
export function Stepper({ value, onChange, min = 0, max = 99, label, decLabel, incLabel, disabled, className }: StepperProps) {
  const { t } = useTranslation()
  const btn =
    'tap h-12 w-12 shrink-0 rounded-xl border border-line-strong bg-surface text-ink-2 flex items-center justify-center hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-surface-2'
  return (
    <div className={cn('min-w-0', className)}>
      {label && <p className="text-sm font-medium text-ink-2 mb-1.5">{label}</p>}
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          className={btn}
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={decLabel ?? t('menu.ui.decrease')}
        >
          <Minus className="h-5 w-5" />
        </button>
        <span className="num min-w-10 text-center text-xl font-extrabold text-ink">{value}</span>
        <button
          type="button"
          className={btn}
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={incLabel ?? t('menu.ui.increase')}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

/** Small uppercase-free section label used inside forms and cards. */
export function SectionLabel({ children, hint, action }: { children: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-2">
      <div className="min-w-0">
        <h3 className="text-base font-bold text-ink">{children}</h3>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

/** Inline error/notice block (tokens only). */
export function InlineNotice({ tone = 'danger', children }: { tone?: 'danger' | 'warning' | 'info'; children: ReactNode }) {
  const tones = {
    danger: 'bg-danger-soft text-danger-ink',
    warning: 'bg-warning-soft text-warning-ink',
    info: 'bg-info-soft text-info-ink'
  }
  return <div role={tone === 'danger' ? 'alert' : undefined} className={cn('rounded-xl p-3 text-sm font-medium', tones[tone])}>{children}</div>
}

/** Up/down arrow pair (44px targets) used for reordering lists (options, slots, groups). */
export function MoveButtons({
  onUp,
  onDown,
  canUp,
  canDown,
  disabled
}: {
  onUp: () => void
  onDown: () => void
  canUp: boolean
  canDown: boolean
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const btn =
    'tap h-11 w-11 rounded-xl flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed'
  return (
    <div className="flex shrink-0">
      <button type="button" className={btn} onClick={onUp} disabled={disabled || !canUp} aria-label={t('menu.ui.moveUp')} title={t('menu.ui.moveUp')}>
        <ChevronUp className="h-5 w-5" />
      </button>
      <button type="button" className={btn} onClick={onDown} disabled={disabled || !canDown} aria-label={t('menu.ui.moveDown')} title={t('menu.ui.moveDown')}>
        <ChevronDown className="h-5 w-5" />
      </button>
    </div>
  )
}

/** Moves list[index] by `delta` (returns a new array; out of range = unchanged copy). */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  const next = [...list]
  if (target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

let keySeq = 0
/** Stable React key for draft rows that have no database id yet. */
export function draftKey(prefix = 'd'): string {
  keySeq += 1
  return `${prefix}${keySeq}`
}
