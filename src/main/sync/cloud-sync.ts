import { getClient } from '../activation/cloud'
import { getMachineId } from '../activation/activation'
import { settingsRepo } from '../database/repositories/settings.repo'
import { menuRepo } from '../database/repositories/menu.repo'
import { categoriesRepo } from '../database/repositories/categories.repo'
import { promotionsRepo } from '../database/repositories/promotions.repo'
import { net } from 'electron'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { getLanIPs } from '../tablet/network'
import { getCurrentPort } from '../tablet/server'
import { getPairingCode } from '../tablet/pairing'

function generateShortCode(): string {
  // 4-digit numeric code
  return String(Math.floor(1000 + Math.random() * 9000))
}

/** Sync display settings to Supabase for Vercel-hosted display */
export async function syncDisplaySettings(profileName: string = 'default'): Promise<void> {
  if (!net.isOnline()) return
  try {
    const machineId = getMachineId()
    const supabase = getClient()

    // Gather all display settings
    const allSettings = settingsRepo.getAll()
    const displayKeys = Object.keys(allSettings).filter(k =>
      k.startsWith('display_') || k === 'restaurant_name' || k === 'restaurant_phone' ||
      k === 'restaurant_phone2' || k === 'restaurant_address' || k === 'logo_path' ||
      k === 'social_media' || k === 'currency' || k === 'currency_symbol' || k === 'language'
    )

    const settings: Record<string, string> = {}
    for (const key of displayKeys) {
      settings[key] = allSettings[key]
    }

    // Get logo as base64
    const logoPath = allSettings.logo_path
    if (logoPath) {
      try {
        const buf = readFileSync(logoPath)
        settings._logo_base64 = 'data:image/png;base64,' + buf.toString('base64')
      } catch { /* skip */ }
    }

    // Get active promos and packs
    try {
      const promos = promotionsRepo.getActivePromotions()
      const packs = promotionsRepo.getActivePacks()
      settings._promos = JSON.stringify(promos.map((p: any) => ({ name: p.name, type: p.type, value: p.discount_value })))
      settings._packs = JSON.stringify(packs.map((p: any) => ({ name: p.name, price: p.pack_price, emoji: p.emoji || '', items: p.items || [] })))
    } catch { /* skip */ }

    // Get slideshow images as base64 — per-profile key (default keeps legacy)
    try {
      const slideshowKey = profileName === 'default'
        ? 'display_slideshow_images'
        : `display_${profileName}_slideshow_images`
      const raw = allSettings[slideshowKey]
      if (raw) {
        const paths: string[] = JSON.parse(raw)
        const images = paths.slice(0, 10).map(p => {
          try {
            const buf = readFileSync(p)
            const ext = p.split('.').pop()?.toLowerCase() || 'png'
            return 'data:image/' + (ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + buf.toString('base64')
          } catch { return '' }
        }).filter(Boolean)
        settings._slideshow_images = JSON.stringify(images)
      }
    } catch { /* skip */ }

    // TV pairing info: 4-digit code + reachable LAN IPs + port, so /api/pair can hand the
    // TV app a fast LAN target (with the cloud display as the fallback).
    //
    // The code is machine-wide and the UI only ever shows it on the "Main Display" tab, so it
    // belongs ONLY on the default profile's row. Stamping it into every profile made /api/pair
    // (which picks the freshest matching row) resolve the code to whichever named profile synced
    // last — so pairing the main TV landed it on the menu-board screen, with no way back.
    // Named profiles are reached by their own ?profile= link instead.
    if (profileName === 'default') {
      settings._pairing_code = getPairingCode()
    }
    settings._lan_ips = JSON.stringify(getLanIPs())
    settings._port = String(getCurrentPort())

    const { error } = await supabase.from('display_settings').upsert({
      machine_id: machineId,
      profile_name: profileName,
      settings: settings,
      updated_at: new Date().toISOString()
    }, { onConflict: 'machine_id,profile_name' })
    if (error) console.error('[CloudSync] Display settings sync failed:', error.message)
    else console.log('[CloudSync] Display settings synced for profile:', profileName)
  } catch (err) { console.error('[CloudSync] Display sync error:', err) }
}

/** Local mirror of the cloud catalog quote_revision (written after each
 *  successful push; read by the remote-order listener's accept-time check). */
const MENU_QUOTE_REVISION_KEY = 'menu_quote_revision'

/**
 * Fingerprint over the CUSTOMER-VISIBLE catalog payload. When this changes, the
 * cloud quote_revision MUST be bumped (WP-G red-team finding #1) or the remote
 * order stale-quote check is blind to price changes — a customer could confirm
 * 500 and be charged 650.
 */
function catalogFingerprint(categories: any[], items: any[]): string {
  const visible = {
    categories: (categories || []).map((c: any) => ({ id: c.id, name: c.name, emoji: c.emoji })),
    items: (items || []).map((i: any) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      active: i.is_active,
      cat: i.category_id,
      emoji: i.emoji
    }))
  }
  return createHash('sha256').update(JSON.stringify(visible)).digest('hex')
}

