import { getClient } from '../activation/cloud'
import { getMachineId } from '../activation/activation'
import { settingsRepo } from '../database/repositories/settings.repo'
import { menuRepo } from '../database/repositories/menu.repo'
import { categoriesRepo } from '../database/repositories/categories.repo'
import { promotionsRepo } from '../database/repositories/promotions.repo'
import { net } from 'electron'

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
        const { readFileSync } = await import('fs')
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

    // Get slideshow images as base64
    try {
      const raw = allSettings.display_slideshow_images
      if (raw) {
        const paths: string[] = JSON.parse(raw)
        const { readFileSync } = await import('fs')
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

/** Sync menu data to Supabase for remote ordering + display */
export async function syncMenuToCloud(): Promise<void> {
  if (!net.isOnline()) return
  try {
    const machineId = getMachineId()
    const supabase = getClient()

    const categories = categoriesRepo.getAll()
    const items = menuRepo.getAll()

    await supabase.from('menu_sync').upsert({
      machine_id: machineId,
      categories: categories,
      items: items,
      updated_at: new Date().toISOString()
    }, { onConflict: 'machine_id' })
  } catch { /* silent */ }
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

/** Start periodic sync (every 5 minutes) */
let syncInterval: ReturnType<typeof setInterval> | null = null

export function startCloudSync(): void {
  console.log('[CloudSync] Starting cloud sync system')
  // Initial sync after 10 seconds
  setTimeout(() => {
    console.log('[CloudSync] Running initial sync...')
    syncDisplaySettings().catch((e) => console.error('[CloudSync] Initial display sync failed:', e))
    syncMenuToCloud().catch((e) => console.error('[CloudSync] Initial menu sync failed:', e))
  }, 10000)

  // Sync every 5 minutes
  syncInterval = setInterval(() => {
    syncDisplaySettings().catch((e) => console.error('[CloudSync] Periodic display sync failed:', e))
    syncMenuToCloud().catch(() => {})
  }, 5 * 60 * 1000)
}

export function stopCloudSync(): void {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null }
}
