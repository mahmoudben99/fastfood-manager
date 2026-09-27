import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Monitor, Moon, SlidersHorizontal, Sun } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Toggle } from '../ui/Toggle'
import { IconButton } from '../ui/IconButton'
import type { Density, ThemeMode } from '../../theme/theme'

/** Light / dark / system switch (icon-only segments). */
export function ThemeSwitch({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { t } = useTranslation()
  const themeMode = useAppStore((s) => s.themeMode)
  const setThemeMode = useAppStore((s) => s.setThemeMode)
  return (
    <SegmentedControl<ThemeMode>
      size={size}
      ariaLabel={t('ui.theme.label')}
      value={themeMode}
      onChange={setThemeMode}
      options={[
        { value: 'light', label: null, icon: <Sun />, ariaLabel: t('ui.theme.light') },
        { value: 'dark', label: null, icon: <Moon />, ariaLabel: t('ui.theme.dark') },
        { value: 'system', label: null, icon: <Monitor />, ariaLabel: t('ui.theme.system') }
      ]}
    />
  )
}

/** Top-bar popover: theme, density (root font-size) and Performance mode. */
export function DisplayMenu() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const density = useAppStore((s) => s.density)
  const setDensity = useAppStore((s) => s.setDensity)
  const perfMode = useAppStore((s) => s.perfMode)
  const setPerfMode = useAppStore((s) => s.setPerfMode)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <IconButton
        icon={<SlidersHorizontal />}
        label={t('ui.display.title')}
        variant={open ? 'soft' : 'ghost'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="absolute end-0 top-full mt-2 z-50 w-[22rem] rounded-2xl bg-surface border border-line shadow-e4 p-4 space-y-4 animate-pop-in">
          <p className="text-sm font-bold text-ink">{t('ui.display.title')}</p>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted">{t('ui.theme.label')}</p>
            <ThemeSwitch size="md" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted">{t('ui.display.density')}</p>
            <SegmentedControl<Density>
              fullWidth
              size="md"
              value={density}
              onChange={setDensity}
              options={[
                { value: 'compact', label: t('ui.display.compact') },
                { value: 'comfortable', label: t('ui.display.comfortable') },
                { value: 'large', label: t('ui.display.large') }
              ]}
            />
          </div>
          <div className="pt-3 border-t border-line">
            <Toggle
              checked={perfMode}
              onChange={setPerfMode}
              label={t('ui.display.perfMode')}
              description={t('ui.display.perfModeHint')}
            />
          </div>
        </div>
      )}
    </div>
  )
}
