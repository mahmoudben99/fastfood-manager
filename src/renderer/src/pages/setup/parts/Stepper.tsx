import { Check } from 'lucide-react'
import { cn } from '../../../components/ui/cn'

interface StepperProps {
  steps: { key: string; label: string }[]
  current: number
  /** Completed steps become tappable (jump back). */
  onJump?: (index: number) => void
  ariaLabel: string
}

/**
 * Horizontal wizard progress: numbered dots joined by a track. Follows the document direction
 * (RTL flows right-to-left). Only the current step shows its label (fits 1024px in one row);
 * the others carry it as tooltip / accessible name.
 */
export function Stepper({ steps, current, onJump, ariaLabel }: StepperProps) {
  return (
    <ol aria-label={ariaLabel} className="flex items-center gap-2">
      {steps.map((step, i) => {
        const done = i < current
        const active = i === current
        const last = i === steps.length - 1
        const content = (
          <>
            <span
              className={cn(
                'num h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold',
                active && 'bg-ember text-on-primary shadow-glow',
                done && 'bg-primary-soft text-primary-ink',
                !active && !done && 'bg-surface-2 text-muted border border-line-strong'
              )}
            >
              {done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                'text-sm font-semibold whitespace-nowrap',
                active ? 'text-ink' : done ? 'text-ink-2' : 'text-muted',
                !active && 'sr-only'
              )}
            >
              {step.label}
            </span>
          </>
        )
        return (
          <li
            key={step.key}
            aria-current={active ? 'step' : undefined}
            className={cn('flex min-w-0 items-center gap-2', !last && 'flex-1')}
          >
            {done && onJump ? (
              <button
                type="button"
                onClick={() => onJump(i)}
                title={step.label}
                className="tap flex min-h-11 shrink-0 items-center gap-2 rounded-xl pe-1 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
              >
                {content}
              </button>
            ) : (
              <div title={active ? undefined : step.label} className="flex min-h-11 shrink-0 items-center gap-2">
                {content}
              </div>
            )}
            {!last && (
              <span aria-hidden className={cn('h-0.5 min-w-3 flex-1 rounded-full', done ? 'bg-primary' : 'bg-line-strong')} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
