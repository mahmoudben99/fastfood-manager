import { ReactNode, useId } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from './cn'
import { Skeleton } from './Skeleton'

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const toneTile: Record<Tone, string> = {
  primary: 'bg-primary-soft text-primary-ink',
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info-ink',
  neutral: 'bg-surface-2 text-ink-2'
}

interface StatCardProps {
  label: ReactNode
  /** Pre-formatted value (use <Money/> or a formatted string). Rendered tabular. */
  value: ReactNode
  icon?: ReactNode
  tone?: Tone
  /** Change vs. previous period in %, e.g. 12.5 or -3. Arrow + sign + colour. */
  delta?: number | null
  /** Text after the delta chip, e.g. "vs yesterday". */
  deltaLabel?: ReactNode
  /** For metrics where lower is better (refunds, wait time). */
  invertDelta?: boolean
  /** Slot under the value — pass <Sparkline/> (cheap SVG) rather than a full recharts chart. */
  sparkline?: ReactNode
  footer?: ReactNode
  loading?: boolean
  className?: string
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'primary',
  delta,
  deltaLabel,
  invertDelta = false,
  sparkline,
  footer,
  loading = false,
  className = ''
}: StatCardProps) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta)
  const up = hasDelta && (delta as number) > 0
  const flat = hasDelta && Math.abs(delta as number) < 0.05
  const good = flat ? null : invertDelta ? !up : up
  return (
    <div className={cn('rounded-2xl bg-surface border border-line shadow-e1 p-5 flex flex-col gap-3 contain-card', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted leading-snug">{label}</p>
        {icon && (
          <div className={cn('h-9 w-9 shrink-0 rounded-xl flex items-center justify-center [&_svg]:h-[18px] [&_svg]:w-[18px]', toneTile[tone])}>
            {icon}
          </div>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-32" />
      ) : (
        <div className="num text-kpi text-ink tracking-tight">{value}</div>
      )}
      {(hasDelta || deltaLabel) && !loading && (
        <div className="flex items-center gap-2 text-xs">
          {hasDelta && (
            <span
              className={cn(
                'num inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-bold [&_svg]:h-3.5 [&_svg]:w-3.5',
                good === null ? 'bg-surface-2 text-muted' : good ? 'bg-success-soft text-success-ink' : 'bg-danger-soft text-danger-ink'
              )}
            >
              {flat ? <Minus /> : up ? <ArrowUpRight /> : <ArrowDownRight />}
              {up ? '+' : ''}
              {(delta as number).toFixed(Math.abs(delta as number) < 10 ? 1 : 0)}%
            </span>
          )}
          {deltaLabel && <span className="text-muted">{deltaLabel}</span>}
        </div>
      )}
      {sparkline && <div className="-mx-1 -mb-1">{sparkline}</div>}
      {footer && <div className="pt-3 border-t border-line text-sm text-muted">{footer}</div>}
    </div>
  )
}

interface SparklineProps {
  data: number[]
  /** CSS colour; default ember. Use var(--success) etc. */
  color?: string
  height?: number
  className?: string
}

/** Tiny dependency-free area sparkline (one SVG path, no animation, no recharts). */
export function Sparkline({ data, color = 'var(--accent)', height = 40, className = '' }: SparklineProps) {
  const gid = 'spk' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  if (data.length < 2) return <div style={{ height }} className={className} />
  const w = 100
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, height - 3 - ((v - min) / span) * (height - 6)])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const area = `${line} L${w},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn('w-full block', className)} style={{ height }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" style={{ stroke: color }} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
