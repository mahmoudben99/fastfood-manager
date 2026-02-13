import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Upload, FileSpreadsheet, Check, AlertCircle, Copy, Info } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import * as XLSX from 'xlsx'

const TEMPLATE_GUIDE = `# Fast Food Manager - Excel Template Guide

This template has 5 sheets. Fill them in order (Categories first, then the rest).
Send this guide along with the empty template to an AI assistant and it will help you fill it.

## Sheet 1: Categories
Food categories for your menu (e.g., Tacos, Burger, Pizza, Drinks).
| Column | Description | Required | Example |
|--------|------------|----------|---------|
| Name | Category name in English | Yes | "Tacos" |
| Name_AR | Category name in Arabic | No | "تاكوس" |
| Name_FR | Category name in French | No | "Tacos" |

## Sheet 2: Menu Items
Each menu item (food/drink) that customers can order.
| Column | Description | Required | Example |
|--------|------------|----------|---------|
| Name | Item name in English | Yes | "Classic Burger" |
| Name_AR | Item name in Arabic | No | "برغر كلاسيك" |
| Name_FR | Item name in French | No | "Burger Classique" |
| Price | Selling price (number only, no currency symbol) | Yes | 450 |
| Category_Name | Must match a name from the Categories sheet exactly | Yes | "Burger" |
| Image_Filename | Filename of the image (place images in a folder) | No | "classic-burger.jpg" |

## Sheet 3: Stock Items
Raw ingredients/supplies used to make menu items.
| Column | Description | Required | Example |
|--------|------------|----------|---------|
| Name | Ingredient name in English | Yes | "Ground Beef" |
| Name_AR | Arabic name | No | "لحم مفروم" |
| Name_FR | French name | No | "Boeuf Haché" |
| Unit_Type | Must be one of: kg, liter, unit | Yes | "kg" |
| Initial_Quantity | Starting quantity in stock | Yes | 50 |
| Price_Per_Unit | Cost per unit (purchase price) | Yes | 800 |
| Alert_Threshold | Low stock warning level | Yes | 5 |

## Sheet 4: Workers
Staff members (cooks, servers, cleaners, etc.).
| Column | Description | Required | Example |
|--------|------------|----------|---------|
| Name | Worker full name | Yes | "Ahmed Benali" |
| Role | Must be one of: cook, server, cleaner, cashier, other | Yes | "cook" |
| Pay_Full_Day | Full day salary (number) | Yes | 2000 |
| Pay_Half_Day | Half day salary (number) | Yes | 1200 |
| Phone | Phone number | No | "0555123456" |
| Categories | For cooks only: comma-separated category names they can prepare | No | "Burger,Tacos,Pizza" |

## Sheet 5: Ingredients
Links menu items to stock items (what ingredients each dish needs).
| Column | Description | Required | Example |
|--------|------------|----------|---------|
| Menu_Item_Name | Must match a name from Menu Items sheet exactly | Yes | "Classic Burger" |
| Stock_Item_Name | Must match a name from Stock Items sheet exactly | Yes | "Ground Beef" |
| Quantity | Amount needed per dish | Yes | 0.15 |
| Unit | Display unit: g (grams), ml (milliliters), unit | Yes | "kg" |

## Important Notes
- Fill Categories BEFORE Menu Items (menu items reference categories by name)
- Fill Stock Items BEFORE Ingredients (ingredients reference stock items by name)
- Names must match exactly between sheets (case-sensitive)
- Prices are numbers only — the currency is configured in the app settings
- For "Unit_Type": kg = kilograms, liter = liters, unit = individual items (eggs, buns, etc.)
`

