import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { SegmentedControl, cn } from '../../../components/ui'
import { SettingBlock } from './SettingBlock'
import {
  ACCENT_COLOR_OPTIONS,
  FONT_OPTIONS,
  GRADIENT_PRESETS,
  TEXT_COLOR_OPTIONS,
  gradientCss,
  isLightColor,
  type ColorOption,
  type ProfileSettings,
  type TextScale
} from './presets'

interface AppearanceSectionProps {
  current: ProfileSettings
  onChange: <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) => void
}

const selectedRing = 'ring-2 ring-primary ring-offset-2 ring-offset-surface'

/** Check mark drawn on a swatch; dark on light swatches, white on dark ones. */
function SwatchCheck({ light }: { light: boolean }) {
  return (
    <Check
      className="h-5 w-5"
      strokeWidth={3}
      style={{ color: light ? '#1c1917' : '#ffffff' }}
      aria-hidden="true"
    />
  )
}

function ColorRow({
  options,
  value,
  onPick
}: {
  options: ColorOption[]
  value: string
  onPick: (color: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map(({ color, id }) => {
        const active = value === color
        const name = t(`ambiance.colorNames.${id}`)
        return (
          <button
            key={color}
            type="button"
            title={name}
            aria-label={name}
            aria-pressed={active}
            onClick={() => onPick(color)}
            className={cn(
              'tap h-11 w-11 rounded-full border border-line-strong flex items-center justify-center',
              active && selectedRing
            )}
            style={{ backgroundColor: color }}
          >
            {active && <SwatchCheck light={isLightColor(color)} />}
          </button>
        )
      })}
    </div>
  )
}

/** Look of the TV: background, typeface, colours and sizes. */
export function AppearanceSection({ current, onChange }: AppearanceSectionProps) {
  const { t } = useTranslation()
  const gradient = GRADIENT_PRESETS[current.gradientPreset] || GRADIENT_PRESETS[0]
  const block = 'py-5 first:pt-0 last:pb-0'

  return (
    <div className="divide-y divide-line">
      <SettingBlock
        className={block}
        title={t('ambiance.background')}
        aside={t('ambiance.selected', { name: t(`ambiance.gradientNames.${gradient.id}`) })}
      >
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
          {GRADIENT_PRESETS.map((preset, idx) => {
            const active = current.gradientPreset === idx
            const name = t(`ambiance.gradientNames.${preset.id}`)
            return (
              <button
                key={preset.id}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={active}
                onClick={() => onChange('gradientPreset', idx)}
                className={cn(
                  'tap contain-card h-14 rounded-xl border border-line flex items-center justify-center',
                  active && selectedRing
                )}
                style={{ background: gradientCss(preset) }}
              >
                {active && <SwatchCheck light={isLightColor(preset.colors[1])} />}
              </button>
            )
          })}
        </div>
      </SettingBlock>

      <SettingBlock className={block} title={t('ambiance.font')}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FONT_OPTIONS.map((font) => {
            const active = current.fontFamily === font
            return (
              <button
                key={font}
                type="button"
                aria-pressed={active}
                onClick={() => onChange('fontFamily', font)}
                className={cn(
                  'tap min-h-12 px-3 rounded-xl border text-base truncate',
                  active
                    ? 'border-primary bg-primary-soft text-primary-ink font-semibold'
                    : 'border-line-strong bg-surface text-ink hover:bg-surface-2'
                )}
                style={{ fontFamily: font }}
              >
                <bdi>{font}</bdi>
              </button>
            )
          })}
        </div>
      </SettingBlock>

      <SettingBlock className={block} title={t('ambiance.textColor')}>
        <ColorRow options={TEXT_COLOR_OPTIONS} value={current.textColor} onPick={(c) => onChange('textColor', c)} />
      </SettingBlock>

      <SettingBlock className={block} title={t('ambiance.accentColor')}>
        <ColorRow
          options={ACCENT_COLOR_OPTIONS}
          value={current.accentColor}
          onPick={(c) => onChange('accentColor', c)}
        />
      </SettingBlock>

      <div className={cn(block, 'grid gap-5 sm:grid-cols-2')}>
        <SettingBlock title={t('ambiance.textSize')}>
          <SegmentedControl<TextScale>
            fullWidth
            ariaLabel={t('ambiance.textSize')}
            value={current.textScale}
            onChange={(v) => onChange('textScale', v)}
            options={[
              { value: 'small', label: t('ambiance.sizeSmall') },
              { value: 'medium', label: t('ambiance.sizeMedium') },
              { value: 'large', label: t('ambiance.sizeLarge') }
            ]}
          />
        </SettingBlock>
        <SettingBlock title={t('ambiance.logoSize')}>
          <SegmentedControl<'1' | '2' | '3'>
            fullWidth
            ariaLabel={t('ambiance.logoSize')}
            value={String(current.logoScale) as '1' | '2' | '3'}
            onChange={(v) => onChange('logoScale', Number(v))}
            options={[
              { value: '1', label: <bdi>1×</bdi> },
              { value: '2', label: <bdi>2×</bdi> },
              { value: '3', label: <bdi>3×</bdi> }
            ]}
          />
        </SettingBlock>
      </div>
    </div>
  )
}
