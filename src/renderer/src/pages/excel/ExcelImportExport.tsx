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

export function ExcelImportExport() {
  const { t } = useTranslation()
  const [importResult, setImportResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [versions, setVersions] = useState<MenuVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [savingVersion, setSavingVersion] = useState(false)
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
    setExporting(true)
    setImportResult(null)
    try {
      const [categories, menuItems, stockItems, workers] = await Promise.all([
        window.api.categories.getAll(),
        window.api.menu.getAll(),
        window.api.stock.getAll(),
        window.api.workers.getAll()
      ])
      const menuDetails = await Promise.all(
        menuItems.map((item: any) => window.api.menu.getById(item.id))
      )
      const categoryNames = new Map(categories.map((category: any) => [category.id, category.name]))

      const wb = XLSX.utils.book_new()

      const catData = categories.map((c: any) => ({
        Name: c.name,
        Name_AR: c.name_ar || '',
        Name_FR: c.name_fr || '',
        Emoji: c.icon || ''
      }))
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(catData, { header: ['Name', 'Name_AR', 'Name_FR', 'Emoji'] }),
        'Categories'
      )

      const menuData = menuItems.map((m: any) => ({
        Name: m.name,
        Name_AR: m.name_ar || '',
        Name_FR: m.name_fr || '',
        Price: m.price,
        Category_Name: m.category_name || '',
        Emoji: m.emoji || ''
      }))
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(menuData, {
          header: ['Name', 'Name_AR', 'Name_FR', 'Price', 'Category_Name', 'Emoji']
        }),
        'Menu Items'
      )

      const stockData = stockItems.map((s: any) => ({
        Name: s.name,
        Name_AR: s.name_ar || '',
        Name_FR: s.name_fr || '',
        Unit_Type: s.unit_type,
        Initial_Quantity: s.quantity,
        Price_Per_Unit: s.price_per_unit,
        Alert_Threshold: s.alert_threshold
      }))
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(stockData, {
          header: [
            'Name',
            'Name_AR',
            'Name_FR',
            'Unit_Type',
            'Initial_Quantity',
            'Price_Per_Unit',
            'Alert_Threshold'
          ]
        }),
        'Stock Items'
      )

      const workerData = workers.map((w: any) => ({
        Name: w.name,
        Role: w.role,
        Pay_Full_Day: w.pay_full_day,
        Pay_Half_Day: w.pay_half_day,
        Phone: w.phone || '',
        Categories: (w.category_ids || [])
          .map((categoryId: number) => categoryNames.get(categoryId))
          .filter(Boolean)
          .join(', ')
      }))
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(workerData, {
          header: ['Name', 'Role', 'Pay_Full_Day', 'Pay_Half_Day', 'Phone', 'Categories']
        }),
        'Workers'
      )

      const ingredientData = menuDetails.flatMap((item: any) =>
        (item?.ingredients || []).map((ingredient: any) => ({
          Menu_Item_Name: item.name,
          Stock_Item_Name: ingredient.stock_item_name || '',
          Quantity: ingredient.quantity,
          Unit: ingredient.unit
        }))
      )
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(ingredientData, {
          header: ['Menu_Item_Name', 'Stock_Item_Name', 'Quantity', 'Unit']
        }),
        'Ingredients'
      )

      XLSX.writeFile(wb, 'fastfood-data-export.xlsx')
    } catch (error) {
      setImportResult({
        success: false,
        message: error instanceof Error ? error.message : 'Excel export failed.'
      })
    } finally {
      setExporting(false)
    }
  }

  const saveRecoveryPoint = async () => {
    setSavingVersion(true)
    setImportResult(null)
    try {
      const now = new Date()
      const label = `Manual menu recovery point - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })}`
      const result = await window.api.data.saveVersion(label)
      if (!result?.success) throw new Error('The recovery point could not be saved.')
      setImportResult({
        success: true,
        message: t('excel.recoverySaved', { defaultValue: 'Menu recovery point saved.' })
      })
      await loadVersions()
    } catch (error) {
      setImportResult({
        success: false,
        message: error instanceof Error ? error.message : 'The recovery point could not be saved.'
      })
    } finally {
      setSavingVersion(false)
    }
  }

  const handleRestore = async (versionId: number) => {
    setRestoringId(versionId)
    setConfirmRestoreId(null)
    try {
      // Save current state before restoring
      const now = new Date()
      const label = `Before restore - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      const saved = await window.api.data.saveVersion(label)
      if (!saved?.success) throw new Error('The current data could not be saved before restore.')

      const restored = await window.api.data.restoreVersion(versionId)
      if (!restored?.success) throw new Error('The recovery point could not be restored.')
      setImportResult({
        success: true,
        message: t('excel.restoreSuccess', { defaultValue: 'Version restored successfully!' })
      })
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
      const result = await window.api.data.deleteVersion(versionId)
      if (!result?.success) throw new Error('The recovery point could not be deleted.')
      setVersions((prev) => prev.filter((v) => v.id !== versionId))
    } catch (error) {
      setImportResult({
        success: false,
        message: error instanceof Error ? error.message : 'The recovery point could not be deleted.'
      })
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Export current data */}
        <Card>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-50 rounded-xl">
              <Download className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-1">
                {t('excel.downloadMenuTitle', { defaultValue: 'Download Current Menu' })}
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                {t('excel.downloadMenuDesc', {
                  defaultValue:
                    'Export your current menu, stock, and workers data as an Excel file.'
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={exportData}
                  loading={exporting}
                  className="justify-start"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {t('excel.exportExcel', { defaultValue: 'Export Excel' })}
                </Button>
                <Button
                  variant="ghost"
                  onClick={saveRecoveryPoint}
                  loading={savingVersion}
                  className="justify-start"
                >
                  <Clock className="h-4 w-4" />
                  {t('excel.saveRecovery', { defaultValue: 'Save menu recovery point' })}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Production-disabled until a stable-ID, non-destructive updater is available. */}
        <Card>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-gray-100 rounded-xl">
              <Upload className="h-6 w-6 text-gray-500" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900">
                  {t('excel.updateMenuTitle', { defaultValue: 'Update Menu' })}
                </h3>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {t('excel.updateDisabledBadge', { defaultValue: 'Safety hold' })}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                {t('excel.updateDisabledDesc', {
                  defaultValue:
                    'Excel replacement is temporarily disabled because the old importer could erase recipes and stock history. Edit live data from Menu, Stock, and Workers.'
                })}
              </p>
              <Button variant="secondary" disabled>
                <AlertCircle className="h-4 w-4" />
                {t('excel.updateDisabledButton', { defaultValue: 'Excel update unavailable' })}
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
            <h3 className="text-lg font-semibold text-gray-900">
              {t('excel.versionHistory', { defaultValue: 'Version History' })}
            </h3>
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
              <p className="text-sm text-gray-400 py-4 text-center">{t('common.loading')}</p>
            ) : versions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('excel.noVersions', { defaultValue: 'No versions yet' })}</p>
                <p className="text-xs mt-1">
                  {t('excel.noVersionsHint', {
                    defaultValue:
                      'Versions are created automatically when you import a new Excel file.'
                  })}
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
                            {t('excel.countCategories', {
                              defaultValue: '{{count}} categories',
                              count: version.counts.categories
                            })}
                            {' \u00B7 '}
                            {t('excel.countItems', {
                              defaultValue: '{{count}} items',
                              count: version.counts.menuItems
                            })}
                            {' \u00B7 '}
                            {t('excel.countStock', {
                              defaultValue: '{{count}} stock',
                              count: version.counts.stockItems
                            })}
                            {' \u00B7 '}
                            {t('excel.countWorkers', {
                              defaultValue: '{{count}} workers',
                              count: version.counts.workers
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      {/* Restore */}
                      {confirmRestoreId === version.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-orange-600 mr-1">
                            {t('excel.restoreConfirm', { defaultValue: 'Restore?' })}
                          </span>
                          <button
                            onClick={() => handleRestore(version.id)}
                            className="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
                          >
                            {t('common.yes')}
                          </button>
                          <button
                            onClick={() => setConfirmRestoreId(null)}
                            className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition-colors"
                          >
                            {t('common.no')}
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
                          {restoringId === version.id
                            ? t('excel.restoring', { defaultValue: 'Restoring...' })
                            : t('excel.restore', { defaultValue: 'Restore' })}
                        </button>
                      )}

                      {/* Delete */}
                      {confirmDeleteId === version.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-600 mr-1">
                            {t('excel.deleteConfirm', { defaultValue: 'Delete?' })}
                          </span>
                          <button
                            onClick={() => handleDelete(version.id)}
                            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                          >
                            {t('common.yes')}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition-colors"
                          >
                            {t('common.no')}
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