export function ExcelImportExport() {
  const { t } = useTranslation()
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const exportTemplate = () => {
    const wb = XLSX.utils.book_new()

    // Categories sheet
    const catHeaders = [['Name', 'Name_AR', 'Name_FR']]
    const catWs = XLSX.utils.aoa_to_sheet(catHeaders)
    XLSX.utils.book_append_sheet(wb, catWs, 'Categories')

    // Menu Items sheet
    const menuHeaders = [['Name', 'Name_AR', 'Name_FR', 'Price', 'Category_Name', 'Image_Filename']]
    const menuWs = XLSX.utils.aoa_to_sheet(menuHeaders)
    XLSX.utils.book_append_sheet(wb, menuWs, 'Menu Items')

    // Stock Items sheet
    const stockHeaders = [['Name', 'Name_AR', 'Name_FR', 'Unit_Type (kg/liter/unit)', 'Initial_Quantity', 'Price_Per_Unit', 'Alert_Threshold']]
    const stockWs = XLSX.utils.aoa_to_sheet(stockHeaders)
    XLSX.utils.book_append_sheet(wb, stockWs, 'Stock Items')

    // Workers sheet
    const workerHeaders = [['Name', 'Role (cook/server/cleaner/cashier/other)', 'Pay_Full_Day', 'Pay_Half_Day', 'Phone', 'Categories (comma-separated)']]
    const workerWs = XLSX.utils.aoa_to_sheet(workerHeaders)
    XLSX.utils.book_append_sheet(wb, workerWs, 'Workers')

    // Ingredients sheet
    const ingHeaders = [['Menu_Item_Name', 'Stock_Item_Name', 'Quantity', 'Unit (g/ml/unit)']]
    const ingWs = XLSX.utils.aoa_to_sheet(ingHeaders)
    XLSX.utils.book_append_sheet(wb, ingWs, 'Ingredients')

    XLSX.writeFile(wb, 'fastfood-template.xlsx')
  }

  const exportData = async () => {
    const [categories, menuItems, stockItems, workers] = await Promise.all([
      window.api.categories.getAll(),
      window.api.menu.getAll(),
      window.api.stock.getAll(),
      window.api.workers.getAll()
    ])

    const wb = XLSX.utils.book_new()

    // Categories
    const catData = categories.map((c: any) => ({ Name: c.name, Name_AR: c.name_ar || '', Name_FR: c.name_fr || '' }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catData), 'Categories')

    // Menu Items
    const menuData = menuItems.map((m: any) => ({
      Name: m.name, Name_AR: m.name_ar || '', Name_FR: m.name_fr || '',
      Price: m.price, Category_Name: m.category_name || '', Image_Filename: ''
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(menuData), 'Menu Items')

    // Stock Items
    const stockData = stockItems.map((s: any) => ({
      Name: s.name, Name_AR: s.name_ar || '', Name_FR: s.name_fr || '',
      Unit_Type: s.unit_type, Initial_Quantity: s.quantity, Price_Per_Unit: s.price_per_unit, Alert_Threshold: s.alert_threshold
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockData), 'Stock Items')

    // Workers
    const workerData = workers.map((w: any) => ({
      Name: w.name, Role: w.role, Pay_Full_Day: w.pay_full_day, Pay_Half_Day: w.pay_half_day,
      Phone: w.phone || '', Categories: ''
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
        if (!file) { setImporting(false); return }

        const reader = new FileReader()
        reader.onload = async (ev) => {
          try {
            const data = new Uint8Array(ev.target!.result as ArrayBuffer)
            const wb = XLSX.read(data, { type: 'array' })

            let imported = 0

            // Clear existing data before importing (replaces instead of appending)
            await window.api.data.clearForImport()

            // Import Categories
            const catSheet = wb.Sheets['Categories']
            if (catSheet) {
              const cats: any[] = XLSX.utils.sheet_to_json(catSheet)
              for (const cat of cats) {
                if (cat.Name) {
                  await window.api.categories.create({
                    name: cat.Name, name_ar: cat.Name_AR, name_fr: cat.Name_FR
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

            // Import Menu Items (needs categories to exist first)
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
                      price: Number(m.Price), category_id: cat.id
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
                    name: w.Name, role: w.Role || w['Role (cook/server/cleaner/cashier/other)'] || 'cook',
                    pay_full_day: Number(w.Pay_Full_Day) || 0,
                    pay_half_day: Number(w.Pay_Half_Day) || 0,
                    phone: w.Phone
                  })
                  imported++
                }
              }
            }

            setImportResult({ success: true, message: `${t('excel.success')} (${imported} items)` })
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
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('excel.title')}</h1>

      <div className="grid grid-cols-2 gap-6">
        {/* Export */}
        <Card title={t('excel.export')}>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Download a template or export your current data to Excel.
            </p>
            <div className="flex flex-col gap-3">
              <Button variant="secondary" onClick={exportTemplate} className="justify-start">
                <Download className="h-4 w-4" />
                {t('excel.exportTemplate')}
              </Button>
              <Button variant="secondary" onClick={exportData} className="justify-start">
                <FileSpreadsheet className="h-4 w-4" />
                {t('excel.exportData')}
              </Button>
            </div>
          </div>
        </Card>

        {/* Import */}
        <Card title={t('excel.import')}>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Import data from a filled Excel template.
            </p>
            <Button onClick={handleImport} loading={importing}>
              <Upload className="h-4 w-4" />
              {t('excel.importFile')}
            </Button>

            {importResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {importResult.success ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {importResult.message}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* AI Guide Section */}
      <div className="mt-6">
        <Card>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-orange-500" />
              <h3 className="text-lg font-semibold text-gray-900">Template Guide (for AI Assistance)</h3>
            </div>
            <Button variant="secondary" size="sm" onClick={copyGuide}>
              <Copy className="h-4 w-4" />
              {copied ? 'Copied!' : 'Copy Guide'}
            </Button>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Copy this guide and send it to an AI assistant (like ChatGPT or Claude) along with the empty template.
            The AI will help you fill in all the sheets with your restaurant data.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 font-mono whitespace-pre-wrap max-h-80 overflow-y-auto border">
            {TEMPLATE_GUIDE}
          </div>
        </Card>
      </div>
    </div>
  )
}
