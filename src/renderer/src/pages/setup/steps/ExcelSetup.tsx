import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Upload, FileSpreadsheet, Check, AlertCircle, Copy } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import * as XLSX from 'xlsx'

const TEMPLATE_GUIDE = `# Fast Food Manager - Excel Template Guide

This template has 5 sheets. Fill them in order (Categories first, then the rest).
Send this guide along with the empty template to an AI assistant and it will help you fill it.

## Sheet 1: Categories
| Column | Required | Example |
|--------|----------|---------|
| Name | Yes | "Tacos" |
| Name_AR | No | "تاكوس" |
| Name_FR | No | "Tacos" |
| Emoji | No | "🌮" |

## Sheet 2: Menu Items
| Column | Required | Example |
|--------|----------|---------|
| Name | Yes | "Classic Burger" |
| Name_AR | No | "برغر كلاسيك" |
| Name_FR | No | "Burger Classique" |
| Price | Yes | 450 |
| Category_Name | Yes | "Burger" |
| Emoji | No | "🍔" |

## Sheet 3: Stock Items
| Column | Required | Example |
|--------|----------|---------|
| Name | Yes | "Ground Beef" |
| Name_AR | No | "لحم مفروم" |
| Name_FR | No | "Boeuf Haché" |
| Unit_Type | Yes | "kg" or "liter" or "unit" |
| Initial_Quantity | Yes | 50 |
| Price_Per_Unit | Yes | 800 |
| Alert_Threshold | Yes | 5 |

## Sheet 4: Workers
| Column | Required | Example |
|--------|----------|---------|
| Name | Yes | "Ahmed Benali" |
| Role | Yes | "cook" or "server" or "cleaner" or "cashier" or "other" |
| Pay_Full_Day | Yes | 2000 |
| Pay_Half_Day | Yes | 1200 |
| Phone | No | "0555123456" |

## Sheet 5: Ingredients
| Column | Required | Example |
|--------|----------|---------|
| Menu_Item_Name | Yes | "Classic Burger" |
| Stock_Item_Name | Yes | "Ground Beef" |
| Quantity | Yes | 0.15 |

## Rules
- Category names in Menu Items must match Sheet 1 exactly
- Stock item names in Ingredients must match Sheet 3 exactly
- Menu item names in Ingredients must match Sheet 2 exactly
- Prices are numbers only (no currency symbols)
`

interface Props {
  onImported: () => void
}

export function ExcelSetup({ onImported }: Props) {
  const { t } = useTranslation()
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const exportTemplate = () => {
    const wb = XLSX.utils.book_new()

    const catWs = XLSX.utils.aoa_to_sheet([['Name', 'Name_AR', 'Name_FR', 'Emoji']])
    XLSX.utils.book_append_sheet(wb, catWs, 'Categories')

    const menuWs = XLSX.utils.aoa_to_sheet([['Name', 'Name_AR', 'Name_FR', 'Price', 'Category_Name', 'Emoji']])
    XLSX.utils.book_append_sheet(wb, menuWs, 'Menu Items')

    const stockWs = XLSX.utils.aoa_to_sheet([['Name', 'Name_AR', 'Name_FR', 'Unit_Type (kg/liter/unit)', 'Initial_Quantity', 'Price_Per_Unit', 'Alert_Threshold']])
    XLSX.utils.book_append_sheet(wb, stockWs, 'Stock Items')

    const workerWs = XLSX.utils.aoa_to_sheet([['Name', 'Role (cook/server/cleaner/cashier/other)', 'Pay_Full_Day', 'Pay_Half_Day', 'Phone']])
    XLSX.utils.book_append_sheet(wb, workerWs, 'Workers')

    const ingWs = XLSX.utils.aoa_to_sheet([['Menu_Item_Name', 'Stock_Item_Name', 'Quantity']])
    XLSX.utils.book_append_sheet(wb, ingWs, 'Ingredients')

    XLSX.writeFile(wb, 'fastfood-template.xlsx')
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

            // Import Ingredients — group by menu item, then update each with its ingredients
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

  const copyGuide = () => {
    navigator.clipboard.writeText(TEMPLATE_GUIDE)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">{t('setup.excel.title', { defaultValue: 'Import Your Data' })}</h2>
        <p className="text-gray-500 mt-1">{t('setup.excel.subtitle', { defaultValue: 'Set up your menu, stock, and workers from an Excel file' })}</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm space-y-5">
        {/* Step 1: Download template */}
        <div className="flex items-start gap-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
          <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm shrink-0">1</div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-sm">{t('setup.excel.step1', { defaultValue: 'Download the empty template' })}</h3>
            <p className="text-xs text-gray-500 mt-1">{t('setup.excel.step1Desc', { defaultValue: 'Get the Excel file with all the sheets you need to fill' })}</p>
            <Button variant="secondary" size="sm" onClick={exportTemplate} className="mt-2">
              <Download className="h-4 w-4" />
              {t('excel.exportTemplate', { defaultValue: 'Download Template' })}
            </Button>
          </div>
        </div>

        {/* Step 2: Copy guide for AI */}
        <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-sm shrink-0">2</div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-sm">{t('setup.excel.step2', { defaultValue: 'Copy the guide & fill with AI' })}</h3>
            <p className="text-xs text-gray-500 mt-1">{t('setup.excel.step2Desc', { defaultValue: 'Send this guide + the template to ChatGPT or Claude along with your menu' })}</p>
            <Button variant="secondary" size="sm" onClick={copyGuide} className="mt-2">
              <Copy className="h-4 w-4" />
              {copied ? 'Copied!' : t('setup.excel.copyGuide', { defaultValue: 'Copy Guide for AI' })}
            </Button>
          </div>
        </div>

        {/* Step 3: Import */}
        <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-sm shrink-0">3</div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-sm">{t('setup.excel.step3', { defaultValue: 'Import the filled file' })}</h3>
            <p className="text-xs text-gray-500 mt-1">{t('setup.excel.step3Desc', { defaultValue: 'Upload the completed Excel file to set up everything at once' })}</p>
            <Button size="sm" onClick={handleImport} loading={importing} className="mt-2">
              <Upload className="h-4 w-4" />
              {t('excel.importFile', { defaultValue: 'Import Excel File' })}
            </Button>
          </div>
        </div>

        {importResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {importResult.success ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {importResult.message}
          </div>
        )}

        <p className="text-xs text-gray-400 text-center">
          {t('setup.excel.skipNote', { defaultValue: 'This step is optional — you can skip it and add data manually later' })}
        </p>
      </div>
    </div>
  )
}
