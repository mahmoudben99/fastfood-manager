import * as XLSX from 'xlsx'

/**
 * Build + download `fastfood-data-export.xlsx` from live data (Categories, Menu Items,
 * Stock Items, Workers, Ingredients). Sheet names and column headers are an import contract:
 * keep them in English and unchanged.
 */
export async function exportWorkbook(): Promise<void> {
  const [categories, menuItems, stockItems, workers] = await Promise.all([
    window.api.categories.getAll(),
    window.api.menu.getAll(),
    window.api.stock.getAll(),
    window.api.workers.getAll()
  ])
  const menuDetails = await Promise.all(menuItems.map((item: any) => window.api.menu.getById(item.id)))
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
}
