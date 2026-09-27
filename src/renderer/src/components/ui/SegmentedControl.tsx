import { ReactNode } from 'react'
import { cn } from './cn'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
  /** Accessible name when label is icon-only. */
  ariaLabel?: string
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  /** sm 36px · md 44px · lg 52px (POS: order type, payment method) */
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  className?: string
  ariaLabel?: string
}

const sizes = {
  sm: 'min-h-9 text-[13px] gap-1.5 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
  md: 'min-h-11 text-sm gap-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
  lg: 'min-h-13 text-base gap-2 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0'
}
const padX = { sm: 'px-2.5', md: 'px-4', lg: 'px-5' }

/** One-of-N switch (order type, period, theme). The active segment lifts onto a surface pill. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth = false,
  className = '',
  ariaLabel
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex p-1 gap-1 rounded-xl bg-surface-2 border border-line',
        fullWidth && 'flex w-full',
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel}
            onClick={() => onChange(opt.value)}
            className={cn(
              'tap inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap',
              fullWidth ? 'flex-1 min-w-0 px-2' : padX[size],
              sizes[size],
              active
                ? 'bg-surface text-ink shadow-e1 dark:bg-surface-3'
                : 'text-muted hover:text-ink hover:bg-surface/60'
            )}
          >
            {opt.icon}
            {opt.label !== null && opt.label !== undefined && <span className="truncate">{opt.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
