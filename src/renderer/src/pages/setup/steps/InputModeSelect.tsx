import { useTranslation } from 'react-i18next'
import { Monitor, Keyboard, Mouse, TabletSmartphone, Hand, MonitorSmartphone } from 'lucide-react'
import { cn } from '../../../components/ui/cn'
import { StepLayout } from '../parts/StepLayout'
import { ChoiceCard } from '../parts/ChoiceCard'
import type { SetupData } from '../SetupWizard'

interface Props {
  data: SetupData
  updateData: (partial: Partial<SetupData>) => void
}

const modes = [
  { value: 'keyboard', title: 'setup.inputMode.keyboard', desc: 'setup.inputMode.keyboardDesc' },
  { value: 'touchscreen', title: 'setup.inputMode.touch', desc: 'setup.inputMode.touchDesc' }
] as const

/** Small icon scene for each mode (desk PC with keyboard + mouse / touch screen with a hand). */
function Illustration({ mode }: { mode: 'keyboard' | 'touchscreen' }) {
  if (mode === 'keyboard') {
    return (
      <div className="flex items-end gap-2">
        <Monitor className="h-20 w-20" strokeWidth={1.25} />
        <Keyboard className="h-12 w-12" strokeWidth={1.25} />
        <Mouse className="h-8 w-8" strokeWidth={1.25} />
      </div>
    )
  }
  return (
    <div className="flex items-end">
      <TabletSmartphone className="h-20 w-20" strokeWidth={1.25} />
      <Hand className="-ms-6 mb-1 h-12 w-12" strokeWidth={1.25} />
    </div>
  )
}

export function InputModeSelect({ data, updateData }: Props) {
  const { t } = useTranslation()

  return (
    <StepLayout icon={<MonitorSmartphone />} title={t('setup.inputMode.title')}>
      <div dir="ltr" role="radiogroup" aria-label={t('setup.inputMode.title')} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {modes.map((mode) => {
          const selected = data.inputMode === mode.value
          return (
            <ChoiceCard
              key={mode.value}
              selected={selected}
              onSelect={() => updateData({ inputMode: mode.value })}
              className="flex flex-col gap-4 p-4"
            >
              <div
                aria-hidden
                className={cn(
                  'flex h-32 w-full items-center justify-center rounded-xl',
                  selected ? 'bg-primary-soft-2 text-primary-ink' : 'bg-surface-2 text-muted'
                )}
              >
                <Illustration mode={mode.value} />
              </div>
              {/* dir=auto: the grid is forced LTR, the copy follows its own language */}
              <div dir="auto" className="px-2 pb-2">
                <div className="text-xl font-bold text-ink">{t(mode.title)}</div>
                <p className="mt-1 text-sm text-muted">{t(mode.desc)}</p>
              </div>
            </ChoiceCard>
          )
        })}
      </div>
    </StepLayout>
  )
}
