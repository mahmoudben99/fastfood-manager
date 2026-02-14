import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download,
  Upload,
  FileSpreadsheet,
  Check,
  AlertCircle,
  RotateCcw,
  Trash2,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import * as XLSX from 'xlsx'

interface MenuVersion {
  id: number
  label: string
  created_at: string
  counts: {
    categories: number
    menuItems: number
    stockItems: number
    workers: number
  } | null
}

// SheetJS/XLSX corrupts emoji codepoints by dropping the high surrogate,
// turning U+1F96A into U+F96A. This repairs them by adding 0x10000 back.
function fixEmoji(str: string | undefined): string | undefined {
  if (!str) return str
  return [...str]
    .map((ch) => {
      const code = ch.codePointAt(0)!
      if (code >= 0xe000 && code <= 0xffff) {
        const fixed = code + 0x10000
        if (fixed >= 0x1f300 && fixed <= 0x1faff) {
          return String.fromCodePoint(fixed)
        }
      }
      return ch
    })
    .join('')
}

export function ExcelImportExport() {
  const { t } = useTranslation()
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [versions, setVersions] = useState<MenuVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(true)
  const [restoringId, setRestoringId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [confirmRestoreId, setConfirmRestoreId] = useState<number | null>(null)
  const [showVersions, setShowVersions] = useState(true)

  const loadVersions = async () => {
    try {
      const list = await window.api.data.listVersions()
      setVersions(list)
    } catch {
      // ignore
    } finally {
      setLoadingVersions(false)
    }
  }

  useEffect(() => {
    loadVersions()
  }, [])

  const exportData = async () => {
    const [categories, menuItems, stockItems, workers] = await Promise.all([
      window.api.categories.getAll(),
      window.api.menu.getAll(),
      window.api.stock.getAll(),
      window.api.workers.getAll()
    ])

    const wb = XLSX.utils.book_new()

    const catData = categories.map((c: any) => ({
      Name: c.name,
      Name_AR: c.name_ar || '',
      Name_FR: c.name_fr || '',
      Emoji: c.icon || ''
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catData), 'Categories')

    const menuData = menuItems.map((m: any) => ({
      Name: m.name,
      Name_AR: m.name_ar || '',
      Name_FR: m.name_fr || '',
      Price: m.price,
      Category_Name: m.category_name || '',
      Emoji: m.emoji || ''
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(menuData), 'Menu Items')

    const stockData = stockItems.map((s: any) => ({
      Name: s.name,
      Name_AR: s.name_ar || '',
      Name_FR: s.name_fr || '',
      Unit_Type: s.unit_type,
      Initial_Quantity: s.quantity,
      Price_Per_Unit: s.price_per_unit,
      Alert_Threshold: s.alert_threshold
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockData), 'Stock Items')

    const workerData = workers.map((w: any) => ({
      Name: w.name,
      Role: w.role,
      Pay_Full_Day: w.pay_full_day,
      Pay_Half_Day: w.pay_half_day,
      Phone: w.phone || '',
      Categories: ''
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(workerData), 'Workers')

    XLSX.writeFile(wb, 'fastfood-data-export.xlsx')
  }

  const handleImport = async () => {
    setImporting(true)
    setImportResult(null)

    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.xlsx,.xls'

      input.onchange = async (e: any) => {
        const file = e.target.files[0]
        if (!file) {
          setImporting(false)
          return
        }

        const reader = new FileReader()
        reader.onload = async (ev) => {
          try {
            // Auto-save current data as a version before importing
            const now = new Date()
            const label = `Before import - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            await window.api.data.saveVersion(label)

            const data = new Uint8Array(ev.target!.result as ArrayBuffer)
            const wb = XLSX.read(data, { type: 'array' })

            let imported = 0

            // Clear existing data before importing
            await window.api.data.clearForImport()

            // Import Categories
            const catSheet = wb.Sheets['Categories']
            if (catSheet) {
              const cats: any[] = XLSX.utils.sheet_to_json(catSheet)
              for (const cat of cats) {
                if (cat.Name) {
                  await window.api.categories.create({
                    name: cat.Name,
                    name_ar: cat.Name_AR,
                    name_fr: cat.Name_FR,
                    icon: fixEmoji(cat.Emoji) || undefined
                  })
                  imported++
                }
              }
            }

            // Import Stock Items
            const stockSheet = wb.Sheets['Stock Items']
            if (stockSheet) {
              const stocks: any[] = XLSX.utils.sheet_to_json(stockSheet)
              for (const s of stocks) {
                if (s.Name) {
                  await window.api.stock.create({
                    name: s.Name,
                    name_ar: s.Name_AR,
                    name_fr: s.Name_FR,
                    unit_type: s.Unit_Type || s['Unit_Type (kg/liter/unit)'] || 'kg',
                    quantity: Number(s.Initial_Quantity) || 0,
                    price_per_unit: Number(s.Price_Per_Unit) || 0,
                    alert_threshold: Number(s.Alert_Threshold) || 0
                  })
                  imported++
                }
              }
            }

            // Import Menu Items (needs categories to exist first)
            const menuSheet = wb.Sheets['Menu Items']
            if (menuSheet) {
              const allCats = await window.api.categories.getAll()
              const menus: any[] = XLSX.utils.sheet_to_json(menuSheet)
              for (const m of menus) {
                if (m.Name && m.Price) {
                  const cat = allCats.find(
                    (c: any) =>
                      c.name.toLowerCase() === (m.Category_Name || '').toLowerCase()
                  )
                  if (cat) {
                    await window.api.menu.create({
                      name: m.Name,
                      name_ar: m.Name_AR,
                      name_fr: m.Name_FR,
                      price: Number(m.Price),
                      category_id: cat.id,
                      emoji: fixEmoji(m.Emoji) || undefined
                    })
                    imported++
                  }
                }
              }
            }

            // Import Workers
            const workerSheet = wb.Sheets['Workers']
            if (workerSheet) {
              const workers: any[] = XLSX.utils.sheet_to_json(workerSheet)
              for (const w of workers) {
                if (w.Name) {
                  await window.api.workers.create({
                    name: w.Name,
                    role:
                      w.Role ||
                      w['Role (cook/server/cleaner/cashier/other)'] ||
                      'cook',
                    pay_full_day: Number(w.Pay_Full_Day) || 0,
                    pay_half_day: Number(w.Pay_Half_Day) || 0,
                    phone: w.Phone
                  })
                  imported++
                }
              }
            }

            setImportResult({
              success: true,
              message: `${t('excel.success')} (${imported} items)`
            })

            // Reload versions list
            loadVersions()
          } catch (err: any) {
            setImportResult({ success: false, message: err.message })
          } finally {
            setImporting(false)
          }
        }
        reader.readAsArrayBuffer(file)
      }

      input.click()
    } catch {
      setImporting(false)
    }
  }

  const handleRestore = async (versionId: number) => {
    setRestoringId(versionId)
    setConfirmRestoreId(null)
    try {
      // Save current state before restoring
      const now = new Date()
      const label = `Before restore - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      await window.api.data.saveVersion(label)

      await window.api.data.restoreVersion(versionId)
      setImportResult({ success: true, message: 'Version restored successfully!' })
      loadVersions()
    } catch (err: any) {
      setImportResult({ success: false, message: err.message })
    } finally {
      setRestoringId(null)
    }
  }

  const handleDelete = async (versionId: number) => {
    setDeletingId(versionId)
    setConfirmDeleteId(null)
    try {
      await window.api.data.deleteVersion(versionId)
      setVersions((prev) => prev.filter((v) => v.id !== versionId))
    } catch {
      // ignore
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'Z')
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('excel.title')}</h1>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Export current data */}
        <Card>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-50 rounded-xl">
              <Download className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-1">Download Current Menu</h3>
              <p className="text-sm text-gray-500 mb-3">
                Export your current menu, stock, and workers data as an Excel file.
              </p>
              <Button variant="secondary" onClick={exportData} className="justify-start">
                <FileSpreadsheet className="h-4 w-4" />
                Export Excel
              </Button>
            </div>
          </div>
        </Card>

        {/* Import new version */}
        <Card>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-orange-50 rounded-xl">
              <Upload className="h-6 w-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-1">Update Menu</h3>
              <p className="text-sm text-gray-500 mb-3">
                Import a new Excel file. Your current data will be saved as a version automatically.
              </p>
              <Button onClick={handleImport} loading={importing}>
                <Upload className="h-4 w-4" />
                Import New Excel
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Import result */}
      {importResult && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-sm mb-6 ${
            importResult.success
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {importResult.success ? (
            <Check className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {importResult.message}
        </div>
      )}

      {/* Version History */}
      <Card>
        <button
          onClick={() => setShowVersions(!showVersions)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900">Version History</h3>
            {versions.length > 0 && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {versions.length}
              </span>
            )}
          </div>
          {showVersions ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </button>

        {showVersions && (
          <div className="mt-4">
            {loadingVersions ? (
              <p className="text-sm text-gray-400 py-4 text-center">Loading...</p>
            ) : versions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No versions yet</p>
                <p className="text-xs mt-1">
                  Versions are created automatically when you import a new Excel file.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {version.label}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-400">
                          {formatDate(version.created_at)}
                        </span>
                        {version.counts && (
                          <span className="text-xs text-gray-400">
                            {version.counts.categories} categories
                            {' \u00B7 '}
                            {version.counts.menuItems} items
                            {' \u00B7 '}
                            {version.counts.stockItems} stock
                            {' \u00B7 '}
                            {version.counts.workers} workers
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      {/* Restore */}
                      {confirmRestoreId === version.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-orange-600 mr-1">Restore?</span>
                          <button
                            onClick={() => handleRestore(version.id)}
                            className="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmRestoreId(null)}
                            className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setConfirmRestoreId(version.id)
                            setConfirmDeleteId(null)
                          }}
                          disabled={restoringId === version.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-orange-600 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {restoringId === version.id ? 'Restoring...' : 'Restore'}
                        </button>
                      )}

                      {/* Delete */}
                      {confirmDeleteId === version.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-600 mr-1">Delete?</span>
                          <button
                            onClick={() => handleDelete(version.id)}
                            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setConfirmDeleteId(version.id)
                            setConfirmRestoreId(null)
                          }}
                          disabled={deletingId === version.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
