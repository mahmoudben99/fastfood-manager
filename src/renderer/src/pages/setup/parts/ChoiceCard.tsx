import { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../../components/ui/cn'

interface ChoiceCardProps {
  selected: boolean
  onSelect: () => void
  children: ReactNode
  className?: string
}

/** Big tappable one-of-N card (language, input mode). Put it inside a `role="radiogroup"`. */
export function ChoiceCard({ selected, onSelect, children, className = '' }: ChoiceCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'tap contain-card relative w-full rounded-2xl border-2 text-center',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        selected
          ? 'border-primary bg-primary-soft shadow-e2'
          : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2',
        className
      )}
    >
      {selected && (
        <span className="absolute top-3 end-3 h-7 w-7 rounded-full bg-ember text-on-primary shadow-glow flex items-center justify-center">
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
        </span>
      )}
      {children}
    </button>
  )
}
