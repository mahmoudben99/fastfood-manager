import { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '../../../components/ui/cn'

type NoticeTone = 'success' | 'danger' | 'warning' | 'info'

const tones: Record<NoticeTone, string> = {
  success: 'bg-success-soft text-success-ink',
  danger: 'bg-danger-soft text-danger-ink',
  warning: 'bg-warning-soft text-warning-ink',
  info: 'bg-info-soft text-info-ink'
}

const icons = { success: CheckCircle2, danger: AlertCircle, warning: AlertTriangle, info: Info }

interface NoticeProps {
  tone: NoticeTone
  children: ReactNode
  /** Replaces the default tone icon. */
  icon?: ReactNode
  className?: string
}

/** Inline status message (icon + text, never colour alone). */
export function Notice({ tone, children, icon, className = '' }: NoticeProps) {
  const Icon = icons[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium leading-relaxed', tones[tone], className)}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:h-4.5 [&_svg]:w-4.5">{icon ?? <Icon aria-hidden />}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}
