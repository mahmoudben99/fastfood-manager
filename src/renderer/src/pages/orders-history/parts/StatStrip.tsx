import { ReactNode } from 'react'
import { Card, Skeleton, cn } from '../../../components/ui'

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TILE: Record<Tone, string> = {
  primary: 'bg-primary-soft text-primary-ink',
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info-ink',
  neutral: 'bg-surface-2 text-ink-2'
}

export interface StatItem {
  label: ReactNode
  value: ReactNode
  icon: ReactNode
  tone?: Tone
  /** Short extra line under the value (e.g. "3 to collect"). */
  note?: ReactNode
}

/**
 * Compact KPI strip: one card, 2 columns (4 from xl). Keeps the list above the fold on
 * 1024×768 / 1280×720 screens where four full StatCards would take two tall rows.
 */
export function StatStrip({ items, loading, className = '' }: { items: StatItem[]; loading?: boolean; className?: string }) {
  return (
    <Card padding={false} className={className}>
      <div className="grid grid-cols-2 xl:grid-cols-4">
        {items.map((item, i) => (
          <div
            key={i}
            className={cn(
              'flex min-w-0 items-center gap-3 px-4 py-3 contain-card',
              i % 2 === 1 && 'border-s border-line',
              i >= 2 && 'border-t border-line xl:border-t-0',
              i === 2 && 'xl:border-s'
            )}
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&_svg]:h-[18px] [&_svg]:w-[18px]',
                TILE[item.tone ?? 'primary']
              )}
            >
              {item.icon}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-muted">{item.label}</p>
              {loading ? (
                <Skeleton className="mt-1 h-6 w-20" />
              ) : (
                <p className="num truncate text-xl font-bold leading-tight tracking-tight text-ink">{item.value}</p>
              )}
              {item.note && !loading && <p className="truncate text-xs font-semibold text-warning-ink">{item.note}</p>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
