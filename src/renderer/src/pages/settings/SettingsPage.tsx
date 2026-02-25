import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Printer, AlertCircle, RefreshCw, LogOut, Upload, Image } from 'lucide-react'
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
  const { setLanguage, setSetupComplete, setActivated, loadSettings, inputMode } = useAppStore()
  const isTouch = inputMode === 'touchscreen'
  const [tab, setTab] = useState<'general' | 'schedule' | 'printer' | 'telegram' | 'security'>('general')
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

  // Virtual keyboard
  const [keyboardTarget, setKeyboardTarget] = useState<{ field: string; type: 'numeric' | 'text' } | null>(null)

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

      // Load current printer assignments (we'll implement this IPC handler)
      const assignments: Record<number, string> = {}
      for (const worker of workersList) {
        if (worker.printer_name) {
          assignments[worker.id] = worker.printer_name
        }
      }
      setWorkerPrinters(assignments)
    } catch {
      // Workers API might not be available
      setWorkers([])
    }

    // Load auto-launch setting
    const autoLaunchEnabled = await window.api.settings.getAutoLaunch()
    setAutoLaunch(autoLaunchEnabled)
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
    await window.api.settings.setMultiple({
      printer_name: printerName,
      kitchen_printer_name: kitchenPrinterName,
      printer_width: paperWidth,
      auto_print_receipt: autoPrintReceipt ? 'true' : 'false',
      auto_print_kitchen: autoPrintKitchen ? 'true' : 'false',
      receipt_font_size: receiptFontSize,
      kitchen_font_size: kitchenFontSize,
      split_kitchen_tickets: splitKitchenTickets ? 'true' : 'false'
    })

    // Save worker printer assignments
    for (const worker of workers) {
      const printerName = workerPrinters[worker.id] || null
      await window.api.workers.update(worker.id, { printer_name: printerName })
    }

    flashSaved()
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
      // Hard reset: clear both setup and activation
      await window.api.settings.set('setup_complete', 'false')
      await window.api.settings.set('activation_status', '')
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

  const tabs = [
    { key: 'general' as const, label: t('settings.general') },
    { key: 'schedule' as const, label: t('settings.schedule') },
    { key: 'printer' as const, label: t('settings.printer') },
    { key: 'telegram' as const, label: t('settings.telegram') },
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
          <div className="space-y-4 max-w-xl">
            <div className="flex items-center gap-2 mb-2">
              <Printer className="h-5 w-5 text-gray-600" />
              <h3 className="font-semibold">{t('settings.printer')}</h3>
            </div>

            <Select
              label="Receipt Printer (Customer Receipt)"
              value={printerName}
              onChange={(e) => setPrinterName(e.target.value)}
              options={[
                { value: '', label: '-- Select Printer --' },
                ...printers.map(p => ({
                  value: p.name,
                  label: p.name + (p.isDefault ? ' (Default)' : '')
                }))
              ]}
            />

            <Select
              label={t('settings.paperWidth')}
              value={paperWidth}
              onChange={(e) => setPaperWidth(e.target.value)}
              options={[
                { value: '58', label: '58mm' },
                { value: '80', label: '80mm' }
              ]}
            />

            {/* Font size settings */}
            <div className="grid grid-cols-2 gap-3 pt-3 mt-3 border-t border-gray-200">
              <Select
                label={t('settings.receiptFontSize', { defaultValue: 'Receipt Font Size' })}
                value={receiptFontSize}
                onChange={(e) => setReceiptFontSize(e.target.value)}
                options={[
                  { value: 'small', label: t('settings.fontSmall', { defaultValue: 'Small' }) },
                  { value: 'medium', label: t('settings.fontMedium', { defaultValue: 'Medium' }) },
                  { value: 'large', label: t('settings.fontLarge', { defaultValue: 'Large' }) }
                ]}
              />
              <Select
                label={t('settings.kitchenFontSize', { defaultValue: 'Kitchen Font Size' })}
                value={kitchenFontSize}
                onChange={(e) => setKitchenFontSize(e.target.value)}
                options={[
                  { value: 'small', label: t('settings.fontSmall', { defaultValue: 'Small' }) },
                  { value: 'medium', label: t('settings.fontMedium', { defaultValue: 'Medium' }) },
                  { value: 'large', label: t('settings.fontLarge', { defaultValue: 'Large' }) }
                ]}
              />
            </div>

            {/* Auto-print toggles */}
            <div className="pt-3 mt-3 border-t border-gray-200 space-y-3">
              <h4 className="text-sm font-medium text-gray-700">{t('settings.autoPrint', { defaultValue: 'Auto-Print on New Order' })}</h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPrintReceipt}
                  onChange={(e) => setAutoPrintReceipt(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <div>
                  <span className="text-sm text-gray-700">{t('settings.autoPrintReceipt', { defaultValue: 'Auto-print receipt' })}</span>
                  <p className="text-xs text-gray-400">{t('settings.autoPrintReceiptDesc', { defaultValue: 'Automatically print customer receipt when a new order is placed' })}</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPrintKitchen}
                  onChange={(e) => setAutoPrintKitchen(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <div>
                  <span className="text-sm text-gray-700">{t('settings.autoPrintKitchen', { defaultValue: 'Auto-print kitchen ticket' })}</span>
                  <p className="text-xs text-gray-400">{t('settings.autoPrintKitchenDesc', { defaultValue: 'Automatically print kitchen ticket when a new order is placed' })}</p>
                </div>
              </label>
            </div>

            {/* Worker Printer Assignments */}
            {workers.length > 0 && (
              <div className="pt-3 mt-3 border-t border-gray-200 space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-gray-700">{t('settings.workerPrinters', { defaultValue: 'Worker Printer Assignments' })}</h4>
                  <p className="text-xs text-gray-400 mt-1">{t('settings.workerPrintersDesc', { defaultValue: 'Assign specific printers to workers for kitchen ticket printing' })}</p>
                </div>
                {workers.map(worker => (
                  <div key={worker.id} className="flex items-center gap-3">
                    <label className="w-32 text-sm text-gray-700">{worker.name}:</label>
                    <select
                      value={workerPrinters[worker.id] || ''}
                      onChange={(e) => handleWorkerPrinterChange(worker.id, e.target.value)}
                      className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                    >
                      <option value="">{t('settings.noAssignment', { defaultValue: '-- Use Default --' })}</option>
                      {printers.map(printer => (
                        <option key={printer.name} value={printer.name}>
                          {printer.name}{printer.isDefault ? ' (Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-700">
                    💡 {t('settings.workerPrintersHint', { defaultValue: 'When split kitchen tickets is enabled, each worker\'s items will print to their assigned printer.' })}
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={savePrinter}>{t('common.save')}</Button>
              <Button
                variant="secondary"
                onClick={handleTestPrint}
                loading={testingPrint}
                disabled={!printerName}
              >
                <Printer className="h-4 w-4" />
                {t('settings.testPrint')}
              </Button>
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {testResult.success ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {testResult.success ? 'Test print sent successfully!' : testResult.error || 'Print failed'}
              </div>
            )}

            {printers.length === 0 && (
              <p className="text-sm text-gray-400">No printers detected on this system.</p>
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
    </div>
  )
}
