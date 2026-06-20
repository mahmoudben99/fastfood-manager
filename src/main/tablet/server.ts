import http from 'http'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import type { BrowserWindow } from 'electron'
import QRCode from 'qrcode'
import { menuRepo } from '../database/repositories/menu.repo'
import { categoriesRepo } from '../database/repositories/categories.repo'
import { ordersRepo } from '../database/repositories/orders.repo'
import { settingsRepo } from '../database/repositories/settings.repo'
import { promotionsRepo } from '../database/repositories/promotions.repo'
import { getTabletHTML } from './tablet-ui'
import { getDisplayHTML } from './display-ui'
import { getBestLanIP } from './network'
import { printOrder } from '../ipc/printer.ipc'
import { sendOrderNotification } from '../telegram/bot'
import { performAutoBackup } from '../ipc/backup.ipc'

let server: http.Server | null = null
let currentPort = 3333
let mainWin: BrowserWindow | null = null

// SSE clients connected to /api/display-events
const displayClients = new Set<http.ServerResponse>()

function getDisplayInfoPayload(): Record<string, unknown> {
  const name = settingsRepo.get('restaurant_name') || ''
  const logoPath = settingsRepo.get('logo_path') || ''
  const currency = settingsRepo.get('currency') || 'DA'
  let logo = ''
  if (logoPath) {
    try {
      const buf = readFileSync(logoPath)
      logo = 'data:image/png;base64,' + buf.toString('base64')
    } catch { /* logo file missing, skip */ }
  }

  const promos = promotionsRepo.getActivePromotions().map((p: any) => ({
    name: p.name, type: p.type, value: p.discount_value
  }))
  const packs = promotionsRepo.getActivePacks().map((p: any) => ({
    name: p.name, price: p.pack_price, emoji: p.emoji || '',
    items: (p.items || []).map((pi: any) => ({
      name: pi.menu_item_name || '',
      quantity: pi.quantity || 1
    }))
  }))

  // Social media from settings (stored as JSON string)
  let social: { platform: string; handle: string }[] = []
  try {
    const raw = settingsRepo.get('social_media')
    if (raw) social = JSON.parse(raw)
  } catch { /* ignore */ }

  // YouTube URL
  const youtubeUrl = settingsRepo.get('display_youtube_url') || ''

  // Theme color (legacy key) — fall back to accent_color
  const themeColor = settingsRepo.get('display_accent_color') || settingsRepo.get('display_theme_color') || '#f97316'

  // Slideshow images (stored as JSON array of file paths)
  let slideshowImages: string[] = []
  try {
    const raw = settingsRepo.get('display_slideshow_images')
    if (raw) {
      const paths: string[] = JSON.parse(raw)
      slideshowImages = paths.slice(0, 10).map(p => {
        try {
          const buf = readFileSync(p)
          const ext = p.split('.').pop()?.toLowerCase() || 'png'
          const mime = ext === 'jpg' ? 'jpeg' : ext
          return `data:image/${mime};base64,` + buf.toString('base64')
        } catch { return '' }
      }).filter(Boolean)
    }
  } catch { /* ignore */ }

  // Welcome mode
  const welcomeMode = settingsRepo.get('display_welcome_mode') || 'animated'
  const welcomeText = settingsRepo.get('display_welcome_text') || ''

  // Phone number
  const phone = settingsRepo.get('restaurant_phone') || ''

  // Display customization
  const gradientPreset = parseInt(settingsRepo.get('display_gradient_preset') || '0')
  const fontFamily = settingsRepo.get('display_font_family') || 'Playfair Display'
  const textColor = settingsRepo.get('display_text_color') || '#ffffff'
  const accentColor = settingsRepo.get('display_accent_color') || '#f97316'

  // Text scale
  const textScale = settingsRepo.get('display_text_scale') || 'medium'

  // Show restaurant name
  const showName = settingsRepo.get('display_show_name') || 'true'

  // Menu panel: a single flag drives both panel visibility and data injection.
  // (Legacy `display_show_menu` was a separate key that the UI never toggled,
  // so the menu panel never received items even when its panel was enabled.)
  const showMenu = settingsRepo.get('display_panel_menu') !== 'false' ? 'true' : 'false'

  // Menu items (only if menu panel is enabled)
  let menuItems: { name: string; price: number; category_name: string; emoji: string }[] = []
  if (showMenu === 'true') {
    try {
      const allItems = menuRepo.getAll() as any[]
      menuItems = allItems.map((item: any) => ({
        name: item.name,
        price: item.price,
        category_name: item.category_name || '',
        emoji: item.emoji || ''
      }))
    } catch { /* ignore */ }
  }

  // Logo scale and panel toggles
  const logoScale = parseFloat(settingsRepo.get('display_logo_scale') || '1')
  const panelWelcome = settingsRepo.get('display_panel_welcome') !== 'false'
  const panelSocial = settingsRepo.get('display_panel_social') !== 'false'
  const panelPromos = settingsRepo.get('display_panel_promos') !== 'false'
  const panelSlideshow = settingsRepo.get('display_panel_slideshow') !== 'false'
  const panelOrders = settingsRepo.get('display_panel_orders') !== 'false'
  const panelMenu = settingsRepo.get('display_panel_menu') !== 'false'

  return { type: 'info', name, logo, currency, promos, packs, social, youtubeUrl, themeColor, slideshowImages, welcomeMode, welcomeText, phone, gradientPreset, fontFamily, textColor, accentColor, textScale, showMenu, menuItems, showName, logoScale, panelWelcome, panelSocial, panelPromos, panelSlideshow, panelOrders, panelMenu }
}

