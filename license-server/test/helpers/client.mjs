/**
 * Thin HTTP client for the acceptance suite. Talks to a running
 * `wrangler dev --local` instance over plain fetch — no framework magic,
 * so the suite exercises exactly the wire contract in CONTRACT.md §1.
 */

export const BASE_URL = process.env.TEST_LICENSE_SERVER_URL || 'http://127.0.0.1:8787'

// Must match ADMIN_API_KEY configured in license-server/.dev.vars for local runs.
// See test/README.md.
export const ADMIN_KEY = process.env.TEST_ADMIN_API_KEY || 'test-admin-key-CHANGE-ME'

/**
 * @param {string} path e.g. '/v1/trial/start'
 * @param {{method?: string, body?: any, headers?: Record<string,string>}} [opts]
 */
export async function req(path, opts = {}) {
  const { method = 'POST', body, headers = {} } = opts
  const res = await fetch(BASE_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  let json = null
  const text = await res.text()
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = null // non-JSON body; caller can inspect res.text separately if ever needed
    }
  }
  return { status: res.status, headers: res.headers, json, rawText: text }
}

export function deviceAuthHeader(secret) {
  return secret === undefined ? {} : { Authorization: `Device ${secret}` }
}

export function adminAuthHeader(key = ADMIN_KEY) {
  return { Authorization: `Bearer ${key}` }
}

const MACHINE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Fresh machine id matching ^[A-Z0-9]{6,64}$, unique enough to avoid cross-test collisions. */
export function randomMachineId(prefix = 'T') {
  let s = prefix.toUpperCase()
  for (let i = 0; i < 16; i++) s += MACHINE_CHARS[Math.floor(Math.random() * MACHINE_CHARS.length)]
  return s
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Poll `fn` until it returns a truthy value or timeoutMs elapses; returns last value. */
export async function waitFor(fn, { timeoutMs = 3000, intervalMs = 100 } = {}) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeoutMs) {
    last = await fn()
    if (last) return last
    await sleep(intervalMs)
  }
  return last
}
