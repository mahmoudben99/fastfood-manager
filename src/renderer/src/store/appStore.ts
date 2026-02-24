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

  setLanguage: (lang: string) => void
  setFoodLanguage: (lang: string) => void
  setCurrency: (currency: string, symbol: string) => void
  setRestaurantName: (name: string) => void
  setActivated: (activated: boolean) => void
  setSetupComplete: (complete: boolean) => void
  toggleDarkMode: () => void
  setInputMode: (mode: string) => void
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

      set({
        language: lang,
        foodLanguage: settings.food_language || lang,
        currency: settings.currency || 'USD',
        currencySymbol: settings.currency_symbol || '$',
        restaurantName: settings.restaurant_name || '',
        activated: settings.activation_status === 'activated',
        setupComplete: settings.setup_complete === 'true',
        darkMode,
        inputMode: settings.input_mode || 'keyboard'
      })
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }
}))