/** Sync menu data to Supabase for remote ordering + display.
 *  Bumps quote_revision whenever the customer-visible payload changed. */
export async function syncMenuToCloud(): Promise<void> {
  if (!net.isOnline()) return
  try {
    const machineId = getMachineId()
    const supabase = getClient()

    const categories = categoriesRepo.getAll()
    const items = menuRepo.getAll()
    const fingerprint = catalogFingerprint(categories as any[], items as any[])

    // Preferred: atomic RPC (migration 0007) — upsert + conditional revision bump
    // in one statement. Returns the (possibly bumped) quote_revision.
    try {
      const { data, error } = await supabase.rpc('menu_sync_push', {
        p_machine_id: machineId,
        p_categories: categories,
        p_items: items,
        p_fingerprint: fingerprint
      })
      if (!error && data != null && Number.isFinite(Number(data))) {
        settingsRepo.set(MENU_QUOTE_REVISION_KEY, String(Number(data)))
        return
      }
    } catch { /* RPC unavailable — fall back below */ }

    // Fallback (RPC not deployed yet): read-compare-bump. The POS is the single
    // writer for its own machine_id, so the read-then-write race is theoretical.
    const { data: existing } = await supabase
      .from('menu_sync')
      .select('quote_revision, catalog_fingerprint')
      .eq('machine_id', machineId)
      .maybeSingle()
    const changed = !existing || existing.catalog_fingerprint !== fingerprint
    const revision = Number(existing?.quote_revision ?? 0) + (changed ? 1 : 0)

    const { error: upsertError } = await supabase.from('menu_sync').upsert({
      machine_id: machineId,
      categories: categories,
      items: items,
      updated_at: new Date().toISOString(),
      quote_revision: revision,
      catalog_fingerprint: fingerprint
    }, { onConflict: 'machine_id' })
    if (!upsertError) {
      settingsRepo.set(MENU_QUOTE_REVISION_KEY, String(revision))
    }
  } catch { /* offline/transient — the local revision mirror stays at the last
               successfully pushed value, matching what customers can quote */ }
}

/** Get or create short codes for all link types */
export async function getShortCodes(): Promise<{ tv: string; owner: string; order: string }> {
  const machineId = getMachineId()
  const supabase = getClient()

  const result = { tv: '', owner: '', order: '' }

  for (const type of ['tv', 'owner', 'order'] as const) {
    // Check if code exists
    const { data } = await supabase.from('short_codes')
      .select('code')
      .eq('machine_id', machineId)
      .eq('type', type)
      .eq('profile_name', 'default')
      .single()

    if (data) {
      result[type] = data.code
    } else {
      // Generate new code, retry on collision
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateShortCode()
        const { error } = await supabase.from('short_codes').insert({
          machine_id: machineId,
          type: type,
          code: code,
          profile_name: 'default'
        })
        if (!error) {
          result[type] = code
          break
        }
      }
    }
  }

  return result
}

