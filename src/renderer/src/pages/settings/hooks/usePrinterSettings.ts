import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipcErrorMessage } from '../../../utils/ipcError'

/** One physical printer and the jobs it prints ('receipt', 'kitchen_all', 'worker_<id>'). */
export interface PrinterConfig {
  id: string
  printerName: string
  tasks: string[]
  autoPrint: boolean
  paperWidth: string
  receiptFontSize: string
  kitchenFontSize: string
}

export interface PrinterTestResult {
  success: boolean
  error?: string
  printerName?: string
}

interface AssignmentRow {
  printer_name: string
  assignment_type: string
  worker_id?: number | null
  auto_print?: number | boolean
  paper_width?: string
  receipt_font_size?: string
  kitchen_font_size?: string
}

/** Group printer_assignments rows (one per task) back into one config per printer. */
function configsFromAssignments(rows: AssignmentRow[]): PrinterConfig[] {
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
const printerSignature = (configs: PrinterConfig[]) =>
  JSON.stringify(configs.map(({ id: _id, ...rest }) => rest))

/** Settings > Printers: installed printers, per-printer task assignment, test prints. */
export function usePrinterSettings(onSaved: () => void) {
  const { t } = useTranslation()
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean }[]>([])
  const [workers, setWorkers] = useState<{ id: number; name: string }[]>([])
  const [configs, setConfigs] = useState<PrinterConfig[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState('[]')
  const [testResults, setTestResults] = useState<Record<string, PrinterTestResult>>({})
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      setPrinters(await window.api.printer.getPrinters())
    } catch {
      setPrinters([])
    }
    try {
      setWorkers(await window.api.workers.getAll())
    } catch {
      setWorkers([])
    }
    try {
      const next = configsFromAssignments(await window.api.printer.getAssignments())
      setConfigs(next)
      setSavedSnapshot(printerSignature(next))
    } catch {
      // Printer assignments might not exist yet
    }
    setLoaded(true)
  }, [])

  const add = () =>
    setConfigs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        printerName: '',
        tasks: [],
        autoPrint: false,
        paperWidth: '80',
        receiptFontSize: 'medium',
        kitchenFontSize: 'large'
      }
    ])

  const remove = (id: string) => setConfigs((prev) => prev.filter((p) => p.id !== id))

  const update = (id: string, patch: Partial<PrinterConfig>) =>
    setConfigs((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const toggleTask = (id: string, task: string) =>
    setConfigs((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const tasks = p.tasks.includes(task) ? p.tasks.filter((x) => x !== task) : [...p.tasks, task]
        return { ...p, tasks }
      })
    )

  const testPrint = async (id: string, printerName: string) => {
    if (!printerName) return
    setTestingIds((prev) => new Set(prev).add(id))
    try {
      // Contract C3: { success, error?, printerName? } — error is human-readable (e.g. printer not found).
      const result = await window.api.printer.testPrintOnPrinter(printerName)
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: !!result?.success, error: result?.error, printerName: result?.printerName || printerName }
      }))
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: false, error: ipcErrorMessage(err) || t('settings.testFailed') }
      }))
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  /** Saves the printer list. An empty list is valid: it clears every printer/assignment. */
  const save = async (): Promise<boolean> => {
    setSaveError('')
    setSaving(true)
    try {
      await window.api.printer.saveFullConfig({
        assignments: configs.map((c) => ({
          printerName: c.printerName,
          tasks: c.tasks,
          autoPrint: c.autoPrint,
          paperWidth: c.paperWidth,
          receiptFontSize: c.receiptFontSize,
          kitchenFontSize: c.kitchenFontSize
        }))
      })
      // Reload from the database so state matches what was saved (including an empty list).
      const next = configsFromAssignments(await window.api.printer.getAssignments())
      setConfigs(next)
      setSavedSnapshot(printerSignature(next))
      onSaved()
      return true
    } catch (err) {
      console.error('Failed to save printer config:', err)
      setSaveError(t('settings.saveFailed', { error: ipcErrorMessage(err) }))
      return false
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    setConfigs(
      (JSON.parse(savedSnapshot) as Omit<PrinterConfig, 'id'>[]).map((c) => ({ ...c, id: crypto.randomUUID() }))
    )
    setSaveError('')
  }

  const availableTasks = (): { value: string; label: string }[] => [
    { value: 'receipt', label: t('settings.taskCustomerReceipt') },
    { value: 'kitchen_all', label: t('settings.taskKitchenAll') },
    ...workers.map((w) => ({ value: `worker_${w.id}`, label: t('settings.taskKitchenWorker', { name: w.name }) }))
  ]

  const isMissing = (name: string) => !!name && !printers.some((p) => p.name === name)

  return {
    printers,
    configs,
    loaded,
    load,
    add,
    remove,
    update,
    toggleTask,
    testPrint,
    testResults,
    testingIds,
    save,
    discard,
    saving,
    saveError,
    availableTasks,
    isMissing,
    isDirty: printerSignature(configs) !== savedSnapshot
  }
}

export type PrinterSettings = ReturnType<typeof usePrinterSettings>
