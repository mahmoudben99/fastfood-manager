import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getDisplayHTML } from '@/lib/display-ui'
import { formatAlgiersDate } from '@/lib/dates'

export const dynamic = 'force-dynamic'

const MAX_QUEUE_ITEMS = 100

function todayStr(): string {
  return formatAlgiersDate()
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** Durable visual state. Media is only immutable Storage URLs; packs never reach a TV. */
function buildInfo(raw: Record<string, any>, prefix: string, menuItems: any[]) {
  let social: any[] = []; try { social = JSON.parse(raw.social_media || '[]') } catch {}
  let promos: any[] = []; try { promos = JSON.parse(raw._promos || '[]') } catch {}
  let slideshowImages: any[] = []; try { slideshowImages = JSON.parse(raw._slideshow_media || '[]') } catch {}

  const panelMenuEnabled = raw[prefix + 'panel_menu'] !== 'false'
  return {
    type: 'info',
    name: raw.restaurant_name || '',
    logo: raw._logo_url || '',
    currency: raw.currency_symbol || raw.currency || 'DA',
    phone: raw.restaurant_phone || '',
    promos: promos.map((promo: any) => ({ name: promo.name, type: promo.type, value: promo.discount_value || promo.value })),
    social,
    youtubeUrl: raw[prefix + 'youtube_url'] || '',
    themeColor: raw[prefix + 'accent_color'] || '#f97316',
    accentColor: raw[prefix + 'accent_color'] || '#f97316',
    slideshowImages,
    welcomeMode: raw[prefix + 'welcome_mode'] || 'animated',
    welcomeText: raw[prefix + 'welcome_text'] || '',
    gradientPreset: parseInt(raw[prefix + 'gradient_preset'] || '0', 10),
    fontFamily: raw[prefix + 'font_family'] || 'Inter',
    textColor: raw[prefix + 'text_color'] || '#ffffff',
    textScale: raw[prefix + 'text_scale'] || 'medium',
    showMenu: panelMenuEnabled,
    menuItems: panelMenuEnabled ? menuItems : [],
    showName: raw[prefix + 'show_name'] !== 'false',
    logoScale: parseFloat(raw[prefix + 'logo_scale'] || '1'),
    panelWelcome: raw[prefix + 'panel_welcome'] !== 'false',
    panelSocial: raw[prefix + 'panel_social'] !== 'false',
    panelPromos: raw[prefix + 'panel_promos'] !== 'false',
    panelSlideshow: raw[prefix + 'panel_slideshow'] !== 'false',
    panelOrders: raw[prefix + 'panel_orders'] !== 'false',
    panelMenu: panelMenuEnabled
  }
}

function responseHeaders(revision: string): Record<string, string> {
  return {
    ETag: `"${revision}"`,
    'Cache-Control': 'private, max-age=0, must-revalidate'
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const machineId = url.searchParams.get('machineId')
  const profile = url.searchParams.get('profile') || 'default'

  if (!machineId) {
    return new NextResponse('<h1>Missing machineId</h1>', { status: 400, headers: { 'Content-Type': 'text/html' } })
  }

  const prefix = profile === 'default' ? 'display_' : `display_${profile}_`
  const [dsResult, menuResult, ordersResult] = await Promise.all([
    supabase.from('display_settings').select('settings').eq('machine_id', machineId).eq('profile_name', profile).single(),
    supabase.from('menu_sync').select('items').eq('machine_id', machineId).single(),
    supabase.from('owner_orders').select('order_number').eq('machine_id', machineId).eq('status', 'preparing').gte('order_date', todayStr())
  ])

  if (dsResult.error || menuResult.error) {
    const message = 'Display data is temporarily unavailable; keeping the last known screen.'
    if (url.searchParams.get('json') === '1' || url.searchParams.get('settings') === '1') {
      return NextResponse.json({ error: message }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
    return new NextResponse(`<h1>${message}</h1>`, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    })
  }

  const raw = (dsResult.data?.settings || {}) as Record<string, any>
  const info = buildInfo(raw, prefix, menuResult.data?.items || [])
  const revision = createHash('sha256').update(JSON.stringify(info)).digest('base64url').slice(0, 24)
  const preparing = ordersResult.error
    ? null
    : (ordersResult.data || [])
      .map((order: any) => String(order.order_number).slice(0, 64))
      .slice(0, MAX_QUEUE_ITEMS)
  const queue = preparing ? { type: 'queue', preparing } : null

  // The normal 30-second poll is deliberately tiny: revision plus a bounded queue only. It
  // never carries media or the menu, so it remains well under 32KiB even with a busy kitchen.
  if (url.searchParams.get('json') === '1') {
    return NextResponse.json({ revision, ...(queue ? { queue } : {}) }, {
      headers: { 'Cache-Control': 'no-store' }
    })
  }

  // Settings are fetched only after a revision change. ETag lets a retry avoid retransmitting
  // the menu/settings document; media URLs themselves are immutable and cache for a year.
  if (url.searchParams.get('settings') === '1') {
    const headers = responseHeaders(revision)
    if (req.headers.get('if-none-match') === headers.ETag) {
      return new NextResponse(null, { status: 304, headers })
    }
    return NextResponse.json({ revision, info }, { headers })
  }

  let displayHTML = getDisplayHTML(raw.language || 'en')
  const initialInfo = scriptJson(info)
  const initialQueue = scriptJson(queue)
  const pollPath = scriptJson(`/api/tv-html?machineId=${encodeURIComponent(machineId)}&profile=${encodeURIComponent(profile)}&json=1`)
  const settingsPath = scriptJson(`/api/tv-html?machineId=${encodeURIComponent(machineId)}&profile=${encodeURIComponent(profile)}&settings=1`)
  displayHTML = displayHTML.replace(
    'connect();',
    `// Cloud mode: fetch durable settings only when its revision changes.
    var __cloudInfo = ${initialInfo};
    var __cloudQueue = ${initialQueue};
    var __cloudRevision = ${scriptJson(revision)};
    var __cloudSettingsEtag = '"' + __cloudRevision + '"';
    var __cloudPollPath = ${pollPath};
    var __cloudSettingsPath = ${settingsPath};
    handleSSE(__cloudInfo);
    if (__cloudQueue) handleSSE(__cloudQueue);
    setInterval(function() {
      fetch(__cloudPollPath, { cache: 'no-store' })
        .then(function(r) { if (!r.ok) throw new Error('Display refresh unavailable'); return r.json(); })
        .then(function(update) {
          if (update && update.queue) handleSSE(update.queue);
          if (!update || !update.revision || update.revision === __cloudRevision) return null;
          return fetch(__cloudSettingsPath, {
            cache: 'no-store',
            headers: { 'If-None-Match': __cloudSettingsEtag }
          }).then(function(r) {
            if (r.status === 304) return null;
            if (!r.ok) throw new Error('Display settings unavailable');
            __cloudSettingsEtag = r.headers.get('ETag') || '"' + update.revision + '"';
            return r.json();
          }).then(function(settings) {
            if (settings && settings.info) {
              __cloudRevision = settings.revision;
              handleSSE(settings.info);
            }
          });
        })
        .catch(function() {});
    }, 30000);`
  )

  return new NextResponse(displayHTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store' }
  })
}
