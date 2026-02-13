import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../../store/appStore'
import type { SetupData } from '../SetupWizard'

interface Props {
  data: SetupData
  updateData: (partial: Partial<SetupData>) => void
}

const languages = [
  { code: 'ar', label: 'العربية', flag: '🇩🇿', desc: 'Arabic' },
  { code: 'en', label: 'English', flag: '🇬🇧', desc: 'English' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', desc: 'French' }
]

export function LanguageSelect({ data, updateData }: Props) {
  const { t } = useTranslation()
  const { setLanguage } = useAppStore()

  const handleSelect = (code: string) => {
    updateData({ language: code })
    setLanguage(code)
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">{t('setup.language.title')}</h2>
        <p className="text-gray-500 mt-1">{t('setup.language.subtitle')}</p>
      </div>

      {/* Force LTR so buttons don't flip when Arabic is selected */}
      <div dir="ltr" className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleSelect(lang.code)}
            className={`p-6 rounded-xl border-2 transition-all text-center hover:shadow-md ${
              data.language === lang.code
                ? 'border-orange-500 bg-orange-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="text-4xl mb-3">{lang.flag}</div>
            <div className="text-lg font-semibold text-gray-900">{lang.label}</div>
            <div className="text-sm text-gray-500 mt-1">{lang.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
