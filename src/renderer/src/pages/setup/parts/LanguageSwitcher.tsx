import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../../store/appStore'
import { SegmentedControl } from '../../../components/ui/SegmentedControl'

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' }
]

/**
 * Compact UI-language switch for screens shown before the setup wizard (activation).
 * Only changes the running UI language (store/i18n); the setup wizard saves the choice.
 * Order is kept LTR so the options don't jump under the finger when Arabic flips the page.
 */
export function LanguageSwitcher() {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  return (
    <div dir="ltr">
      <SegmentedControl
        size="md"
        value={language}
        onChange={setLanguage}
        options={LANGUAGES}
        ariaLabel={t('setup.language.title')}
      />
    </div>
  )
}
