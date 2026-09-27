import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../../store/appStore'
import { ipcErrorMessage } from '../../../utils/ipcError'
import {
  DEFAULT_CURRENCY_SYMBOL,
  MAX_ORDER_ALERT_MINUTES,
  orderAlertMinutesOrDefault,
  parseSocialMedia,
  serializeSocialMedia,
  type SocialMediaEntry
} from '../../../../../shared/settings-rules'

export const CURRENCIES = [
  { value: 'DZD', label: 'DZD - Algerian Dinar', symbol: 'DA' },
  { value: 'USD', label: 'USD - US Dollar', symbol: '$' },
  { value: 'EUR', label: 'EUR - Euro', symbol: 'EUR' },
  { value: 'GBP', label: 'GBP - British Pound', symbol: '£' },
  { value: 'MAD', label: 'MAD - Moroccan Dirham', symbol: 'DH' },
  { value: 'TND', label: 'TND - Tunisian Dinar', symbol: 'DT' },
  { value: 'SAR', label: 'SAR - Saudi Riyal', symbol: 'SR' },
  { value: 'AED', label: 'AED - UAE Dirham', symbol: 'AED' },
  { value: 'TRY', label: 'TRY - Turkish Lira', symbol: 'TL' }
]

export interface GeneralForm {
  name: string
  phone: string
  phone2: string
  address: string
  socialMedia: SocialMediaEntry[]
  currency: string
  currencySymbol: string
  lang: string
  orderAlertMinutes: string
  inputModeLocal: string
}

const EMPTY: GeneralForm = {
  name: '',
  phone: '',
  phone2: '',
  address: '',
  socialMedia: [],
  currency: 'DZD',
  currencySymbol: 'DA',
  lang: 'en',
  orderAlertMinutes: '20',
  inputModeLocal: 'keyboard'
}

/**
 * Settings > General form: restaurant profile, language/currency, POS behaviour.
 * Lives in the page shell so the unsaved-changes guard can save/discard it from any section.
 */
export function useGeneralSettings(onSaved: () => void) {
  const { t } = useTranslation()
  const setLanguage = useAppStore((s) => s.setLanguage)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const [form, setForm] = useState<GeneralForm>(EMPTY)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const [nameError, setNameError] = useState('')
  const [alertError, setAlertError] = useState('')
  const [generalError, setGeneralError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = useCallback(<K extends keyof GeneralForm>(key: K, value: GeneralForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  /** Functional update (on-screen keyboard keystrokes arrive faster than renders). */
  const patch = useCallback((fn: (prev: GeneralForm) => Partial<GeneralForm>) => {
    setForm((prev) => ({ ...prev, ...fn(prev) }))
  }, [])

  const load = useCallback((settings: Record<string, string>) => {
    const loaded: GeneralForm = {
      name: settings.restaurant_name || '',
      phone: settings.restaurant_phone || '',
      phone2: settings.restaurant_phone2 || '',
      address: settings.restaurant_address || '',
      socialMedia: parseSocialMedia(settings.social_media),
      currency: settings.currency || 'DZD',
      currencySymbol: settings.currency_symbol || DEFAULT_CURRENCY_SYMBOL,
      lang: settings.language || 'en',
      // Clamp on read: 0/negative/garbage made every order show as late.
      orderAlertMinutes: String(orderAlertMinutesOrDefault(settings.order_alert_minutes)),
      inputModeLocal: settings.input_mode || 'keyboard'
    }
    setForm(loaded)
    setSavedSnapshot(JSON.stringify(loaded))
  }, [])

  const isDirty = savedSnapshot !== null && JSON.stringify(form) !== savedSnapshot

  const changeCurrency = (value: string) => {
    const curr = CURRENCIES.find((c) => c.value === value)
    setForm((prev) => ({ ...prev, currency: value, currencySymbol: curr?.symbol || value }))
  }

  /** Validate + save. Returns false (and shows why) when nothing was saved. */
  const save = async (): Promise<boolean> => {
    setGeneralError('')
    const trimmedName = form.name.trim()
    const minutesText = form.orderAlertMinutes.trim()
    const minutes = Number(minutesText)
    const nameErr = trimmedName ? '' : t('settings.restaurantNameRequired')
    const alertErr =
      /^\d+$/.test(minutesText) && minutes >= 1 && minutes <= MAX_ORDER_ALERT_MINUTES
        ? ''
        : t('settings.orderAlertInvalid', { max: MAX_ORDER_ALERT_MINUTES })
    setNameError(nameErr)
    setAlertError(alertErr)
    if (nameErr || alertErr) return false

    // Contract C4: never store an empty currency symbol.
    const symbol =
      form.currencySymbol.trim() ||
      CURRENCIES.find((c) => c.value === form.currency)?.symbol ||
      DEFAULT_CURRENCY_SYMBOL
    const socialJson = serializeSocialMedia(form.socialMedia)
    const next: GeneralForm = {
      ...form,
      name: trimmedName,
      socialMedia: parseSocialMedia(socialJson),
      currencySymbol: symbol,
      orderAlertMinutes: String(minutes)
    }
    setSaving(true)
    try {
      // logo_path is NOT written here: the main process owns logo storage (contract C1).
      await window.api.settings.setMultiple({
        restaurant_name: next.name,
        restaurant_phone: next.phone,
        restaurant_phone2: next.phone2,
        restaurant_address: next.address,
        social_media: socialJson,
        currency: next.currency,
        currency_symbol: symbol,
        language: next.lang,
        order_alert_minutes: next.orderAlertMinutes,
        input_mode: next.inputModeLocal
      })
      setForm(next)
      setSavedSnapshot(JSON.stringify(next))
      setLanguage(next.lang)
      loadSettings()
      onSaved()
      return true
    } catch (err) {
      setGeneralError(t('settings.saveFailed', { error: ipcErrorMessage(err) }))
      return false
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    if (savedSnapshot) setForm(JSON.parse(savedSnapshot))
    setNameError('')
    setAlertError('')
    setGeneralError('')
  }

  return {
    form,
    set,
    patch,
    load,
    save,
    discard,
    isDirty,
    saving,
    changeCurrency,
    nameError,
    alertError,
    generalError
  }
}

export type GeneralSettings = ReturnType<typeof useGeneralSettings>
