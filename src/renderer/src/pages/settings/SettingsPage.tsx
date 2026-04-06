import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Printer, AlertCircle, RefreshCw, LogOut, Upload, Image, ShieldCheck, ShieldX, Clock, Copy, Plus, X, Palette } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'

const currencies = [
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

const SOCIAL_PLATFORM_SVGS: Record<string, string> = {
  facebook: '<svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  instagram: '<svg width="16" height="16" viewBox="0 0 24 24" fill="#E4405F"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
  snapchat: '<svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFC00"><path d="M12.017.001c3.3.02 5.3 1.836 6.3 3.9.5 1.1.7 2.3.7 4.6 0 .5 0 1.1-.1 1.6.3.1.7.2 1.1.2.3 0 .6-.1.8-.2.2-.1.3-.1.5-.1.4 0 .8.2 1 .5.3.4.2.8-.1 1.2-.5.6-1.3.9-2.3 1.1 0 .1-.1.3-.1.5 0 .2.1.3.1.5 1.3 2.2 3 3.5 4.5 3.9.3.1.5.2.5.5 0 .3-.1.5-.3.7-.8.6-2 .9-3.3 1-.1.3-.2.6-.4.9-.2.3-.4.4-.7.4h-.1c-.3 0-.7-.1-1.2-.2-.6-.2-1.3-.3-2.2-.3-.3 0-.7 0-1 .1-.8.2-1.5.8-2.3 1.5-.9.8-1.8 1.2-2.8 1.2s-2-.4-2.8-1.2c-.8-.7-1.5-1.3-2.3-1.5-.3-.1-.7-.1-1-.1-.9 0-1.6.1-2.2.3-.5.2-.9.2-1.2.2h-.1c-.3 0-.5-.1-.7-.4-.2-.3-.3-.6-.4-.9-1.3-.1-2.5-.4-3.3-1-.2-.2-.3-.4-.3-.7 0-.3.2-.4.5-.5 1.5-.4 3.2-1.7 4.5-3.9 0-.2.1-.3.1-.5 0-.2-.1-.4-.1-.5-1-.2-1.8-.5-2.3-1.1-.3-.4-.4-.8-.1-1.2.2-.3.6-.5 1-.5.2 0 .3 0 .5.1.2.1.5.2.8.2.4 0 .8-.1 1.1-.2-.1-.5-.1-1.1-.1-1.6 0-2.3.2-3.5.7-4.6 1-2.064 3-3.88 6.3-3.9h.334z"/></svg>',
  tiktok: '<svg width="16" height="16" viewBox="0 0 24 24" fill="#ff0050"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.53v-3.4a4.85 4.85 0 01-.81-.14z"/></svg>',
  twitter: '<svg width="16" height="16" viewBox="0 0 24 24" fill="#000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  youtube: '<svg width="16" height="16" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
  whatsapp: '<svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
  threads: '<svg width="16" height="16" viewBox="0 0 24 24" fill="#000"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.199.408-2.3 1.332-3.1.855-.74 2.05-1.218 3.394-1.218h.039c.768.004 1.46.115 2.06.33.154-.89.228-1.868.196-2.938l2.09-.058c.045 1.399-.074 2.675-.354 3.818 1.04.648 1.839 1.534 2.315 2.63.784 1.807.726 4.448-1.327 6.526-1.814 1.836-4.07 2.63-7.317 2.578zm-.186-7.99c-1.035 0-2.416.418-2.53 1.726.044.476.328.895.8 1.18.536.325 1.264.479 2.05.44 1.053-.058 1.864-.44 2.413-1.122.387-.483.667-1.14.82-1.96-.576-.168-1.208-.259-1.553-.264z"/></svg>',
  telegram: '<svg width="16" height="16" viewBox="0 0 24 24" fill="#0088CC"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>'
}

export function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setLanguage, setSetupComplete, setActivated, loadSettings, inputMode, activationType, trialStatus, trialExpiresAt } = useAppStore()
  const isTouch = inputMode === 'touchscreen'
  const [tab, setTab] = useState<'general' | 'schedule' | 'printer' | 'telegram' | 'tablet' | 'display' | 'security'>('general')
  const [saved, setSaved] = useState(false)

  // General
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [phone2, setPhone2] = useState('')
  const [address, setAddress] = useState('')
  const [socialMedia, setSocialMedia] = useState<{ platform: string; handle: string }[]>([])
  const [currency, setCurrency] = useState('DZD')
  const [currencySymbol, setCurrencySymbol] = useState('DA')
  const [lang, setLang] = useState('en')
  const [orderAlertMinutes, setOrderAlertMinutes] = useState('20')
  const [inputModeLocal, setInputModeLocal] = useState('keyboard')
  const [logoPath, setLogoPath] = useState('')

  // Schedule
  const [schedule, setSchedule] = useState<any[]>([])

  // Printer
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean }[]>([])
  const [printerName, setPrinterName] = useState('')
  const [kitchenPrinterName, setKitchenPrinterName] = useState('')
  const [paperWidth, setPaperWidth] = useState('80')
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false)
  const [autoPrintKitchen, setAutoPrintKitchen] = useState(false)
  const [receiptFontSize, setReceiptFontSize] = useState('medium')
  const [kitchenFontSize, setKitchenFontSize] = useState('large')
  const [splitKitchenTickets, setSplitKitchenTickets] = useState(true)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [testingPrint, setTestingPrint] = useState(false)
  const [workers, setWorkers] = useState<any[]>([])
  const [workerPrinters, setWorkerPrinters] = useState<Record<number, string>>({})

  // New printer config system
  interface PrinterConfig {
    id: string
    printerName: string
    tasks: string[] // 'receipt', 'kitchen_all', 'worker_<id>'
    autoPrint: boolean
    paperWidth: string
    receiptFontSize: string
    kitchenFontSize: string
  }
  const [printerConfigs, setPrinterConfigs] = useState<PrinterConfig[]>([])
  const [printerTestResults, setPrinterTestResults] = useState<Record<string, { success: boolean; error?: string }>>({})
  const [printerTestingIds, setPrinterTestingIds] = useState<Set<string>>(new Set())

  // Updates
  const [checking, setChecking] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<'none' | 'available' | 'upToDate' | null>(null)

  // Security
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [passError, setPassError] = useState('')
  const [autoLaunch, setAutoLaunch] = useState(true)

  // Logout
  const [logoutPassword, setLogoutPassword] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  // License
  const [licMachineId, setLicMachineId] = useState('')
  const [licCopied, setLicCopied] = useState(false)
  const [, setTimerTick] = useState(0)
  // Activate modal (for trial users who later purchase)
  const [activateModal, setActivateModal] = useState(false)
  const [activateCode, setActivateCode] = useState('')
  const [activateError, setActivateError] = useState('')
  const [activateLoading, setActivateLoading] = useState(false)

  // Virtual keyboard
  const [keyboardTarget, setKeyboardTarget] = useState<{ field: string; type: 'numeric' | 'text' } | null>(null)

  // Tablet server state
  const [tabletRunning, setTabletRunning] = useState(false)
  const [tabletUrl, setTabletUrl] = useState('')
  const [tabletQr, setTabletQr] = useState('')
  const [tabletAutoStart, setTabletAutoStart] = useState(true)
  const [tabletPinEnabled, setTabletPinEnabled] = useState(false)
  const [tabletPinModal, setTabletPinModal] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [tabletLoading, setTabletLoading] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)

  // Owner dashboard state
  const [ownerDashUrl, setOwnerDashUrl] = useState('')
  const [ownerDashQr, setOwnerDashQr] = useState('')
  const [ownerUrlCopied, setOwnerUrlCopied] = useState(false)

  // Display customization
  const [displayYoutubeUrl, setDisplayYoutubeUrl] = useState('')
  const [displayThemeColor, setDisplayThemeColor] = useState('#f97316')
  const [displayImages, setDisplayImages] = useState<string[]>([])
  const [customHex, setCustomHex] = useState('')
  const [gradientPreset, setGradientPreset] = useState(0)
  const [fontFamily, setFontFamily] = useState('Playfair Display')
  const [textColor, setTextColor] = useState('#ffffff')
  const [accentColor, setAccentColor] = useState('#f97316')
  const [displayTextScale, setDisplayTextScale] = useState<'small' | 'medium' | 'large'>('medium')
  const [displayShowMenu, setDisplayShowMenu] = useState(false)
  const [displayShowName, setDisplayShowName] = useState(true)
  const [displayLogoScale, setDisplayLogoScale] = useState(1)
  const [panelToggles, setPanelToggles] = useState({
    welcome: true, social: true, promos: true, slideshow: true, orders: true, menu: true
  })

  const getKeyboardValue = (): string => {
    if (!keyboardTarget) return ''
    switch (keyboardTarget.field) {
      case 'name': return name
      case 'phone': return phone
      case 'phone2': return phone2
      case 'address': return address
      case 'currencySymbol': return currencySymbol
      case 'currentPass': return currentPass
      case 'newPass': return newPass
      case 'confirmPass': return confirmPass
      case 'logoutPassword': return logoutPassword
      default: return ''
    }
  }

  const handleKeyboardChange = (val: string) => {
    if (!keyboardTarget) return
    switch (keyboardTarget.field) {
      case 'name': setName(val); break
      case 'phone': setPhone(val); break
      case 'phone2': setPhone2(val); break
      case 'address': setAddress(val); break
      case 'currencySymbol': setCurrencySymbol(val); break
      case 'currentPass': setCurrentPass(val.replace(/\D/g, '')); break
      case 'newPass': setNewPass(val.replace(/\D/g, '')); break
      case 'confirmPass': setConfirmPass(val.replace(/\D/g, '')); break
      case 'logoutPassword': setLogoutPassword(val.replace(/\D/g, '')); setLogoutError(''); break
    }
  }

  useEffect(() => {
    loadCurrentSettings()
    // Tick every second so the trial countdown stays live
    const timerInterval = setInterval(() => setTimerTick((n) => n + 1), 1000)
    return () => clearInterval(timerInterval)
  }, [])

  const loadCurrentSettings = async () => {
    const settings = await window.api.settings.getAll()
    setName(settings.restaurant_name || '')
    setPhone(settings.restaurant_phone || '')
    setPhone2(settings.restaurant_phone2 || '')
    setAddress(settings.restaurant_address || '')
    try { const sm = settings.social_media; if (sm) setSocialMedia(JSON.parse(sm)) } catch { /* ignore */ }
    setCurrency(settings.currency || 'DZD')
    setCurrencySymbol(settings.currency_symbol || 'DA')
    setLang(settings.language || 'en')
    setOrderAlertMinutes(settings.order_alert_minutes || '20')
    setInputModeLocal(settings.input_mode || 'keyboard')
    setLogoPath(settings.logo_path || '')
    setPrinterName(settings.printer_name || '')
    setKitchenPrinterName(settings.kitchen_printer_name || settings.printer_name || '')
    setPaperWidth(settings.printer_width || '80')
    setAutoPrintReceipt(settings.auto_print_receipt === 'true')
    setAutoPrintKitchen(settings.auto_print_kitchen === 'true')
    setReceiptFontSize(settings.receipt_font_size || 'medium')
    setKitchenFontSize(settings.kitchen_font_size || 'large')
    setSplitKitchenTickets(settings.split_kitchen_tickets !== 'false')

    const sched = await window.api.settings.getSchedule()
    setSchedule(sched)

    const printerList = await window.api.printer.getPrinters()
    setPrinters(printerList)

    // Load workers for printer assignment
    try {
      const workersList = await window.api.workers.getAll()
      setWorkers(workersList)

      const assignments: Record<number, string> = {}
      for (const worker of workersList) {
        if (worker.printer_name) {
          assignments[worker.id] = worker.printer_name
        }
      }
      setWorkerPrinters(assignments)
    } catch {
      setWorkers([])
    }

    // Load printer assignments into new config format
    try {
      const dbAssignments = await window.api.printer.getAssignments()
      // Group by printer_name
      const configMap = new Map<string, PrinterConfig>()
      for (const a of dbAssignments) {
        if (!configMap.has(a.printer_name)) {
          configMap.set(a.printer_name, {
            id: crypto.randomUUID(),
            printerName: a.printer_name,
            tasks: [],
            autoPrint: !!a.auto_print,
            paperWidth: a.paper_width || '80',
            receiptFontSize: a.receipt_font_size || 'medium',
            kitchenFontSize: a.kitchen_font_size || 'large'
          })
        }
        const config = configMap.get(a.printer_name)!
        if (a.assignment_type === 'worker' && a.worker_id) {
          config.tasks.push(`worker_${a.worker_id}`)
        } else if (a.assignment_type !== 'default') {
          config.tasks.push(a.assignment_type)
        }
        // Use auto_print from any row for this printer (they should all be the same)
        if (a.auto_print) config.autoPrint = true
      }
      setPrinterConfigs(Array.from(configMap.values()))
    } catch {
      // Printer assignments might not exist yet
    }

    // Load auto-launch setting
    const autoLaunchEnabled = await window.api.settings.getAutoLaunch()
    setAutoLaunch(autoLaunchEnabled)

    // Load machine ID for license display
    const mid = await window.api.activation.getMachineId()
    setLicMachineId(mid)

    // Load tablet server status
    const tabletStatus = await window.api.tablet.status()
    setTabletRunning(tabletStatus.running)
    setTabletUrl(tabletStatus.url || '')
    setTabletQr(tabletStatus.qrDataUrl || '')
    setTabletAutoStart(settings.tablet_server_auto_start !== '0')
    setTabletPinEnabled(settings.tablet_pin_enabled === '1')

    // Load owner dashboard QR
    try {
      const ownerData = await window.api.tablet.getOwnerDashboard()
      setOwnerDashUrl(ownerData.url)
      setOwnerDashQr(ownerData.qrDataUrl)
    } catch { /* ignore */ }

    // Display customization
    setDisplayYoutubeUrl(settings.display_youtube_url || '')
    setDisplayThemeColor(settings.display_theme_color || '#f97316')
    setGradientPreset(parseInt(settings.display_gradient_preset || '0'))
    setFontFamily(settings.display_font_family || 'Playfair Display')
    setTextColor(settings.display_text_color || '#ffffff')
    setAccentColor(settings.display_accent_color || '#f97316')
    setDisplayTextScale((settings.display_text_scale as 'small' | 'medium' | 'large') || 'medium')
    setDisplayShowMenu(settings.display_show_menu === 'true')
    setDisplayShowName(settings.display_show_name !== 'false')
    setDisplayLogoScale(parseFloat(settings.display_logo_scale || '1'))
    if (!settings.display_youtube_url) {
      setDisplayYoutubeUrl('https://www.youtube.com/watch?v=LokYdcG00AE&list=RDLokYdcG00AE&start_radio=1')
    }
    setPanelToggles({
      welcome: settings.display_panel_welcome !== 'false',
      social: settings.display_panel_social !== 'false',
      promos: settings.display_panel_promos !== 'false',
      slideshow: settings.display_panel_slideshow !== 'false',
      orders: settings.display_panel_orders !== 'false',
      menu: settings.display_panel_menu !== 'false'
    })
    try {
      const imgs = await window.api.tablet.getDisplayImages()
      setDisplayImages(imgs || [])
    } catch { /* ignore */ }
  }

  const saveGeneral = async () => {
    await window.api.settings.setMultiple({
      restaurant_name: name,
      restaurant_phone: phone,
      restaurant_phone2: phone2,
      restaurant_address: address,
      social_media: JSON.stringify(socialMedia),
      currency,
      currency_symbol: currencySymbol,
      language: lang,
      order_alert_minutes: orderAlertMinutes,
      input_mode: inputModeLocal,
      logo_path: logoPath
    })
    setLanguage(lang)
    loadSettings()
    flashSaved()
  }

  const handleUploadLogo = async () => {
    const path = await window.api.settings.uploadLogo()
    if (path) {
      setLogoPath(path)
    }
  }

  const saveSchedule = async () => {
    await window.api.settings.setSchedule(schedule)
    flashSaved()
  }

  const savePrinter = async () => {
    await window.api.printer.saveFullConfig({
      assignments: printerConfigs.map(c => ({
        printerName: c.printerName,
        tasks: c.tasks,
        autoPrint: c.autoPrint,
        paperWidth: c.paperWidth,
        receiptFontSize: c.receiptFontSize,
        kitchenFontSize: c.kitchenFontSize
      }))
    })

    flashSaved()
  }

  // New printer config helpers
  const addPrinterConfig = () => {
    setPrinterConfigs(prev => [...prev, {
      id: crypto.randomUUID(),
      printerName: '',
      tasks: [],
      autoPrint: false,
      paperWidth: '80',
      receiptFontSize: 'medium',
      kitchenFontSize: 'large'
    }])
  }

  const removePrinterConfig = (id: string) => {
    setPrinterConfigs(prev => prev.filter(p => p.id !== id))
  }

  const updatePrinterConfig = (id: string, updates: Partial<PrinterConfig>) => {
    setPrinterConfigs(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  const toggleTask = (configId: string, task: string) => {
    setPrinterConfigs(prev => prev.map(p => {
      if (p.id !== configId) return p
      const tasks = p.tasks.includes(task)
        ? p.tasks.filter(t => t !== task)
        : [...p.tasks, task]
      return { ...p, tasks }
    }))
  }

  const handleTestPrintForPrinter = async (configId: string, printerName: string) => {
    if (!printerName) return
    setPrinterTestingIds(prev => new Set(prev).add(configId))
    try {
      const result = await window.api.printer.testPrintOnPrinter(printerName)
      setPrinterTestResults(prev => ({ ...prev, [configId]: result }))
    } catch {
      setPrinterTestResults(prev => ({ ...prev, [configId]: { success: false, error: 'Test failed' } }))
    }
    setPrinterTestingIds(prev => {
      const next = new Set(prev)
      next.delete(configId)
      return next
    })
  }

  // Available tasks for printer assignment
  const getAvailableTasks = () => {
    const tasks: { value: string; label: string }[] = [
      { value: 'receipt', label: 'Customer Receipt' },
      { value: 'kitchen_all', label: 'Kitchen Ticket (All Items)' }
    ]
    for (const worker of workers) {
      tasks.push({ value: `worker_${worker.id}`, label: `Kitchen: ${worker.name}` })
    }
    return tasks
  }

  const handleWorkerPrinterChange = (workerId: number, printerName: string) => {
    setWorkerPrinters(prev => ({
      ...prev,
      [workerId]: printerName || undefined
    }))
  }

  const handleTestPrint = async () => {
    setTestingPrint(true)
    setTestResult(null)
    // Save first so the test uses latest settings
    await window.api.settings.setMultiple({
      printer_name: printerName,
      printer_width: paperWidth
    })
    const result = await window.api.printer.testPrint()
    setTestResult(result)
    setTestingPrint(false)
  }

  const handleAutoLaunchToggle = async (enabled: boolean) => {
    setAutoLaunch(enabled)
    await window.api.settings.setAutoLaunch(enabled)
    await window.api.settings.set('auto_launch', enabled ? 'true' : 'false')
    flashSaved()
  }

  const changePassword = async () => {
    setPassError('')
    if (newPass.length < 4) {
      setPassError(t('setup.password.tooShort'))
      return
    }
    if (newPass !== confirmPass) {
      setPassError(t('setup.password.mismatch'))
      return
    }
    const valid = await window.api.settings.verifyPassword(currentPass)
    if (!valid) {
      setPassError('Current password is incorrect')
      return
    }
    const hash = await window.api.settings.hashPassword(newPass)
    await window.api.settings.set('admin_password_hash', hash)
    setCurrentPass('')
    setNewPass('')
    setConfirmPass('')
    flashSaved()
  }

  const handleLogout = async () => {
    if (!logoutPassword.trim()) return
    setLoggingOut(true)
    setLogoutError('')
    try {
      const valid = await window.api.settings.verifyPassword(logoutPassword)
      if (!valid) {
        setLogoutError(t('nav.wrongPassword'))
        setLoggingOut(false)
        return
      }
      // Factory reset: backup + wipe entire database, then go to activation
      await window.api.settings.resetAll()
      setSetupComplete(false)
      setActivated(false)
      navigate('/activation')
    } catch {
      setLogoutError(t('nav.wrongPassword'))
    } finally {
      setLoggingOut(false)
    }
  }

  const checkForUpdates = async () => {
    setChecking(true)
    setUpdateStatus(null)
    try {
      const result = await window.api.updater.check()
      setUpdateStatus(result.hasUpdate ? 'available' : 'upToDate')
    } catch {
      setUpdateStatus('upToDate')
    } finally {
      setChecking(false)
    }
  }

  const flashSaved = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateScheduleDay = (index: number, field: string, value: string | null) => {
    const updated = [...schedule]
    updated[index] = { ...updated[index], [field]: value }
    setSchedule(updated)
  }

  const handleCurrencyChange = (value: string) => {
    const curr = currencies.find((c) => c.value === value)
    setCurrency(value)
    setCurrencySymbol(curr?.symbol || value)
  }

  const getTrialTimeLeft = (): string => {
    if (!trialExpiresAt) return ''
    const msLeft = trialExpiresAt.getTime() - Date.now()
    if (msLeft <= 0) return 'Expired'
    const days = Math.floor(msLeft / (1000 * 60 * 60 * 24))
    const hours = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const mins = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60))
    const secs = Math.floor((msLeft % (1000 * 60)) / 1000)
    if (days > 0) return `${days}d ${hours}h ${mins}m ${secs}s remaining`
    if (hours > 0) return `${hours}h ${mins}m ${secs}s remaining`
    return `${mins}m ${secs}s remaining`
  }

  const handleCopyLicMachineId = () => {
    navigator.clipboard.writeText(licMachineId)
    setLicCopied(true)
    setTimeout(() => setLicCopied(false), 2000)
  }

  const formatActivateCode = (value: string) => {
    const clean = value.replace(/[^A-Fa-f0-9-]/g, '').toUpperCase().replace(/-/g, '')
    const parts: string[] = []
    for (let i = 0; i < clean.length && i < 20; i += 5) parts.push(clean.slice(i, i + 5))
    return parts.join('-')
  }

  const handleActivateSerial = async () => {
    setActivateError('')
    setActivateLoading(true)
    try {
      const result = await window.api.activation.activate(activateCode)
      if (result.success) {
        setActivateModal(false)
        window.location.reload()
      } else {
        setActivateError('Invalid activation code for this machine.')
      }
    } catch {
      setActivateError('Activation failed. Try again.')
    } finally {
      setActivateLoading(false)
    }
  }

  const handleTabletToggle = async () => {
    setTabletLoading(true)
    if (tabletRunning) {
      await window.api.tablet.stop()
      setTabletRunning(false)
      setTabletUrl('')
      setTabletQr('')
    } else {
      const result = await window.api.tablet.start()
      if (result.ok) {
        setTabletRunning(true)
        setTabletUrl(result.url)
        setTabletQr(result.qrDataUrl)
      }
    }
    setTabletLoading(false)
  }

  const handleTabletAutoStart = async (enabled: boolean) => {
    setTabletAutoStart(enabled)
    await window.api.tablet.setAutoStart(enabled)
  }

  const handleTabletPinEnabled = async (enabled: boolean) => {
    setTabletPinEnabled(enabled)
    await window.api.tablet.setPinEnabled(enabled)
  }

  const handleSavePin = async () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) { setPinError('Le PIN doit être 4 chiffres.'); return }
    if (newPin !== confirmPin) { setPinError('Les PINs ne correspondent pas.'); return }
    const result = await window.api.tablet.setPin(newPin)
    if (result.ok) {
      setTabletPinModal(false)
      setNewPin('')
      setConfirmPin('')
      setPinError('')
    } else {
      setPinError(result.error || 'Erreur')
    }
  }

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(tabletUrl)
    setUrlCopied(true)
    setTimeout(() => setUrlCopied(false), 2000)
  }

  const tabs = [
    { key: 'general' as const, label: t('settings.general') },
    { key: 'schedule' as const, label: t('settings.schedule') },
    { key: 'printer' as const, label: t('settings.printer') },
    { key: 'telegram' as const, label: 'Owner Dashboard' },
    { key: 'tablet' as const, label: t('settings.remoteOrders') },
    { key: 'display' as const, label: 'Ambiance Screen' },
    { key: 'security' as const, label: t('settings.security') }
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
        {saved && (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <Check className="h-4 w-4" />
            {t('settings.saved')}
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => { setTab(tb.key); setKeyboardTarget(null) }}
            className={`${isTouch ? 'px-5 py-3 text-base' : 'px-4 py-2 text-sm'} rounded-lg font-medium ${
              tab === tb.key ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <Card>
          <div className="space-y-4 max-w-xl">
            {/* Logo Upload */}
            <div className="flex flex-col items-center pb-4 mb-4 border-b border-gray-200">
              <div
                className="w-32 h-32 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center mb-3 overflow-hidden cursor-pointer hover:border-orange-400 transition-colors"
                onClick={handleUploadLogo}
              >
                {logoPath ? (
                  <img
                    src={`file:///${logoPath.replace(/\\/g, '/')}`}
                    alt="Logo"
                    className="w-full h-full object-contain p-2"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.src = `app-image://${logoPath}`;
                    }}
                  />
                ) : (
                  <Image className="h-8 w-8 text-gray-400" />
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={handleUploadLogo}>
                <Upload className="h-4 w-4" />
                {logoPath ? t('setup.restaurant.changeLogo') : t('setup.restaurant.uploadLogo')}
              </Button>
              <p className="text-xs text-gray-400 mt-1">{t('setup.restaurant.logoOptional', { defaultValue: 'Optional — displayed on receipts' })}</p>
            </div>

            <Input label={t('setup.restaurant.name')} value={name} readOnly={isTouch} onClick={isTouch ? () => setKeyboardTarget({ field: 'name', type: 'text' }) : undefined} onChange={isTouch ? undefined : (e) => setName(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('setup.restaurant.phone')} value={phone} readOnly={isTouch} onClick={isTouch ? () => setKeyboardTarget({ field: 'phone', type: 'numeric' }) : undefined} onChange={isTouch ? undefined : (e) => setPhone(e.target.value)} />
              <Input label={t('setup.restaurant.phone2')} value={phone2} readOnly={isTouch} onClick={isTouch ? () => setKeyboardTarget({ field: 'phone2', type: 'numeric' }) : undefined} onChange={isTouch ? undefined : (e) => setPhone2(e.target.value)} />
            </div>
            <Input
              label={t('setup.restaurant.address')}
              value={address}
              readOnly={isTouch}
              onClick={isTouch ? () => setKeyboardTarget({ field: 'address', type: 'text' }) : undefined}
              onChange={isTouch ? undefined : (e) => setAddress(e.target.value)}
              placeholder={t('setup.restaurant.addressPlaceholder')}
            />
            {/* Social Media */}
            <div className="pt-3 border-t">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Social Media</label>
                <button
                  onClick={() => setSocialMedia([...socialMedia, { platform: 'instagram', handle: '' }])}
                  className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium"
                >
                  + Add Platform
                </button>
              </div>
              {socialMedia.length === 0 ? (
                <p className="text-xs text-gray-400">No social media added. Add your accounts to show on receipts and ambiance screen.</p>
              ) : (
                <div className="space-y-2">
                  {socialMedia.map((sm, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50 border border-gray-200" dangerouslySetInnerHTML={{ __html: SOCIAL_PLATFORM_SVGS[sm.platform] || '' }} />
                      <select
                        value={sm.platform}
                        onChange={(e) => {
                          const updated = [...socialMedia]
                          updated[i] = { ...updated[i], platform: e.target.value }
                          setSocialMedia(updated)
                        }}
                        className="w-36 border rounded-lg px-2 py-1.5 text-sm"
                      >
                        <option value="facebook">Facebook</option>
                        <option value="instagram">Instagram</option>
                        <option value="snapchat">Snapchat</option>
                        <option value="tiktok">TikTok</option>
                        <option value="twitter">X / Twitter</option>
                        <option value="youtube">YouTube</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="threads">Threads</option>
                        <option value="telegram">Telegram</option>
                      </select>
                      <input
                        value={sm.handle}
                        onChange={(e) => {
                          const updated = [...socialMedia]
                          updated[i] = { ...updated[i], handle: e.target.value }
                          setSocialMedia(updated)
                        }}
                        placeholder="@username or link"
                        className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <button
                        onClick={() => setSocialMedia(socialMedia.filter((_, idx) => idx !== i))}
                        className="p-1.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label={t('setup.restaurant.currency')}
                value={currency}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                options={currencies.map((c) => ({ value: c.value, label: c.label }))}
              />
              <Input label={t('setup.restaurant.currencySymbol')} value={currencySymbol} readOnly={isTouch} onClick={isTouch ? () => setKeyboardTarget({ field: 'currencySymbol', type: 'text' }) : undefined} onChange={isTouch ? undefined : (e) => setCurrencySymbol(e.target.value)} />
            </div>
            <Select
              label={t('setup.language.title')}
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              options={[
                { value: 'en', label: 'English' },
                { value: 'ar', label: 'العربية' },
                { value: 'fr', label: 'Français' }
              ]}
            />
            {isTouch ? (
              /* Touch mode: quick-pick preset minutes */
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.orderAlertMinutes', { defaultValue: 'Order Alert Time (minutes)' })}
                </label>
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 15, 20, 25, 30, 45, 60, 90, 120].map((min) => (
                    <button
                      key={min}
                      onClick={() => setOrderAlertMinutes(String(min))}
                      className={`px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        orderAlertMinutes === String(min)
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-gray-100 text-gray-700 border-gray-200 hover:border-orange-300'
                      }`}
                    >
                      {min} min
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {t('settings.orderAlertHelp', { defaultValue: 'Orders older than this will be highlighted in red' })}
                </p>
              </div>
            ) : (
              <Input
                label={t('settings.orderAlertMinutes', { defaultValue: 'Order Alert Time (minutes)' })}
                type="number"
                min="1"
                max="120"
                value={orderAlertMinutes}
                onChange={(e) => setOrderAlertMinutes(e.target.value)}
                placeholder="20"
                helperText={t('settings.orderAlertHelp', { defaultValue: 'Orders older than this will be highlighted in red' })}
              />
            )}
            {/* Input Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('settings.inputMode', { defaultValue: 'Input Mode' })}
              </label>
              <div className="flex gap-2">
                {(['keyboard', 'touchscreen'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setInputModeLocal(mode)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors border-2 ${
                      inputModeLocal === mode
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {mode === 'keyboard' ? 'Keyboard & Mouse' : 'Touchscreen'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {t('settings.inputModeHelp', { defaultValue: 'Touchscreen mode uses larger buttons and a built-in keyboard' })}
              </p>
            </div>

            <Button onClick={saveGeneral}>{t('common.save')}</Button>

            {/* Check for Updates */}
            <div className="pt-4 mt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">{t('settings.updates')}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t('settings.currentVersion', { version: APP_VERSION })}
                  </p>
                </div>
                <button
                  onClick={checkForUpdates}
                  disabled={checking}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
                  {t('settings.checkUpdates')}
                </button>
              </div>
              {updateStatus === 'upToDate' && (
                <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" />
                  {t('settings.upToDate')}
                </p>
              )}
              {updateStatus === 'available' && (
                <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {t('update.availableTitle')}
                </p>
              )}
            </div>

            {/* License Status */}
            <div className="pt-4 mt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-900 mb-3">License</h4>

              {activationType === 'full' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
                  <ShieldCheck className="h-5 w-5 text-green-600 shrink-0" />
                  <span className="text-sm font-medium text-green-700">Full License — Activated</span>
                </div>
              )}

              {activationType === 'trial' && (trialStatus === 'active' || trialStatus === 'offline-locked') && (
                <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-lg border border-orange-200">
                  <Clock className="h-5 w-5 text-orange-500 shrink-0" />
                  <span className="text-sm font-medium text-orange-700 flex-1">
                    Free Trial — {getTrialTimeLeft()}
                  </span>
                </div>
              )}

              {activationType === 'trial' && (trialStatus === 'expired' || trialStatus === 'paused') && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
                  <ShieldX className="h-5 w-5 text-red-500 shrink-0" />
                  <span className="text-sm font-medium text-red-700">
                    {trialStatus === 'paused' ? 'Trial Paused' : 'Trial Expired'}
                  </span>
                </div>
              )}

              {/* Activate button — visible when not on full license */}
              {activationType !== 'full' && (
                <button
                  onClick={() => { setActivateModal(true); setActivateCode(''); setActivateError('') }}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Activate Software
                </button>
              )}

              {licMachineId && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Machine ID</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 select-all text-gray-700 truncate">
                      {licMachineId}
                    </div>
                    <button
                      onClick={handleCopyLicMachineId}
                      className="shrink-0 p-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                      title="Copy machine ID"
                    >
                      {licCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-500" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Activate modal */}
            {activateModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Activate Software</h3>
                  <p className="text-xs text-gray-500 mb-4">Enter the serial code for this machine ID: <span className="font-mono">{licMachineId}</span></p>
                  <input
                    type="text"
                    value={activateCode}
                    onChange={(e) => setActivateCode(formatActivateCode(e.target.value))}
                    placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                    className="w-full border rounded-lg px-3 py-2.5 font-mono text-sm tracking-wider text-center uppercase focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none mb-3"
                    maxLength={23}
                    autoFocus
                  />
                  {activateError && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{activateError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActivateModal(false)}
                      className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleActivateSerial}
                      disabled={activateCode.length < 23 || activateLoading}
                      className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                      {activateLoading ? '...' : 'Activate'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {tab === 'schedule' && (
        <Card>
          <div className="space-y-3">
            {schedule.map((day, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="w-28 font-medium text-sm">{t(`days.${day.day_of_week}`)}</div>
                <select
                  value={day.status}
                  onChange={(e) => updateScheduleDay(i, 'status', e.target.value)}
                  className="border rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="full">{t('setup.schedule.fullDay')}</option>
                  <option value="half">{t('setup.schedule.halfDay')}</option>
                  <option value="closed">{t('setup.schedule.closed')}</option>
                </select>
                {day.status !== 'closed' && (
                  <>
                    <input type="time" value={day.open_time || '08:00'} onChange={(e) => updateScheduleDay(i, 'open_time', e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
                    <span className="text-gray-400">-</span>
                    <input type="time" value={day.close_time || '23:00'} onChange={(e) => updateScheduleDay(i, 'close_time', e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
                  </>
                )}
              </div>
            ))}
            <Button onClick={saveSchedule} className="mt-4">{t('common.save')}</Button>
          </div>
        </Card>
      )}

      {tab === 'printer' && (
        <Card>
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-gray-600" />
                <h3 className="font-semibold">{t('settings.printer')}</h3>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => navigate('/admin/receipt-editor')}>
                  <Palette className="h-4 w-4" />
                  Receipt Editor
                </Button>
                <Button variant="secondary" size="sm" onClick={addPrinterConfig}>
                  <Plus className="h-4 w-4" />
                  Add Printer
                </Button>
              </div>
            </div>

            {printerConfigs.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                <Printer className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No printers configured</p>
                <p className="text-xs text-gray-400 mt-1">Click "Add Printer" to set up your first printer</p>
              </div>
            )}

            <div className="space-y-3">
              {printerConfigs.map((config, index) => (
                <div key={config.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                  {/* Printer selection + remove */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Printer {index + 1}</label>
                      <select
                        value={config.printerName}
                        onChange={(e) => updatePrinterConfig(config.id, { printerName: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">-- Select Printer --</option>
                        {printers.map(p => (
                          <option key={p.name} value={p.name}>
                            {p.name}{p.isDefault ? ' (Default)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => removePrinterConfig(config.id)}
                      className="mt-5 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove printer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Task toggles */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Print Tasks</label>
                    <div className="flex flex-wrap gap-2">
                      {getAvailableTasks().map(task => (
                        <button
                          key={task.value}
                          onClick={() => toggleTask(config.id, task.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                            config.tasks.includes(task.value)
                              ? 'bg-orange-100 text-orange-700 border-orange-300'
                              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {config.tasks.includes(task.value) ? '✓ ' : ''}{task.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Per-printer settings: paper width + font sizes */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t('settings.paperWidth')}</label>
                      <select
                        value={config.paperWidth}
                        onChange={(e) => updatePrinterConfig(config.id, { paperWidth: e.target.value })}
                        className="w-full border rounded-lg px-2 py-1.5 text-xs"
                      >
                        <option value="58">58mm</option>
                        <option value="80">80mm</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Receipt Font</label>
                      <select
                        value={config.receiptFontSize}
                        onChange={(e) => updatePrinterConfig(config.id, { receiptFontSize: e.target.value })}
                        className="w-full border rounded-lg px-2 py-1.5 text-xs"
                      >
                        <option value="small">{t('settings.fontSmall', { defaultValue: 'Small' })}</option>
                        <option value="medium">{t('settings.fontMedium', { defaultValue: 'Medium' })}</option>
                        <option value="large">{t('settings.fontLarge', { defaultValue: 'Large' })}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Kitchen Font</label>
                      <select
                        value={config.kitchenFontSize}
                        onChange={(e) => updatePrinterConfig(config.id, { kitchenFontSize: e.target.value })}
                        className="w-full border rounded-lg px-2 py-1.5 text-xs"
                      >
                        <option value="small">{t('settings.fontSmall', { defaultValue: 'Small' })}</option>
                        <option value="medium">{t('settings.fontMedium', { defaultValue: 'Medium' })}</option>
                        <option value="large">{t('settings.fontLarge', { defaultValue: 'Large' })}</option>
                      </select>
                    </div>
                  </div>

                  {/* Auto-print + Test row */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.autoPrint}
                        onChange={(e) => updatePrinterConfig(config.id, { autoPrint: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                      />
                      <span className="text-sm text-gray-600">Auto-print on new order</span>
                    </label>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleTestPrintForPrinter(config.id, config.printerName)}
                      loading={printerTestingIds.has(config.id)}
                      disabled={!config.printerName}
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Test
                    </Button>
                  </div>

                  {/* Test result */}
                  {printerTestResults[config.id] && (
                    <div className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                      printerTestResults[config.id].success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {printerTestResults[config.id].success ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      {printerTestResults[config.id].success ? 'Test print sent!' : printerTestResults[config.id].error || 'Print failed'}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Save button */}
            {printerConfigs.length > 0 && (
              <div className="flex gap-3 pt-2">
                <Button onClick={savePrinter}>{t('common.save')}</Button>
              </div>
            )}

            {printers.length === 0 && (
              <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <p className="text-sm text-orange-700">No printers detected on this system. Make sure your printer is connected and turned on.</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {tab === 'telegram' && (
        <Card>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-1">Owner Dashboard</h3>
              <p className="text-sm text-gray-500">Restaurant owner scans this QR code to access their live dashboard from any phone.</p>
              <p className="text-xs text-orange-600 mt-1 font-medium">The owner logs in with the admin password (set in Security tab).</p>
            </div>

            {ownerDashQr ? (
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <img src={ownerDashQr} alt="Owner Dashboard QR" className="w-48 h-48 rounded-lg border border-gray-200" />
                <div className="flex-1">
                  <p className="text-sm text-gray-500 mb-2">Dashboard URL:</p>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                    <span className="text-sm font-mono text-gray-800 flex-1 break-all">{ownerDashUrl}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(ownerDashUrl)
                        setOwnerUrlCopied(true)
                        setTimeout(() => setOwnerUrlCopied(false), 2000)
                      }}
                      className="flex-shrink-0 text-orange-500 hover:text-orange-600"
                      title="Copy link"
                    >
                      {ownerUrlCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">This link works from any device with internet access — no WiFi restriction.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <p className="text-sm text-orange-700">Start the tablet server (in Remote Orders tab) to generate the Owner Dashboard QR code.</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Virtual Keyboard for touchscreen mode */}
      {isTouch && keyboardTarget && (
        <VirtualKeyboard
          visible
          type={keyboardTarget.type}
          value={getKeyboardValue()}
          onChange={handleKeyboardChange}
          onClose={() => setKeyboardTarget(null)}
        />
      )}

      {tab === 'display' && (() => {
        const gradientPresets = [
          { name: 'Midnight', colors: ['#0f0c29', '#302b63', '#24243e'] },
          { name: 'Ocean', colors: ['#000428', '#004e92', '#000428'] },
          { name: 'Sunset', colors: ['#1a0a00', '#b33000', '#ff6a00'] },
          { name: 'Forest', colors: ['#0a1a0a', '#1b4332', '#2d6a4f'] },
          { name: 'Royal Purple', colors: ['#1a0033', '#4a0080', '#7b2ff7'] },
          { name: 'Cherry', colors: ['#1a0000', '#6b0020', '#c0003a'] },
          { name: 'Coffee', colors: ['#1a0f00', '#3e2723', '#6d4c41'] },
          { name: 'Arctic', colors: ['#0a1628', '#1a3a5c', '#2e6b8a'] },
          { name: 'Ember', colors: ['#1a0500', '#8b2500', '#d44500'] },
          { name: 'Teal Night', colors: ['#001a1a', '#004d4d', '#008080'] },
          { name: 'Gold', colors: ['#1a1400', '#4a3800', '#8b6914'] },
          { name: 'Rose', colors: ['#1a0010', '#4a0028', '#8b1460'] },
          { name: 'Storm', colors: ['#0d0d0d', '#2c2c2c', '#4a4a4a'] },
          { name: 'Warm Night', colors: ['#1a0a00', '#3d1c00', '#6b3a1f'] },
          { name: 'Pure Dark', colors: ['#000000', '#0a0a0a', '#111111'] },
          { name: 'Sunrise', colors: ['#fff1eb', '#ace0f9', '#ffd6a5'] },
          { name: 'Cotton Candy', colors: ['#fce4ec', '#e8eaf6', '#f3e5f5'] },
          { name: 'Fresh Mint', colors: ['#e8f5e9', '#b2dfdb', '#c8e6c9'] },
          { name: 'Peach Cream', colors: ['#fff3e0', '#ffe0b2', '#ffccbc'] },
          { name: 'Sky Blue', colors: ['#e3f2fd', '#bbdefb', '#b3e5fc'] }
        ]
        const fontOptions = ['Playfair Display', 'Inter', 'DM Serif Display', 'Cormorant Garamond', 'Montserrat', 'Raleway']
        const textColorOptions = [
          { color: '#ffffff', label: 'White' },
          { color: '#f0f0f0', label: 'Off-white' },
          { color: '#fff8e7', label: 'Warm white' },
          { color: '#d4d4d4', label: 'Light gray' },
          { color: '#ffd700', label: 'Gold' },
          { color: '#fffdd0', label: 'Cream' },
          { color: '#e0f7fa', label: 'Ice blue' },
          { color: '#fce4ec', label: 'Light pink' },
          { color: '#1a1a1a', label: 'Dark' },
          { color: '#2d2d2d', label: 'Charcoal' },
          { color: '#4a3728', label: 'Brown' }
        ]
        const accentColorOptions = [
          { color: '#f97316', label: 'Orange' },
          { color: '#3b82f6', label: 'Blue' },
          { color: '#22c55e', label: 'Green' },
          { color: '#ef4444', label: 'Red' },
          { color: '#a855f7', label: 'Purple' },
          { color: '#ec4899', label: 'Pink' },
          { color: '#eab308', label: 'Gold' },
          { color: '#14b8a6', label: 'Teal' },
          { color: '#06b6d4', label: 'Cyan' },
          { color: '#ffffff', label: 'White' }
        ]
        const currentGradient = gradientPresets[gradientPreset] || gradientPresets[0]
        const googleFontsUrl = 'https://fonts.googleapis.com/css2?family=' + fontOptions.map(f => f.replace(/ /g, '+')).join('&family=') + '&display=swap'

        return (
        <>
          <link href={googleFontsUrl} rel="stylesheet" />
          <style>{`
            @keyframes ambiance-gradient {
              0%, 100% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
            }
          `}</style>
          <div className="flex gap-6">
            {/* LEFT COLUMN - Settings (55%) */}
            <div className="w-[55%] space-y-5">
              <Card>
                <div className="space-y-5">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg">Ambiance Screen</h3>
                  </div>
                  <p className="text-sm text-gray-500">
                    A beautiful branded TV display for your restaurant wall.
                  </p>

                  {/* Server Status */}
                  {tabletRunning ? (
                    <div className="space-y-3">
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm font-medium text-green-800 mb-1">Display URL</p>
                        <p className="text-base font-mono text-green-700 break-all">
                          {tabletUrl.replace(/\/$/, '')}/display
                        </p>
                        <p className="text-xs text-green-600 mt-1">Open this URL in any browser on the same network</p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const url = tabletUrl.replace(/\/$/, '') + '/display'
                          navigator.clipboard.writeText(url)
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        Copy URL
                      </Button>
                    </div>
                  ) : (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        Start the Remote Orders server first to enable the customer display.
                      </p>
                      <Button variant="secondary" size="sm" className="mt-2" onClick={() => setTab('tablet')}>
                        Go to Remote Orders
                      </Button>
                    </div>
                  )}

                  {/* Gradient Background */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Background</h4>
                    <div className="grid grid-cols-5 gap-2">
                      {gradientPresets.map((preset, idx) => (
                        <button
                          key={idx}
                          title={preset.name}
                          onClick={async () => {
                            setGradientPreset(idx)
                            await window.api.settings.set('display_gradient_preset', String(idx))
                            flashSaved()
                          }}
                          className={`h-10 rounded-lg transition-all ${gradientPreset === idx ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-100 scale-105' : 'hover:scale-105'}`}
                          style={{
                            background: `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]}, ${preset.colors[2]})`,
                            animation: 'ambiance-gradient 4s ease infinite',
                            backgroundSize: '200% 200%'
                          }}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Selected: {currentGradient.name}
                    </p>
                  </div>

                  {/* Font */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Font</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {fontOptions.map((font) => (
                        <button
                          key={font}
                          onClick={async () => {
                            setFontFamily(font)
                            await window.api.settings.set('display_font_family', font)
                            flashSaved()
                          }}
                          className={`px-3 py-2 text-sm rounded-lg border-2 transition-all truncate ${fontFamily === font ? 'border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-300' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}
                          style={{ fontFamily: font }}
                        >
                          {font}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Text Color */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Text Color</h4>
                    <div className="flex flex-wrap gap-2">
                      {textColorOptions.map(({ color, label }) => (
                        <button
                          key={color}
                          title={label}
                          onClick={async () => {
                            setTextColor(color)
                            await window.api.settings.set('display_text_color', color)
                            flashSaved()
                          }}
                          className={`w-9 h-9 rounded-full border-2 transition-all ${textColor === color ? 'scale-110 ring-2 ring-offset-1 ring-gray-400 border-gray-600' : 'border-gray-300 hover:scale-105'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Accent Color */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Accent Color</h4>
                    <div className="flex flex-wrap gap-2">
                      {accentColorOptions.map(({ color, label }) => (
                        <button
                          key={color}
                          title={label}
                          onClick={async () => {
                            setAccentColor(color)
                            await window.api.settings.set('display_accent_color', color)
                            flashSaved()
                          }}
                          className={`w-9 h-9 rounded-full border-2 transition-all ${accentColor === color ? 'scale-110 ring-2 ring-offset-1 ring-gray-400 border-gray-800' : 'border-gray-300 hover:scale-105'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Text Size */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Text Size</h4>
                    <div className="flex gap-2">
                      {([
                        { value: 'small' as const, label: 'Small', scale: '0.8x' },
                        { value: 'medium' as const, label: 'Medium', scale: '1.0x' },
                        { value: 'large' as const, label: 'Large', scale: '1.3x' }
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          onClick={async () => {
                            setDisplayTextScale(opt.value)
                            await window.api.settings.set('display_text_scale', opt.value)
                            flashSaved()
                          }}
                          className={`flex-1 py-2 px-3 text-sm rounded-lg border-2 transition-all font-medium ${
                            displayTextScale === opt.value
                              ? 'border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-300'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          {opt.label} <span className="text-xs text-gray-400">({opt.scale})</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Controls the text size on the ambiance display</p>
                  </div>

                  {/* Show Menu Items */}
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700">Show Menu Items</h4>
                        <p className="text-xs text-gray-400 mt-0.5">Display a menu panel with item names and prices on the ambiance screen</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={displayShowMenu}
                          onChange={async (e) => {
                            setDisplayShowMenu(e.target.checked)
                            await window.api.settings.set('display_show_menu', e.target.checked ? 'true' : 'false')
                            flashSaved()
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500" />
                      </label>
                    </div>
                  </div>

                  {/* Show Restaurant Name */}
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700">Show Restaurant Name</h4>
                        <p className="text-xs text-gray-400 mt-0.5">Display the restaurant name on the welcome screen (logo still shows)</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={displayShowName}
                          onChange={async (e) => {
                            setDisplayShowName(e.target.checked)
                            await window.api.settings.set('display_show_name', e.target.checked ? 'true' : 'false')
                            flashSaved()
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500" />
                      </label>
                    </div>
                  </div>

                  {/* Logo Size */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Logo Size</h4>
                    <div className="flex gap-2">
                      {[{ label: '1x', value: 1 }, { label: '2x', value: 2 }, { label: '3x', value: 3 }].map(opt => (
                        <button
                          key={opt.value}
                          onClick={async () => {
                            setDisplayLogoScale(opt.value)
                            await window.api.settings.set('display_logo_scale', String(opt.value))
                            flashSaved()
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium ${displayLogoScale === opt.value ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                        >{opt.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Panel Toggles */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Active Panels</h4>
                    <p className="text-xs text-gray-400 mb-3">Choose which panels show on the TV. Disabled panels are skipped.</p>
                    <div className="space-y-2">
                      {[
                        { key: 'welcome', label: 'Welcome (Logo + Name)' },
                        { key: 'social', label: 'Social Media & Contact' },
                        { key: 'promos', label: 'Promotions & Packs' },
                        { key: 'slideshow', label: 'Image Slideshow' },
                        { key: 'orders', label: 'Orders Being Prepared' },
                        { key: 'menu', label: 'Menu Items' }
                      ].map(panel => (
                        <label key={panel.key} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(panelToggles as any)[panel.key]}
                            onChange={async (e) => {
                              const updated = { ...panelToggles, [panel.key]: e.target.checked }
                              setPanelToggles(updated)
                              await window.api.settings.set(`display_panel_${panel.key}`, e.target.checked ? 'true' : 'false')
                              flashSaved()
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                          />
                          <span className="text-sm text-gray-700">{panel.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Welcome Message Mode */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Welcome Message</h4>
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={async () => {
                          await window.api.settings.set('display_welcome_mode', 'animated')
                          flashSaved()
                        }}
                        className="px-3 py-1.5 text-sm rounded-lg bg-orange-100 text-orange-700 font-medium"
                      >
                        Animated (3 languages)
                      </button>
                      <button
                        onClick={async () => {
                          await window.api.settings.set('display_welcome_mode', 'static')
                          flashSaved()
                        }}
                        className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-600 font-medium"
                      >
                        Custom Text
                      </button>
                    </div>
                    <Input
                      placeholder="Custom welcome text..."
                      onChange={async (e) => {
                        await window.api.settings.set('display_welcome_text', e.target.value)
                      }}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-400 mt-1">If &quot;Animated&quot; is selected, welcome cycles through English, French, and Arabic automatically</p>
                  </div>

                  {/* YouTube Music URL */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Background Music (YouTube)</h4>
                    <p className="text-xs text-gray-400 mb-2">Paste a YouTube video or playlist URL. Audio plays in the background on the display.</p>
                    <div className="flex gap-2">
                      <Input
                        className="flex-1"
                        placeholder="https://www.youtube.com/watch?v=... or playlist URL"
                        value={displayYoutubeUrl}
                        onChange={(e) => setDisplayYoutubeUrl(e.target.value)}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          await window.api.settings.setMultiple({ display_youtube_url: displayYoutubeUrl })
                          flashSaved()
                        }}
                      >
                        Save
                      </Button>
                      {displayYoutubeUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            setDisplayYoutubeUrl('')
                            await window.api.settings.setMultiple({ display_youtube_url: '' })
                            flashSaved()
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Slideshow Images */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      <Image className="h-4 w-4 inline mr-1" />
                      Slideshow Images
                    </h4>
                    <p className="text-xs text-gray-400 mb-2">Upload food photos, restaurant images, etc. Max 10 images.</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={displayImages.length >= 10}
                      onClick={async () => {
                        const paths = await window.api.tablet.uploadDisplayImages()
                        if (paths) setDisplayImages(paths)
                      }}
                    >
                      <Upload className="h-4 w-4" />
                      Upload Images {displayImages.length > 0 && `(${displayImages.length}/10)`}
                    </Button>
                    {displayImages.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {displayImages.map((imgPath, idx) => (
                          <div key={idx} className="relative group">
                            <div className="w-20 h-20 rounded-lg border border-gray-200 overflow-hidden bg-gray-100">
                              <img
                                src={'file:///' + imgPath.replace(/\\/g, '/')}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                            </div>
                            <button
                              onClick={async () => {
                                const updated = await window.api.tablet.removeDisplayImage(imgPath)
                                setDisplayImages(updated || [])
                              }}
                              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* RIGHT COLUMN - Live Preview (45%) */}
            <div className="w-[45%]">
              <div className="sticky top-4">
                <h4 className="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wide">Live Preview</h4>
                <div
                  className="rounded-xl overflow-hidden shadow-2xl border border-gray-700"
                  style={{
                    aspectRatio: '16/9',
                    background: `linear-gradient(135deg, ${currentGradient.colors[0]}, ${currentGradient.colors[1]}, ${currentGradient.colors[2]})`,
                    backgroundSize: '200% 200%',
                    animation: 'ambiance-gradient 6s ease infinite',
                    position: 'relative'
                  }}
                >
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center" style={{ transform: `scale(${displayTextScale === 'small' ? 0.8 : displayTextScale === 'large' ? 1.3 : 1.0})`, transformOrigin: 'center center' }}>
                    {/* Restaurant name */}
                    <div
                      className="text-2xl font-bold mb-2 drop-shadow-lg"
                      style={{ fontFamily, color: textColor }}
                    >
                      {name || 'Restaurant Name'}
                    </div>
                    {/* Welcome text */}
                    <div
                      className="text-base font-medium drop-shadow-md"
                      style={{ fontFamily, color: accentColor }}
                    >
                      Welcome
                    </div>
                    {/* Menu indicator */}
                    {displayShowMenu && (
                      <div className="mt-3 text-xs px-3 py-1 rounded-full border" style={{ color: textColor, borderColor: textColor + '33', backgroundColor: textColor + '0a' }}>
                        Menu Panel Active
                      </div>
                    )}
                    {/* Thumbnail strip */}
                    {displayImages.length > 0 && (
                      <div className="flex gap-1 mt-4">
                        {displayImages.slice(0, 4).map((imgPath, idx) => (
                          <div key={idx} className="w-10 h-10 rounded overflow-hidden opacity-70">
                            <img
                              src={'file:///' + imgPath.replace(/\\/g, '/')}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          </div>
                        ))}
                        {displayImages.length > 4 && (
                          <div className="w-10 h-10 rounded bg-black/30 flex items-center justify-center text-xs" style={{ color: textColor }}>
                            +{displayImages.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Subtle shimmer overlay */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.03) 50%, transparent 60%)',
                      backgroundSize: '200% 200%',
                      animation: 'ambiance-gradient 3s ease infinite'
                    }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">Preview updates as you change settings</p>
              </div>
            </div>
          </div>
        </>
        )
      })()}

      {tab === 'security' && (
        <Card>
          {/* Auto-launch setting */}
          <div className="mb-6 pb-6 border-b border-gray-200">
            <h3 className="font-semibold mb-3">{t('settings.startupSettings', { defaultValue: 'Startup Settings' })}</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoLaunch}
                onChange={(e) => handleAutoLaunchToggle(e.target.checked)}
                className={`${isTouch ? 'w-6 h-6' : 'w-4 h-4'} rounded border-gray-300 text-orange-500 focus:ring-orange-500`}
              />
              <div>
                <span className={`${isTouch ? 'text-base' : 'text-sm'} font-medium text-gray-700`}>{t('settings.autoLaunch', { defaultValue: 'Start with Windows' })}</span>
                <p className="text-xs text-gray-400">{t('settings.autoLaunchDesc', { defaultValue: 'Launch Fast Food Manager automatically when Windows starts' })}</p>
              </div>
            </label>
          </div>

          <div className="space-y-4 max-w-md">
            <h3 className="font-semibold">{t('settings.changePassword')}</h3>
            <Input type="password" inputMode="numeric" label={t('settings.currentPassword')} value={currentPass} readOnly={isTouch} onClick={isTouch ? () => setKeyboardTarget({ field: 'currentPass', type: 'numeric' }) : undefined} onChange={isTouch ? undefined : (e) => setCurrentPass(e.target.value.replace(/\D/g, ''))} />
            <Input type="password" inputMode="numeric" label={t('settings.newPassword')} value={newPass} readOnly={isTouch} onClick={isTouch ? () => setKeyboardTarget({ field: 'newPass', type: 'numeric' }) : undefined} onChange={isTouch ? undefined : (e) => setNewPass(e.target.value.replace(/\D/g, ''))} />
            <Input type="password" inputMode="numeric" label={t('settings.confirmPassword')} value={confirmPass} readOnly={isTouch} onClick={isTouch ? () => setKeyboardTarget({ field: 'confirmPass', type: 'numeric' }) : undefined} onChange={isTouch ? undefined : (e) => setConfirmPass(e.target.value.replace(/\D/g, ''))} error={passError} />
            <Button onClick={changePassword} disabled={!currentPass || !newPass || !confirmPass}>{t('common.save')}</Button>
          </div>

          {/* Logout Section */}
          <div className="pt-6 mt-6 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <LogOut className="h-5 w-5 text-red-500" />
              <h3 className="font-semibold text-red-600">{t('nav.logout')}</h3>
            </div>
            <p className="text-xs text-gray-500 mb-1">{t('nav.logoutConfirm')}</p>
            <p className="text-xs text-orange-600 mb-4">{t('nav.logoutWarning')}</p>
            <div className="max-w-md space-y-3">
              <input
                type="password"
                inputMode="numeric"
                value={logoutPassword}
                readOnly={isTouch}
                onClick={isTouch ? () => setKeyboardTarget({ field: 'logoutPassword', type: 'numeric' }) : undefined}
                onChange={isTouch ? undefined : (e) => { setLogoutPassword(e.target.value.replace(/\D/g, '')); setLogoutError('') }}
                onKeyDown={isTouch ? undefined : (e) => e.key === 'Enter' && handleLogout()}
                placeholder="••••••••"
                className="w-full border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {logoutError && (
                <p className="text-red-500 text-xs">{logoutError}</p>
              )}
              <Button
                variant="danger"
                onClick={handleLogout}
                loading={loggingOut}
                disabled={!logoutPassword.trim()}
              >
                <LogOut className="h-4 w-4" />
                {t('nav.logout')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {tab === 'tablet' && (
        <Card>
          {/* Server toggle */}
          <div className="mb-6 pb-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">{t('settings.tabletServerTitle')}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{t('settings.tabletServerDesc')}</p>
              </div>
              <div className={`flex items-center gap-2 text-sm font-medium ${tabletRunning ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${tabletRunning ? 'bg-green-500' : 'bg-gray-300'}`} />
                {tabletRunning ? t('settings.tabletActive') : t('settings.tabletStopped')}
              </div>
            </div>
            <Button onClick={handleTabletToggle} loading={tabletLoading} variant={tabletRunning ? 'danger' : 'primary'}>
              {tabletRunning ? `⏹ ${t('settings.tabletStop')}` : `▶ ${t('settings.tabletStart')}`}
            </Button>
          </div>

          {/* QR code + URL */}
          {tabletRunning && tabletQr && (
            <div className="mb-6 pb-6 border-b border-gray-200">
              <h3 className="font-semibold mb-3">{t('settings.tabletAccess')}</h3>
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <img src={tabletQr} alt="QR Code" className="w-48 h-48 rounded-lg border border-gray-200" />
                <div className="flex-1">
                  <p className="text-sm text-gray-500 mb-2">{t('settings.tabletScanQr')}</p>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                    <span className="text-sm font-mono text-gray-800 flex-1 break-all">{tabletUrl}</span>
                    <button
                      onClick={handleCopyUrl}
                      className="flex-shrink-0 text-orange-500 hover:text-orange-600"
                      title={t('settings.tabletCopyLink')}
                    >
                      {urlCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{t('settings.tabletSameWifi')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Auto-start */}
          <div className="mb-6 pb-6 border-b border-gray-200">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={tabletAutoStart}
                onChange={(e) => handleTabletAutoStart(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">{t('settings.tabletAutoStart')}</span>
                <p className="text-xs text-gray-400">{t('settings.tabletAutoStartDesc')}</p>
              </div>
            </label>
          </div>

          {/* PIN */}
          <div>
            <h3 className="font-semibold mb-3">{t('settings.tabletPinTitle')}</h3>
            <label className="flex items-center gap-3 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={tabletPinEnabled}
                onChange={(e) => handleTabletPinEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">{t('settings.tabletPinEnable')}</span>
                <p className="text-xs text-gray-400">{t('settings.tabletPinEnableDesc')}</p>
              </div>
            </label>
            {tabletPinEnabled && (
              <Button onClick={() => setTabletPinModal(true)} variant="secondary">
                🔒 {t('settings.tabletPinChange')}
              </Button>
            )}
          </div>

          {/* PIN modal */}
          {tabletPinModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
                <h3 className="font-bold text-lg mb-1">{t('settings.tabletPinModalTitle')}</h3>
                <p className="text-xs text-orange-600 mb-4">{t('settings.tabletPinModalWarning')}</p>
                <div className="space-y-3">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('settings.tabletPinNew')}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('settings.tabletPinConfirm')}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  {pinError && <p className="text-red-500 text-xs">{pinError}</p>}
                  <div className="flex gap-2">
                    <Button onClick={handleSavePin} disabled={newPin.length !== 4}>{t('common.save')}</Button>
                    <Button variant="secondary" onClick={() => { setTabletPinModal(false); setNewPin(''); setConfirmPin(''); setPinError('') }}>{t('common.cancel')}</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
