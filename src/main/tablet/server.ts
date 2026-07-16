import http from 'http'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import type { BrowserWindow } from 'electron'
import QRCode from 'qrcode'
import { menuRepo } from '../database/repositories/menu.repo'
import { categoriesRepo } from '../database/repositories/categories.repo'
import { ordersRepo, localDate } from '../database/repositories/orders.repo'
import { settingsRepo } from '../database/repositories/settings.repo'
import { promotionsRepo } from '../database/repositories/promotions.repo'
import { getTabletHTML } from './tablet-ui'
import { getDisplayHTML } from './display-ui'
import { getBestLanIP } from './network'
import { sendOrderNotification } from '../telegram/bot'
import { performAutoBackup } from '../ipc/backup.ipc'
import { syncOrderToCloud } from '../sync/owner-sync'
import { computeAutoDiscount, sanitizeOrderItems } from '../services/order-promotions'

let server: http.Server | null = null
let currentPort = 3333
let mainWin: BrowserWindow | null = null

// SSE clients connected to /api/display-events
const displayClients = new Set<http.ServerResponse>()

function getDisplayInfoPayload(profile: string = 'default'): Record<string, unknown> {
  // Per-profile key prefix. Default profile uses the bare `display_` keys (legacy); named
  // profiles use `display_<profile>_` — the same scheme AmbianceScreen and the admin cloud
  // route (buildInfo) use. Machine-global keys (restaurant_name, currency, logo, social) are
  // NOT prefixed. Previously this always read the default keys, so a LAN TV bound to a named
  // profile showed the DEFAULT profile's design.
  const prefix = profile === 'default' ? 'display_' : `display_${profile}_`
  const dget = (suffix: string): string | undefined => settingsRepo.get(prefix + suffix) ?? undefined

  const name = settingsRepo.get('restaurant_name') || ''
  const logoPath = settingsRepo.get('logo_path') || ''
  const currency = settingsRepo.get('currency_symbol') || settingsRepo.get('currency') || 'DA'
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

  // Social media from settings (stored as JSON string)
  let social: { platform: string; handle: string }[] = []
  try {
    const raw = settingsRepo.get('social_media')
    if (raw) social = JSON.parse(raw)
  } catch { /* ignore */ }

  // YouTube URL
  const youtubeUrl = dget('youtube_url') || ''

  // Theme color (legacy key) — fall back to accent_color
  const themeColor = dget('accent_color') || dget('theme_color') || '#f97316'

  // Slideshow images (stored as JSON array of file paths)
  let slideshowImages: string[] = []
  try {
    const raw = dget('slideshow_images')
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
  const welcomeMode = dget('welcome_mode') || 'animated'
  const welcomeText = dget('welcome_text') || ''

  // Phone number
  const phone = settingsRepo.get('restaurant_phone') || ''

  // Display customization
  const gradientPreset = parseInt(dget('gradient_preset') || '0')
  const fontFamily = dget('font_family') || 'Playfair Display'
  const textColor = dget('text_color') || '#ffffff'
  const accentColor = dget('accent_color') || '#f97316'

  // Text scale
  const textScale = dget('text_scale') || 'medium'

  // Show restaurant name
  const showName = dget('show_name') || 'true'

  // Menu panel: a single flag drives both panel visibility and data injection.
  // (Legacy `display_show_menu` was a separate key that the UI never toggled,
  // so the menu panel never received items even when its panel was enabled.)
  const showMenu = dget('panel_menu') !== 'false' ? 'true' : 'false'

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
  const logoScale = parseFloat(dget('logo_scale') || '1')
  const panelWelcome = dget('panel_welcome') !== 'false'
  const panelSocial = dget('panel_social') !== 'false'
  const panelPromos = dget('panel_promos') !== 'false'
  const panelSlideshow = dget('panel_slideshow') !== 'false'
  const panelOrders = dget('panel_orders') !== 'false'
  const panelMenu = dget('panel_menu') !== 'false'

  return { type: 'info', name, logo, currency, promos, social, youtubeUrl, themeColor, slideshowImages, welcomeMode, welcomeText, phone, gradientPreset, fontFamily, textColor, accentColor, textScale, showMenu, menuItems, showName, logoScale, panelWelcome, panelSocial, panelPromos, panelSlideshow, panelOrders, panelMenu }
}

function getQueuePayload(): Record<string, unknown> {
  // Restaurant-LOCAL day (matches order_date), not UTC — otherwise the TV "Now Preparing"
  // queue empties an hour early / shows the wrong day for a shop open past local midnight.
  const today = localDate()
  const orders = ordersRepo.getByDate(today) as any[]
  const preparing = orders
    .filter((o: any) => o.status === 'preparing' || o.status === 'pending')
    .reverse()
    .map((o: any) => o.daily_number)
  const ready = orders
    .filter((o: any) => o.status === 'completed')
    .slice(0, 10) // getByDate is newest-first; keep the newest ten
    .reverse()
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

/** Recompute and push the "Now Preparing / Ready" queue to every connected TV display. */
export function broadcastQueue(): void {
  try {
    pushDisplayUpdate(getQueuePayload())
  } catch { /* display server may be shutting down */ }
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
  // Buffer the raw bytes and decode ONCE at the end. Appending each chunk to a string decoded
  // every chunk independently, so a multi-byte UTF-8 sequence (Arabic names, French accents,
  // emoji) that straddled a TCP packet boundary was corrupted into U+FFFD. Also: `body.length`
  // on a string counts UTF-16 code units, not bytes, so the size cap was wrong for non-ASCII.
  const chunks: Buffer[] = []
  let received = 0
  let aborted = false
  req.on('data', (chunk: Buffer) => {
    if (aborted) return
    received += chunk.length
    if (received > MAX_BYTES) {
      aborted = true
      sendJSON(res, 413, { error: 'Payload too large' })
      req.destroy()
      return
    }
    chunks.push(chunk)
  })
  req.on('end', () => {
    if (aborted) return
    try {
      onParsed(JSON.parse(Buffer.concat(chunks).toString('utf8')))
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
    const currency = settingsRepo.get('currency_symbol') || settingsRepo.get('currency') || 'DA'
    sendJSON(res, 200, { categories, items, currency })
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
        // (a LAN client could otherwise POST unit_price: 0). sanitizeOrderItems additionally
        // rejects fractional / absurd / Infinity quantities.
        const items = sanitizeOrderItems(raw?.items)
        if (items.length === 0) {
          sendJSON(res, 400, { error: 'No valid items' })
          return
        }
        // Apply the same active promotions the POS cart applies, so a tablet customer isn't
        // charged full price for a promoted item.
        const discount = computeAutoDiscount(items)
        const order = ordersRepo.create({
          order_type: ['local', 'takeout', 'delivery'].includes(raw?.order_type) ? raw.order_type : 'takeout',
          table_number: raw?.table_number ? String(raw.table_number).slice(0, 50) : undefined,
          customer_phone: raw?.customer_phone ? String(raw.customer_phone).slice(0, 50) : undefined,
          customer_name: raw?.customer_name ? String(raw.customer_name).slice(0, 100) : undefined,
          notes: raw?.notes ? String(raw.notes).slice(0, 500) : undefined,
          forceMenuPrice: true,
          discount_amount: discount.amount || undefined,
          discount_details: discount.details || undefined,
          items
        })
        mainWin?.webContents.send('tablet:new-order', order)
        // Same side-effects as a POS order. Previously the owner dashboard never saw tablet
        // orders (revenue undercounted by the whole channel) and the TV queue never showed them.
        syncOrderToCloud(order).catch(() => {})
        broadcastQueue()
        performAutoBackup()
        sendOrderNotification(order)
        // Durable automatic print jobs were committed by ordersRepo.create().
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

    // Send initial info + queue. The display page forwards its own ?profile query onto the
    // SSE URL, so a named-profile TV gets that profile's design (not the default).
    const profile = url.searchParams.get('profile') || 'default'
    const info = getDisplayInfoPayload(profile)
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
  // server.close() only stops NEW connections; the open SSE streams stay alive and keep the
  // process (and the TVs) attached to a "stopped" server. End them explicitly first, otherwise
  // close() never fires its callback and shutdown hangs.
  for (const client of displayClients) {
    try { client.end() } catch { /* already gone */ }
  }
  displayClients.clear()
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
