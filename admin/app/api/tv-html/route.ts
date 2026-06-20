import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getDisplayHTML } from '@/lib/display-ui'

export const dynamic = 'force-dynamic'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Build the FULL display "info" payload. Used for BOTH the initial HTML injection and the
 * 30s json poll. Previously the poll returned a stripped object (no logo/menu/panels/fonts),
 * and the client's handleSSE('info') overwrites state wholesale — so every 30s the logo, menu,
 * slideshow, fonts and panel toggles reset to defaults (visible flicker). Sharing one builder
 * keeps the poll payload complete so the overwrite is a no-op when nothing changed.
 */
function buildInfo(raw: Record<string, any>, p: string, menuItems: any[], preparing: any[]) {
  let social: any[] = []; try { social = JSON.parse(raw.social_media || '[]') } catch {}
  let promos: any[] = []; try { promos = JSON.parse(raw._promos || '[]') } catch {}
  let packs: any[] = []; try { packs = JSON.parse(raw._packs || '[]') } catch {}
  let slideshowImages: any[] = []; try { slideshowImages = JSON.parse(raw._slideshow_images || '[]') } catch {}

  const panelMenuEnabled = raw[p + 'panel_menu'] !== 'false'

  return {
    type: 'info',
    name: raw.restaurant_name || '',
    logo: raw._logo_base64 || '',
    currency: raw.currency_symbol || raw.currency || 'DA',
    phone: raw.restaurant_phone || '',
    promos: promos.map((pr: any) => ({ name: pr.name, type: pr.type, value: pr.discount_value || pr.value })),
    packs: packs.map((pk: any) => ({ name: pk.name, price: pk.pack_price || pk.price, emoji: pk.emoji || '', items: pk.items || [] })),
    social,
    youtubeUrl: raw[p + 'youtube_url'] || '',
    themeColor: raw[p + 'accent_color'] || '#f97316',
    accentColor: raw[p + 'accent_color'] || '#f97316',
    slideshowImages,
    welcomeMode: raw[p + 'welcome_mode'] || 'animated',
    welcomeText: raw[p + 'welcome_text'] || '',
    gradientPreset: parseInt(raw[p + 'gradient_preset'] || '0'),
    fontFamily: raw[p + 'font_family'] || 'Inter',
    textColor: raw[p + 'text_color'] || '#ffffff',
    textScale: raw[p + 'text_scale'] || 'medium',
    showMenu: panelMenuEnabled,
    menuItems: panelMenuEnabled ? menuItems : [],
    showName: raw[p + 'show_name'] !== 'false',
    logoScale: parseFloat(raw[p + 'logo_scale'] || '1'),
    panelWelcome: raw[p + 'panel_welcome'] !== 'false',
    panelSocial: raw[p + 'panel_social'] !== 'false',
    panelPromos: raw[p + 'panel_promos'] !== 'false',
    panelSlideshow: raw[p + 'panel_slideshow'] !== 'false',
    panelOrders: raw[p + 'panel_orders'] !== 'false',
    panelMenu: panelMenuEnabled,
    queue: { preparing }
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const machineId = url.searchParams.get('machineId')
  const profile = url.searchParams.get('profile') || 'default'

  if (!machineId) {
    return new NextResponse('<h1>Missing machineId</h1>', { status: 400, headers: { 'Content-Type': 'text/html' } })
  }

  // Per-profile setting key prefix — matches AmbianceScreen.tsx:131
  const p = profile === 'default' ? 'display_' : `display_${profile}_`

  // Fetch all data in parallel (same set for both JSON poll and initial HTML)
  const [dsResult, menuResult, ordersResult] = await Promise.all([
    supabase.from('display_settings').select('settings').eq('machine_id', machineId).eq('profile_name', profile).single(),
    supabase.from('menu_sync').select('items').eq('machine_id', machineId).single(),
    supabase.from('owner_orders').select('order_number').eq('machine_id', machineId).eq('status', 'preparing').gte('order_date', todayStr())
  ])

  const raw = (dsResult.data?.settings || {}) as Record<string, any>
  const menuItems = menuResult.data?.items || []
  const preparing = (ordersResult.data || []).map((o: any) => o.order_number)

  const infoObj = buildInfo(raw, p, menuItems, preparing)

  // JSON mode for polling updates — return the SAME full info object so the poll never
  // wipes logo/menu/panels back to defaults.
  if (url.searchParams.get('json') === '1') {
    return NextResponse.json({ info: infoObj, queue: { type: 'queue', preparing } })
  }

  const info = JSON.stringify(infoObj)
  const queue = JSON.stringify({ type: 'queue', preparing })
  const lang = raw.language || 'en'

  // Get the EXACT same HTML as the local display
  let displayHTML = getDisplayHTML(lang)

  // Replace the connect() call with direct data injection
  displayHTML = displayHTML.replace(
    'connect();',
    `// Cloud mode: inject data directly instead of SSE
    var __cloudInfo = ${info};
    var __cloudQueue = ${queue};
    handleSSE(__cloudInfo);
    handleSSE(__cloudQueue);
    // Poll for updates every 30s
    setInterval(function() {
      fetch('/api/tv-html?machineId=' + encodeURIComponent(${JSON.stringify(machineId)}) + '&profile=' + encodeURIComponent(${JSON.stringify(profile)}) + '&json=1')
        .then(function(r) { return r.json(); })
        .then(function(d) { if (d && d.info) { handleSSE(d.info); if (d.queue) handleSSE(d.queue); } })
        .catch(function() {});
    }, 30000);`
  )

  return new NextResponse(displayHTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store' }
  })
}
