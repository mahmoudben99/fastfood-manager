import { ReactNode } from 'react'
import { cn } from './cn'

/** Shared control look for Input / Select / Textarea. `data-ui` opts out of the legacy dark repaint. */
export function controlClass(opts: { error?: boolean; size?: 'md' | 'lg'; className?: string }): string {
  return cn(
    'w-full rounded-xl border bg-surface text-ink dark:bg-surface-2',
    'placeholder:text-faint transition-[border-color,box-shadow] duration-150',
    'hover:border-faint focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15',
    'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-surface-2',
    opts.size === 'lg' ? 'min-h-13 px-4 text-lg' : 'min-h-11 px-3.5 text-base',
    opts.error
      ? 'border-danger bg-danger-soft/40 focus:border-danger focus:ring-danger/15'
      : 'border-line-strong',
    opts.className
  )
}

interface FieldProps {
  label?: ReactNode
  error?: string
  helperText?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}

/** Label + control + helper/error, stacked. */
export function Field({ label, error, helperText, htmlFor, children, className = '' }: FieldProps) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-2 mb-1.5">
          {label}
        </label>
      )}
      {children}
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger-ink">
          {error}
        </p>
      )}
      {!error && helperText && <p className="mt-1.5 text-xs text-muted">{helperText}</p>}
    </div>
  )
}
