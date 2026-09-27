import { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type CardVariant = 'elevated' | 'flat' | 'sunken' | 'interactive'

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  /** Small icon tile before the title. */
  icon?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
  /** Body padding (default true = 20px). */
  padding?: boolean
  /** elevated (default) = surface + e1 · flat = border only · sunken = surface-2 well · interactive = tappable */
  variant?: CardVariant
}

const variants: Record<CardVariant, string> = {
  elevated: 'bg-surface border border-line shadow-e1',
  flat: 'bg-surface border border-line',
  sunken: 'bg-surface-2 border border-line',
  interactive:
    'tap bg-surface border border-line shadow-e1 cursor-pointer hover:border-line-strong hover:shadow-e2 active:bg-surface-2'
}

export function Card({
  title,
  subtitle,
  icon,
  actions,
  children,
  className = '',
  padding = true,
  variant = 'elevated',
  ...rest
}: CardProps) {
  const hasHeader = Boolean(title || actions || icon)
  return (
    <div className={cn('rounded-2xl', variants[variant], className)} {...rest}>
      {hasHeader && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="h-9 w-9 shrink-0 rounded-xl bg-primary-soft text-primary-ink flex items-center justify-center [&_svg]:h-[18px] [&_svg]:w-[18px]">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {title && <h3 className="text-base font-semibold text-ink truncate">{title}</h3>}
              {subtitle && <p className="text-sm text-muted truncate">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={padding ? 'p-5' : ''}>{children}</div>
    </div>
  )
}
