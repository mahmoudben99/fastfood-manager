import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Printer, AlertCircle, RefreshCw, LogOut, Upload, Image, ShieldCheck, ShieldX, Clock, Copy, Plus, X, Palette } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { TelegramSettings } from './TelegramSettings'
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

  // Display customization
  const [displayYoutubeUrl, setDisplayYoutubeUrl] = useState('')
  const [displayThemeColor, setDisplayThemeColor] = useState('#f97316')
  const [displayImages, setDisplayImages] = useState<string[]>([])
  const [customHex, setCustomHex] = useState('')

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

    // Display customization
    setDisplayYoutubeUrl(settings.display_youtube_url || '')
    setDisplayThemeColor(settings.display_theme_color || '#f97316')
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
    { key: 'telegram' as const, label: t('settings.telegram') },
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

      {tab === 'telegram' && <TelegramSettings />}

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

      {tab === 'display' && (
        <Card>
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold">Ambiance Screen</h3>
            </div>

            <p className="text-sm text-gray-500">
              A beautiful branded TV display for your restaurant wall.
              Loops through your logo, welcome messages, social media, promotions, food photos, and order queue — with background music.
            </p>

            {tabletRunning ? (
              <div className="space-y-3">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-800 mb-1">Display URL</p>
                  <p className="text-lg font-mono text-green-700 break-all">
                    {tabletUrl.replace(/\/$/, '')}/display
                  </p>
                  <p className="text-xs text-green-600 mt-2">Open this URL in any browser on the same network</p>
                </div>
                <div className="flex gap-2">
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
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  Start the Remote Orders server first (in the Remote Orders tab) to enable the customer display.
                </p>
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => setTab('tablet')}>
                  Go to Remote Orders →
                </Button>
              </div>
            )}

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

            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Panels shown:</h4>
              <ul className="text-sm text-gray-500 space-y-1">
                <li>• Restaurant logo, name &amp; animated welcome</li>
                <li>• Social media &amp; contact info</li>
                <li>• Promotions &amp; pack deals</li>
                <li>• Image slideshow with captions</li>
                <li>• Orders being prepared</li>
              </ul>
            </div>

            {/* Theme Color */}
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                <Palette className="h-4 w-4 inline mr-1" />
                Theme Color
              </h4>
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  { color: '#f97316', label: 'Orange' },
                  { color: '#3b82f6', label: 'Blue' },
                  { color: '#22c55e', label: 'Green' },
                  { color: '#ef4444', label: 'Red' },
                  { color: '#a855f7', label: 'Purple' },
                  { color: '#ec4899', label: 'Pink' }
                ].map(({ color, label }) => (
                  <button
                    key={color}
                    title={label}
                    onClick={async () => {
                      setDisplayThemeColor(color)
                      await window.api.settings.setMultiple({ display_theme_color: color })
                      flashSaved()
                    }}
                    className={`w-9 h-9 rounded-full border-2 transition-all ${displayThemeColor === color ? 'border-gray-800 scale-110 ring-2 ring-offset-1 ring-gray-400' : 'border-gray-300'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <Input
                  className="max-w-[140px]"
                  placeholder="#hex"
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!/^#[0-9a-fA-F]{6}$/.test(customHex)}
                  onClick={async () => {
                    setDisplayThemeColor(customHex)
                    await window.api.settings.setMultiple({ display_theme_color: customHex })
                    setCustomHex('')
                    flashSaved()
                  }}
                >
                  Apply
                </Button>
                {displayThemeColor && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: displayThemeColor }} />
                    {displayThemeColor}
                  </div>
                )}
              </div>
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
              <p className="text-xs text-gray-400 mb-2">Upload food photos, restaurant images, etc. Each image can have an optional caption (e.g., &quot;Our Specialties&quot;). Max 10 images.</p>
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
      )}

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
