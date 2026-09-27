import { useTranslation } from 'react-i18next'
import { Globe, Hand, Keyboard, MonitorSmartphone, Share2, Store } from 'lucide-react'
import { Card, Field, Input, SegmentedControl, Select, cn } from '../../../components/ui'
import { LogoUploader } from '../../../components/LogoUploader'
import { MAX_ORDER_ALERT_MINUTES } from '../../../../../shared/settings-rules'
import { SocialMediaEditor } from '../SocialMediaEditor'
import { ChoiceCard, SaveBar } from '../SettingsFeedback'
import { useTouchKeyboard } from '../useTouchKeyboard'
import { CURRENCIES, type GeneralSettings } from '../hooks/useGeneralSettings'

const ALERT_PRESETS = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120]

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' }
]

/** Settings > General: restaurant profile, social accounts, language/currency, POS behaviour. */
export function GeneralSection({ general }: { general: GeneralSettings }) {
  const { t } = useTranslation()
  const kb = useTouchKeyboard()
  const { form, set, patch } = general

  // Social handles are typed through the on-screen keyboard too (touch mode).
  form.socialMedia.forEach((entry, index) =>
    kb.register(`social-${index}`, entry.handle, (handle) =>
      patch((prev) => ({ socialMedia: prev.socialMedia.map((s, i) => (i === index ? { ...s, handle } : s)) }))
    )
  )

  const barError = general.generalError || general.nameError || general.alertError

  return (
    <div>
      <div className="space-y-6">
        <Card title={t('settings.v4.profileTitle')} icon={<Store />}>
          <div className="space-y-5">
            <LogoUploader />
            <div className="border-t border-line pt-5 space-y-4">
              <Input
                label={t('setup.restaurant.name')}
                inputSize="lg"
                error={general.nameError}
                {...kb.bind('name', form.name, (v) => set('name', v))}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t('setup.restaurant.phone')}
                  dir="ltr"
                  inputMode="tel"
                  {...kb.bind('phone', form.phone, (v) => set('phone', v), { type: 'numeric' })}
                />
                <Input
                  label={t('setup.restaurant.phone2')}
                  dir="ltr"
                  inputMode="tel"
                  {...kb.bind('phone2', form.phone2, (v) => set('phone2', v), { type: 'numeric' })}
                />
              </div>
              <Input
                label={t('setup.restaurant.address')}
                placeholder={t('setup.restaurant.addressPlaceholder')}
                {...kb.bind('address', form.address, (v) => set('address', v))}
              />
            </div>
          </div>
        </Card>

        <Card title={t('settings.socialMedia')} icon={<Share2 />}>
          <SocialMediaEditor
            items={form.socialMedia}
            onChange={(items) => set('socialMedia', items)}
            isTouch={kb.isTouch}
            onRequestKeyboard={(index) => kb.open(`social-${index}`)}
          />
        </Card>

        <Card title={t('settings.v4.languageTitle')} icon={<Globe />}>
          <div className="space-y-5">
            <Field label={t('setup.language.title')}>
              <SegmentedControl
                fullWidth
                size="lg"
                ariaLabel={t('setup.language.title')}
                value={form.lang}
                onChange={(v) => set('lang', v)}
                options={LANGUAGES.map((l) => ({ value: l.value, label: <bdi>{l.label}</bdi> }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Select
                label={t('setup.restaurant.currency')}
                value={form.currency}
                onChange={(e) => general.changeCurrency(e.target.value)}
                options={CURRENCIES.map((c) => ({ value: c.value, label: c.label }))}
              />
              <Input
                label={t('setup.restaurant.currencySymbol')}
                dir="ltr"
                {...kb.bind('currencySymbol', form.currencySymbol, (v) => set('currencySymbol', v))}
              />
            </div>
          </div>
        </Card>

        <Card title={t('settings.v4.posTitle')} icon={<MonitorSmartphone />}>
          <div className="space-y-6">
            {kb.isTouch ? (
              /* Touch mode: quick-pick preset minutes */
              <Field
                label={t('settings.orderAlertMinutes')}
                error={general.alertError}
                helperText={t('settings.orderAlertHelp')}
              >
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('settings.orderAlertMinutes')}>
                  {ALERT_PRESETS.map((min) => {
                    const active = form.orderAlertMinutes === String(min)
                    return (
                      <button
                        key={min}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => set('orderAlertMinutes', String(min))}
                        className={cn(
                          'tap num min-h-12 min-w-20 px-4 rounded-xl border text-sm font-semibold',
                          active
                            ? 'bg-inverse text-on-inverse border-transparent'
                            : 'bg-surface text-ink-2 border-line hover:bg-surface-2'
                        )}
                      >
                        {t('settings.v4.minutesShort', { n: min })}
                      </button>
                    )
                  })}
                </div>
              </Field>
            ) : (
              <div className="max-w-xs">
                <Input
                  label={t('settings.orderAlertMinutes')}
                  type="number"
                  min="1"
                  max={MAX_ORDER_ALERT_MINUTES}
                  step="1"
                  dir="ltr"
                  value={form.orderAlertMinutes}
                  onChange={(e) => set('orderAlertMinutes', e.target.value)}
                  placeholder="20"
                  error={general.alertError}
                  helperText={t('settings.orderAlertHelp')}
                />
              </div>
            )}

            <Field label={t('settings.inputMode')}>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('settings.inputMode')}>
                <ChoiceCard
                  selected={form.inputModeLocal === 'keyboard'}
                  onSelect={() => set('inputModeLocal', 'keyboard')}
                  icon={<Keyboard />}
                  title={t('settings.inputModeKeyboard')}
                />
                <ChoiceCard
                  selected={form.inputModeLocal === 'touchscreen'}
                  onSelect={() => set('inputModeLocal', 'touchscreen')}
                  icon={<Hand />}
                  title={t('settings.inputModeTouchscreen')}
                  description={t('settings.v4.inputTouchDesc')}
                />
              </div>
            </Field>
          </div>
        </Card>
      </div>

      <SaveBar
        dirty={general.isDirty}
        saving={general.saving}
        error={barError}
        onSave={() => { void general.save() }}
        onDiscard={general.discard}
      />
      {kb.keyboard()}
    </div>
  )
}
