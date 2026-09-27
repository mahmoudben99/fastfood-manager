import type http from 'http'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * Serves the POS's bundled fonts (Inter latin, Cairo arabic — OFL, offline) to the LAN tablet page
 * so waiters see the same Ember typography as the till. Built app: the renderer bundle's hashed
 * copies (out/renderer/assets/<name>-<hash>.woff2); dev / tests: src/renderer/src/assets/fonts.
 * A font that cannot be found is a 404 and the page falls back to the system font stack.
 */
const FONTS: Record<string, string> = {
  'inter-latin.woff2': 'Inter-var-latin',
  'cairo-400-arabic.woff2': 'Cairo-400-arabic',
  'cairo-700-arabic.woff2': 'Cairo-700-arabic'
}

const cache = new Map<string, Buffer | null>()

function candidateDirs(): string[] {
  return [
    join(__dirname, '../renderer/assets'),
    join(__dirname, '../../renderer/assets'),
    join(process.cwd(), 'out/renderer/assets'),
    join(process.cwd(), 'src/renderer/src/assets/fonts')
  ]
}

function findFont(stem: string): Buffer | null {
  if (cache.has(stem)) return cache.get(stem) ?? null
  const hashed = new RegExp('^' + stem.replace(/[-]/g, '\\-') + '-[A-Za-z0-9_-]{8}\\.woff2$')
  let found: Buffer | null = null
  for (const dir of candidateDirs()) {
    try {
      if (!existsSync(dir)) continue
      const names = readdirSync(dir)
      const hit = names.find((name) => name === stem + '.woff2') ?? names.find((name) => hashed.test(name))
      if (hit) {
        found = readFileSync(join(dir, hit))
        break
      }
    } catch { /* unreadable dir: try the next one */ }
  }
  cache.set(stem, found)
  return found
}

export function isTabletFontRoute(pathname: string): boolean {
  return pathname.startsWith('/tablet/fonts/')
}

export function handleTabletFontRequest(res: http.ServerResponse, pathname: string): void {
  const stem = FONTS[pathname.slice('/tablet/fonts/'.length)]
  const data = stem ? findFont(stem) : null
  if (!data) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, {
    'Content-Type': 'font/woff2',
    'Cache-Control': 'public, max-age=604800',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(data)
}
