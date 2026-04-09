import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getDisplayHTML } from '@/lib/display-ui'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const machineId = url.searchParams.get('machineId')
  const profile = url.searchParams.get('profile') || 'default'

  if (!machineId) {
    return new NextResponse('<h1>Missing machineId</h1>', { status: 400, headers: { 'Content-Type': 'text/html' } })
  }

  // JSON mode for polling updates
  if (url.searchParams.get('json') === '1') {
    const [dsR, ordR] = await Promise.all([
      supabase.from('display_settings').select('settings').eq('machine_id', machineId).eq('profile_name', profile).single(),
      supabase.from('owner_orders').select('order_number').eq('machine_id', machineId).eq('status', 'preparing').gte('order_date', new Date().toISOString().split('T')[0])
    ])
    const r = (dsR.data?.settings || {}) as Record<string, any>
    let sc: any[] = []; try { sc = JSON.parse(r.social_media || '[]') } catch {}
    let pr: any[] = []; try { pr = JSON.parse(r._promos || '[]') } catch {}
    let pk: any[] = []; try { pk = JSON.parse(r._packs || '[]') } catch {}
    const prep = (ordR.data || []).map((o: any) => o.order_number)
    return NextResponse.json({
      info: { type: 'info', name: r.restaurant_name || '', promos: pr, packs: pk, social: sc, queue: { preparing: prep }, accentColor: r.display_accent_color || '#f97316', gradientPreset: parseInt(r.display_gradient_preset || '0'), textColor: r.display_text_color || '#ffffff' },
      queue: { type: 'queue', preparing: prep }
    })
  }

  // Fetch all data in parallel
  const [dsResult, menuResult, ordersResult] = await Promise.all([
    supabase.from('display_settings').select('settings').eq('machine_id', machineId).eq('profile_name', profile).single(),
    supabase.from('menu_sync').select('items').eq('machine_id', machineId).single(),
    supabase.from('owner_orders').select('order_number').eq('machine_id', machineId).eq('status', 'preparing').gte('order_date', new Date().toISOString().split('T')[0])
  ])

  const raw = (dsResult.data?.settings || {}) as Record<string, any>

  // Parse settings
  let social: any[] = []; try { social = JSON.parse(raw.social_media || '[]') } catch {}
  let promos: any[] = []; try { promos = JSON.parse(raw._promos || '[]') } catch {}
  let packs: any[] = []; try { packs = JSON.parse(raw._packs || '[]') } catch {}
  let slideshowImages: any[] = []; try { slideshowImages = JSON.parse(raw._slideshow_images || '[]') } catch {}

  const showMenu = raw.display_show_menu === 'true' || raw.display_show_menu === true
  const menuItems = showMenu && menuResult.data?.items ? menuResult.data.items : []
  const preparing = (ordersResult.data || []).map((o: any) => o.order_number)

  const info = JSON.stringify({
    type: 'info',
    name: raw.restaurant_name || '',
    logo: raw._logo_base64 || '',
    currency: raw.currency_symbol || raw.currency || 'DA',
    phone: raw.restaurant_phone || '',
    promos: promos.map((p: any) => ({ name: p.name, type: p.type, value: p.discount_value || p.value })),
    packs: packs.map((p: any) => ({ name: p.name, price: p.pack_price || p.price, emoji: p.emoji || '', items: p.items || [] })),
    social,
    youtubeUrl: raw.display_youtube_url || '',
    themeColor: raw.display_accent_color || '#f97316',
    accentColor: raw.display_accent_color || '#f97316',
    slideshowImages,
    welcomeMode: raw.display_welcome_mode || 'animated',
    welcomeText: raw.display_welcome_text || '',
    gradientPreset: parseInt(raw.display_gradient_preset || '0'),
    fontFamily: raw.display_font_family || 'Inter',
    textColor: raw.display_text_color || '#ffffff',
    textScale: raw.display_text_scale || 'medium',
    showMenu,
    menuItems,
    showName: raw.display_show_name !== 'false',
    logoScale: parseFloat(raw.display_logo_scale || '1'),
    panelWelcome: raw.display_panel_welcome !== 'false',
    panelSocial: raw.display_panel_social !== 'false',
    panelPromos: raw.display_panel_promos !== 'false',
    panelSlideshow: raw.display_panel_slideshow !== 'false',
    panelOrders: raw.display_panel_orders !== 'false',
    panelMenu: raw.display_panel_menu !== 'false',
    queue: { preparing }
  })

  const queue = JSON.stringify({ type: 'queue', preparing })

  const lang = raw.language || 'en'

  // Get the EXACT same HTML as the local display
  let displayHTML = getDisplayHTML(lang)

  // Replace the connect() call with direct data injection
  // Define variables and call handleSSE inline — no separate script tag needed
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
