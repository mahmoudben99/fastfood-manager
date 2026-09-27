import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Printer, AlertCircle, RefreshCw, LogOut, ShieldCheck, ShieldX, Clock, Copy, Plus, X, Palette, Info } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'
import { ExcelImportExport } from '../excel/ExcelImportExport'
import { BackupRestore } from '../backup/BackupRestore'
import { LogoUploader } from '../../components/LogoUploader'
import { SocialMediaEditor } from './SocialMediaEditor'
import { UnsavedChangesDialog } from './SettingsFeedback'
import { ipcErrorMessage } from '../../utils/ipcError'
import {
  DEFAULT_CURRENCY_SYMBOL,
  MAX_ORDER_ALERT_MINUTES,
  orderAlertMinutesOrDefault,
  parseSocialMedia,
  serializeSocialMedia,
  type SocialMediaEntry
} from '../../../../shared/settings-rules'

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

type DirtyTab = 'general' | 'schedule' | 'printer'

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

/** Group printer_assignments rows (one per task) back into one config per printer. */
function configsFromAssignments(rows: any[]): PrinterConfig[] {
  const configMap = new Map<string, PrinterConfig>()
  for (const a of rows || []) {
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
  return Array.from(configMap.values())
}

/** Comparable form of the printer list (ids are regenerated on every load). */
const printerSignature = (configs: PrinterConfig[]) => JSON.stringify(configs.map(({ id: _id, ...rest }) => rest))

export function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setLanguage, setSetupComplete, setActivated, loadSettings, inputMode, activationType, trialStatus, trialExpiresAt } = useAppStore()
  const isTouch = inputMode === 'touchscreen'
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as any) || 'general'
  const [tab, setTab] = useState<'general' | 'schedule' | 'printer' | 'ownerLink' | 'remoteOrder' | 'security' | 'data'>(initialTab)
  const [saved, setSaved] = useState(false)

  // General
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [phone2, setPhone2] = useState('')
  const [address, setAddress] = useState('')
  const [socialMedia, setSocialMedia] = useState<SocialMediaEntry[]>([])
  const [currency, setCurrency] = useState('DZD')
  const [currencySymbol, setCurrencySymbol] = useState('DA')
  const [lang, setLang] = useState('en')
  const [orderAlertMinutes, setOrderAlertMinutes] = useState('20')
  const [inputModeLocal, setInputModeLocal] = useState('keyboard')
  const [nameError, setNameError] = useState('')
  const [alertError, setAlertError] = useState('')
  const [generalError, setGeneralError] = useState('')
  const [savingGeneral, setSavingGeneral] = useState(false)

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

  const [printerConfigs, setPrinterConfigs] = useState<PrinterConfig[]>([])
  const [printerTestResults, setPrinterTestResults] = useState<Record<string, { success: boolean; error?: string; printerName?: string }>>({})
  const [printerSaveError, setPrinterSaveError] = useState('')
  const [printerTestingIds, setPrinterTestingIds] = useState<Set<string>>(new Set())

  // Updates
  const [checking, setChecking] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<'none' | 'available' | 'upToDate' | null>(null)

  // Security
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [passError, setPassError] = useState('')
  // Informational note after a SUCCESSFUL change (e.g. owner dashboard needs 8+ chars) — not an error.
  const [passNotice, setPassNotice] = useState('')
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
  const [keyboardTarget, setKeyboardTarget] = useState<{ field: string; type: 'numeric' | 'text'; index?: number } | null>(null)

  // Unsaved-changes guard: last saved state of each tab that has a Save button
  const [savedGeneral, setSavedGeneral] = useState<string | null>(null)
  const [savedSchedule, setSavedSchedule] = useState('[]')
  const [savedPrinters, setSavedPrinters] = useState('[]')
  const [pendingLeave, setPendingLeave] = useState<{ tabs: DirtyTab[]; run: () => void } | null>(null)
  const [savingPending, setSavingPending] = useState(false)

  // Tablet server / PIN state
  const [tabletPinEnabled, setTabletPinEnabled] = useState(false)
  const [tabletPinModal, setTabletPinModal] = useState(false)
  // 'enable' = the PIN dialog was opened by ticking "Enable PIN": protection only turns on once a
  // valid PIN is saved (it used to turn on immediately and lock tablets behind the default 0000).
  const [pinModalMode, setPinModalMode] = useState<'change' | 'enable'>('change')
  const [tabletPinSet, setTabletPinSet] = useState(true)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')

  // Owner dashboard state
  const [ownerDashQr, setOwnerDashQr] = useState('')

  // Machine ID for direct URLs
  const [machineId, setMachineId] = useState('')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // Remote order QR
  const [remoteOrderQr, setRemoteOrderQr] = useState('')
  // WP-G: per-restaurant remote-ordering flag (cloud, DEFAULT OFF). null = loading.
  const [remoteOrderingEnabled, setRemoteOrderingEnabled] = useState<boolean | null>(null)
  const [remoteToggleBusy, setRemoteToggleBusy] = useState(false)
  // True while the secure device-token path (WP-D) is not integrated: the toggle
  // is locked and the cloud flag stays at its default (OFF).
  const [remoteTogglePending, setRemoteTogglePending] = useState(false)

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
      case 'social': return socialMedia[keyboardTarget.index ?? -1]?.handle || ''
      case 'newPin': return newPin
      case 'confirmPin': return confirmPin
      case 'activateCode': return activateCode
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
      case 'social': {
        const index = keyboardTarget.index ?? -1
        setSocialMedia((prev) => prev.map((s, i) => (i === index ? { ...s, handle: val } : s)))
        break
      }
      case 'newPin': setNewPin(val.replace(/\D/g, '').slice(0, 4)); break
      case 'confirmPin': setConfirmPin(val.replace(/\D/g, '').slice(0, 4)); break
      case 'activateCode': setActivateCode(formatActivateCode(val)); break
    }
  }

  useEffect(() => {
    loadCurrentSettings()
    // Tick every second so the trial countdown stays live
    const timerInterval = setInterval(() => setTimerTick((n) => n + 1), 1000)
    return () => clearInterval(timerInterval)
  }, [])

  // ---- General tab form (snapshot-able for the unsaved-changes guard) ----
  const generalForm = { name, phone, phone2, address, socialMedia, currency, currencySymbol, lang, orderAlertMinutes, inputModeLocal }
  type GeneralForm = typeof generalForm

  const applyGeneral = (f: GeneralForm) => {
    setName(f.name)
    setPhone(f.phone)
    setPhone2(f.phone2)
    setAddress(f.address)
    setSocialMedia(f.socialMedia)
    setCurrency(f.currency)
    setCurrencySymbol(f.currencySymbol)
    setLang(f.lang)
    setOrderAlertMinutes(f.orderAlertMinutes)
    setInputModeLocal(f.inputModeLocal)
  }

  const isTabDirty = (which: DirtyTab): boolean => {
    if (which === 'general') return savedGeneral !== null && JSON.stringify(generalForm) !== savedGeneral
    if (which === 'schedule') return JSON.stringify(schedule) !== savedSchedule
    return printerSignature(printerConfigs) !== savedPrinters
  }

  const loadCurrentSettings = async () => {
    const settings = await window.api.settings.getAll()
    const loadedGeneral: GeneralForm = {
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
    applyGeneral(loadedGeneral)
    setSavedGeneral(JSON.stringify(loadedGeneral))
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
    setSavedSchedule(JSON.stringify(sched))

    const printerList = await window.api.printer.getPrinters()
    setPrinters(printerList)

    // Load workers for printer assignment
    try {
      const workersList = await window.api.workers.getAll()
      setWorkers(workersList)
    } catch {
      setWorkers([])
    }

    // Load printer assignments into new config format
    try {
      const configs = configsFromAssignments(await window.api.printer.getAssignments())
      setPrinterConfigs(configs)
      setSavedPrinters(printerSignature(configs))
    } catch {
      // Printer assignments might not exist yet
    }

    // Load auto-launch setting
    const autoLaunchEnabled = await window.api.settings.getAutoLaunch()
    setAutoLaunch(autoLaunchEnabled)

    // Load machine ID for license display
    const mid = await window.api.activation.getMachineId()
    setLicMachineId(mid)

    // Load tablet PIN setting
    setTabletPinEnabled(settings.tablet_pin_enabled === '1')
    setTabletPinSet(!!settings.tablet_pin)

    // Load owner dashboard QR
    try {
      const ownerData = await window.api.tablet.getOwnerDashboard()
      setOwnerDashQr(ownerData.qrDataUrl)
    } catch { /* ignore */ }

    // Load machine ID for direct URLs + generate QR for remote ordering
    try {
      const mid = await window.api.activation.getMachineId()
      setMachineId(mid)
      if (mid) {
        const QRCode = (await import('qrcode')).default
        const qrDataUrl = await QRCode.toDataURL(`https://fastfood-manager.vercel.app/r/${mid}`, { width: 256, margin: 2 })
        setRemoteOrderQr(qrDataUrl)
      }
    } catch { /* ignore */ }

    // WP-G: load the cloud remote-ordering flag (defaults to OFF when unreachable).
    // Fails closed until the WP-D device-token path is integrated.
    try {
      const status = await (window as any).remoteInbox?.getEnabled?.()
      if (status && typeof status === 'object') {
        setRemoteOrderingEnabled(status.ok ? status.enabled === true : false)
        setRemoteTogglePending(!status.ok)
      } else {
        setRemoteOrderingEnabled(false)
        setRemoteTogglePending(true)
      }
    } catch {
      setRemoteOrderingEnabled(false)
      setRemoteTogglePending(true)
    }
  }

  // WP-G: toggle the per-restaurant remote-ordering flag in the cloud
  const handleRemoteOrderingToggle = async (enabled: boolean) => {
    if (remoteToggleBusy || remoteTogglePending) return
    setRemoteToggleBusy(true)
    try {
      const result = await (window as any).remoteInbox?.setEnabled?.(enabled)
      if (result?.ok) setRemoteOrderingEnabled(enabled)
      else if (result?.pendingIntegration) setRemoteTogglePending(true)
    } catch { /* keep previous state */ }
    finally { setRemoteToggleBusy(false) }
  }

  /** Validate + save the General tab. Returns false (and shows why) when nothing was saved. */
  const saveGeneral = async (): Promise<boolean> => {
    setGeneralError('')
    const trimmedName = name.trim()
    const minutesText = orderAlertMinutes.trim()
    const minutes = Number(minutesText)
    const nameErr = trimmedName ? '' : t('settings.restaurantNameRequired')
    const alertErr = /^\d+$/.test(minutesText) && minutes >= 1 && minutes <= MAX_ORDER_ALERT_MINUTES
      ? ''
      : t('settings.orderAlertInvalid', { max: MAX_ORDER_ALERT_MINUTES })
    setNameError(nameErr)
    setAlertError(alertErr)
    if (nameErr || alertErr) {
      setTab('general')
      return false
    }
    // Contract C4: never store an empty currency symbol.
    const symbol = currencySymbol.trim() || currencies.find((c) => c.value === currency)?.symbol || DEFAULT_CURRENCY_SYMBOL
    const socialJson = serializeSocialMedia(socialMedia)
    const next: GeneralForm = {
      ...generalForm,
      name: trimmedName,
      socialMedia: parseSocialMedia(socialJson),
      currencySymbol: symbol,
      orderAlertMinutes: String(minutes)
    }
    setSavingGeneral(true)
    try {
      // logo_path is NOT written here: the main process owns logo storage (contract C1).
      await window.api.settings.setMultiple({
        restaurant_name: next.name,
        restaurant_phone: phone,
        restaurant_phone2: phone2,
        restaurant_address: address,
        social_media: socialJson,
        currency,
        currency_symbol: symbol,
        language: lang,
        order_alert_minutes: next.orderAlertMinutes,
        input_mode: inputModeLocal
      })
      applyGeneral(next)
      setSavedGeneral(JSON.stringify(next))
      setLanguage(lang)
      loadSettings()
      flashSaved()
      return true
    } catch (err) {
      setGeneralError(t('settings.saveFailed', { error: ipcErrorMessage(err) }))
      setTab('general')
      return false
    } finally {
      setSavingGeneral(false)
    }
  }

  const saveSchedule = async (): Promise<boolean> => {
    try {
      await window.api.settings.setSchedule(schedule)
      setSavedSchedule(JSON.stringify(schedule))
      flashSaved()
      return true
    } catch (err) {
      console.error('Failed to save schedule:', err)
      setTab('schedule')
      return false
    }
  }

  /** Saves the printer list. An empty list is valid: it clears every printer/assignment. */
  const savePrinter = async (): Promise<boolean> => {
    setPrinterSaveError('')
    try {
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
      // Reload printer configs from database to ensure state matches what was saved
      // (including an empty list after the last printer was removed).
      const configs = configsFromAssignments(await window.api.printer.getAssignments())
      setPrinterConfigs(configs)
      setSavedPrinters(printerSignature(configs))
      flashSaved()
      return true
    } catch (err) {
      console.error('Failed to save printer config:', err)
      setPrinterSaveError(t('settings.saveFailed', { error: ipcErrorMessage(err) }))
      setTab('printer')
      return false
    }
  }

  const saveTab = (which: DirtyTab): Promise<boolean> =>
    which === 'general' ? saveGeneral() : which === 'schedule' ? saveSchedule() : savePrinter()

  const discardTab = (which: DirtyTab) => {
    if (which === 'general') {
      if (savedGeneral) applyGeneral(JSON.parse(savedGeneral))
      setNameError('')
      setAlertError('')
      setGeneralError('')
    } else if (which === 'schedule') {
      setSchedule(JSON.parse(savedSchedule))
    } else {
      setPrinterConfigs((JSON.parse(savedPrinters) as Omit<PrinterConfig, 'id'>[]).map((c) => ({ ...c, id: crypto.randomUUID() })))
      setPrinterSaveError('')
    }
  }

  /** Run `action`, first asking Save / Discard / Cancel if any of `tabs` has unsaved edits. */
  const guardLeave = (tabs: DirtyTab[], action: () => void) => {
    const dirty = tabs.filter(isTabDirty)
    if (dirty.length > 0) setPendingLeave({ tabs: dirty, run: action })
    else action()
  }

  const requestTab = (next: typeof tab) => {
    setKeyboardTarget(null)
    if (next === tab) return
    const current: string = tab
    if (current === 'general' || current === 'schedule' || current === 'printer') guardLeave([current], () => setTab(next))
    else setTab(next)
  }

  // The Receipt Editor is another page: nothing unsaved on ANY tab may be lost on the way.
  const openReceiptEditor = () => guardLeave(['general', 'schedule', 'printer'], () => navigate('/admin/receipt-editor'))

  const handlePendingSave = async () => {
    if (!pendingLeave) return
    setSavingPending(true)
    try {
      for (const which of pendingLeave.tabs) {
        if (!(await saveTab(which))) {
          // Validation/save failed: stay, and show the tab with the error.
          setPendingLeave(null)
          return
        }
      }
      const { run } = pendingLeave
      setPendingLeave(null)
      run()
    } finally {
      setSavingPending(false)
    }
  }

  const handlePendingDiscard = () => {
    if (!pendingLeave) return
    pendingLeave.tabs.forEach(discardTab)
    const { run } = pendingLeave
    setPendingLeave(null)
    run()
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
      // Contract C3: { success, error?, printerName? } — error is human-readable (e.g. printer not found).
      const result = await window.api.printer.testPrintOnPrinter(printerName)
      setPrinterTestResults(prev => ({
        ...prev,
        [configId]: {
          success: !!result?.success,
          error: result?.error,
          printerName: result?.printerName || printerName
        }
      }))
    } catch (err) {
      setPrinterTestResults(prev => ({ ...prev, [configId]: { success: false, error: ipcErrorMessage(err) || t('settings.testFailed') } }))
    } finally {
      setPrinterTestingIds(prev => {
        const next = new Set(prev)
        next.delete(configId)
        return next
      })
    }
  }

  // Available tasks for printer assignment
  const getAvailableTasks = () => {
    const tasks: { value: string; label: string }[] = [
      { value: 'receipt', label: t('settings.taskCustomerReceipt', { defaultValue: 'Customer Receipt' }) },
      { value: 'kitchen_all', label: t('settings.taskKitchenAll', { defaultValue: 'Kitchen Ticket (All Items)' }) }
    ]
    for (const worker of workers) {
      tasks.push({ value: `worker_${worker.id}`, label: t('settings.taskKitchenWorker', { defaultValue: 'Kitchen: {{name}}', name: worker.name }) })
    }
    return tasks
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
    setPassNotice('')
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
      setPassError(t('settings.currentPasswordIncorrect', { defaultValue: 'Current password is incorrect' }))
      return
    }
    // Store the admin password AND provision the remote owner-dashboard credential in one call.
    const result = await window.api.settings.setAdminPassword(newPass)
    if (!result.ok) {
      setPassError(t('setup.password.tooShort'))
      return
    }
    setCurrentPass('')
    setNewPass('')
    setConfirmPass('')
    // The password WAS saved: show the owner-dashboard hint as information, not in the error slot.
    setPassNotice(
      result.ownerDashboard === 'too_short'
        ? t('settings.ownerDashboardCredentialTooShort')
        : t('settings.passwordChanged')
    )
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
      // Logout clears only entitlement/setup state. Operational data remains in SQLite.
      const result = await window.api.settings.logout()
      if (!result?.success) throw new Error(result?.error || 'Logout failed')
      setSetupComplete(false)
      setActivated(false)
      navigate('/activate')
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : t('common.error'))
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
    if (msLeft <= 0) return t('settings.trialExpiredLabel', { defaultValue: 'Expired' })
    const days = Math.floor(msLeft / (1000 * 60 * 60 * 24))
    const hours = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const mins = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60))
    const secs = Math.floor((msLeft % (1000 * 60)) / 1000)
    if (days > 0) return t('settings.trialRemainingDays', { defaultValue: '{{days}}d {{hours}}h {{mins}}m {{secs}}s remaining', days, hours, mins, secs })
    if (hours > 0) return t('settings.trialRemainingHours', { defaultValue: '{{hours}}h {{mins}}m {{secs}}s remaining', hours, mins, secs })
    return t('settings.trialRemainingMins', { defaultValue: '{{mins}}m {{secs}}s remaining', mins, secs })
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
        setActivateError(t('settings.activateInvalidCode', { defaultValue: 'Invalid activation code for this machine.' }))
      }
    } catch {
      setActivateError(t('settings.activateFailed', { defaultValue: 'Activation failed. Try again.' }))
    } finally {
      setActivateLoading(false)
    }
  }

  const openPinModal = (mode: 'change' | 'enable') => {
    setPinModalMode(mode)
    setNewPin('')
    setConfirmPin('')
    setPinError('')
    setTabletPinModal(true)
  }

  const closePinModal = () => {
    // Cancelling the "enable" dialog leaves PIN protection OFF (nothing was saved).
    setTabletPinModal(false)
    setNewPin('')
    setConfirmPin('')
    setPinError('')
    setKeyboardTarget(null)
  }

  const handleTabletPinEnabled = async (enabled: boolean) => {
    if (enabled) {
      // Never turn protection on without a PIN: tablets would silently fall back to "0000".
      openPinModal('enable')
      return
    }
    try {
      await window.api.tablet.setPinEnabled(false)
      setTabletPinEnabled(false)
    } catch (err) {
      console.error('Failed to disable tablet PIN:', err)
    }
  }

  const handleSavePin = async () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) { setPinError(t('settings.pinMustBe4Digits', { defaultValue: 'Le PIN doit être 4 chiffres.' })); return }
    if (newPin !== confirmPin) { setPinError(t('settings.pinMismatch', { defaultValue: 'Les PINs ne correspondent pas.' })); return }
    try {
      const result = await window.api.tablet.setPin(newPin)
      if (!result.ok) {
        setPinError(result.error || t('settings.pinError', { defaultValue: 'Erreur' }))
        return
      }
      setTabletPinSet(true)
      if (pinModalMode === 'enable') {
        await window.api.tablet.setPinEnabled(true)
        setTabletPinEnabled(true)
      }
      closePinModal()
    } catch (err) {
      setPinError(ipcErrorMessage(err) || t('settings.pinError', { defaultValue: 'Erreur' }))
    }
  }

  const isPrinterMissing = (name: string) => !!name && !printers.some((p) => p.name === name)

  const tabs = [
    { key: 'general' as const, label: t('settings.general') },
    { key: 'schedule' as const, label: t('settings.schedule') },
    { key: 'printer' as const, label: t('settings.printer') },
    { key: 'ownerLink' as const, label: t('settings.ownerLink', { defaultValue: 'Owner Link' }) },
    { key: 'remoteOrder' as const, label: t('settings.remoteOrder', { defaultValue: 'Remote Order' }) },
    { key: 'security' as const, label: t('settings.security') },
    { key: 'data' as const, label: t('settings.data', { defaultValue: 'Data' }) }
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
            onClick={() => requestTab(tb.key)}
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
            {/* Logo (contract C1: main process stores it; shown via a data URL, removable) */}
            <div className="pb-4 mb-4 border-b border-gray-200">
              <LogoUploader />
            </div>

            <Input label={t('setup.restaurant.name')} value={name} error={nameError} readOnly={isTouch} onClick={isTouch ? () => setKeyboardTarget({ field: 'name', type: 'text' }) : undefined} onChange={isTouch ? undefined : (e) => setName(e.target.value)} />
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
            {/* Social Media — settings.social_media, same list as the Receipt Editor */}
            <div className="pt-3 border-t">
              <SocialMediaEditor
                items={socialMedia}
                onChange={setSocialMedia}
                label={t('settings.socialMedia')}
                isTouch={isTouch}
                onRequestKeyboard={(index) => setKeyboardTarget({ field: 'social', type: 'text', index })}
              />
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
                {alertError && <p className="mt-1 text-xs text-red-500">{alertError}</p>}
              </div>
            ) : (
              <Input
                label={t('settings.orderAlertMinutes', { defaultValue: 'Order Alert Time (minutes)' })}
                type="number"
                min="1"
                max={MAX_ORDER_ALERT_MINUTES}
                step="1"
                value={orderAlertMinutes}
                onChange={(e) => setOrderAlertMinutes(e.target.value)}
                placeholder="20"
                error={alertError}
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
                    {mode === 'keyboard' ? t('settings.inputModeKeyboard', { defaultValue: 'Keyboard & Mouse' }) : t('settings.inputModeTouchscreen', { defaultValue: 'Touchscreen' })}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {t('settings.inputModeHelp', { defaultValue: 'Touchscreen mode uses larger buttons and a built-in keyboard' })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => { void saveGeneral() }} loading={savingGeneral}>{t('common.save')}</Button>
              {(nameError || alertError) && <p className="text-xs text-red-500">{nameError || alertError}</p>}
              {generalError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">{generalError}</p>}
            </div>

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
              <h4 className="text-sm font-medium text-gray-900 mb-3">{t('settings.license', { defaultValue: 'License' })}</h4>

              {activationType === 'full' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
                  <ShieldCheck className="h-5 w-5 text-green-600 shrink-0" />
                  <span className="text-sm font-medium text-green-700">{t('settings.fullLicenseActivated', { defaultValue: 'Full License — Activated' })}</span>
                </div>
              )}

              {activationType === 'trial' && (trialStatus === 'active' || trialStatus === 'offline-locked') && (
                <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-lg border border-orange-200">
                  <Clock className="h-5 w-5 text-orange-500 shrink-0" />
                  <span className="text-sm font-medium text-orange-700 flex-1">
                    {t('settings.freeTrialPrefix', { defaultValue: 'Free Trial — {{time}}', time: getTrialTimeLeft() })}
                  </span>
                </div>
              )}

              {activationType === 'trial' && (trialStatus === 'expired' || trialStatus === 'paused') && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
                  <ShieldX className="h-5 w-5 text-red-500 shrink-0" />
                  <span className="text-sm font-medium text-red-700">
                    {trialStatus === 'paused' ? t('settings.trialPaused', { defaultValue: 'Trial Paused' }) : t('settings.trialExpired', { defaultValue: 'Trial Expired' })}
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
                  {t('settings.activateSoftware', { defaultValue: 'Activate Software' })}
                </button>
              )}

              {licMachineId && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">{t('settings.machineId', { defaultValue: 'Machine ID' })}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 select-all text-gray-700 truncate">
                      {licMachineId}
                    </div>
                    <button
                      onClick={handleCopyLicMachineId}
                      className="shrink-0 p-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                      title={t('settings.copyMachineId', { defaultValue: 'Copy machine ID' })}
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
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{t('settings.activateSoftware', { defaultValue: 'Activate Software' })}</h3>
                  <p className="text-xs text-gray-500 mb-4">{t('settings.activateModalHint', { defaultValue: 'Enter the serial code for this machine ID:' })} <span className="font-mono">{licMachineId}</span></p>
                  <input
                    type="text"
                    value={activateCode}
                    readOnly={isTouch}
                    onClick={isTouch ? () => setKeyboardTarget({ field: 'activateCode', type: 'text' }) : undefined}
                    onChange={isTouch ? undefined : (e) => setActivateCode(formatActivateCode(e.target.value))}
                    placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                    dir="ltr"
                    className="w-full border rounded-lg px-3 py-2.5 font-mono text-sm tracking-wider text-center uppercase focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none mb-3"
                    maxLength={23}
                    autoFocus={!isTouch}
                  />
                  {activateError && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{activateError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setActivateModal(false); setKeyboardTarget(null) }}
                      className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={handleActivateSerial}
                      disabled={activateCode.length < 23 || activateLoading}
                      className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                      {activateLoading ? '...' : t('settings.activate', { defaultValue: 'Activate' })}
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
            <Button onClick={() => { void saveSchedule() }} className="mt-4">{t('common.save')}</Button>
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
                <Button variant="secondary" size="sm" onClick={openReceiptEditor}>
                  <Palette className="h-4 w-4" />
                  {t('settings.receiptEditor', { defaultValue: 'Receipt Editor' })}
                </Button>
                <Button variant="secondary" size="sm" onClick={addPrinterConfig}>
                  <Plus className="h-4 w-4" />
                  {t('settings.addPrinter', { defaultValue: 'Add Printer' })}
                </Button>
              </div>
            </div>

            {printerConfigs.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                <Printer className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">{t('settings.noPrintersConfigured', { defaultValue: 'No printers configured' })}</p>
                <p className="text-xs text-gray-400 mt-1">{t('settings.addPrinterHint', { defaultValue: 'Click "Add Printer" to set up your first printer' })}</p>
              </div>
            )}

            <div className="space-y-3">
              {printerConfigs.map((config, index) => (
                <div key={config.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                  {/* Printer selection + remove */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t('settings.printerLabel', { defaultValue: 'Printer {{n}}', n: index + 1 })}</label>
                      <select
                        value={config.printerName}
                        onChange={(e) => updatePrinterConfig(config.id, { printerName: e.target.value })}
                        className={`w-full border rounded-lg px-3 py-2 text-sm ${isPrinterMissing(config.printerName) ? 'border-orange-400 bg-orange-50' : ''}`}
                      >
                        <option value="">{t('settings.selectPrinter', { defaultValue: '-- Select Printer --' })}</option>
                        {/* A saved printer that is no longer installed keeps its value, labelled as missing. */}
                        {isPrinterMissing(config.printerName) && (
                          <option value={config.printerName}>{t('settings.printerNotFound', { name: config.printerName })}</option>
                        )}
                        {printers.map(p => (
                          <option key={p.name} value={p.name}>
                            {p.name}{p.isDefault ? ` ${t('settings.defaultSuffix', { defaultValue: '(Default)' })}` : ''}
                          </option>
                        ))}
                      </select>
                      {isPrinterMissing(config.printerName) && (
                        <p className="flex items-center gap-1 mt-1 text-xs text-orange-700">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          {t('settings.printerNotFoundWarning')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removePrinterConfig(config.id)}
                      className="mt-5 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title={t('settings.removePrinter', { defaultValue: 'Remove printer' })}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Task toggles */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">{t('settings.printTasks', { defaultValue: 'Print Tasks' })}</label>
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
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t('settings.receiptFont', { defaultValue: 'Receipt Font' })}</label>
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
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t('settings.kitchenFont', { defaultValue: 'Kitchen Font' })}</label>
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
                      <span className="text-sm text-gray-600">{t('settings.autoPrintOnNewOrder', { defaultValue: 'Auto-print on new order' })}</span>
                    </label>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleTestPrintForPrinter(config.id, config.printerName)}
                      loading={printerTestingIds.has(config.id)}
                      disabled={!config.printerName}
                    >
                      <Printer className="h-3.5 w-3.5" />
                      {t('settings.test', { defaultValue: 'Test' })}
                    </Button>
                  </div>

                  {/* Test result */}
                  {printerTestResults[config.id] && (
                    <div className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                      printerTestResults[config.id].success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {printerTestResults[config.id].success ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      {printerTestResults[config.id].success
                        ? t('settings.testPrintSentTo', { name: printerTestResults[config.id].printerName || config.printerName })
                        : printerTestResults[config.id].error || t('settings.printFailed', { defaultValue: 'Print failed' })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Save button — always shown: saving an empty list removes the last printer */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button onClick={() => { void savePrinter() }}>{t('common.save')}</Button>
              {printerSaveError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">{printerSaveError}</p>}
            </div>

            {printers.length === 0 && (
              <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <p className="text-sm text-orange-700">{t('settings.noPrintersDetected', { defaultValue: 'No printers detected on this system. Make sure your printer is connected and turned on.' })}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {tab === 'ownerLink' && (
        <Card>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-1">{t('settings.ownerLink', { defaultValue: 'Owner Link' })}</h3>
              <p className="text-sm text-gray-500">{t('settings.ownerLinkDesc', { defaultValue: 'Monitor your restaurant remotely from any device.' })}</p>
              <p className="text-xs text-orange-600 mt-1 font-medium">{t('settings.ownerLinkLoginNote', { defaultValue: 'The owner logs in with the admin password (set in Security tab).' })}</p>
            </div>

            {machineId ? (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium text-sm">{t('settings.ownerDashboard', { defaultValue: 'Owner Dashboard' })}</h4>
                    <span className="text-xs text-gray-400">{t('settings.ownerDashboardSub', { defaultValue: 'Monitor orders, revenue & analytics' })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-800 flex-1 bg-white rounded px-3 py-2 border border-gray-200">
                      fastfood-manager.vercel.app/owner/{machineId}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`https://fastfood-manager.vercel.app/owner/${machineId}`)
                        setCopiedCode('owner')
                        setTimeout(() => setCopiedCode(null), 2000)
                      }}
                      className="flex-shrink-0 text-orange-500 hover:text-orange-600 p-2"
                      title={t('settings.copyLink', { defaultValue: 'Copy link' })}
                    >
                      {copiedCode === 'owner' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* QR code */}
                {ownerDashQr && (
                  <div className="flex flex-col sm:flex-row gap-6 items-start">
                    <img src={ownerDashQr} alt={t('settings.ownerDashboardQrAlt', { defaultValue: 'Owner Dashboard QR' })} className="w-48 h-48 rounded-lg border border-gray-200" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-500 mb-2">{t('settings.ownerQrScan', { defaultValue: 'Scan this QR code to open the owner dashboard on your phone.' })}</p>
                      <p className="text-xs text-gray-400 mt-2">{t('settings.worksAnyDevice', { defaultValue: 'Works from any device with internet access.' })}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <p className="text-sm text-orange-700">{t('settings.machineIdLoadError', { defaultValue: 'Machine ID could not be loaded. Try restarting the app.' })}</p>
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
          extended={keyboardTarget.type === 'text' && keyboardTarget.field !== 'activateCode'}
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
            {passNotice && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{passNotice}</span>
              </div>
            )}
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

      {tab === 'remoteOrder' && (
        <Card>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-1">{t('settings.remoteOrdering', { defaultValue: 'Remote Ordering' })}</h3>
              <p className="text-sm text-gray-500">{t('settings.remoteOrderingDesc', { defaultValue: 'Let customers order from their phone by scanning a QR code.' })}</p>
            </div>

            {/* WP-G: enable/disable flag (cloud, DEFAULT OFF — new orders are staff-approved requests) */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={remoteOrderingEnabled === true}
                disabled={remoteOrderingEnabled === null || remoteToggleBusy || remoteTogglePending}
                onChange={(e) => { void handleRemoteOrderingToggle(e.target.checked) }}
                className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">{t('settings.remoteOrderingEnable', { defaultValue: 'Enable remote ordering for this restaurant' })}</span>
                <p className="text-xs text-gray-400">
                  {remoteOrderingEnabled === null
                    ? t('settings.remoteOrderingLoading', { defaultValue: 'Checking current status…' })
                    : t('settings.remoteOrderingEnableDesc', { defaultValue: 'OFF by default. When enabled, customer requests appear in the POS inbox and are only prepared after you accept them.' })}
                </p>
              </div>
            </label>
            {remoteTogglePending && (
              <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-xs text-orange-700">{t('settings.remoteOrderingPendingHint', { defaultValue: 'Remote ordering stays OFF until this app can securely prove its identity to the cloud (arrives with the next update).' })}</p>
              </div>
            )}
            {remoteOrderingEnabled === false && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500">{t('settings.remoteOrderingOffHint', { defaultValue: 'The ordering link and QR code below stay inactive until you enable remote ordering.' })}</p>
              </div>
            )}

            {/* Cloud ordering link */}
            {machineId ? (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="font-medium text-sm mb-2">{t('settings.orderingLink', { defaultValue: 'Ordering Link' })}</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-800 flex-1 bg-white rounded px-3 py-2 border border-gray-200">
                      fastfood-manager.vercel.app/r/{machineId}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`https://fastfood-manager.vercel.app/r/${machineId}`)
                        setCopiedCode('order')
                        setTimeout(() => setCopiedCode(null), 2000)
                      }}
                      className="flex-shrink-0 text-orange-500 hover:text-orange-600 p-2"
                      title={t('settings.copyLink', { defaultValue: 'Copy link' })}
                    >
                      {copiedCode === 'order' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{t('settings.orderingQrHint', { defaultValue: 'Customers scan this QR code to order from their phone.' })}</p>
                </div>

                {/* QR code */}
                {remoteOrderQr && (
                  <div className="flex flex-col sm:flex-row gap-6 items-start">
                    <img src={remoteOrderQr} alt={t('settings.remoteOrderQrAlt', { defaultValue: 'Remote Order QR' })} className="w-48 h-48 rounded-lg border border-gray-200" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-500 mb-2">{t('settings.orderQrPrintHint', { defaultValue: 'Print or display this QR code at your tables.' })}</p>
                      <p className="text-xs text-gray-400 mt-2">{t('settings.worksAnyDevice', { defaultValue: 'Works from any device with internet access.' })}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <p className="text-sm text-orange-700">{t('settings.machineIdLoadError', { defaultValue: 'Machine ID could not be loaded. Try restarting the app.' })}</p>
              </div>
            )}

            {/* PIN section */}
            <div className="border-t pt-6">
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
              {tabletPinEnabled && !tabletPinSet && (
                <div className="flex items-start gap-2 p-3 mb-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{t('settings.tabletPinNotSet')}</span>
                </div>
              )}
              {tabletPinEnabled && (
                <Button onClick={() => openPinModal('change')} variant="secondary">
                  {t('settings.tabletPinChange')}
                </Button>
              )}
            </div>

            {/* Note about local server */}
            <div className="border-t pt-4">
              <p className="text-xs text-gray-400">{t('settings.tabletServerNote', { defaultValue: 'The tablet server still runs in the background for local network access.' })}</p>
            </div>
          </div>

          {/* PIN modal */}
          {tabletPinModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
                <h3 className="font-bold text-lg mb-1">
                  {pinModalMode === 'enable' ? t('settings.tabletPinSetTitle') : t('settings.tabletPinModalTitle')}
                </h3>
                <p className="text-xs text-orange-600 mb-4">
                  {pinModalMode === 'enable' ? t('settings.tabletPinSetHint') : t('settings.tabletPinModalWarning')}
                </p>
                <div className="space-y-3">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={newPin}
                    readOnly={isTouch}
                    onClick={isTouch ? () => setKeyboardTarget({ field: 'newPin', type: 'numeric' }) : undefined}
                    onChange={isTouch ? undefined : (e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('settings.tabletPinNew')}
                    className={`w-full border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${isTouch ? 'py-3' : 'py-2'}`}
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={confirmPin}
                    readOnly={isTouch}
                    onClick={isTouch ? () => setKeyboardTarget({ field: 'confirmPin', type: 'numeric' }) : undefined}
                    onChange={isTouch ? undefined : (e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('settings.tabletPinConfirm')}
                    className={`w-full border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${isTouch ? 'py-3' : 'py-2'}`}
                  />
                  {pinError && <p className="text-red-500 text-xs">{pinError}</p>}
                  <div className="flex gap-2">
                    <Button onClick={() => { void handleSavePin() }} disabled={newPin.length !== 4}>{t('common.save')}</Button>
                    <Button variant="secondary" onClick={closePinModal}>{t('common.cancel')}</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {tab === 'data' && (
        <div className="space-y-8">
          <ExcelImportExport />
          <hr className="border-gray-200" />
          <BackupRestore />
        </div>
      )}

      <UnsavedChangesDialog
        isOpen={pendingLeave !== null}
        saving={savingPending}
        onSave={() => { void handlePendingSave() }}
        onDiscard={handlePendingDiscard}
        onCancel={() => setPendingLeave(null)}
      />
    </div>
  )
}
