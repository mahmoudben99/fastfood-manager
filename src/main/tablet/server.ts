import http from 'http'
import { createHash } from 'crypto'
import os from 'os'
import type { BrowserWindow } from 'electron'
import QRCode from 'qrcode'
import { menuRepo } from '../database/repositories/menu.repo'
import { categoriesRepo } from '../database/repositories/categories.repo'
import { ordersRepo } from '../database/repositories/orders.repo'
import { settingsRepo } from '../database/repositories/settings.repo'
import { getTabletHTML } from './tablet-ui'
import { printOrder } from '../ipc/printer.ipc'
import { sendOrderNotification } from '../telegram/bot'
import { performAutoBackup } from '../ipc/backup.ipc'

let server: http.Server | null = null
let currentPort = 3333
let mainWin: BrowserWindow | null = null

export function getLocalIP(): string {
  const nets = os.networkInterfaces()
  for (const iface of Object.values(nets)) {
    for (const addr of (iface ?? [])) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address
      }
    }
  }
  return '127.0.0.1'
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
    const lang = settingsRepo.get('language') ?? 'fr'
    const pinEnabled = settingsRepo.get('tablet_pin_enabled') === '1'
    const pinVersion = settingsRepo.get('tablet_pin_version') ?? '1'
    const html = getTabletHTML(lang, pinEnabled, pinVersion)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
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
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        const { pin } = JSON.parse(body) as { pin: string }
        const storedPin = settingsRepo.get('tablet_pin') ?? '0000'
        if (pin !== storedPin) {
          sendJSON(res, 401, { error: 'PIN incorrect' })
          return
        }
        const pinVersion = settingsRepo.get('tablet_pin_version') ?? '1'
        const token = makeToken(pin, pinVersion)
        sendJSON(res, 200, { ok: true, token })
      } catch {
        sendJSON(res, 400, { error: 'Invalid request' })
      }
    })
    return
  }

  // Order submission
  if (method === 'POST' && url.pathname === '/api/order') {
    if (!validateSession(req.headers['authorization'])) {
      sendJSON(res, 401, { error: 'Session expirée. Reconnectez-vous.' })
      return
    }
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        const input = JSON.parse(body)
        const order = ordersRepo.create(input)
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
  server.listen(currentPort, '0.0.0.0')

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
