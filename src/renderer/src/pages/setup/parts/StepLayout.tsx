import { ReactNode } from 'react'

interface StepLayoutProps {
  /** lucide icon for the header tile. */
  icon: ReactNode
  title: ReactNode
  /** Optional one short line; most steps don't need one. */
  subtitle?: ReactNode
  /** End-aligned extra (e.g. an info icon with a tooltip). */
  aside?: ReactNode
  children: ReactNode
}

/** One large card per setup step: icon tile + title + subtitle, then the step body. */
export function StepLayout({ icon, title, subtitle, aside, children }: StepLayoutProps) {
  return (
    <section className="animate-pop-in rounded-3xl border border-line bg-surface p-5 shadow-e2 sm:p-6">
      <header className="mb-5 flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-primary-soft text-primary-ink flex items-center justify-center [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold leading-tight tracking-tight text-ink rtl:tracking-normal">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  )
}
