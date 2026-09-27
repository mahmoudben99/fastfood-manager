// Ambiance (TV display) presets, profile model and settings-key helpers.
// The hex values below are TV-side presets (what the television renders), not app UI colours,
// so they live here as data and are applied through inline styles only.

export interface GradientPreset {
  /** i18n id under `ambiance.gradientNames.*` */
  id: string
  colors: [string, string, string]
}

// ORDER MATTERS: the saved setting is the index into this list (`display_gradient_preset`).
export const GRADIENT_PRESETS: GradientPreset[] = [
  { id: 'midnight', colors: ['#0f0c29', '#302b63', '#24243e'] },
  { id: 'ocean', colors: ['#000428', '#004e92', '#000428'] },
  { id: 'sunset', colors: ['#1a0a00', '#b33000', '#ff6a00'] },
  { id: 'forest', colors: ['#0a1a0a', '#1b4332', '#2d6a4f'] },
  { id: 'royalPurple', colors: ['#1a0033', '#4a0080', '#7b2ff7'] },
  { id: 'cherry', colors: ['#1a0000', '#6b0020', '#c0003a'] },
  { id: 'coffee', colors: ['#1a0f00', '#3e2723', '#6d4c41'] },
  { id: 'arctic', colors: ['#0a1628', '#1a3a5c', '#2e6b8a'] },
  { id: 'ember', colors: ['#1a0500', '#8b2500', '#d44500'] },
  { id: 'tealNight', colors: ['#001a1a', '#004d4d', '#008080'] },
  { id: 'gold', colors: ['#1a1400', '#4a3800', '#8b6914'] },
  { id: 'rose', colors: ['#1a0010', '#4a0028', '#8b1460'] },
  { id: 'storm', colors: ['#0d0d0d', '#2c2c2c', '#4a4a4a'] },
  { id: 'warmNight', colors: ['#1a0a00', '#3d1c00', '#6b3a1f'] },
  { id: 'pureDark', colors: ['#000000', '#0a0a0a', '#111111'] },
  { id: 'sunrise', colors: ['#fff1eb', '#ace0f9', '#ffd6a5'] },
  { id: 'cottonCandy', colors: ['#fce4ec', '#e8eaf6', '#f3e5f5'] },
  { id: 'freshMint', colors: ['#e8f5e9', '#b2dfdb', '#c8e6c9'] },
  { id: 'peachCream', colors: ['#fff3e0', '#ffe0b2', '#ffccbc'] },
  { id: 'skyBlue', colors: ['#e3f2fd', '#bbdefb', '#b3e5fc'] }
]

export const gradientCss = (preset: GradientPreset): string =>
  `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]}, ${preset.colors[2]})`

export const FONT_OPTIONS = [
  'Playfair Display',
  'Inter',
  'DM Serif Display',
  'Cormorant Garamond',
  'Montserrat',
  'Raleway'
]

/** Loaded only for the live preview (the TV loads its own copy). Offline = system fallback. */
export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=' +
  FONT_OPTIONS.map((f) => f.replace(/ /g, '+')).join('&family=') +
  '&display=swap'

export interface ColorOption {
  color: string
  /** i18n id under `ambiance.colorNames.*` */
  id: string
}

export const TEXT_COLOR_OPTIONS: ColorOption[] = [
  { color: '#ffffff', id: 'white' },
  { color: '#f0f0f0', id: 'offWhite' },
  { color: '#fff8e7', id: 'warmWhite' },
  { color: '#d4d4d4', id: 'lightGray' },
  { color: '#ffd700', id: 'gold' },
  { color: '#fffdd0', id: 'cream' },
  { color: '#e0f7fa', id: 'iceBlue' },
  { color: '#fce4ec', id: 'lightPink' },
  { color: '#1a1a1a', id: 'dark' },
  { color: '#2d2d2d', id: 'charcoal' },
  { color: '#4a3728', id: 'brown' }
]

export const ACCENT_COLOR_OPTIONS: ColorOption[] = [
  { color: '#f97316', id: 'orange' },
  { color: '#3b82f6', id: 'blue' },
  { color: '#22c55e', id: 'green' },
  { color: '#ef4444', id: 'red' },
  { color: '#a855f7', id: 'purple' },
  { color: '#ec4899', id: 'pink' },
  { color: '#eab308', id: 'gold' },
  { color: '#14b8a6', id: 'teal' },
  { color: '#06b6d4', id: 'cyan' },
  { color: '#ffffff', id: 'white' }
]

/** True for light swatches, so the selected check mark can switch to a dark stroke. */
export function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return false
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 160
}

/** Panel keys (setting `display_panel_<key>`); labels are `ambiance.panel.<key>`. */
export const PANEL_KEYS = ['welcome', 'social', 'promos', 'slideshow', 'orders', 'menu'] as const

