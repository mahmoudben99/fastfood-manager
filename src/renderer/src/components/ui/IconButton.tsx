import { ButtonHTMLAttributes, ReactNode, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from './cn'

type IconButtonVariant = 'ghost' | 'secondary' | 'soft' | 'primary' | 'danger'
type IconButtonSize = 'sm' | 'md' | 'lg' | 'xl'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode
  /** Required: becomes aria-label + tooltip (icon-only buttons need a name). */
  label: string
  variant?: IconButtonVariant
  /** sm 36px · md 44px · lg 48px (POS minimum) · xl 56px */
  size?: IconButtonSize
  loading?: boolean
  /** Small count bubble on the top-end corner (e.g. pending orders). */
  badge?: ReactNode
}

const variants: Record<IconButtonVariant, string> = {
  ghost: 'text-muted hover:text-ink hover:bg-surface-2 active:bg-surface-3',
  secondary:
    'bg-surface text-ink-2 border border-line-strong shadow-e1 hover:bg-surface-2 hover:text-ink dark:bg-surface-2',
  soft: 'bg-primary-soft text-primary-ink hover:bg-primary-soft-2',
  primary: 'bg-ember text-on-primary shadow-[var(--highlight),var(--elev-primary)] hover:brightness-[1.07]',
  danger: 'text-danger-ink hover:bg-danger-soft active:bg-danger-soft'
}

const sizes: Record<IconButtonSize, string> = {
  sm: 'h-9 w-9 rounded-lg [&_svg]:h-4 [&_svg]:w-4',
  md: 'h-11 w-11 rounded-xl [&_svg]:h-5 [&_svg]:w-5',
  lg: 'h-12 w-12 rounded-xl [&_svg]:h-5 [&_svg]:w-5',
  xl: 'h-14 w-14 rounded-2xl [&_svg]:h-6 [&_svg]:w-6'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', loading, badge, disabled, className = '', type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      className={cn(
        'tap relative inline-flex shrink-0 items-center justify-center',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" /> : icon}
      {badge !== undefined && badge !== null && badge !== false && (
        <span className="num absolute -top-1 -end-1 min-w-5 h-5 px-1 rounded-full bg-danger-strong text-white text-[11px] font-bold leading-5 text-center ring-2 ring-surface">
          {badge}
        </span>
      )}
    </button>
  )
})
