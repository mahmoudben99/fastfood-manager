import { ReactNode } from 'react'
import { cn } from './cn'

export interface TabItem<T extends string> {
  id: T
  label: ReactNode
  icon?: ReactNode
  /** Small count pill after the label. */
  count?: number
}

interface TabsProps<T extends string> {
  tabs: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  /** underline (page sections, default) · pills (filters, category rows) */
  variant?: 'underline' | 'pills'
  className?: string
}

/** Section tabs. Scrolls horizontally when it overflows (touch friendly, no wrapping). */
export function Tabs<T extends string>({ tabs, value, onChange, variant = 'underline', className = '' }: TabsProps<T>) {
  const underline = variant === 'underline'
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center overflow-x-auto overflow-y-hidden no-scrollbar',
        underline ? 'gap-1 border-b border-line' : 'gap-2',
        className
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'tap relative inline-flex items-center gap-2 whitespace-nowrap font-semibold [&_svg]:h-4 [&_svg]:w-4',
              underline
                ? cn(
                    'min-h-12 px-4 text-sm',
                    active ? 'text-primary-ink' : 'text-muted hover:text-ink'
                  )
                : cn(
                    'min-h-11 px-4 rounded-xl text-sm border',
                    active
                      ? 'bg-inverse text-on-inverse border-transparent'
                      : 'bg-surface text-ink-2 border-line hover:bg-surface-2'
                  )
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'num min-w-6 px-1.5 rounded-full text-xs leading-5 text-center',
                  active ? (underline ? 'bg-primary-soft text-primary-ink' : 'bg-white/15') : 'bg-surface-2 text-muted'
                )}
              >
                {tab.count}
              </span>
            )}
            {underline && active && (
              <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-ember" aria-hidden="true" />
            )}
          </button>
        )
      })}
    </div>
  )
}
