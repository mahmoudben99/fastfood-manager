import * as XLSX from 'xlsx'
import {
  SETUP_IMPORT_LIMITS,
  normalizeStockUnit,
  parseSetupImportNumber,
  setupImportNameKey,
  validateSetupImportPayload,
  type SetupImportPayload
} from '../../../shared/excel-import'

type CellValue = string | number | boolean | Date | null | undefined

interface ParsedSheet {
  headers: Map<string, number>
  rows: { values: CellValue[]; excelRow: number }[]
}

// SheetJS/XLSX can corrupt some emoji codepoints by dropping the high surrogate.
function fixEmoji(value: string | undefined): string | undefined {
  if (!value) return value
  return [...value]
    .map((character) => {
      const code = character.codePointAt(0)!
      if (code >= 0xe000 && code <= 0xffff) {
        const repaired = code + 0x10000
        if (repaired >= 0x1f300 && repaired <= 0x1faff) {
          return String.fromCodePoint(repaired)
        }
      }
      return character
    })
    .join('')
}

function normalizedHeader(value: CellValue): string {
  return typeof value === 'string' ? value.trim().normalize('NFKC').toLocaleLowerCase('en-US') : ''
}

function parseSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  requiredHeaders: string[],
  optional = false
): ParsedSheet | null {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    if (optional) return null
    throw new Error(`Workbook is missing the required "${sheetName}" sheet`)
  }

  // Keep blank rows while reading so every row can be reported with its real Excel row number.
  const isBlank = (values: CellValue[]) =>
    !values.some((value) => value !== null && value !== undefined && String(value).trim() !== '')
  const matrix = XLSX.utils.sheet_to_json<CellValue[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true
  })
  const headerIndex = matrix.findIndex((values) => !isBlank(values))
  if (headerIndex < 0) throw new Error(`Sheet "${sheetName}" is empty and has no header row`)
  const firstExcelRow = (sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).s.r : 0) + 1

  const headers = new Map<string, number>()
  matrix[headerIndex].forEach((value, index) => {
    const header = normalizedHeader(value)
    if (!header) return
    if (headers.has(header)) throw new Error(`Sheet "${sheetName}" has duplicate header "${value}"`)
    headers.set(header, index)
  })

  for (const required of requiredHeaders) {
    if (!headers.has(required.toLocaleLowerCase('en-US'))) {
      throw new Error(`Sheet "${sheetName}" is missing required column "${required}"`)
    }
  }

  const rows = matrix
    .map((values, index) => ({ values, excelRow: firstExcelRow + index }))
    .slice(headerIndex + 1)
    .filter(({ values }) => !isBlank(values))

  return { headers, rows }
}

function column(sheet: ParsedSheet, name: string, fallback?: string): number {
  const exact = sheet.headers.get(name.toLocaleLowerCase('en-US'))
  if (exact !== undefined) return exact
  if (fallback) {
    const legacy = sheet.headers.get(fallback.toLocaleLowerCase('en-US'))
    if (legacy !== undefined) return legacy
  }
  throw new Error(`Required column "${name}" is missing`)
}

function optionalColumn(sheet: ParsedSheet, name: string): number | undefined {
  return sheet.headers.get(name.toLocaleLowerCase('en-US'))
}

function requiredText(value: CellValue, sheet: string, row: number, header: string): string {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new Error(`${sheet} row ${row}: ${header} is required`)
  }
  if (value instanceof Date || typeof value === 'boolean') {
    throw new Error(`${sheet} row ${row}: ${header} must be text`)
  }
  return String(value).trim()
}

function optionalText(value: CellValue): string | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined
  if (value instanceof Date || typeof value === 'boolean') return undefined
  return String(value).trim()
}

