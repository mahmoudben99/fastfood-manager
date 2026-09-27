import { MouseEvent, ReactNode, RefObject, useEffect, useRef } from 'react'
import { Delete } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Money, cn, formatAmount } from '../ui'
import { useAppStore } from '../../store/appStore'
import { keyFromKeyboard, type NumpadKey } from './tender'

/** onMouseDown for keypad-style buttons: a tap must not steal the focus (Enter keeps confirming). */
export const keepFocus = (event: MouseEvent): void => event.preventDefault()

const ROWS: NumpadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['00', '0', 'back']
]

interface NumpadProps {
  onKey: (key: NumpadKey) => void
  /** Optional 4th column (e.g. +100 / +200 / C), stretched over the 4 rows. */
  side?: ReactNode
  /** Key height: sm 48px · md 52px · lg 56px. */
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
}

/**
 * 3×4 touch numpad (1-9, 00, 0, ⌫). Always laid out LTR (1 2 3 left→right) even in Arabic,
 * like every calculator/terminal keypad. Keys ≥ 52px.
 */
export function Numpad({ onKey, side, size = 'lg', disabled, className }: NumpadProps) {
  const { t } = useTranslation()
  const h = size === 'lg' ? 'h-14' : size === 'md' ? 'h-13' : 'h-12'
  return (
    <div dir="ltr" className={cn('flex gap-2', className)}>
      <div className="grid grid-cols-3 gap-2 flex-[3] min-w-0">
      {ROWS.map((row) =>
        row.map((key) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onKey(key)}
            onMouseDown={keepFocus}
            data-passive
            aria-label={key === 'back' ? t('checkout.pad.back') : key}
            className={cn(
              'tap num rounded-xl border border-line-strong bg-surface text-2xl font-bold text-ink shadow-e1',
              'hover:bg-surface-2 active:bg-surface-3 disabled:opacity-50 dark:bg-surface-2 dark:hover:bg-surface-3',
              'flex items-center justify-center select-none',
              h,
              key === 'back' && 'text-ink-2'
            )}
          >
            {key === 'back' ? <Delete className="h-6 w-6" /> : key}
          </button>
        ))
      )}
      </div>
      {side && <div className="flex flex-col gap-2 flex-1 min-w-0 [&>*]:flex-1">{side}</div>}
    </div>
  )
}

/** A key for the Numpad side column (+100, C…). */
export function SideKey({ children, onClick, tone = 'neutral', disabled, label }: {
  children: ReactNode
  onClick: () => void
  tone?: 'neutral' | 'soft' | 'danger'
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={keepFocus}
      data-passive
      disabled={disabled}
      aria-label={label}
      className={cn(
        'tap num rounded-xl text-lg font-bold flex items-center justify-center select-none disabled:opacity-50',
        tone === 'soft' && 'bg-primary-soft text-primary-ink hover:bg-primary-soft-2',
        tone === 'neutral' && 'bg-surface-2 text-ink-2 border border-line hover:bg-surface-3',
        tone === 'danger' && 'bg-danger-soft text-danger-ink hover:brightness-95'
      )}
    >
      {children}
    </button>
  )
}

/**
 * "+1 845 DA" / "−800 DA" as ONE left-to-right unit (a separate sign would jump to the other side
 * of the amount in Arabic). `sign` 'auto' = from the value; 'plus' / 'minus' force it (abs value shown).
 */
export function SignedMoney({ value, sign = 'auto', className }: { value: number; sign?: 'auto' | 'plus' | 'minus'; className?: string }) {
  const negative = sign === 'minus' || (sign === 'auto' && value < 0)
  const positive = sign === 'plus' || (sign === 'auto' && value > 0)
  return (
    <bdi dir="ltr" className={cn('whitespace-nowrap', className)}>
      {value !== 0 && (negative ? '\u2212' : positive ? '+' : '')}
      <Money value={Math.abs(value)} decimals={0} />
    </bdi>
  )
}

interface AmountDisplayProps {
  label: ReactNode
  /** Digits typed ('' shows the placeholder). */
  entry: string
  /** Shown muted when nothing is typed (e.g. the exact amount). */
  placeholder?: number
  placeholderHint?: ReactNode
  tone?: 'default' | 'danger'
  className?: string
  /** Extra line under the label. */
  hint?: ReactNode
  /** Label on top, amount below (half-width tiles). */
  stacked?: boolean
}

/** Big LTR amount readout above a numpad. */
export function AmountDisplay({ label, entry, placeholder, placeholderHint, tone = 'default', className, hint, stacked }: AmountDisplayProps) {
  const symbol = useAppStore((s) => s.currencySymbol)
  const empty = !entry
  const value = empty ? placeholder ?? 0 : Number(entry)
  return (
    <div
      className={cn(
        'rounded-2xl border-2 px-4 bg-surface-2',
        stacked ? 'flex flex-col justify-between gap-1 py-2 min-h-20' : 'flex items-center justify-between gap-3 min-h-16',
        tone === 'danger' ? 'border-danger/60' : 'border-line-strong',
        className
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-2 truncate">{label}</p>
        {(hint || (empty && placeholderHint)) && <p className="text-xs text-muted truncate">{empty ? placeholderHint : hint}</p>}
      </div>
      <bdi dir="ltr" className={cn('num whitespace-nowrap text-[2rem] leading-none font-extrabold', stacked && 'self-end', empty ? 'text-faint' : 'text-ink')}>
        {formatAmount(value, 0)}
        <span className="ms-1.5 text-base font-semibold opacity-70">{symbol}</span>
      </bdi>
    </div>
  )
}

/**
 * Physical keyboard -> numpad while `active`: digits, Backspace, Delete (clear), Enter (onEnter).
 * Keys typed into a text field are left alone. Enter on a real button presses that button, but
 * Enter on a "passive" one (numpad key, chip, tab, radio, tile - or any button outside `scope`,
 * e.g. the Pay button that opened this sheet) runs onEnter instead.
 */
export function useNumpadKeys(
  active: boolean,
  onKey: (key: NumpadKey) => void,
  onEnter?: () => void,
  scope?: RefObject<HTMLElement | null>
): void {
  const handlers = useRef({ onKey, onEnter })
  handlers.current = { onKey, onEnter }
  useEffect(() => {
    if (!active) return
    const listener = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]')
      if (event.key === 'Enter') {
        if (target?.closest('textarea')) return
        const button = target?.closest('button, a, [role="switch"]')
        const passive = Boolean(button) && (
          button!.matches('[data-passive], [aria-pressed], [role="tab"], [role="radio"], [role="option"]') ||
          (scope?.current ? !scope.current.contains(button as Node) : false)
        )
        if (button && !passive) return
        if (handlers.current.onEnter) {
          event.preventDefault()
          handlers.current.onEnter()
        }
        return
      }
      if (typing) return
      const key = keyFromKeyboard(event.key)
      if (key) {
        event.preventDefault()
        handlers.current.onKey(key)
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [active, scope])
}
