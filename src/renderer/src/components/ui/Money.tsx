import { useAppStore } from '../../store/appStore'
import { useCountUp } from '../../theme/useCountUp'
import { cn } from './cn'

const NNBSP = ' ' // narrow no-break space: "1 250.00" never wraps

/** "1250" -> "1 250.00". Latin digits in every language (Algeria: ar-DZ uses Latin digits). */
export function formatAmount(value: number, decimals = 2, grouping = true): string {
  const safe = Number.isFinite(value) ? value : 0
  const [int, frac] = Math.abs(safe).toFixed(decimals).split('.')
  const grouped = grouping ? int.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP) : int
  return `${safe < 0 ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`
}

interface MoneyProps {
  value: number
  decimals?: number
  /** Thousands separator (narrow space). Default true. */
  grouping?: boolean
  /** Ease from the previous value (order total). Off in Performance mode automatically. */
  animate?: boolean
  /** Symbol smaller + muted, amount bold (default). false = plain inline text. */
  styledSymbol?: boolean
  className?: string
}

/**
 * Tabular, direction-isolated money: the amount always reads LTR ("1 250.00 DA") even inside
 * Arabic text. Uses the store currency symbol (default "DA").
 */
export function Money({ value, decimals = 2, grouping = true, animate = false, styledSymbol = true, className = '' }: MoneyProps) {
  const symbol = useAppStore((s) => s.currencySymbol)
  const shown = useCountUp(value, 350, animate)
  return (
    <bdi dir="ltr" className={cn('num whitespace-nowrap', className)}>
      {formatAmount(shown, decimals, grouping)}
      {symbol && (
        <span className={styledSymbol ? 'ms-[0.3em] text-[0.62em] font-semibold opacity-70 tracking-wide' : 'ms-1'}>
          {symbol}
        </span>
      )}
    </bdi>
  )
}
