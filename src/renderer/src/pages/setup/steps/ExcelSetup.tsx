import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Props {
  onImported: () => void
}

export function ExcelSetup({ onImported }: Props) {
  const { t } = useTranslation()
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleImport = async () => {
    setImporting(true)
    setImportResult(null)

    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.xlsx,.xls'

      input.onchange = async (e: any) => {
        const file = e.target.files[0]
        if (!file) { setImporting(false); return }

        const reader = new FileReader()
        reader.onload = async (ev) => {
          try {
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
                    name: cat.Name, name_ar: cat.Name_AR, name_fr: cat.Name_FR,
                    icon: cat.Emoji || undefined
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
                    name: s.Name, name_ar: s.Name_AR, name_fr: s.Name_FR,
                    unit_type: s.Unit_Type || s['Unit_Type (kg/liter/unit)'] || 'kg',
                    quantity: Number(s.Initial_Quantity) || 0,
                    price_per_unit: Number(s.Price_Per_Unit) || 0,
                    alert_threshold: Number(s.Alert_Threshold) || 0
                  })
                  imported++
                }
              }
            }

            // Import Menu Items
            const menuSheet = wb.Sheets['Menu Items']
            if (menuSheet) {
              const allCats = await window.api.categories.getAll()
              const menus: any[] = XLSX.utils.sheet_to_json(menuSheet)
              for (const m of menus) {
                if (m.Name && m.Price) {
                  const cat = allCats.find((c: any) =>
                    c.name.toLowerCase() === (m.Category_Name || '').toLowerCase()
                  )
                  if (cat) {
                    await window.api.menu.create({
                      name: m.Name, name_ar: m.Name_AR, name_fr: m.Name_FR,
                      price: Number(m.Price), category_id: cat.id,
                      emoji: m.Emoji || undefined
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
                    role: w.Role || w['Role (cook/server/cleaner/cashier/other)'] || 'cook',
                    pay_full_day: Number(w.Pay_Full_Day) || 0,
                    pay_half_day: Number(w.Pay_Half_Day) || 0,
                    phone: w.Phone
                  })
                  imported++
                }
              }
            }

            // Import Ingredients
            const ingSheet = wb.Sheets['Ingredients']
            if (ingSheet) {
              const allMenuItems = await window.api.menu.getAll()
              const allStockItems = await window.api.stock.getAll()
              const ings: any[] = XLSX.utils.sheet_to_json(ingSheet)

              const grouped: Record<string, { stock_item_id: number; quantity: number; unit: string }[]> = {}
              for (const ing of ings) {
                const menuItem = allMenuItems.find((m: any) =>
                  m.name.toLowerCase() === (ing.Menu_Item_Name || '').toLowerCase()
                )
                const stockItem = allStockItems.find((s: any) =>
                  s.name.toLowerCase() === (ing.Stock_Item_Name || '').toLowerCase()
                )
                if (menuItem && stockItem) {
                  const key = String(menuItem.id)
                  if (!grouped[key]) grouped[key] = []
                  grouped[key].push({
                    stock_item_id: stockItem.id,
                    quantity: Number(ing.Quantity) || 0,
                    unit: stockItem.unit_type || 'kg'
                  })
                }
              }

              for (const [menuItemId, ingredients] of Object.entries(grouped)) {
                await window.api.menu.update(Number(menuItemId), { ingredients })
                imported += ingredients.length
              }
            }

            setImportResult({ success: true, message: `Imported ${imported} items successfully!` })
            if (imported > 0) onImported()
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

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">{t('setup.excel.title', { defaultValue: 'Import Your Data' })}</h2>
        <p className="text-gray-500 mt-1">{t('setup.excel.subtitle', { defaultValue: 'Do you have a prepared Excel file with your menu data?' })}</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        {/* Import Excel option */}
        <button
          onClick={handleImport}
          disabled={importing}
          className="w-full flex items-center gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-all text-left"
        >
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
            <Upload className="h-6 w-6 text-orange-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{t('setup.excel.importOption', { defaultValue: 'Import Excel File' })}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('setup.excel.importOptionDesc', { defaultValue: 'Upload a prepared Excel file with your categories, menu, stock, and workers' })}</p>
          </div>
          {importing && (
            <div className="animate-spin h-5 w-5 border-2 border-orange-500 border-t-transparent rounded-full shrink-0" />
          )}
        </button>

        {importResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {importResult.success ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {importResult.message}
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">{t('setup.excel.or', { defaultValue: 'OR' })}</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Skip / default menu option */}
        <div className="flex items-center gap-4 p-5 rounded-xl border-2 border-gray-200 bg-gray-50">
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="h-6 w-6 text-gray-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{t('setup.excel.skipOption', { defaultValue: 'Continue with default menu' })}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('setup.excel.skipOptionDesc', { defaultValue: 'Start with a basic menu and customize it later from the admin panel' })}</p>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center">
          {t('setup.excel.skipNote', { defaultValue: 'You can always import or edit your data later from the admin panel' })}
        </p>
      </div>
    </div>
  )
}
