import { getClient } from '../activation/cloud'
import { getMachineId } from '../activation/activation'
import { settingsRepo } from '../database/repositories/settings.repo'
import { menuRepo } from '../database/repositories/menu.repo'
import { categoriesRepo } from '../database/repositories/categories.repo'
import { promotionsRepo } from '../database/repositories/promotions.repo'
import { nativeImage, net } from 'electron'
import { createHash } from 'crypto'
import { getLanIPs } from '../tablet/network'
import { getCurrentPort } from '../tablet/server'
import { getPairingCode } from '../tablet/pairing'

function generateShortCode(): string {
  // 4-digit numeric code
  return String(Math.floor(1000 + Math.random() * 9000))
}

const TV_MEDIA_UPLOAD_URL = 'https://fastfood-manager.vercel.app/api/tv-media'
const MAX_TV_MEDIA_IMAGES = 10
const MAX_TV_MEDIA_WIDTH = 1920
const MAX_TV_MEDIA_HEIGHT = 1080
const MAX_TV_MEDIA_BYTES = 750 * 1024

/** Converts local artwork into a bounded, content-addressed TV asset. */
function boundedTvJpeg(path: string): Buffer {
  const source = nativeImage.createFromPath(path)
  if (source.isEmpty()) throw new Error(`Could not decode display image: ${path}`)

  const size = source.getSize()
  if (size.width < 1 || size.height < 1) throw new Error(`Invalid display image size: ${path}`)

  let scale = Math.min(1, MAX_TV_MEDIA_WIDTH / size.width, MAX_TV_MEDIA_HEIGHT / size.height)
  while (scale > 0.05) {
    const width = Math.max(1, Math.floor(size.width * scale))
    const height = Math.max(1, Math.floor(size.height * scale))
    const resized = source.resize({ width, height })
    for (const quality of [82, 72, 62, 52, 42, 32]) {
      const jpeg = resized.toJPEG(quality)
      if (jpeg.length <= MAX_TV_MEDIA_BYTES) return jpeg
    }
    scale *= 0.8
  }
  throw new Error(`Display image could not be reduced below ${MAX_TV_MEDIA_BYTES} bytes: ${path}`)
}

async function uploadTvMedia(
  accessToken: string | null,
  machineId: string,
  profileName: string,
  kind: string,
  localPath: string
): Promise<string> {
  if (!accessToken) throw new Error('Authenticated cloud session is required for TV media upload')
  const jpeg = boundedTvJpeg(localPath)
  const version = createHash('sha256').update(jpeg).digest('hex')
  const response = await net.fetch(TV_MEDIA_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      machineId,
      profileName,
      kind,
      version,
      jpegBase64: jpeg.toString('base64')
    })
  })
  const result = await response.json() as { url?: unknown; error?: unknown }
  if (!response.ok || typeof result.url !== 'string' || !result.url.startsWith('https://')) {
    const detail = typeof result.error === 'string' ? result.error : `HTTP ${response.status}`
    throw new Error(`TV media upload failed: ${detail}`)
  }
  return result.url
}

/** Sync display settings to Supabase for Vercel-hosted display */
export async function syncDisplaySettings(profileName: string = 'default'): Promise<void> {
  if (!net.isOnline()) return
  try {
    const machineId = getMachineId()
    const supabase = getClient()
    const [{ data: authData }, { data: previousRow }] = await Promise.all([
      supabase.auth.getSession(),
      supabase
        .from('display_settings')
        .select('settings')
        .eq('machine_id', machineId)
        .eq('profile_name', profileName)
        .maybeSingle()
    ])
    const mediaAccessToken = authData.session?.access_token || null
    const previousSettings = (previousRow?.settings || {}) as Record<string, unknown>
    const previousLogoUrl = typeof previousSettings._logo_url === 'string' &&
      previousSettings._logo_url.startsWith('https://')
      ? previousSettings._logo_url
      : ''
    let previousSlideshowMedia: string[] = []
    try {
      const parsed = JSON.parse(String(previousSettings._slideshow_media || '[]'))
      if (Array.isArray(parsed)) {
        previousSlideshowMedia = parsed
          .filter((value): value is string => typeof value === 'string' && value.startsWith('https://'))
          .slice(0, MAX_TV_MEDIA_IMAGES)
      }
    } catch { /* no valid prior cloud media */ }

    // Gather all display settings
    const allSettings = settingsRepo.getAll()
    const displayKeys = Object.keys(allSettings).filter(k =>
      (k.startsWith('display_') && !k.endsWith('_slideshow_images')) ||
      k === 'restaurant_name' || k === 'restaurant_phone' ||
      k === 'restaurant_phone2' || k === 'restaurant_address' ||
      k === 'social_media' || k === 'currency' || k === 'currency_symbol' || k === 'language'
    )

    const settings: Record<string, string> = {}
    for (const key of displayKeys) {
      settings[key] = allSettings[key]
    }

    // Store artwork outside the JSON row. Base64 settings made a cloud refresh allocate every
    // image in the TV WebView at once.
    const logoPath = allSettings.logo_path
    if (logoPath) {
      try {
        settings._logo_url = await uploadTvMedia(mediaAccessToken, machineId, profileName, 'logo', logoPath)
      } catch (error) {
        if (previousLogoUrl) settings._logo_url = previousLogoUrl
        console.warn('[CloudSync] Display logo upload skipped; keeping last cloud version:', error)
      }
    }

    // Packs are intentionally absent from TV payloads until their price and item-display rules
    // are safe for unattended signage.
    try {
      const promos = promotionsRepo.getActivePromotions()
      settings._promos = JSON.stringify(promos.map((p: any) => ({ name: p.name, type: p.type, value: p.discount_value })))
    } catch { /* skip */ }

    // Convert per-profile local slideshow paths to authenticated, versioned Storage URLs.
    try {
      const slideshowKey = profileName === 'default'
        ? 'display_slideshow_images'
        : `display_${profileName}_slideshow_images`
      const raw = allSettings[slideshowKey]
      if (raw) {
        const paths: string[] = JSON.parse(raw)
        if (!Array.isArray(paths)) throw new Error('Display image setting is not an array')
        const images: string[] = []
        for (const [index, path] of paths.slice(0, MAX_TV_MEDIA_IMAGES).entries()) {
          try {
            images.push(await uploadTvMedia(mediaAccessToken, machineId, profileName, `slideshow-${index}`, path))
          } catch (error) {
            if (previousSlideshowMedia[index]) images.push(previousSlideshowMedia[index])
            console.warn('[CloudSync] Display image upload skipped; keeping last cloud version:', error)
          }
        }
        settings._slideshow_media = JSON.stringify(images)
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
