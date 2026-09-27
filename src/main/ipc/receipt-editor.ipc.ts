import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { receiptTemplatesRepo } from '../database/repositories/receipt-templates.repo'
import { healBlockIds } from '../../shared/settings-rules'

/**
 * Validate a template payload coming from the renderer. Rejects an empty name or a `blocks`
 * value that is not a JSON array, and re-ids duplicate block ids before anything is stored.
 */
function sanitizeTemplateInput(input: unknown, requireAll: boolean): { name?: string; blocks?: string; is_active?: number } {
  if (!input || typeof input !== 'object') throw new Error('Invalid template')
  const raw = input as { name?: unknown; blocks?: unknown; is_active?: unknown }
  const out: { name?: string; blocks?: string; is_active?: number } = {}
  if (raw.name !== undefined || requireAll) {
    const name = String(raw.name ?? '').trim()
    if (!name) throw new Error('Template name is required')
    out.name = name.slice(0, 100)
  }
  if (raw.blocks !== undefined || requireAll) {
    let parsed: unknown
    try {
      parsed = JSON.parse(String(raw.blocks ?? ''))
    } catch {
      throw new Error('Invalid template blocks')
    }
    if (!Array.isArray(parsed)) throw new Error('Invalid template blocks')
    const objects = parsed.filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    out.blocks = JSON.stringify(healBlockIds(objects, randomUUID))
  }
  if (raw.is_active !== undefined) out.is_active = raw.is_active ? 1 : 0
  return out
}

const presets = [
  {
    name: 'Classic',
    blocks: JSON.stringify([
      { id: '1', type: 'logo', enabled: true, config: {}, sortOrder: 0 },
      { id: '2', type: 'restaurant_name', enabled: true, config: { fontSize: 'large', alignment: 'center', bold: true }, sortOrder: 1 },
      { id: '3', type: 'divider', enabled: true, config: {}, sortOrder: 2 },
      { id: '4', type: 'order_details', enabled: true, config: { fontSize: 'medium' }, sortOrder: 3 },
      { id: '5', type: 'items_table', enabled: true, config: { fontSize: 'medium' }, sortOrder: 4 },
      { id: '6', type: 'divider', enabled: true, config: {}, sortOrder: 5 },
      { id: '7', type: 'total', enabled: true, config: { fontSize: 'large', bold: true }, sortOrder: 6 },
      { id: '8', type: 'custom_text', enabled: true, config: { text: 'Thank you for your visit!', alignment: 'center' }, sortOrder: 7 }
    ])
  },
  {
    name: 'Modern',
    blocks: JSON.stringify([
      { id: '1', type: 'logo', enabled: true, config: {}, sortOrder: 0 },
      { id: '2', type: 'restaurant_name', enabled: true, config: { fontSize: 'large', alignment: 'center', bold: true }, sortOrder: 1 },
      { id: '3', type: 'social_media', enabled: true, config: {}, sortOrder: 2 },
      { id: '4', type: 'divider', enabled: true, config: { decorationType: 'stars' }, sortOrder: 3 },
      { id: '5', type: 'order_details', enabled: true, config: {}, sortOrder: 4 },
      { id: '6', type: 'items_table', enabled: true, config: {}, sortOrder: 5 },
      { id: '7', type: 'total', enabled: true, config: { fontSize: 'large', bold: true }, sortOrder: 6 },
      { id: '8', type: 'qr_code', enabled: true, config: { qrContent: 'phone' }, sortOrder: 7 },
      { id: '9', type: 'custom_text', enabled: true, config: { text: 'Follow us!', alignment: 'center' }, sortOrder: 8 }
    ])
  },
  {
    name: 'Minimal',
    blocks: JSON.stringify([
      { id: '1', type: 'restaurant_name', enabled: true, config: { fontSize: 'medium', alignment: 'center', bold: true }, sortOrder: 0 },
      { id: '2', type: 'divider', enabled: true, config: {}, sortOrder: 1 },
      { id: '3', type: 'items_table', enabled: true, config: { fontSize: 'small' }, sortOrder: 2 },
      { id: '4', type: 'total', enabled: true, config: { fontSize: 'medium', bold: true }, sortOrder: 3 }
    ])
  },
  {
    name: 'Full Featured',
    blocks: JSON.stringify([
      { id: '1', type: 'logo', enabled: true, config: {}, sortOrder: 0 },
      { id: '2', type: 'restaurant_name', enabled: true, config: { fontSize: 'large', alignment: 'center', bold: true }, sortOrder: 1 },
      { id: '3', type: 'custom_text', enabled: true, config: { text: 'Address line here', alignment: 'center', fontSize: 'small' }, sortOrder: 2 },
      { id: '4', type: 'social_media', enabled: true, config: {}, sortOrder: 3 },
      { id: '5', type: 'divider', enabled: true, config: { decorationType: 'food-emoji' }, sortOrder: 4 },
      { id: '6', type: 'order_details', enabled: true, config: {}, sortOrder: 5 },
      { id: '7', type: 'items_table', enabled: true, config: {}, sortOrder: 6 },
      { id: '8', type: 'divider', enabled: true, config: {}, sortOrder: 7 },
      { id: '9', type: 'total', enabled: true, config: { fontSize: 'large', bold: true }, sortOrder: 8 },
      { id: '10', type: 'qr_code', enabled: true, config: { qrContent: 'phone' }, sortOrder: 9 },
      { id: '11', type: 'custom_text', enabled: true, config: { text: 'Thank you! See you again!', alignment: 'center' }, sortOrder: 10 },
      { id: '12', type: 'edge_decoration', enabled: true, config: { decorationType: 'food-emoji' }, sortOrder: 11 }
    ])
  },
  {
    name: 'Bilingual (AR/FR)',
    blocks: JSON.stringify([
      { id: '1', type: 'logo', enabled: true, config: {}, sortOrder: 0 },
      { id: '2', type: 'restaurant_name', enabled: true, config: { fontSize: 'large', alignment: 'center', bold: true }, sortOrder: 1 },
      { id: '3', type: 'divider', enabled: true, config: {}, sortOrder: 2 },
      { id: '4', type: 'order_details', enabled: true, config: { language: 'bilingual' }, sortOrder: 3 },
      { id: '5', type: 'items_table', enabled: true, config: { language: 'bilingual' }, sortOrder: 4 },
      { id: '6', type: 'divider', enabled: true, config: {}, sortOrder: 5 },
      { id: '7', type: 'total', enabled: true, config: { fontSize: 'large', bold: true }, sortOrder: 6 },
      { id: '8', type: 'custom_text', enabled: true, config: { text: 'Merci de votre visite!', textAr: '\u0634\u0643\u0631\u0627 \u0644\u0632\u064a\u0627\u0631\u062a\u0643\u0645!', alignment: 'center' }, sortOrder: 7 }
    ])
  }
]

