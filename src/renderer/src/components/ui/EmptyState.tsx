import { ReactNode } from 'react'
import { cn } from './cn'

interface EmptyStateProps {
  /** 48px lucide icon (or emoji). */
  icon?: ReactNode
  title: ReactNode
  /** One sentence: what this area is for / why it is empty. */
  description?: ReactNode
  /** Usually one primary <Button/>. */
  action?: ReactNode
  /** Tighter version for cards and side panels. */
  compact?: boolean
  className?: string
}

export function EmptyState({ icon, title, description, action, compact = false, className = '' }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center mx-auto',
        compact ? 'gap-2 py-8 px-4 max-w-xs' : 'gap-3 py-14 px-6 max-w-sm',
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            'rounded-3xl bg-primary-soft text-primary-ink flex items-center justify-center ring-8 ring-primary-soft/40',
            compact ? 'h-14 w-14 text-2xl [&_svg]:h-7 [&_svg]:w-7' : 'h-20 w-20 text-4xl [&_svg]:h-10 [&_svg]:w-10',
            'mb-2'
          )}
        >
          {icon}
        </div>
      )}
      <h3 className={cn('font-bold text-ink', compact ? 'text-base' : 'text-lg')}>{title}</h3>
      {description && <p className="text-sm text-muted leading-relaxed">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