export type TextScale = 'small' | 'medium' | 'large'
export type WelcomeMode = 'animated' | 'static'

export const TEXT_SCALE_FACTOR: Record<TextScale, number> = { small: 0.8, medium: 1, large: 1.3 }

export const MAX_SLIDESHOW_IMAGES = 10

export const DEFAULT_YOUTUBE_URL =
  'https://www.youtube.com/watch?v=53nwh1aHCU8&list=RD53nwh1aHCU8&start_radio=1'

export interface ProfileSettings {
  gradientPreset: number
  fontFamily: string
  textColor: string
  accentColor: string
  textScale: TextScale
  logoScale: number
  showName: boolean
  panelToggles: Record<string, boolean>
  welcomeMode: WelcomeMode
  welcomeText: string
  youtubeUrl: string
  images: string[]
  tvUrl: string
}

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  gradientPreset: 0,
  fontFamily: 'Playfair Display',
  textColor: '#ffffff',
  accentColor: '#f97316',
  textScale: 'medium',
  logoScale: 1,
  showName: true,
  panelToggles: { welcome: true, social: true, promos: true, slideshow: true, orders: true, menu: true },
  welcomeMode: 'animated',
  welcomeText: '',
  youtubeUrl: DEFAULT_YOUTUBE_URL,
  images: [],
  tvUrl: ''
}

/** Settings-key prefix for a profile (`display_` for the default one). */
export const settingsPrefix = (profile: string): string =>
  profile === 'default' ? 'display_' : `display_${profile}_`

/** ProfileSettings field -> settings key suffix. panelToggles/images/tvUrl are handled apart. */
export const SETTING_KEY_SUFFIX: Partial<Record<keyof ProfileSettings, string>> = {
  gradientPreset: 'gradient_preset',
  fontFamily: 'font_family',
  textColor: 'text_color',
  accentColor: 'accent_color',
  textScale: 'text_scale',
  logoScale: 'logo_scale',
  showName: 'show_name',
  welcomeMode: 'welcome_mode',
  welcomeText: 'welcome_text',
  youtubeUrl: 'youtube_url'
}

/** Every per-profile key purged when a named profile is deleted (show_menu = legacy stale rows). */
export const PROFILE_KEYS_TO_PURGE = [
  'gradient_preset', 'font_family', 'text_color', 'accent_color',
  'text_scale', 'logo_scale', 'show_name', 'show_menu',
  'panel_welcome', 'panel_social', 'panel_promos', 'panel_slideshow',
  'panel_orders', 'panel_menu', 'welcome_mode', 'welcome_text',
  'youtube_url'
]

/**
 * Cloud TV link for a profile. Default = the bare /tv/<id> (picker chooses a screen);
 * a named profile = a direct link to THAT screen (?profile=), so each tab's link opens
 * its own display instead of every tab sharing the picker URL.
 */
export const buildTvUrl = (mid: string, profile: string): string =>
  !mid
    ? ''
    : profile === 'default'
      ? `fastfood-manager.vercel.app/tv/${mid}`
      : `fastfood-manager.vercel.app/tv/${mid}?profile=${encodeURIComponent(profile)}`

/** The `?profile=` suffix appended to LAN targets for named profiles (empty for default). */
export const profileQuery = (profile: string): string =>
  profile === 'default' ? '' : `?profile=${encodeURIComponent(profile)}`

/** Parse one profile's settings out of the flat settings map. */
export function readProfileSettings(
  all: Record<string, string>,
  profile: string,
  images: string[],
  tvUrl: string
): ProfileSettings {
  const p = settingsPrefix(profile)
  const panelToggles: Record<string, boolean> = {}
  for (const key of PANEL_KEYS) panelToggles[key] = all[`${p}panel_${key}`] !== 'false'
  return {
    gradientPreset: parseInt(all[`${p}gradient_preset`] || '0'),
    fontFamily: all[`${p}font_family`] || 'Playfair Display',
    textColor: all[`${p}text_color`] || '#ffffff',
    accentColor: all[`${p}accent_color`] || '#f97316',
    textScale: (all[`${p}text_scale`] as TextScale) || 'medium',
    logoScale: parseFloat(all[`${p}logo_scale`] || '1'),
    showName: all[`${p}show_name`] !== 'false',
    panelToggles,
    welcomeMode: (all[`${p}welcome_mode`] as WelcomeMode) || 'animated',
    welcomeText: all[`${p}welcome_text`] || '',
    youtubeUrl: all[`${p}youtube_url`] || DEFAULT_YOUTUBE_URL,
    images,
    tvUrl
  }
}

/** Local image path -> file:// URL for <img>. */
export const fileUrl = (path: string): string => 'file:///' + path.replace(/\\/g, '/')
