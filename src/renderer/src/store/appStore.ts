import { create } from 'zustand'
import i18n from '../i18n'
import { DEFAULT_CURRENCY_SYMBOL } from '../../../shared/settings-rules'
import {
  applyDensity,
  applyPerfMode,
  applyTheme,
  parseDensity,
  parseThemeMode,
  type Density,
  type ThemeMode
} from '../theme/theme'

interface AppState {
  language: string
  foodLanguage: string
  currency: string
  currencySymbol: string
  restaurantName: string
  activated: boolean
  setupComplete: boolean
  darkMode: boolean
  /** v4: 'system' follows Windows; darkMode is always the resolved value. */
  themeMode: ThemeMode
  /** v4 Performance mode: no shadows/animations (settings.perf_mode). */
  perfMode: boolean
  /** v4 UI density: root font-size 15/16/18px (settings.ui_density). */
  density: Density
  inputMode: string

  // Trial / license state
  activationType: 'full' | 'trial' | null
  trialStatus: 'active' | 'expired' | 'paused' | 'offline-locked' | null
  trialExpiresAt: Date | null
  trialOfflineSecondsLeft: number | null

  setLanguage: (lang: string) => void
  setFoodLanguage: (lang: string) => void
  setCurrency: (currency: string, symbol: string) => void
  setRestaurantName: (name: string) => void
  setActivated: (activated: boolean) => void
  setSetupComplete: (complete: boolean) => void
  toggleDarkMode: () => void
  setThemeMode: (mode: ThemeMode) => void
  setPerfMode: (on: boolean) => void
  setDensity: (density: Density) => void
  setInputMode: (mode: string) => void
  setActivationType: (type: 'full' | 'trial' | null) => void
  setTrialStatus: (status: 'active' | 'expired' | 'paused' | 'offline-locked' | null) => void
  setTrialExpiresAt: (date: Date | null) => void
  setTrialOfflineSecondsLeft: (seconds: number | null) => void
  loadSettings: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  language: 'en',
  foodLanguage: 'en',
  currency: 'DZD',
  currencySymbol: DEFAULT_CURRENCY_SYMBOL,
  restaurantName: '',
  activated: false,
  setupComplete: false,
  darkMode: false,
  themeMode: 'light',
  perfMode: false,
  density: 'comfortable',
  inputMode: 'keyboard',

  activationType: null,
  trialStatus: null,
  trialExpiresAt: null,
  trialOfflineSecondsLeft: null,

  setLanguage: (lang) => {
    i18n.changeLanguage(lang)
    set({ language: lang })
  },

  setFoodLanguage: (lang) => {
    set({ foodLanguage: lang })
    window.api.settings.set('food_language', lang).catch(() => {})
  },

  setCurrency: (currency, symbol) => set({ currency, currencySymbol: symbol }),

  setRestaurantName: (name) => set({ restaurantName: name }),

  setActivated: (activated) => set({ activated }),

  setSetupComplete: (complete) => set({ setupComplete: complete }),

  setInputMode: (mode) => {
    set({ inputMode: mode })
    window.api.settings.set('input_mode', mode).catch(() => {})
  },

  setActivationType: (type) => set({ activationType: type }),

  setTrialStatus: (status) => set({ trialStatus: status }),

  setTrialExpiresAt: (date) => set({ trialExpiresAt: date }),

  setTrialOfflineSecondsLeft: (seconds) => set({ trialOfflineSecondsLeft: seconds }),

  toggleDarkMode: () => {
    get().setThemeMode(get().darkMode ? 'light' : 'dark')
  },

  setThemeMode: (mode) => {
    const darkMode = applyTheme(mode, (dark) => set({ darkMode: dark }))
    set({ themeMode: mode, darkMode })
    window.api.settings.set('theme_mode', mode).catch(() => {})
    // Keep the v3 key in sync for anything still reading it.
    window.api.settings.set('dark_mode', darkMode ? 'true' : 'false').catch(() => {})
  },

  setPerfMode: (on) => {
    applyPerfMode(on)
    set({ perfMode: on })
    window.api.settings.set('perf_mode', on ? 'true' : 'false').catch(() => {})
  },

  setDensity: (density) => {
    applyDensity(density)
    set({ density })
    window.api.settings.set('ui_density', density).catch(() => {})
  },

  loadSettings: async () => {
    try {
      const settings = await window.api.settings.getAll()
      const lang = settings.language || 'en'
      i18n.changeLanguage(lang)

      const themeMode = parseThemeMode(settings)
      const darkMode = applyTheme(themeMode, (dark) => set({ darkMode: dark }))
      const perfMode = settings.perf_mode === 'true'
      applyPerfMode(perfMode)
      const density = parseDensity(settings.ui_density)
      applyDensity(density)

      const activationType = (settings.activation_type as 'full' | 'trial' | null) || null
      const trialExpiresAt = settings.trial_expires_at ? new Date(settings.trial_expires_at) : null

      set({
        language: lang,
        foodLanguage: settings.food_language || lang,
        currency: settings.currency || 'DZD',
        // Contract C4: an empty currency symbol means 'DA' everywhere (was '$').
        currencySymbol: settings.currency_symbol || DEFAULT_CURRENCY_SYMBOL,
        restaurantName: settings.restaurant_name || '',
        activated: settings.activation_status === 'activated',
        setupComplete: settings.setup_complete === 'true',
        darkMode,
        themeMode,
        perfMode,
        density,
        inputMode: settings.input_mode || 'keyboard',
        activationType,
        trialExpiresAt,
        trialStatus: activationType === 'trial' ? 'active' : null
      })
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }
}))
