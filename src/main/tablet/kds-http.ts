import type http from 'http'
import type Database from 'better-sqlite3'
import { parseKdsStation, type KdsStationFilter } from '../../shared/kds'
import { kdsEvents } from '../services/kds/kds-events'
import { buildBoardState, buildKdsSnapshot } from '../services/kds/kds-query'
import { parseKdsAction, runKdsAction } from '../services/kds/kds-actions'
import { checkKdsPin, kdsToken, uiLanguage, verifyKdsToken } from '../services/kds/kds-settings'
import { getKdsPageHTML } from './kds-page'
import { getBoardPageHTML } from './board-page'

/**
 * LAN routes of the kitchen display and the customer order board, mounted by server.ts:
 *
 *   GET  /kds                     kitchen screen page (asks for the KDS PIN once)
 *   POST /kds/api/pin             {pin} → {ok, token}   (5 wrong PINs → 30 s lock per client)
 *   GET  /kds/api/snapshot        ?station=all|<id>     (auth)
 *   POST /kds/api/action          {type, ...}           (auth) see kds-actions.ts
 *   GET  /kds/stream              ?station=&token=      (auth) SSE: `snapshot` + `ping` events
 *   GET  /board                   customer board page   (public: order numbers only)
 *   GET  /board/api/state                               (public)
 *   GET  /board/stream                                  (public) SSE: `board` + `ping` events
 *
 * Auth is the tablet model: a stateless token derived from the PIN + its version, sent as
 * `Authorization: Bearer <token>` (or `?token=` for EventSource, which cannot set headers).
 * Deliberately free of Electron imports: the database arrives through `deps.getDb`.
 */

export interface KdsHttpDeps {
  getDb: () => Database.Database
}

interface StreamClient {
  res: http.ServerResponse
  kind: 'kds' | 'board'
  station: KdsStationFilter
}

const clients = new Set<StreamClient>()
const pinAttempts = new Map<string, { fails: number; lockedUntil: number }>()
const MAX_PIN_FAILS = 5
const PIN_LOCK_MS = 30_000
const HEARTBEAT_MS = 15_000
let deps: KdsHttpDeps | null = null
let heartbeat: ReturnType<typeof setInterval> | null = null
let subscribed = false

export function isKdsRoute(pathname: string): boolean {
  return pathname === '/kds' || pathname.startsWith('/kds/') || pathname === '/board' || pathname.startsWith('/board/')
}

function sendJSON(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(JSON.stringify(data))
}

function sendHTML(res: http.ServerResponse, html: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  })
  res.end(html)
}

function readJson(req: http.IncomingMessage, res: http.ServerResponse, onParsed: (data: unknown) => void): void {
  const MAX_BYTES = 16 * 1024
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
    let data: unknown
    try {
      data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    } catch {
      sendJSON(res, 400, { error: 'Invalid request' })
      return
    }
    onParsed(data)
  })
}

function tokenOf(req: http.IncomingMessage, url: URL): string | null {
  const header = req.headers['authorization']
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7).trim()
  return url.searchParams.get('token')
}

function langOf(url: URL, db: Database.Database): string {
  const lang = url.searchParams.get('lang')
  return lang === 'en' || lang === 'fr' || lang === 'ar' ? lang : uiLanguage(db)
}

function write(client: StreamClient, event: string, data: unknown): void {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  } catch {
    clients.delete(client)
  }
}

function broadcast(): void {
  if (clients.size === 0 || !deps) return
  let db: Database.Database
  try {
    db = deps.getDb()
  } catch {
    return
  }
  const snapshots = new Map<string, unknown>()
  let board: unknown = null
  for (const client of [...clients]) {
    try {
      if (client.kind === 'board') {
        board ??= buildBoardState(db)
        write(client, 'board', board)
        continue
      }
      const key = String(client.station)
      if (!snapshots.has(key)) snapshots.set(key, buildKdsSnapshot(db, client.station))
      write(client, 'snapshot', snapshots.get(key))
    } catch (error) {
      console.error('[KDS] Stream update failed:', error)
    }
  }
}

function ensureRuntime(): void {
  if (!subscribed) {
    subscribed = true
    kdsEvents.on('changed', broadcast)
  }
  if (!heartbeat && clients.size > 0) {
    heartbeat = setInterval(() => {
      if (clients.size === 0 && heartbeat) {
        clearInterval(heartbeat)
        heartbeat = null
        return
      }
      for (const client of [...clients]) write(client, 'ping', { t: Date.now() })
    }, HEARTBEAT_MS)
    heartbeat.unref?.()
  }
}