function getQueuePayload(): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10)
  const orders = ordersRepo.getByDate(today) as any[]
  const preparing = orders
    .filter((o: any) => o.status === 'preparing' || o.status === 'pending')
    .map((o: any) => o.daily_number)
  const ready = orders
    .filter((o: any) => o.status === 'completed')
    .slice(-10) // last 10 completed
    .map((o: any) => o.daily_number)
  return { type: 'queue', preparing, ready }
}

export function pushDisplayUpdate(data: any): void {
  if (displayClients.size === 0) return
  const payload = 'data: ' + JSON.stringify(data) + '\n\n'
  for (const client of displayClients) {
    try { client.write(payload) } catch { displayClients.delete(client) }
  }
}

export function getLocalIP(): string {
  // Smart pick (filters printer/virtual NICs). The TV pairing path uses the full
  // ranked list from network.ts and probes every address instead of trusting one.
  return getBestLanIP()
}

/** The port the display server is bound to (3333 by default, may shift on conflict). */
export function getCurrentPort(): number {
  return currentPort
}

function makeToken(pin: string, pinVersion: string): string {
  return createHash('sha256').update(`${pin}:${pinVersion}`).digest('hex')
}

function validateSession(authHeader: string | undefined): boolean {
  const pinEnabled = settingsRepo.get('tablet_pin_enabled') === '1'
  if (!pinEnabled) return true
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const pin = settingsRepo.get('tablet_pin') ?? '0000'
  const pinVersion = settingsRepo.get('tablet_pin_version') ?? '1'
  const expected = makeToken(pin, pinVersion)
  return token === expected
}

function sendJSON(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(body)
}

/**
 * Read a JSON request body with a hard size cap. Previously both POST handlers buffered
 * req.on('data') into a string with no limit, so a LAN client could stream an arbitrarily
 * large body to exhaust main-process memory. Caps at 256 KB and 413s anything larger.
 */