function requiredNumber(value: CellValue, sheet: string, row: number, header: string): number {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new Error(`${sheet} row ${row}: ${header} is required`)
  }
  // SheetJS returns true numeric cells as numbers. Numeric text is accepted too, including a
  // decimal comma ("0,5"), but locale-ambiguous strings such as "1,200" are refused rather than
  // guessing whether they mean 1.2 or 1200.
  const parsed = parseSetupImportNumber(value)
  if (parsed === 'ambiguous') {
    throw new Error(
      `${sheet} row ${row}: ${header} "${String(value).trim()}" is ambiguous. Write it without a thousands separator (e.g. 1200) or with a dot for decimals (e.g. 1.2)`
    )
  }
  if (parsed === undefined) {
    throw new Error(`${sheet} row ${row}: ${header} must be a valid number`)
  }
  return parsed
}

function cell(row: { values: CellValue[] }, index: number | undefined): CellValue {
  return index === undefined ? undefined : row.values[index]
}

/** Parse and validate the entire workbook before any IPC call can change the database. */
export function parseSetupWorkbook(data: Uint8Array): SetupImportPayload {
  if (!(data instanceof Uint8Array) || data.byteLength === 0) {
    throw new Error('The selected Excel file is empty')
  }
  if (data.byteLength > SETUP_IMPORT_LIMITS.fileBytes) {
    throw new Error('The selected Excel file is larger than the 10 MB safety limit')
  }

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(data, { type: 'array', cellDates: false })
  } catch {
    throw new Error('The selected file is not a readable Excel workbook')
  }

  const categoriesSheet = parseSheet(workbook, 'Categories', ['Name'])!
  const menuSheet = parseSheet(workbook, 'Menu Items', ['Name', 'Price', 'Category_Name'])!
  const stockSheet = parseSheet(
    workbook,
    'Stock Items',
    ['Name', 'Initial_Quantity', 'Price_Per_Unit', 'Alert_Threshold']
  )!
  const workersSheet = parseSheet(
    workbook,
    'Workers',
    ['Name', 'Pay_Full_Day', 'Pay_Half_Day']
  )!
  const ingredientsSheet = parseSheet(
    workbook,
    'Ingredients',
    ['Menu_Item_Name', 'Stock_Item_Name', 'Quantity'],
    true
  )

  const categoryName = column(categoriesSheet, 'Name')
  const categoryNameAr = optionalColumn(categoriesSheet, 'Name_AR')
  const categoryNameFr = optionalColumn(categoriesSheet, 'Name_FR')
  const categoryEmoji = optionalColumn(categoriesSheet, 'Emoji')
  const categories = categoriesSheet.rows.map((row) => ({
    name: requiredText(cell(row, categoryName), 'Categories', row.excelRow, 'Name'),
    name_ar: optionalText(cell(row, categoryNameAr)),
    name_fr: optionalText(cell(row, categoryNameFr)),
    icon: fixEmoji(optionalText(cell(row, categoryEmoji)))
  }))

  const stockName = column(stockSheet, 'Name')
  const stockNameAr = optionalColumn(stockSheet, 'Name_AR')
  const stockNameFr = optionalColumn(stockSheet, 'Name_FR')
  const stockUnit = column(stockSheet, 'Unit_Type', 'Unit_Type (kg/liter/unit)')
  const stockQuantity = column(stockSheet, 'Initial_Quantity')
  const stockPrice = column(stockSheet, 'Price_Per_Unit')
  const stockThreshold = column(stockSheet, 'Alert_Threshold')
  const stockItems = stockSheet.rows.map((row) => ({
    name: requiredText(cell(row, stockName), 'Stock Items', row.excelRow, 'Name'),
    name_ar: optionalText(cell(row, stockNameAr)),
    name_fr: optionalText(cell(row, stockNameFr)),
    unit_type: requiredText(cell(row, stockUnit), 'Stock Items', row.excelRow, 'Unit_Type'),
    quantity: requiredNumber(cell(row, stockQuantity), 'Stock Items', row.excelRow, 'Initial_Quantity'),
    price_per_unit: requiredNumber(cell(row, stockPrice), 'Stock Items', row.excelRow, 'Price_Per_Unit'),
    alert_threshold: requiredNumber(cell(row, stockThreshold), 'Stock Items', row.excelRow, 'Alert_Threshold')
  }))

  const menuName = column(menuSheet, 'Name')
  const menuNameAr = optionalColumn(menuSheet, 'Name_AR')
  const menuNameFr = optionalColumn(menuSheet, 'Name_FR')
  const menuPrice = column(menuSheet, 'Price')
  const menuCategory = column(menuSheet, 'Category_Name')
  const menuEmoji = optionalColumn(menuSheet, 'Emoji')
  const menuItems = menuSheet.rows.map((row) => ({
    name: requiredText(cell(row, menuName), 'Menu Items', row.excelRow, 'Name'),
    name_ar: optionalText(cell(row, menuNameAr)),
    name_fr: optionalText(cell(row, menuNameFr)),
    price: requiredNumber(cell(row, menuPrice), 'Menu Items', row.excelRow, 'Price'),
    category_name: requiredText(
      cell(row, menuCategory),
      'Menu Items',
      row.excelRow,
      'Category_Name'
    ),
    emoji: fixEmoji(optionalText(cell(row, menuEmoji)))
  }))

  const workerName = column(workersSheet, 'Name')
  const workerRole = column(workersSheet, 'Role', 'Role (cook/server/cleaner/cashier/other)')
  const workerFullPay = column(workersSheet, 'Pay_Full_Day')
  const workerHalfPay = column(workersSheet, 'Pay_Half_Day')
  const workerPhone = optionalColumn(workersSheet, 'Phone')
  const workerCategories = optionalColumn(workersSheet, 'Categories')
  const workers = workersSheet.rows.map((row) => ({
    name: requiredText(cell(row, workerName), 'Workers', row.excelRow, 'Name'),
    role: requiredText(cell(row, workerRole), 'Workers', row.excelRow, 'Role'),
    pay_full_day: requiredNumber(cell(row, workerFullPay), 'Workers', row.excelRow, 'Pay_Full_Day'),
    pay_half_day: requiredNumber(cell(row, workerHalfPay), 'Workers', row.excelRow, 'Pay_Half_Day'),
    phone: optionalText(cell(row, workerPhone)),
    category_names: (optionalText(cell(row, workerCategories)) || '')
      .split(/[,;|]/)
      .map((name) => name.trim())
      .filter(Boolean)
  }))

  const stockUnitByName = new Map(
    stockItems.map((item) => [setupImportNameKey(item.name), normalizeStockUnit(item.unit_type)])
  )
  const ingredients = ingredientsSheet
    ? (() => {
        const ingredientMenu = column(ingredientsSheet, 'Menu_Item_Name')
        const ingredientStock = column(ingredientsSheet, 'Stock_Item_Name')
        const ingredientQuantity = column(ingredientsSheet, 'Quantity')
        const ingredientUnit = optionalColumn(ingredientsSheet, 'Unit')
        return ingredientsSheet.rows.map((row) => {
          const stockItemName = requiredText(
            cell(row, ingredientStock),
            'Ingredients',
            row.excelRow,
            'Stock_Item_Name'
          )
          const stockUnit = stockUnitByName.get(setupImportNameKey(stockItemName))
          const unit = optionalText(cell(row, ingredientUnit))
          // Never guess a weight/volume unit: a blank Unit used to fall back to the stock unit,
          // so "150" of minced meat was deducted as 150 kg per burger.
          if (!unit && (stockUnit === 'kg' || stockUnit === 'liter')) {
            throw new Error(
              `Ingredients row ${row.excelRow}: Unit is required for "${stockItemName}" ` +
                (stockUnit === 'kg'
                  ? '(stock counted in kg). Write g or kg'
                  : '(stock counted in L). Write ml or L')
            )
          }
          return {
            menu_item_name: requiredText(
              cell(row, ingredientMenu),
              'Ingredients',
              row.excelRow,
              'Menu_Item_Name'
            ),
            stock_item_name: stockItemName,
            quantity: requiredNumber(
              cell(row, ingredientQuantity),
              'Ingredients',
              row.excelRow,
              'Quantity'
            ),
            unit: unit || (stockUnit === 'unit' ? 'unit' : '')
          }
        })
      })()
    : []

  return validateSetupImportPayload({ categories, menuItems, stockItems, workers, ingredients })
}