/** Create a new display profile with its own short code */
export async function createDisplayProfile(profileName: string): Promise<string> {
  const machineId = getMachineId()
  const supabase = getClient()

  // Generate short code for this profile
  let code = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateShortCode()
    const { error } = await supabase.from('short_codes').insert({
      machine_id: machineId,
      type: 'tv',
      code: candidate,
      profile_name: profileName
    })
    if (!error) { code = candidate; break }
  }

  // Copy current display settings as the profile's settings
  await syncDisplaySettings(profileName)

  return code
}

/** Delete a display profile row from Supabase (and its short_codes). */
export async function deleteDisplayProfileFromCloud(profileName: string): Promise<void> {
  if (!net.isOnline()) return
  if (profileName === 'default') return // never delete default
  try {
    const machineId = getMachineId()
    const supabase = getClient()
    await supabase
      .from('display_settings')
      .delete()
      .eq('machine_id', machineId)
      .eq('profile_name', profileName)
    await supabase
      .from('short_codes')
      .delete()
      .eq('machine_id', machineId)
      .eq('profile_name', profileName)
  } catch (err) {
    console.error('[CloudSync] deleteDisplayProfileFromCloud error:', err)
  }
}

/** The list of display profiles configured locally (always includes 'default'). */
export function getLocalProfiles(): string[] {
  const storedRaw = settingsRepo.get('display_profiles')
  let list: string[] = ['default']
  try {
    if (storedRaw) {
      const parsed = JSON.parse(storedRaw)
      if (Array.isArray(parsed)) list = parsed
    }
  } catch { /* ignore */ }
  if (!list.includes('default')) list.unshift('default')
  return list
}

/** Push EVERY local display profile's settings to the cloud, not just 'default'. The periodic
 * sync used to refresh only the default profile, so named-profile TV rows kept stale promos /
 * packs / logo / LAN-IP+port forever, and profiles created while offline never got a cloud row
 * at all. Sequential (await per profile) to avoid parallel upserts of large base64 payloads. */
export async function syncAllDisplayProfiles(): Promise<void> {
  if (!net.isOnline()) return
  for (const name of getLocalProfiles()) {
    try { await syncDisplaySettings(name) } catch { /* skip one, keep going */ }
  }
}

/** Reconcile Supabase profiles against the local display_profiles list. Any
 * profile row in the cloud that isn't in the local list gets deleted. Runs
 * on every periodic sync so orphans from prior installs self-heal.
 */
export async function reconcileDisplayProfiles(): Promise<void> {
  if (!net.isOnline()) return
  try {
    const machineId = getMachineId()
    const supabase = getClient()

    const localList = getLocalProfiles()

    const { data } = await supabase
      .from('display_settings')
      .select('profile_name')
      .eq('machine_id', machineId)

    const orphans = (data || [])
      .map((r: any) => r.profile_name as string)
      .filter((name: string) => !localList.includes(name))

    for (const name of orphans) {
      await deleteDisplayProfileFromCloud(name)
    }
  } catch (err) {
    console.error('[CloudSync] reconcileDisplayProfiles error:', err)
  }
}

/** Start periodic sync (every 5 minutes) */
let syncInterval: ReturnType<typeof setInterval> | null = null

export function startCloudSync(): void {
  console.log('[CloudSync] Starting cloud sync system')
  // Initial sync after 10 seconds
  setTimeout(() => {
    console.log('[CloudSync] Running initial sync...')
    syncAllDisplayProfiles().catch((e) => console.error('[CloudSync] Initial display sync failed:', e))
    syncMenuToCloud().catch((e) => console.error('[CloudSync] Initial menu sync failed:', e))
    reconcileDisplayProfiles().catch((e) => console.error('[CloudSync] Initial reconcile failed:', e))
  }, 10000)

  // Sync every 5 minutes
  syncInterval = setInterval(() => {
    syncAllDisplayProfiles().catch((e) => console.error('[CloudSync] Periodic display sync failed:', e))
    syncMenuToCloud().catch(() => {})
    reconcileDisplayProfiles().catch(() => {})
  }, 5 * 60 * 1000)
}

export function stopCloudSync(): void {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null }
}
