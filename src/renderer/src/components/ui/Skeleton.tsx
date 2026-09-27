import { cn } from './cn'

/** Loading placeholder block. Opacity pulse only (compositor-friendly); static in Performance mode. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('rounded-lg bg-surface-3 animate-pulse-soft', className)} aria-hidden="true" />
}

/** Paragraph placeholder: `lines` bars, last one shorter. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  )
}