function readJsonBody(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  onParsed: (data: any) => void
): void {
  const MAX_BYTES = 256 * 1024
  let body = ''
  let aborted = false
  req.on('data', (chunk) => {
    if (aborted) return
    body += chunk
    if (body.length > MAX_BYTES) {
      aborted = true
      sendJSON(res, 413, { error: 'Payload too large' })
      req.destroy()
    }
  })
  req.on('end', () => {
    if (aborted) return
    try {
      onParsed(JSON.parse(body))
    } catch {
      sendJSON(res, 400, { error: 'Invalid request' })
    }
  })
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://localhost`)
  const method = req.method ?? 'GET'

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' })
    res.end()
    return
  }

  // Serve main tablet UI
  if (method === 'GET' && url.pathname === '/') {
    const lang = settingsRepo.get('language') ?? 'en'
    const pinEnabled = settingsRepo.get('tablet_pin_enabled') === '1'
    const pinVersion = settingsRepo.get('tablet_pin_version') ?? '1'
    const html = getTabletHTML(lang, pinEnabled, pinVersion)
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    })
    res.end(html)
    return
  }

  // Menu data (no auth — menu items are not sensitive)
  if (method === 'GET' && url.pathname === '/api/menu') {
    const categories = categoriesRepo.getAll()
    const items = menuRepo.getAll()
    sendJSON(res, 200, { categories, items })
    return
  }

  // PIN authentication
  if (method === 'POST' && url.pathname === '/api/pin') {
    readJsonBody(req, res, (data) => {
      const pin = String(data?.pin ?? '')
      const storedPin = settingsRepo.get('tablet_pin') ?? '0000'
      if (pin !== storedPin) {
        sendJSON(res, 401, { error: 'PIN incorrect' })
        return
      }
      const pinVersion = settingsRepo.get('tablet_pin_version') ?? '1'
      const token = makeToken(pin, pinVersion)
      sendJSON(res, 200, { ok: true, token })
    })
    return
  }

  // Order submission
  if (method === 'POST' && url.pathname === '/api/order') {
    if (!validateSession(req.headers['authorization'])) {
      sendJSON(res, 401, { error: 'Session expirée. Reconnectez-vous.' })
      return
    }
    readJsonBody(req, res, (raw) => {
      try {
        // Build a sanitized input from only the fields a self-order client may set.
        // forceMenuPrice ensures prices always come from the menu, never from the client
        // (a LAN client could otherwise POST unit_price: 0).
        const rawItems = Array.isArray(raw?.items) ? raw.items : []
        const items = rawItems
          .filter((it: any) => it && Number.isFinite(Number(it.menu_item_id)) && Number(it.quantity) > 0)
          .map((it: any) => ({
            menu_item_id: Number(it.menu_item_id),
            quantity: Number(it.quantity),
            notes: typeof it.notes === 'string' ? it.notes.slice(0, 500) : undefined
          }))
        if (items.length === 0) {
          sendJSON(res, 400, { error: 'No valid items' })
          return
        }
        const order = ordersRepo.create({
          order_type: ['local', 'takeout', 'delivery'].includes(raw?.order_type) ? raw.order_type : 'takeout',
          table_number: raw?.table_number ? String(raw.table_number).slice(0, 50) : undefined,
          customer_phone: raw?.customer_phone ? String(raw.customer_phone).slice(0, 50) : undefined,
          customer_name: raw?.customer_name ? String(raw.customer_name).slice(0, 100) : undefined,
          notes: raw?.notes ? String(raw.notes).slice(0, 500) : undefined,
          forceMenuPrice: true,
          items
        })
        mainWin?.webContents.send('tablet:new-order', order)
        // Same side-effects as normal orders
        performAutoBackup()
        sendOrderNotification(order)
        const autoPrintReceipt = settingsRepo.get('auto_print_receipt') === 'true'
        const autoPrintKitchen = settingsRepo.get('auto_print_kitchen') === 'true'
        if (autoPrintReceipt) printOrder(order.id, 'receipt').catch(() => {})
        if (autoPrintKitchen) printOrder(order.id, 'kitchen').catch(() => {})
        sendJSON(res, 200, { ok: true, order_number: order.daily_number, id: order.id })
      } catch (e) {
        sendJSON(res, 500, { error: String(e) })
      }
    })
    return
  }

  // ── Customer Display ──
  if (method === 'GET' && url.pathname === '/display') {
    const lang = settingsRepo.get('language') ?? 'en'
    const html = getDisplayHTML(lang)
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    })
    res.end(html)
    return
  }

  // SSE endpoint for real-time display updates
  if (method === 'GET' && url.pathname === '/api/display-events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })

    // Send initial info + queue
    const info = getDisplayInfoPayload()
    res.write('data: ' + JSON.stringify(info) + '\n\n')
    const queue = getQueuePayload()
    res.write('data: ' + JSON.stringify(queue) + '\n\n')

    displayClients.add(res)
    req.on('close', () => { displayClients.delete(res) })
    return
  }

  // REST endpoint for current queue state
  if (method === 'GET' && url.pathname === '/api/display-queue') {
    const queue = getQueuePayload()
    sendJSON(res, 200, queue)
    return
  }

  res.writeHead(404)
  res.end('Not found')
}

function tryListen(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const testServer = http.createServer()
    testServer.once('error', reject)
    testServer.once('listening', () => {
      testServer.close(() => resolve())
    })
    testServer.listen(port, '0.0.0.0')
  })
}

export async function startTabletServer(win: BrowserWindow): Promise<{ port: number; url: string; qrDataUrl: string }> {
  if (server) {
    const ip = getLocalIP()
    const url = `http://${ip}:${currentPort}`
    const qrDataUrl = await QRCode.toDataURL(url, { width: 256, margin: 1 })
    return { port: currentPort, url, qrDataUrl }
  }

  mainWin = win

  // Find a free port
  for (let p = 3333; p <= 3340; p++) {
    try {
      await tryListen(p)
      currentPort = p
      break
    } catch {
      continue
    }
  }

  server = http.createServer(handleRequest)

  await new Promise<void>((resolve, reject) => {
    server!.once('error', (err: any) => {
      server = null
      reject(err)
    })
    server!.listen(currentPort, '0.0.0.0', () => resolve())
  })

  const ip = getLocalIP()
  const url = `http://${ip}:${currentPort}`
  const qrDataUrl = await QRCode.toDataURL(url, { width: 256, margin: 1 })
  return { port: currentPort, url, qrDataUrl }
}

export function stopTabletServer(): void {
  server?.close()
  server = null
  mainWin = null
}

export function isTabletServerRunning(): boolean {
  return server !== null
}

export async function getTabletServerStatus(): Promise<{
  running: boolean
  port: number
  url: string
  qrDataUrl: string | null
}> {
  if (!server) return { running: false, port: currentPort, url: '', qrDataUrl: null }
  const ip = getLocalIP()
  const url = `http://${ip}:${currentPort}`
  const qrDataUrl = await QRCode.toDataURL(url, { width: 256, margin: 1 })
  return { running: true, port: currentPort, url, qrDataUrl }
}
