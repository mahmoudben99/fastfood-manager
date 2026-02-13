import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Printer, AlertCircle, RefreshCw } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { TelegramSettings } from './TelegramSettings'

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
  const { setLanguage, loadSettings } = useAppStore()
  const [tab, setTab] = useState<'general' | 'schedule' | 'printer' | 'telegram' | 'security'>('general')
  const [saved, setSaved] = useState(false)

  // General
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [phone2, setPhone2] = useState('')
  const [currency, setCurrency] = useState('DZD')
  const [currencySymbol, setCurrencySymbol] = useState('DA')
  const [lang, setLang] = useState('en')

  // Schedule
  const [schedule, setSchedule] = useState<any[]>([])

  // Printer
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean }[]>([])
  const [printerName, setPrinterName] = useState('')
  const [paperWidth, setPaperWidth] = useState('80')
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [testingPrint, setTestingPrint] = useState(false)

  // Updates
  const [checking, setChecking] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<'none' | 'available' | 'upToDate' | null>(null)

  // Security
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [passError, setPassError] = useState('')

  useEffect(() => {
    loadCurrentSettings()
  }, [])

  const loadCurrentSettings = async () => {
    const settings = await window.api.settings.getAll()
    setName(settings.restaurant_name || '')
    setPhone(settings.restaurant_phone || '')
    setPhone2(settings.restaurant_phone2 || '')
    setCurrency(settings.currency || 'DZD')
    setCurrencySymbol(settings.currency_symbol || 'DA')
    setLang(settings.language || 'en')
    setPrinterName(settings.printer_name || '')
    setPaperWidth(settings.printer_width || '80')

    const sched = await window.api.settings.getSchedule()
    setSchedule(sched)

    const printerList = await window.api.printer.getPrinters()
    setPrinters(printerList)
  }

  const saveGeneral = async () => {
    await window.api.settings.setMultiple({
      restaurant_name: name,
      restaurant_phone: phone,
      restaurant_phone2: phone2,
      currency,
      currency_symbol: currencySymbol,
      language: lang
    })
    setLanguage(lang)
    loadSettings()
    flashSaved()
  }

  const saveSchedule = async () => {
    await window.api.settings.setSchedule(schedule)
    flashSaved()
  }

  const savePrinter = async () => {
    await window.api.settings.setMultiple({
      printer_name: printerName,
      printer_width: paperWidth
    })
    flashSaved()
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
            onClick={() => setTab(tb.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
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
            <Input label={t('setup.restaurant.name')} value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('setup.restaurant.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input label={t('setup.restaurant.phone2')} value={phone2} onChange={(e) => setPhone2(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label={t('setup.restaurant.currency')}
                value={currency}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                options={currencies.map((c) => ({ value: c.value, label: c.label }))}
              />
              <Input label={t('setup.restaurant.currencySymbol')} value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} />
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
              label={t('settings.printerName')}
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

      {tab === 'security' && (
        <Card>
          <div className="space-y-4 max-w-md">
            <h3 className="font-semibold">{t('settings.changePassword')}</h3>
            <Input type="password" label={t('settings.currentPassword')} value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} />
            <Input type="password" label={t('settings.newPassword')} value={newPass} onChange={(e) => setNewPass(e.target.value)} />
            <Input type="password" label={t('settings.confirmPassword')} value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} error={passError} />
            <Button onClick={changePassword} disabled={!currentPass || !newPass || !confirmPass}>{t('common.save')}</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