export function registerReceiptEditorHandlers(): void {
  // Move social accounts saved by older versions of the editor into settings.social_media once,
  // at startup, so they print even if nobody opens the editor again.
  try {
    receiptTemplatesRepo.migrateLegacySocialMedia()
  } catch (err) {
    console.error('[Receipt] social media migration failed:', err)
  }

  ipcMain.handle('receipt:getTemplates', () => {
    return receiptTemplatesRepo.getAllTemplates()
  })

  ipcMain.handle('receipt:getActive', () => {
    return receiptTemplatesRepo.getActiveTemplate()
  })

  ipcMain.handle('receipt:saveTemplate', (_, input) => {
    const clean = sanitizeTemplateInput(input, true)
    return receiptTemplatesRepo.saveTemplate({ name: clean.name!, blocks: clean.blocks!, is_active: clean.is_active })
  })

  ipcMain.handle('receipt:updateTemplate', (_, id, input) => {
    return receiptTemplatesRepo.updateTemplate(Number(id), sanitizeTemplateInput(input, false))
  })

  ipcMain.handle('receipt:deleteTemplate', (_, id) => {
    return receiptTemplatesRepo.deleteTemplate(Number(id))
  })

  ipcMain.handle('receipt:setActive', (_, id) => {
    return receiptTemplatesRepo.setActive(Number(id))
  })

  // "Use default receipt": no template active → the printer uses its built-in layout.
  ipcMain.handle('receipt:clearActive', () => {
    return receiptTemplatesRepo.clearActive()
  })

  ipcMain.handle('receipt:getSocialMedia', () => {
    return receiptTemplatesRepo.getAllSocialMedia()
  })

  ipcMain.handle('receipt:saveSocialMedia', (_, items) => {
    return receiptTemplatesRepo.saveSocialMedia(items)
  })

  ipcMain.handle('receipt:getPresets', () => {
    return presets
  })

  ipcMain.handle('receipt:generateQR', async (_, url: string) => {
    try {
      const QRCode = (await import('qrcode')).default
      return await QRCode.toDataURL(url, { width: 120, margin: 1 })
    } catch {
      return ''
    }
  })
}
