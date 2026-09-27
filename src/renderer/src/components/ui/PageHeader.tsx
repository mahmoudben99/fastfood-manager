import { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { cn } from './cn'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Icon tile before the title (lucide icon). */
  icon?: ReactNode
  /** End-aligned actions (primary action last). Wraps under the title on narrow screens. */
  actions?: ReactNode
  /** Shows a back arrow (mirrored in RTL). */
  onBack?: () => void
  backLabel?: string
  className?: string
}

/** Top of every admin page: 28px/800 title, muted subtitle, actions at the end. */
export function PageHeader({ title, subtitle, icon, actions, onBack, backLabel, className = '' }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-6 gap-y-4 mb-6', className)}>
      <div className="flex items-center gap-4 min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            title={backLabel}
            className="tap h-11 w-11 shrink-0 rounded-xl border border-line-strong bg-surface text-ink-2 flex items-center justify-center hover:bg-surface-2"
          >
            <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" />
          </button>
        )}
        {icon && (
          <div className="h-12 w-12 shrink-0 rounded-2xl bg-ember text-on-primary shadow-glow flex items-center justify-center [&_svg]:h-6 [&_svg]:w-6">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink truncate">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
