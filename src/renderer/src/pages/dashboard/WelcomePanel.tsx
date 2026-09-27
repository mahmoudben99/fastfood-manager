import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Check, MonitorSmartphone, Package, Send, Sparkles, UtensilsCrossed } from 'lucide-react'
import { Button, cn } from '../../components/ui'
import type { SetupStatus } from './useDashboardData'

interface Step {
  id: string
  icon: ReactNode
  done: boolean
  path: string
  primary?: boolean
}

/**
 * First-run home: a short checklist instead of empty charts. Each step opens the place to do it;
 * the last one (take the first order) is the page's one ember action.
 */
export function WelcomePanel({ setup, restaurantName }: { setup: SetupStatus | null; restaurantName: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const steps: Step[] = [
    { id: 'menu', icon: <UtensilsCrossed />, done: (setup?.menuItems ?? 0) > 0, path: '/admin/menu' },
    { id: 'stock', icon: <Package />, done: (setup?.stockItems ?? 0) > 0, path: '/admin/stock' },
    { id: 'telegram', icon: <Send />, done: Boolean(setup?.telegram), path: '/admin/settings' },
    { id: 'order', icon: <MonitorSmartphone />, done: false, path: '/orders', primary: true }
  ]
  const doneCount = steps.filter((s) => s.done).length

  return (
    <section className="rounded-3xl bg-surface border border-line shadow-e1 overflow-hidden">
      <div className="grid lg:grid-cols-5">
        <div className="lg:col-span-2 p-7 bg-primary-soft/60 border-b lg:border-b-0 lg:border-e border-line flex flex-col gap-4">
          <div className="h-14 w-14 rounded-2xl bg-ember text-on-primary shadow-glow flex items-center justify-center [&_svg]:h-7 [&_svg]:w-7">
            <Sparkles />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-ink">
              {restaurantName ? t('dashboard.welcome.titleNamed', { name: restaurantName }) : t('dashboard.welcome.title')}
            </h2>
            <p className="mt-2 text-sm text-ink-2 leading-relaxed">{t('dashboard.welcome.body')}</p>
          </div>
          <div className="mt-auto">
            <div className="flex items-baseline justify-between text-xs mb-1.5">
              <span className="font-semibold text-ink-2">{t('dashboard.welcome.progress')}</span>
              <span className="num font-bold text-ink">{doneCount}/{steps.length}</span>
            </div>
            <div className="h-2 rounded-full bg-surface/80 overflow-hidden">
              <div className="h-full rounded-full bg-ember" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
          </div>
        </div>
        <ol className="lg:col-span-3 divide-y divide-line">
          {steps.map((step, i) => (
            <li key={step.id} className="flex items-center gap-4 px-6 py-4">
              <div
                className={cn(
                  'h-10 w-10 shrink-0 rounded-full flex items-center justify-center [&_svg]:h-5 [&_svg]:w-5',
                  step.done ? 'bg-success-soft text-success-ink' : 'bg-surface-2 text-ink-2'
                )}
              >
                {step.done ? <Check /> : step.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('font-semibold', step.done ? 'text-muted line-through decoration-faint' : 'text-ink')}>
                  <span className="num text-faint me-2">{i + 1}.</span>
                  {t(`dashboard.welcome.steps.${step.id}.title`)}
                </p>
                <p className="text-sm text-muted">{t(`dashboard.welcome.steps.${step.id}.body`)}</p>
              </div>
              {!step.done && (
                <Button variant={step.primary ? 'primary' : 'soft'} onClick={() => navigate(step.path)}>
                  {t(`dashboard.welcome.steps.${step.id}.action`)}
                </Button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
