import { ButtonHTMLAttributes, MouseEvent, ReactNode, forwardRef, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from './cn'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost'
  | 'success'
  | 'soft'
  | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl' | 'touch'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** sm 36px · md 40px · lg 48px (POS minimum) · xl 56px · touch 64px (primary POS actions) */
  size?: ButtonSize
  loading?: boolean
  /** Leading icon (mirrors nothing; pass a flipped icon yourself if it is directional). */
  icon?: ReactNode
  /** Trailing icon. */
  iconEnd?: ReactNode
  fullWidth?: boolean
  /** Double-tap guard: ignore clicks for this many ms after one fires (Pay / Print: ~800). */
  cooldownMs?: number
}

export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-ember text-on-primary shadow-[var(--highlight),var(--elev-primary)] hover:brightness-[1.07] active:brightness-95',
  secondary:
    'bg-surface text-ink border border-line-strong shadow-e1 hover:bg-surface-2 active:bg-surface-3 dark:bg-surface-2 dark:hover:bg-surface-3',
  danger:
    'bg-danger-strong text-white shadow-[var(--highlight),var(--elev-1)] hover:brightness-110 active:brightness-95',
  success:
    'bg-success-strong text-white shadow-[var(--highlight),var(--elev-1)] hover:brightness-110 active:brightness-95',
  soft: 'bg-primary-soft text-primary-ink hover:bg-primary-soft-2 active:bg-primary-soft-2',
  outline:
    'bg-transparent text-primary-ink border border-primary/45 hover:bg-primary-soft active:bg-primary-soft-2',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3'
}

export const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'min-h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'min-h-12 px-5 text-base rounded-xl gap-2',
  xl: 'min-h-14 px-6 text-lg rounded-2xl gap-2.5',
  touch: 'min-h-16 px-7 text-xl rounded-2xl gap-3'
}

const spinnerSize: Record<ButtonSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
  xl: 'h-5 w-5',
  touch: 'h-6 w-6'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconEnd,
    fullWidth = false,
    cooldownMs,
    disabled,
    children,
    className = '',
    onClick,
    ...props
  },
  ref
) {
  const [cooling, setCooling] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const handleClick = (e: MouseEvent<HTMLButtonElement>): void => {
    if (cooling) return
    onClick?.(e)
    if (cooldownMs && cooldownMs > 0) {
      setCooling(true)
      timer.current = setTimeout(() => setCooling(false), cooldownMs)
    }
  }

  // v3 callers recolour a primary button with a bg-* class (e.g. blue "update order"): drop the
  // ember gradient then, or it would paint over their colour.
  const recoloured = variant === 'primary' && /(^|\s)bg-(?!ember)/.test(className)
  const variantClass = recoloured
    ? 'text-white shadow-[var(--highlight),var(--elev-1)] hover:brightness-[1.07] active:brightness-95'
    : buttonVariants[variant]

  return (
    <button
      ref={ref}
      className={cn(
        'tap relative inline-flex items-center justify-center font-semibold leading-tight select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:brightness-100',
        // Disabled dims + flattens; a loading button (also disabled) keeps its look.
        '[&:disabled:not([aria-busy=true])]:opacity-50 [&:disabled:not([aria-busy=true])]:shadow-none',
        loading && 'cursor-progress',
        variantClass,
        buttonSizes[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...props}
    >
      {loading ? <Loader2 className={cn(spinnerSize[size], 'animate-spin shrink-0')} /> : icon}
      {children}
      {iconEnd}
    </button>
  )
})
