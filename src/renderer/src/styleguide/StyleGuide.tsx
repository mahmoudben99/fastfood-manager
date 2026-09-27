import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Palette } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { PasswordGate } from '../components/ui/PasswordGate'
import { PageHeader, SegmentedControl } from '../components/ui'
import { DisplayMenu, ThemeSwitch } from '../components/layout/DisplayMenu'
import { TokenSwatches, Section } from './Swatches'
import { ComponentsDemo } from './ComponentsDemo'
import { OrderBlueprint } from './OrderBlueprint'
import { DashboardBlueprint } from './DashboardBlueprint'

const JUMPS = ['surfaces', 'brand', 'categories', 'type', 'buttons', 'inputs', 'choice', 'feedback', 'blueprints'] as const

/**
 * #/styleguide — living reference of the v4 "Ember" system in the current theme + direction.
 * Admin-only (same password gate as /admin). Used for screenshot QA and by wave-2 page work.
 */
export function StyleGuide() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isUnlocked, unlock } = useAuthStore()
  const [dir, setDir] = useState<'ltr' | 'rtl'>(() => (document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'))

  if (!isUnlocked) {
    return <PasswordGate onUnlock={unlock} onCancel={() => navigate('/orders')} />
  }

  const changeDir = (next: 'ltr' | 'rtl'): void => {
    document.documentElement.dir = next
    setDir(next)
  }

  const jumpLabel: Record<(typeof JUMPS)[number], string> = {
    surfaces: t('ui.sg.surfaces'),
    brand: t('ui.sg.brand'),
    categories: t('ui.sg.categories'),
    type: t('ui.sg.type'),
    buttons: t('ui.sg.buttons'),
    inputs: t('ui.sg.inputs'),
    choice: t('ui.sg.choice'),
    feedback: t('ui.sg.feedback'),
    blueprints: t('ui.sg.blueprints')
  }

  return (
    <div className="h-screen overflow-y-auto bg-canvas">
      <div className="sticky top-0 z-40 bg-canvas border-b border-line">
        <div className="max-w-[1320px] mx-auto px-8 h-16 flex items-center gap-3">
          <div className="flex-1 flex gap-1 overflow-x-auto no-scrollbar">
            {JUMPS.map((id) => (
              <a
                key={id}
                href={`#/styleguide`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="tap shrink-0 px-3 min-h-10 inline-flex items-center rounded-lg text-sm font-medium text-muted hover:text-ink hover:bg-surface-2"
              >
                {jumpLabel[id]}
              </a>
            ))}
          </div>
          <SegmentedControl
            size="sm"
            value={dir}
            onChange={changeDir}
            options={[
              { value: 'ltr', label: 'LTR' },
              { value: 'rtl', label: 'RTL' }
            ]}
          />
          <ThemeSwitch />
          <DisplayMenu />
        </div>
      </div>

      <main className="max-w-[1320px] mx-auto px-8 py-8 space-y-12">
        <PageHeader
          icon={<Palette />}
          title={t('ui.sg.title')}
          subtitle={t('ui.sg.subtitle')}
          onBack={() => navigate('/admin')}
          backLabel={t('common.back')}
        />
        <TokenSwatches />
        <ComponentsDemo />
        <Section id="blueprints" title={t('ui.sg.blueprints')}>
          <div className="space-y-8">
            <div>
              <h3 className="text-base font-bold text-ink-2 mb-3">{t('ui.sg.orderBlueprint')}</h3>
              <OrderBlueprint />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink-2 mb-3">{t('ui.sg.dashboardBlueprint')}</h3>
              <DashboardBlueprint />
            </div>
          </div>
        </Section>
      </main>
    </div>
  )
}