function openStream(req: http.IncomingMessage, res: http.ServerResponse, client: Omit<StreamClient, 'res'>, first: { event: string; data: unknown }): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  })
  const entry: StreamClient = { ...client, res }
  res.write('retry: 3000\n\n')
  write(entry, first.event, first.data)
  clients.add(entry)
  ensureRuntime()
  req.on('close', () => { clients.delete(entry) })
}

function pinAllowed(ip: string): boolean {
  const entry = pinAttempts.get(ip)
  return !entry || entry.lockedUntil <= Date.now()
}

function recordPin(ip: string, ok: boolean): void {
  if (ok) {
    pinAttempts.delete(ip)
    return
  }
  const entry = pinAttempts.get(ip) ?? { fails: 0, lockedUntil: 0 }
  entry.fails += 1
  if (entry.fails >= MAX_PIN_FAILS) {
    entry.fails = 0
    entry.lockedUntil = Date.now() + PIN_LOCK_MS
  }
  pinAttempts.set(ip, entry)
}

export function handleKdsRequest(req: http.IncomingMessage, res: http.ServerResponse, url: URL, kdsDeps: KdsHttpDeps): void {
  deps = kdsDeps
  const db = kdsDeps.getDb()
  const method = req.method ?? 'GET'
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (method === 'GET' && path === '/kds') return sendHTML(res, getKdsPageHTML(langOf(url, db)))
  if (method === 'GET' && path === '/board') return sendHTML(res, getBoardPageHTML(langOf(url, db)))
  if (method === 'GET' && path === '/board/api/state') return sendJSON(res, 200, buildBoardState(db))
  if (method === 'GET' && path === '/board/stream') {
    return openStream(req, res, { kind: 'board', station: 'all' }, { event: 'board', data: buildBoardState(db) })
  }

  if (method === 'POST' && path === '/kds/api/pin') {
    const ip = req.socket.remoteAddress || 'unknown'
    if (!pinAllowed(ip)) return sendJSON(res, 429, { error: 'locked' })
    readJson(req, res, (data) => {
      const ok = checkKdsPin(db, (data as { pin?: unknown } | null)?.pin)
      recordPin(ip, ok)
      if (!ok) return sendJSON(res, pinAllowed(ip) ? 401 : 429, { error: pinAllowed(ip) ? 'wrong_pin' : 'locked' })
      sendJSON(res, 200, { ok: true, token: kdsToken(db) })
    })
    return
  }

  const isKdsApi = path === '/kds/api/snapshot' || path === '/kds/api/action' || path === '/kds/stream'
  if (!isKdsApi) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  if (!verifyKdsToken(db, tokenOf(req, url))) return sendJSON(res, 401, { error: 'unauthorized' })

  const station = parseKdsStation(url.searchParams.get('station'))
  if (method === 'GET' && path === '/kds/api/snapshot') return sendJSON(res, 200, buildKdsSnapshot(db, station))
  if (method === 'GET' && path === '/kds/stream') {
    return openStream(req, res, { kind: 'kds', station }, { event: 'snapshot', data: buildKdsSnapshot(db, station) })
  }
  if (method === 'POST' && path === '/kds/api/action') {
    readJson(req, res, (data) => {
      const action = parseKdsAction(data)
      if (!action) return sendJSON(res, 400, { ok: false, error: 'invalid_action' })
      try {
        const outcome = runKdsAction(db, action)
        sendJSON(res, outcome.ok ? 200 : 409, outcome.ok ? { ok: true } : outcome)
      } catch (error) {
        console.error('[KDS] Action failed:', error)
        sendJSON(res, 500, { ok: false, error: 'server_error' })
      }
    })
    return
  }
  res.writeHead(405)
  res.end('Method not allowed')
}

/** Ends every open kitchen/board stream (server shutdown; screens reconnect by themselves). */
export function closeKdsStreams(): void {
  for (const client of clients) {
    try { client.res.end() } catch { /* already gone */ }
  }
  clients.clear()
  if (heartbeat) clearInterval(heartbeat)
  heartbeat = null
}

export function kdsStreamCount(): number {
  return clients.size
}
