/** Row shapes of the promotions / packs / menu IPC (renderer view). */
export interface Promo {
  id: number
  name: string
  name_ar?: string | null
  name_fr?: string | null
  type: 'percentage' | 'fixed'
  discount_value: number
  applies_to: 'all' | 'specific'
  menu_item_ids?: number[]
  is_active: number | boolean
}

export interface PackItem {
  menu_item_id: number
  quantity: number
  menu_item_name?: string
}

export interface Pack {
  id: number
  name: string
  name_ar?: string | null
  name_fr?: string | null
  pack_price: number
  emoji?: string | null
  items?: PackItem[]
  is_active: number | boolean
}

export interface MenuItemLite {
  id: number
  name: string
  name_ar?: string | null
  name_fr?: string | null
  price: number
}

export type Named = { name: string; name_ar?: string | null; name_fr?: string | null }

/** Name in the food language, falling back to the main name. */
export function localName(item: Named, foodLanguage: string): string {
  if (foodLanguage === 'ar' && item.name_ar) return item.name_ar
  if (foodLanguage === 'fr' && item.name_fr) return item.name_fr
  return item.name
}

export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
}

/** Sum of the pack's items at today's menu prices. */
export function packIndividualTotal(items: { menu_item_id: number; quantity: number }[], menuItems: MenuItemLite[]): number {
  return items.reduce((sum, item) => {
    const menuItem = menuItems.find((m) => m.id === item.menu_item_id)
    return sum + (menuItem?.price || 0) * item.quantity
  }, 0)
}

/** "YYYY-MM-DD HH:MM:SS" (SQLite UTC) or ISO → Date. */
export function parseStored(value: string): Date {
  const s = value.trim()
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s)
}

/** 27/09/2026 (Latin digits, day first). */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/')
  const d = parseStored(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatClock(value: string | null | undefined): string {
  if (!value) return ''
  const d = parseStored(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
