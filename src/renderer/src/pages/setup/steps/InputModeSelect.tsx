import { useTranslation } from 'react-i18next'
import { Monitor, Keyboard, TabletSmartphone, Hand } from 'lucide-react'
import type { SetupData } from '../SetupWizard'

interface Props {
  data: SetupData
  updateData: (partial: Partial<SetupData>) => void
}

const modes = [
  {
    value: 'keyboard',
    icons: [Monitor, Keyboard],
    label: 'Keyboard & Mouse',
    desc: 'Traditional setup with physical keyboard and mouse. Best for desktop computers.'
  },
  {
    value: 'touchscreen',
    icons: [TabletSmartphone, Hand],
    label: 'Touchscreen',
    desc: 'Large buttons and built-in keyboard. Best for touch displays and tablets.'
  }
]

export function InputModeSelect({ data, updateData }: Props) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {t('setup.inputMode.title', { defaultValue: 'How will you use the app?' })}
        </h2>
        <p className="text-gray-500 mt-1">
          {t('setup.inputMode.subtitle', { defaultValue: 'You can change this later in settings' })}
        </p>
      </div>

      <div dir="ltr" className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
        {modes.map((mode) => {
          const [Icon1, Icon2] = mode.icons
          const selected = data.inputMode === mode.value
          return (
            <button
              key={mode.value}
              onClick={() => updateData({ inputMode: mode.value as 'keyboard' | 'touchscreen' })}
              className={`p-8 rounded-2xl border-3 transition-all text-center hover:shadow-lg ${
                selected
                  ? 'border-orange-500 bg-orange-50 shadow-lg scale-[1.02]'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-center gap-3 mb-4">
                <Icon1 className={`h-12 w-12 ${selected ? 'text-orange-500' : 'text-gray-400'}`} strokeWidth={1.5} />
                <Icon2 className={`h-10 w-10 ${selected ? 'text-orange-400' : 'text-gray-300'}`} strokeWidth={1.5} />
              </div>
              <div className={`text-xl font-bold ${selected ? 'text-orange-700' : 'text-gray-900'}`}>
                {mode.label}
              </div>
              <div className="text-sm text-gray-500 mt-2 leading-relaxed">{mode.desc}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
