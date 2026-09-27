import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Gauge, Monitor, Moon, Palette, Sun, Type } from 'lucide-react'
import { useAppStore } from '../../../store/appStore'
import { Card, Toggle } from '../../../components/ui'
import { DENSITIES, DENSITY_ROOT_PX, THEME_MODES, type Density, type ThemeMode } from '../../../theme/theme'
import { ChoiceCard } from '../SettingsFeedback'

/* Static swatches of the two palettes (tokens.css) so each card previews its theme whatever the current one is. */
const PALETTE = {
  light: { canvas: '#faf7f2', surface: '#ffffff', line: '#e9e2d8', ink: '#44403c', faint: '#d6ccbf', nav: '#1c1917' },
  dark: { canvas: '#141110', surface: '#1d1916', line: '#2f2925', ink: '#ddd4ca', faint: '#403832', nav: '#0f0d0c' }
}
const EMBER = 'linear-gradient(135deg, #ea580c, #c2410c)'
const NAV_PILL = 'rgb(255 255 255 / 0.25)'

function MiniApp({ tone, style }: { tone: 'light' | 'dark'; style?: CSSProperties }) {
  const p = PALETTE[tone]
  return (
    <div className="absolute inset-0 flex" style={{ background: p.canvas, ...style }}>
      <div className="w-5 shrink-0 flex flex-col items-center gap-1.5 pt-2" style={{ background: p.nav }}>
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: EMBER }} />
        <span className="h-1 w-2.5 rounded-full" style={{ background: NAV_PILL }} />
        <span className="h-1 w-2.5 rounded-full" style={{ background: NAV_PILL }} />
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <span className="block h-1.5 w-12 rounded-full" style={{ background: p.ink }} />
        <div className="grid grid-cols-2 gap-1.5">
          {[0, 1].map((i) => (
            <div key={i} className="h-9 rounded-md border p-1.5 space-y-1" style={{ background: p.surface, borderColor: p.line }}>
              <span className="block h-1 w-8 rounded-full" style={{ background: p.faint }} />
              <span className="block h-1.5 w-5 rounded-full" style={{ background: p.ink }} />
            </div>
          ))}
        </div>
        <span className="block h-2.5 w-10 rounded-md ms-auto" style={{ background: EMBER }} />
      </div>
    </div>
  )
}

function ThemePreview({ mode }: { mode: ThemeMode }) {
  return (
    <span dir="ltr" className="relative block h-24 w-full overflow-hidden rounded-xl border border-line" aria-hidden="true">
      {mode === 'system' ? (
        <>
          <MiniApp tone="light" />
          <MiniApp tone="dark" style={{ clipPath: 'polygon(62% 0, 100% 0, 100% 100%, 38% 100%)' }} />
        </>
      ) : (
        <MiniApp tone={mode} />
      )}
    </span>
  )
}

const THEME_ICON: Record<ThemeMode, ReactNode> = { light: <Sun />, dark: <Moon />, system: <Monitor /> }

/** Settings > Appearance: theme, text/touch size and Performance mode (applied instantly, per PC). */
export function AppearanceSection() {
  const { t } = useTranslation()
  const themeMode = useAppStore((s) => s.themeMode)
  const setThemeMode = useAppStore((s) => s.setThemeMode)
  const density = useAppStore((s) => s.density)
  const setDensity = useAppStore((s) => s.setDensity)
  const perfMode = useAppStore((s) => s.perfMode)
  const setPerfMode = useAppStore((s) => s.setPerfMode)

  return (
    <div>
      <div className="space-y-6">
        <Card title={t('ui.theme.label')} icon={<Palette />}>
          <div className="grid gap-4 sm:grid-cols-3" role="radiogroup" aria-label={t('ui.theme.label')}>
            {THEME_MODES.map((mode) => (
              <ChoiceCard
                key={mode}
                selected={themeMode === mode}
                onSelect={() => setThemeMode(mode)}
                icon={THEME_ICON[mode]}
                title={t(`ui.theme.${mode}`)}
                preview={<ThemePreview mode={mode} />}
              />
            ))}
          </div>
        </Card>

        <Card title={t('ui.display.density')} icon={<Type />}>
          <div className="grid gap-4 sm:grid-cols-3" role="radiogroup" aria-label={t('ui.display.density')}>
            {DENSITIES.map((d: Density) => {
              const px = DENSITY_ROOT_PX[d]
              return (
                <ChoiceCard
                  key={d}
                  selected={density === d}
                  onSelect={() => setDensity(d)}
                  title={t(`ui.display.${d}`)}
                  description={d === 'comfortable' ? t('settings.v4.density_comfortable') : undefined}
                  preview={
                    <span
                      aria-hidden="true"
                      className="flex h-24 w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface-2"
                    >
                      <span className="font-extrabold text-ink leading-none" style={{ fontSize: px * 1.9 }}>
                        Aa
                      </span>
                      <span className="rounded-lg bg-ember" style={{ height: px * 2.2, width: px * 3.2 }} />
                    </span>
                  }
                />
              )
            })}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-primary-soft text-primary-ink flex items-center justify-center">
              <Gauge className="h-[18px] w-[18px]" />
            </span>
            <Toggle
              checked={perfMode}
              onChange={setPerfMode}
              label={t('ui.display.perfMode')}
              description={t('ui.display.perfModeHint')}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
