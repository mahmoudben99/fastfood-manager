import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { useAppStore } from '../../../store/appStore'
import { cn } from '../../../components/ui/cn'
import { StepLayout } from '../parts/StepLayout'
import { ChoiceCard } from '../parts/ChoiceCard'
import type { SetupData } from '../SetupWizard'

interface Props {
  data: SetupData
  updateData: (partial: Partial<SetupData>) => void
}

// Script glyphs instead of flag emoji: Windows has no flag glyphs (they render as "DZ", "GB").
const languages = [
  { code: 'ar', label: 'العربية', glyph: 'ع' },
  { code: 'en', label: 'English', glyph: 'EN' },
  { code: 'fr', label: 'Français', glyph: 'FR' }
]

export function LanguageSelect({ data, updateData }: Props) {
  const { t } = useTranslation()
  const { setLanguage } = useAppStore()

  const handleSelect = (code: string) => {
    updateData({ language: code })
    setLanguage(code)
  }

  return (
    <StepLayout icon={<Languages />} title={t('setup.language.title')}>
      {/* Force LTR so the cards don't swap places under the finger when Arabic is selected */}
      <div dir="ltr" role="radiogroup" aria-label={t('setup.language.title')} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {languages.map((lang) => {
          const selected = data.language === lang.code
          const localized = t(`setup.language.names.${lang.code}`)
          return (
            <ChoiceCard
              key={lang.code}
              selected={selected}
              onSelect={() => handleSelect(lang.code)}
              className="flex min-h-40 flex-col items-center justify-center gap-2.5 p-5"
            >
              <span
                aria-hidden
                className={cn(
                  'h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-extrabold',
                  selected ? 'bg-ember text-on-primary shadow-glow' : 'bg-surface-2 text-ink-2 border border-line'
                )}
              >
                {lang.glyph}
              </span>
              <span lang={lang.code} dir={lang.code === 'ar' ? 'rtl' : 'ltr'} className="text-2xl font-bold text-ink">
                {lang.label}
              </span>
              {localized !== lang.label && <span className="text-sm text-muted">{localized}</span>}
            </ChoiceCard>
          )
        })}
      </div>
    </StepLayout>
  )
}
