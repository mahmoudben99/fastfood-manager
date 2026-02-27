import { create } from 'zustand'
import i18n from '../i18n'

interface AppState {
  language: string
  foodLanguage: string
  currency: string
  currencySymbol: string
  restaurantName: string
  activated: boolean
  setupComplete: boolean
  darkMode: boolean
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
  currency: 'USD',
  currencySymbol: '$',
  restaurantName: '',
  activated: false,
  setupComplete: false,
  darkMode: false,
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
    const newMode = !get().darkMode
    set({ darkMode: newMode })
    document.documentElement.classList.toggle('dark', newMode)
    window.api.settings.set('dark_mode', newMode ? 'true' : 'false').catch(() => {})
  },

  loadSettings: async () => {
    try {
      const settings = await window.api.settings.getAll()
      const lang = settings.language || 'en'
      i18n.changeLanguage(lang)

      const darkMode = settings.dark_mode === 'true'
      document.documentElement.classList.toggle('dark', darkMode)

      const activationType = (settings.activation_type as 'full' | 'trial' | null) || null
      const trialExpiresAt = settings.trial_expires_at ? new Date(settings.trial_expires_at) : null

      set({
        language: lang,
        foodLanguage: settings.food_language || lang,
        currency: settings.currency || 'USD',
        currencySymbol: settings.currency_symbol || '$',
        restaurantName: settings.restaurant_name || '',
        activated: settings.activation_status === 'activated',
        setupComplete: settings.setup_complete === 'true',
        darkMode,
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
