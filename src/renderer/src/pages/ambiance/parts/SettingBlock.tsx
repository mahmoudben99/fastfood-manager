import { ReactNode } from 'react'
import { cn } from '../../../components/ui'

interface SettingBlockProps {
  title: ReactNode
  hint?: ReactNode
  /** Right-aligned extra (current value, counter…). */
  aside?: ReactNode
  children: ReactNode
  className?: string
}

/** One labelled setting inside a section card (title, optional hint, control). */
export function SettingBlock({ title, hint, aside, children, className = '' }: SettingBlockProps) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-ink">{title}</h4>
          {hint && <p className="mt-0.5 text-xs text-muted leading-relaxed">{hint}</p>}
        </div>
        {aside && <div className="shrink-0 text-xs text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  )
}
