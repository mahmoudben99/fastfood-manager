import { ReactNode } from 'react'
import { Hamburger } from 'lucide-react'
import { cn } from '../../../components/ui/cn'

interface BrandMarkProps {
  /** One muted line under the product name. */
  subtitle?: ReactNode
  /** stacked = large centred mark (lock / hero screens); inline = header size. */
  variant?: 'inline' | 'stacked'
  className?: string
}

/** Fast Food Manager mark for the full-screen onboarding screens (setup, activation, trial lock). */
export function BrandMark({ subtitle, variant = 'inline', className = '' }: BrandMarkProps) {
  const stacked = variant === 'stacked'
  return (
    <div
      className={cn(
        'min-w-0',
        stacked ? 'flex flex-col items-center gap-3 text-center' : 'flex items-center gap-3',
        className
      )}
    >
      <div
        className={cn(
          'shrink-0 bg-ember text-on-primary shadow-glow flex items-center justify-center',
          stacked ? 'h-16 w-16 rounded-3xl [&_svg]:h-8 [&_svg]:w-8' : 'h-11 w-11 rounded-2xl [&_svg]:h-6 [&_svg]:w-6'
        )}
      >
        <Hamburger aria-hidden />
      </div>
      <div className="min-w-0">
        <p className={cn('font-extrabold text-ink leading-tight', stacked ? 'text-xl' : 'text-base')}>
          <bdi>Fast Food Manager</bdi>
        </p>
        {subtitle && <p className="text-sm text-muted truncate">{subtitle}</p>}
      </div>
    </div>
  )
}
