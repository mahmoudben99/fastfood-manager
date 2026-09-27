import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages, Type } from 'lucide-react'
import { Input, SegmentedControl, Toggle } from '../../../components/ui'
import { VirtualKeyboard } from '../../../components/VirtualKeyboard'
import { SettingBlock } from './SettingBlock'
import { PANEL_KEYS, type ProfileSettings, type WelcomeMode } from './presets'

interface ContentSectionProps {
  current: ProfileSettings
  isTouch: boolean
  onChange: <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) => void
  onWelcomeText: (value: string) => void
}

/** What the TV shows: name, which panels rotate, and the welcome line. */
export function ContentSection({ current, isTouch, onChange, onWelcomeText }: ContentSectionProps) {
  const { t } = useTranslation()
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const block = 'py-5 first:pt-0 last:pb-0'

  return (
    <div className="divide-y divide-line">
      <div className={block}>
        <Toggle
          checked={current.showName}
          onChange={(v) => onChange('showName', v)}
          label={t('ambiance.showRestaurantName')}
        />
      </div>

      <SettingBlock className={block} title={t('ambiance.activePanels')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {PANEL_KEYS.map((key) => (
            <div key={key} className="rounded-xl bg-surface-2 px-4">
              <Toggle
                checked={current.panelToggles[key] ?? true}
                onChange={(v) => onChange('panelToggles', { ...current.panelToggles, [key]: v })}
                label={t(`ambiance.panel.${key}`)}
              />
            </div>
          ))}
        </div>
      </SettingBlock>

      <SettingBlock className={block} title={t('ambiance.welcomeMessage')}>
        <SegmentedControl<WelcomeMode>
          className="max-w-full overflow-x-auto no-scrollbar"
          ariaLabel={t('ambiance.welcomeMessage')}
          value={current.welcomeMode}
          onChange={(v) => onChange('welcomeMode', v)}
          options={[
            { value: 'animated', label: t('ambiance.welcomeAnimated'), icon: <Languages /> },
            { value: 'static', label: t('ambiance.welcomeCustom'), icon: <Type /> }
          ]}
        />
        <Input
          placeholder={t('ambiance.welcomeTextPlaceholder')}
          aria-label={t('ambiance.welcomeCustom')}
          value={current.welcomeText}
          readOnly={isTouch}
          onClick={isTouch ? () => setKeyboardOpen(true) : undefined}
          onChange={(e) => onWelcomeText(e.target.value)}
        />
      </SettingBlock>

      {isTouch && keyboardOpen && (
        <VirtualKeyboard
          visible
          type="text"
          extended
          value={current.welcomeText}
          onChange={onWelcomeText}
          onClose={() => setKeyboardOpen(false)}
        />
      )}
    </div>
  )
}
