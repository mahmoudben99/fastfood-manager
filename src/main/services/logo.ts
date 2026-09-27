// Namespace import on purpose: test-harness Electron mocks do not export nativeImage, and a
// named import of a missing export fails at module link time for every importer.
import * as electron from 'electron'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { extname, join, resolve } from 'path'
import { createHash } from 'crypto'
import { settingsRepo } from '../database/repositories/settings.repo'
import { getLogoPath } from '../database/connection'
import { openHiddenDocument, writeTempDocument } from './print-window'

/**
 * Restaurant logo storage.
 *
 * Source of truth: `logo_data` = base64 of a small PNG (≤ 384 px wide) inside the settings table,
 * so the logo travels with a database-only backup/restore and a move to a new PC.
 * `logo_path` stays meaningful for legacy readers: it points to a file re-materialized from
 * `logo_data` under images/logo whenever that file is missing. A legacy install that only has an
 * absolute `logo_path` (the uploaded original) is migrated on first read, big logos resized.
 */

export const LOGO_DATA_KEY = 'logo_data'
const MAX_WIDTH = 384
const MAX_HEIGHT = 768
const MAX_SOURCE_BYTES = 20 * 1024 * 1024
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }

let legacyMigration: Promise<string | null> | null = null

function fitSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** PNG/JPEG via nativeImage (synchronous). Returns null for formats nativeImage cannot decode. */
function pngFromNativeImage(data: Buffer): Buffer | null {
  const image = electron.nativeImage?.createFromBuffer(data)
  if (!image || image.isEmpty()) return null
  const size = image.getSize()
  const target = fitSize(size.width, size.height)
  const resized = target.width === size.width ? image : image.resize({ ...target, quality: 'best' })
  const png = resized.toPNG()
  return png.length > 0 ? png : null
}

/** GIF/WebP (and anything else Chromium decodes) via a canvas in a hidden window. */
async function pngFromChromium(data: Buffer, mime: string): Promise<Buffer | null> {
  const file = writeTempDocument('<!DOCTYPE html><title>logo</title>', 'logo')
  let win: Electron.BrowserWindow | null = null
  let timer: NodeJS.Timeout | null = null
  try {
    win = await openHiddenDocument(file)
    // Bytes go in as a Blob, not a data: URL, so image size is not bound by URL-length limits.
    const script = `(async () => {
      const binary = atob('${data.toString('base64')}')
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const bitmap = await createImageBitmap(new Blob([bytes], { type: ${JSON.stringify(mime)} }))
      const scale = Math.min(1, ${MAX_WIDTH} / bitmap.width, ${MAX_HEIGHT} / bitmap.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    })()`
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Image conversion timed out')), 10_000)
    })
    const dataUrl = await Promise.race([win.webContents.executeJavaScript(script), timeout])
    const match = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl))
    return match ? Buffer.from(match[1], 'base64') : null
  } finally {
    if (timer) clearTimeout(timer)
    if (win && !win.isDestroyed()) win.destroy()
    try { rmSync(file, { force: true }) } catch (error) { console.warn('[Logo] Could not delete temp file:', error) }
  }
}

async function toLogoPng(file: string): Promise<Buffer> {
  if (statSync(file).size > MAX_SOURCE_BYTES) throw new Error('The logo image is larger than 20 MB')
  const data = readFileSync(file)
  const png = pngFromNativeImage(data) ?? await pngFromChromium(data, MIME[extname(file).toLowerCase()] || 'image/png')
  if (!png) throw new Error('This image format could not be read. Please choose a PNG or JPG file.')
  return png
}

function logoFileName(png: Buffer): string {
  return `logo_${createHash('sha1').update(png).digest('hex').slice(0, 12)}.png`
}

/** Writes the stored PNG under images/logo (if missing) and points logo_path at it. */
function materialize(png: Buffer): string {
  const file = join(getLogoPath(), logoFileName(png))
  if (!existsSync(file)) writeFileSync(file, png)
  if (settingsRepo.get('logo_path') !== file) settingsRepo.set('logo_path', file)
  return file
}

/** Deletes every file in images/logo except `keep` (old uploads, previous materializations). */
function pruneLogoDir(keep: string | null): void {
  const dir = getLogoPath()
  for (const name of readdirSync(dir)) {
    const file = join(dir, name)
    if (keep && resolve(file) === resolve(keep)) continue
    try { rmSync(file, { force: true }) } catch (error) { console.warn('[Logo] Could not delete old logo file:', file, error) }
  }
}

function storedPng(): Buffer | null {
  const data = settingsRepo.get(LOGO_DATA_KEY)
  if (!data) return null
  const png = Buffer.from(data, 'base64')
  return png.length > 0 ? png : null
}

function savePng(png: Buffer): string {
  settingsRepo.set(LOGO_DATA_KEY, png.toString('base64'))
  const file = materialize(png)
  pruneLogoDir(file)
  return file
}

/** Legacy absolute logo_path → logo_data (once, shared by concurrent callers). */
function migrateLegacyLogo(): Promise<string | null> {
  if (!legacyMigration) {
    legacyMigration = (async () => {
      const legacy = settingsRepo.get('logo_path')
      if (!legacy || settingsRepo.get(LOGO_DATA_KEY) || !existsSync(legacy)) return null
      return savePng(await toLogoPng(legacy))
    })()
      .catch((error) => {
        console.error('[Logo] Could not migrate the legacy logo file:', error)
        return null
      })
      .finally(() => { legacyMigration = null })
  }
  return legacyMigration
}

/**
 * Local file of the current logo for file-based readers (cloud upload, app-image://), or null.
 * Synchronous: a PNG/JPEG legacy logo is migrated inline; any other legacy format keeps its
 * original path while the conversion runs in the background.
 */
export function resolveLogoFile(): string | null {
  const png = storedPng()
  if (png) return materialize(png)
  const legacy = settingsRepo.get('logo_path')
  if (!legacy || !existsSync(legacy)) return null
  try {
    if (statSync(legacy).size <= MAX_SOURCE_BYTES) {
      const converted = pngFromNativeImage(readFileSync(legacy))
      if (converted) return savePng(converted)
    }
  } catch (error) {
    console.error('[Logo] Could not read the legacy logo file:', error)
  }
  void migrateLegacyLogo()
  return legacy
}

/** `data:image/png;base64,…` of the current logo, or null. */
export async function getLogoDataUrl(): Promise<string | null> {
  let png = storedPng()
  if (!png && (await migrateLegacyLogo())) png = storedPng()
  return png ? `data:image/png;base64,${png.toString('base64')}` : null
}

/** Synchronous variant for readers that cannot await (LAN display payload). */
export function getLogoDataUrlSync(): string | null {
  resolveLogoFile() // migrates a PNG/JPEG legacy logo inline
  const png = storedPng()
  return png ? `data:image/png;base64,${png.toString('base64')}` : null
}

/** Imports a picked image: resized PNG into settings + materialized file. Returns logo_path. */
export async function importLogo(sourceFile: string): Promise<string> {
  return savePng(await toLogoPng(sourceFile))
}

/** Clears the logo everywhere (settings + our files under images/logo). */
export function removeLogo(): void {
  settingsRepo.setMultiple({ [LOGO_DATA_KEY]: '', logo_path: '' })
  pruneLogoDir(null)
}
