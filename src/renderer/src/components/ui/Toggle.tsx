import { ReactNode, useId } from 'react'
import { cn } from './cn'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  /** md = 44x26 track, lg = 52x32 track (touch settings rows) */
  size?: 'md' | 'lg'
  className?: string
}

/** On/off switch. The whole row is the hit target (≥ 48px tall with a label). RTL-aware thumb. */
export function Toggle({ checked, onChange, label, description, disabled, size = 'lg', className = '' }: ToggleProps) {
  const id = useId()
  const lg = size === 'lg'
  const track = (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-150',
        lg ? 'h-8 w-[52px]' : 'h-[26px] w-11',
        checked ? 'bg-primary' : 'bg-faint/70'
      )}
      aria-hidden="true"
    >
      <span
        className={cn(
          'absolute top-1/2 start-[3px] rounded-full bg-[#fff] shadow-e1 transition-transform duration-150 ease-[var(--ease-out)]',
          lg ? 'h-[26px] w-[26px]' : 'h-5 w-5'
        )}
        style={{
          transform: `translateY(-50%) translateX(calc(${checked ? (lg ? 20 : 18) : 0}px * var(--dir)))`
        }}
      />
    </span>
  )

  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'tap inline-flex items-center gap-3 text-start rounded-xl disabled:opacity-50 disabled:cursor-not-allowed',
        label ? 'min-h-12 w-full justify-between' : '',
        className
      )}
    >
      {label && (
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{label}</span>
          {description && <span className="block text-xs text-muted mt-0.5">{description}</span>}
        </span>
      )}
      {track}
    </button>
  )
}
