/**
 * v4 theme runtime: light/dark/system, Performance mode and UI density.
 * All three are plain classes/variables on <html>, so switching costs one style recalc.
 *
 * Settings keys (all strings): theme_mode 'light'|'dark'|'system' (falls back to the v3
 * dark_mode 'true'|'false'), perf_mode 'true'|'false', ui_density 'compact'|'comfortable'|'large'.
 */

export type ThemeMode = 'light' | 'dark' | 'system'
export type Density = 'compact' | 'comfortable' | 'large'

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system']
export const DENSITIES: Density[] = ['compact', 'comfortable', 'large']

/** Root font-size per density. Tailwind spacing + type are rem-based, so everything scales. */
export const DENSITY_ROOT_PX: Record<Density, number> = {
  compact: 15,
  comfortable: 16,
  large: 18
}

const DARK_QUERY = '(prefers-color-scheme: dark)'
let systemQuery: MediaQueryList | null = null
let systemListener: ((e: MediaQueryListEvent) => void) | null = null

export function parseThemeMode(settings: Record<string, string | undefined>): ThemeMode {
  const raw = settings.theme_mode
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  return settings.dark_mode === 'true' ? 'dark' : 'light'
}

export function parseDensity(raw: string | undefined): Density {
  return raw === 'compact' || raw === 'large' ? raw : 'comfortable'
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches
  } catch {
    return false
  }
}

export function resolveDark(mode: ThemeMode): boolean {
  return mode === 'dark' || (mode === 'system' && systemPrefersDark())
}

/**
 * Apply a theme mode to <html>. In 'system' mode it follows the OS live and calls `onSystemChange`
 * with the new dark flag. Returns whether dark is active now.
 */
export function applyTheme(mode: ThemeMode, onSystemChange?: (dark: boolean) => void): boolean {
  if (systemQuery && systemListener) {
    systemQuery.removeEventListener('change', systemListener)
    systemQuery = null
    systemListener = null
  }
  const dark = resolveDark(mode)
  document.documentElement.classList.toggle('dark', dark)
  if (mode === 'system') {
    try {
      systemQuery = window.matchMedia(DARK_QUERY)
      systemListener = (e) => {
        document.documentElement.classList.toggle('dark', e.matches)
        onSystemChange?.(e.matches)
      }
      systemQuery.addEventListener('change', systemListener)
    } catch {
      /* matchMedia unavailable: stay on the resolved value */
    }
  }
  return dark
}

export function applyPerfMode(on: boolean): void {
  document.documentElement.classList.toggle('perf', on)
}

export function applyDensity(density: Density): void {
  document.documentElement.style.setProperty('--ui-root-size', `${DENSITY_ROOT_PX[density]}px`)
  document.documentElement.dataset.density = density
}
