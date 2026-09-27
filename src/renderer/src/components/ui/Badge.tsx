import { ReactNode } from 'react'
import { cn } from './cn'

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default' | 'neutral' | 'primary' | 'solid'

interface BadgeProps {
  variant?: BadgeVariant
  size?: 'sm' | 'md'
  /** Leading status dot in the variant colour. */
  dot?: boolean
  icon?: ReactNode
  children: ReactNode
  className?: string
}

const variants: Record<BadgeVariant, string> = {
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info-ink',
  default: 'bg-surface-2 text-ink-2 border border-line',
  neutral: 'bg-surface-2 text-ink-2 border border-line',
  primary: 'bg-primary-soft text-primary-ink',
  solid: 'bg-ember text-on-primary'
}

const dots: Record<BadgeVariant, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  default: 'bg-faint',
  neutral: 'bg-faint',
  primary: 'bg-accent',
  solid: 'bg-white'
}

export function Badge({ variant = 'default', size = 'sm', dot, icon, children, className = '' }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        '[&_svg]:h-3.5 [&_svg]:w-3.5',
        variants[variant],
        className
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dots[variant])} />}
      {icon}
      {children}
    </span>
  )
}
