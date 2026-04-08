'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

/* ═══════════════════════════════════
   TYPES
═══════════════════════════════════ */
interface SocialEntry { platform: string; handle: string }
interface PromoEntry { name: string; value: number; type: 'percentage' | 'fixed' }
interface PackEntry { name: string; pack_price?: number; price?: number; emoji?: string; items?: { name: string; quantity: number }[] }
interface SlideshowImage { src: string; caption?: string }
interface MenuItem { name: string; price: number; emoji?: string; category_name?: string }

interface DisplaySettings {
  name?: string
  logo?: string
  promos?: PromoEntry[]
  packs?: PackEntry[]
  social?: SocialEntry[]
  phone?: string
  youtubeUrl?: string
  gradientPreset?: number
  fontFamily?: string
  textColor?: string
  accentColor?: string
  welcomeMode?: 'animated' | 'static'
  welcomeText?: string
  slideshowImages?: (string | SlideshowImage)[]
  currency?: string
  textScale?: 'small' | 'medium' | 'large'
  showMenu?: boolean
  menuItems?: MenuItem[]
  showName?: boolean
  logoScale?: number
  panelWelcome?: boolean
  panelSocial?: boolean
  panelPromos?: boolean
  panelSlideshow?: boolean
  panelOrders?: boolean
  panelMenu?: boolean
}

interface TVDisplayProps {
  machineId: string
  profile: string
  initialSettings: DisplaySettings
}

/* ═══════════════════════════════════
   GRADIENT PRESETS
═══════════════════════════════════ */
const GRADIENTS = [
  'linear-gradient(-45deg, #0f0c29, #302b63, #24243e, #0f0c29)',
  'linear-gradient(-45deg, #000428, #004e92, #000428, #003366)',
  'linear-gradient(-45deg, #1a0a00, #b44d12, #e65c00, #1a0a00)',
  'linear-gradient(-45deg, #0a1a0a, #1b4332, #2d6a4f, #0a1a0a)',
  'linear-gradient(-45deg, #1a0024, #3c096c, #7b2cbf, #1a0024)',
  'linear-gradient(-45deg, #1a0000, #800020, #b5003c, #1a0000)',
  'linear-gradient(-45deg, #1a1200, #3e2723, #795548, #1a1200)',
  'linear-gradient(-45deg, #0a0f1a, #1a3a5c, #4a90d9, #0a0f1a)',
  'linear-gradient(-45deg, #1a0500, #bf360c, #ff6e40, #1a0500)',
  'linear-gradient(-45deg, #001a1a, #004d4d, #009688, #001a1a)',
  'linear-gradient(-45deg, #1a1400, #544a00, #c6a700, #1a1400)',
  'linear-gradient(-45deg, #1a0a10, #6b2048, #c2185b, #1a0a10)',
  'linear-gradient(-45deg, #0a0a0a, #1a1a2e, #3a3a5c, #0a0a0a)',
  'linear-gradient(-45deg, #1a0f0a, #4a2c1a, #8d5524, #1a0f0a)',
  'linear-gradient(-45deg, #0a0a0f, #111118, #0a0a0f, #111118)',
  'linear-gradient(-45deg, #fff1eb, #ace0f9, #fff1eb, #ffd6a5)',
  'linear-gradient(-45deg, #fce4ec, #e8eaf6, #fce4ec, #f3e5f5)',
  'linear-gradient(-45deg, #e8f5e9, #b2dfdb, #e8f5e9, #c8e6c9)',
  'linear-gradient(-45deg, #fff3e0, #ffe0b2, #fff3e0, #ffccbc)',
  'linear-gradient(-45deg, #e3f2fd, #bbdefb, #e3f2fd, #b3e5fc)',
]

const WELCOME_MSGS = [
  { text: 'Welcome', dir: 'ltr' as const },
  { text: 'Bienvenue', dir: 'ltr' as const },
  { text: '\u0645\u0631\u062D\u0628\u0627 \u0628\u0643\u0645', dir: 'rtl' as const },
]

const PLATFORM_ICONS: Record<string, string> = {
  facebook: '\uD83D\uDCD8',
  instagram: '\uD83D\uDCF7',
  snapchat: '\uD83D\uDC7B',
  tiktok: '\uD83C\uDFB5',
  twitter: '\uD83D\uDC26',
  x: '\u2716',
  youtube: '\u25B6\uFE0F',
  whatsapp: '\uD83D\uDCAC',
  threads: '\uD83E\uDDF5',
  telegram: '\u2708\uFE0F',
}

/* ═══════════════════════════════════
   HELPERS
═══════════════════════════════════ */
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) || 0
  const g = parseInt(hex.slice(3, 5), 16) || 0
  const b = parseInt(hex.slice(5, 7), 16) || 0
  return `${r},${g},${b}`
}

function fmtPrice(v: number, currency: string) {
  return Number(v).toLocaleString() + (currency ? ' ' + currency : '')
}

/* ═══════════════════════════════════
   COMPONENT
═══════════════════════════════════ */
export function TVDisplay({ machineId, profile, initialSettings }: TVDisplayProps) {
  const [settings, setSettings] = useState<DisplaySettings>(initialSettings)
  const [activePanel, setActivePanel] = useState(0)
  const [visible, setVisible] = useState(true)
  const [welcomeMsg, setWelcomeMsg] = useState(WELCOME_MSGS[0])
  const [welcomeVisible, setWelcomeVisible] = useState(false)
  const [orders, setOrders] = useState<number[]>([])
  const [controlsVisible, setControlsVisible] = useState(false)
  const [musicEnabled, setMusicEnabled] = useState(true)
  const [showMusicOverlay, setShowMusicOverlay] = useState(false)

  const panelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const welcomeTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const welcomeIdx = useRef(0)
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ytRef = useRef<HTMLIFrameElement | null>(null)

  // Normalize settings keys — cloud sync uses display_ prefix, component expects short keys
  const raw = settings as any
  const s: any = {
    ...raw,
    gradientPreset: raw.gradientPreset ?? raw.display_gradient_preset ?? 0,
    fontFamily: raw.fontFamily || raw.display_font_family || 'Inter',
    textColor: raw.textColor || raw.display_text_color || '#ffffff',
    accentColor: raw.accentColor || raw.display_accent_color || '#f97316',
    textScale: raw.textScale || raw.display_text_scale || 'medium',
    logoScale: raw.logoScale ?? raw.display_logo_scale ?? 1,
    showName: raw.showName ?? raw.display_show_name ?? true,
    showMenu: raw.showMenu ?? raw.display_show_menu ?? false,
    welcomeMode: raw.welcomeMode || raw.display_welcome_mode || 'animated',
    welcomeText: raw.welcomeText || raw.display_welcome_text || '',
    youtubeUrl: raw.youtubeUrl || raw.display_youtube_url || '',
    name: raw.name || raw.restaurant_name || '',
    logo: raw.logo || raw._logo_base64 || '',
    phone: raw.phone || raw.restaurant_phone || '',
    currency: raw.currency || raw.currency_symbol || 'DA',
    panelWelcome: raw.panelWelcome ?? (raw.display_panel_welcome !== 'false'),
    panelSocial: raw.panelSocial ?? (raw.display_panel_social !== 'false'),
    panelPromos: raw.panelPromos ?? (raw.display_panel_promos !== 'false'),
    panelSlideshow: raw.panelSlideshow ?? (raw.display_panel_slideshow !== 'false'),
    panelOrders: raw.panelOrders ?? (raw.display_panel_orders !== 'false'),
    panelMenu: raw.panelMenu ?? (raw.display_panel_menu !== 'false'),
  }
  // Parse promos/packs from JSON strings if needed
  if (typeof s._promos === 'string') try { s.promos = JSON.parse(s._promos) } catch {}
  if (typeof s._packs === 'string') try { s.packs = JSON.parse(s._packs) } catch {}
  if (typeof s._slideshow_images === 'string') try { s.slideshowImages = JSON.parse(s._slideshow_images) } catch {}
  if (typeof s.social_media === 'string') try { s.social = JSON.parse(s.social_media) } catch {}

  const gradientIdx = Math.max(0, Math.min(19, Number(s.gradientPreset) || 0))
  const isLightGradient = gradientIdx >= 15
  const textColor = isLightGradient ? '#1a1a1a' : (s.textColor || '#ffffff')
  const accentColor = s.accentColor || '#f97316'
  const effectiveAccent = isLightGradient && (accentColor === '#f97316' || accentColor === '#ff6b35') ? '#c2410c' : accentColor
  const accentRgb = hexToRgb(effectiveAccent)
  const headingMuted = isLightGradient ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)'
  const currency = s.currency || 'DA'
  const fontFamily = s.fontFamily ? `'${s.fontFamily}', system-ui, sans-serif` : "'Inter', system-ui, sans-serif"
  const textScale = s.textScale === 'small' ? 0.8 : s.textScale === 'large' ? 1.3 : 1.0
  const logoSize = `${(s.logoScale ?? 1) * 200}px`

  // Build panels list
  const panels: { id: string; duration: number }[] = []
  if (s.panelWelcome !== false) panels.push({ id: 'welcome', duration: 10000 })
  const hasSocial = (s.social && s.social.length > 0) || s.phone
  if (hasSocial && s.panelSocial !== false) panels.push({ id: 'social', duration: 8000 })
  const allPromos: { name: string; value: string; emoji: string; badge: string; items: { name: string; quantity: number }[] }[] = []
  if (s.promos) {
    for (const p of s.promos) {
      const val = p.type === 'percentage' ? `-${p.value}%` : `-${fmtPrice(p.value, currency)}`
      allPromos.push({ name: p.name, value: val, emoji: '', badge: 'Deal', items: [] })
    }
  }
  if (s.packs) {
    for (const pk of s.packs) {
      allPromos.push({ name: pk.name, value: fmtPrice(pk.pack_price || pk.price || 0, currency), emoji: pk.emoji || '', badge: '', items: pk.items || [] })
    }
  }
  if (allPromos.length > 0 && s.panelPromos !== false) panels.push({ id: 'promos', duration: 10000 })
  const slides = (s.slideshowImages || []).map((img: any) => {
    if (typeof img === 'string') return { src: img.startsWith('data:') || img.startsWith('http') ? img : `data:image/png;base64,${img}`, caption: '' }
    return { src: img.src?.startsWith('data:') || img.src?.startsWith('http') ? img.src : `data:image/png;base64,${img.src}`, caption: img.caption || '' }
  })
  if (slides.length > 0 && s.panelSlideshow !== false) {
    slides.forEach((_: any, i: number) => panels.push({ id: `slide-${i}`, duration: 8000 }))
  }
  if (orders.length > 0 && s.panelOrders !== false) panels.push({ id: 'orders', duration: 6000 })

  // Menu pages
  const menuItems = s.menuItems || []
  const menuPages: { catName: string; items: MenuItem[] }[][] = []
  if (s.showMenu && s.panelMenu !== false && menuItems.length > 0) {
    const catMap: Record<string, MenuItem[]> = {}
    const catOrder: string[] = []
    for (const item of menuItems) {
      const cat = item.category_name || 'Other'
      if (!catMap[cat]) { catMap[cat] = []; catOrder.push(cat) }
      catMap[cat].push(item)
    }
    let currentPage: { catName: string; items: MenuItem[] }[] = []
    let count = 0
    const MAX = 10
    for (const cName of catOrder) {
      const cItems = catMap[cName]
      if (count > 0 && count + cItems.length > MAX) {
        menuPages.push(currentPage)
        currentPage = []
        count = 0
      }
      if (cItems.length > MAX) {
        for (let i = 0; i < cItems.length; i += MAX) {
          if (count > 0) { menuPages.push(currentPage); currentPage = []; count = 0 }
          const chunk = cItems.slice(i, i + MAX)
          currentPage.push({ catName: cName, items: chunk })
          count += chunk.length
          if (count >= MAX) { menuPages.push(currentPage); currentPage = []; count = 0 }
        }
      } else {
        currentPage.push({ catName: cName, items: cItems })
        count += cItems.length
      }
    }
    if (currentPage.length > 0) menuPages.push(currentPage)
    menuPages.forEach((_, i) => panels.push({ id: `menu-${i}`, duration: 10000 }))
  }

  const currentPanelId = panels[activePanel]?.id || 'welcome'

  // Welcome message cycling
  useEffect(() => {
    if (currentPanelId !== 'welcome') {
      setWelcomeVisible(false)
      if (welcomeTimer.current) clearInterval(welcomeTimer.current)
      return
    }
    if (s.welcomeMode === 'static' && s.welcomeText) {
      setWelcomeMsg({ text: s.welcomeText, dir: 'ltr' })
      setWelcomeVisible(true)
      return
    }
    welcomeIdx.current = 0
    const cycle = () => {
      setWelcomeVisible(false)
      setTimeout(() => {
        const msg = WELCOME_MSGS[welcomeIdx.current % WELCOME_MSGS.length]
        setWelcomeMsg(msg)
        setWelcomeVisible(true)
        welcomeIdx.current++
      }, 400)
    }
    cycle()
    welcomeTimer.current = setInterval(cycle, 3000)
    return () => { if (welcomeTimer.current) clearInterval(welcomeTimer.current) }
  }, [currentPanelId, s.welcomeMode, s.welcomeText])

  // Panel cycling
  useEffect(() => {
    if (panels.length === 0) return
    const idx = activePanel % panels.length
    const duration = panels[idx]?.duration || 8000

    panelTimer.current = setTimeout(() => {
      setVisible(false)
      setTimeout(() => {
        setActivePanel(prev => (prev + 1) % panels.length)
        setVisible(true)
      }, 1000)
    }, duration)

    return () => { if (panelTimer.current) clearTimeout(panelTimer.current) }
  }, [activePanel, panels.length])

  // Refresh settings from Supabase every 30s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tv-settings?machineId=${machineId}&profile=${profile}`)
        if (res.ok) {
          const data = await res.json()
          if (data.settings) setSettings(data.settings)
        }
      } catch { /* ignore */ }
    }, 30000)
    return () => clearInterval(interval)
  }, [machineId, profile])

  // Fetch preparing orders every 15s
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await fetch(`/api/tv-orders?machineId=${machineId}`)
        if (res.ok) {
          const data = await res.json()
          setOrders(data.orders || [])
        }
      } catch { /* ignore */ }
    }
    fetchOrders()
    const interval = setInterval(fetchOrders, 15000)
    return () => clearInterval(interval)
  }, [machineId])

  // Controls visibility on mouse move
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => setControlsVisible(false), 3000)
  }, [])

  useEffect(() => {
    const handleMove = () => showControls()
    const handleKey = (e: KeyboardEvent) => {
      showControls()
      if (e.key === 'f' || e.key === 'F' || e.key === 'F11') { e.preventDefault(); toggleFS() }
      if (e.key === 'm' || e.key === 'M') toggleMusic()
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('touchstart', handleMove)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('touchstart', handleMove)
      document.removeEventListener('keydown', handleKey)
    }
  }, [showControls])

  // YouTube music overlay
  useEffect(() => {
    if (s.youtubeUrl) {
      const t = setTimeout(() => setShowMusicOverlay(true), 2000)
      return () => clearTimeout(t)
    }
  }, [s.youtubeUrl])

  function toggleFS() {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen()
  }

  function toggleMusic() {
    setMusicEnabled(prev => !prev)
    if (ytRef.current) {
      if (musicEnabled) {
        ytRef.current.src = ''
      } else {
        ytRef.current.src = getYTSrc(s.youtubeUrl || '')
      }
    }
  }

  function getYTSrc(url: string) {
    if (!url) return ''
    const listM = url.match(/[?&]list=([a-zA-Z0-9_-]+)/)
    if (listM) return `https://www.youtube.com/embed/videoseries?list=${listM[1]}&autoplay=1&loop=1&mute=0&controls=0`
    const vidM = url.match(/(?:youtu\.be\/|[?&]v=|embed\/)([a-zA-Z0-9_-]{11})/)
    if (vidM) return `https://www.youtube.com/embed/${vidM[1]}?autoplay=1&loop=1&playlist=${vidM[1]}&mute=0&controls=0`
    return ''
  }

  const logoSrc = s.logo ? (s.logo.startsWith('data:') || s.logo.startsWith('http') ? s.logo : `data:image/png;base64,${s.logo}`) : ''

  /* ═══════════════════════════════════
     RENDER PANELS
  ═══════════════════════════════════ */
  function renderPanel() {
    const pid = currentPanelId

    if (pid === 'welcome') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          {logoSrc && (
            <img
              src={logoSrc}
              alt=""
              style={{ maxWidth: logoSize, maxHeight: logoSize, width: 'auto', height: 'auto', borderRadius: 24, filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.4))', marginBottom: 48 }}
            />
          )}
          {s.showName !== false && (
            <div style={{ fontSize: 'clamp(2.6rem, 6vw, 5.5rem)', fontWeight: 700, color: textColor, textAlign: 'center', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {s.name}
            </div>
          )}
          <div
            dir={welcomeMsg.dir}
            style={{
              fontSize: 'clamp(1.1rem, 2.5vw, 1.8rem)', fontWeight: 300, color: effectiveAccent,
              marginTop: 24, textAlign: 'center', minHeight: '1.6em', letterSpacing: '0.05em',
              opacity: welcomeVisible ? 1 : 0, transition: 'opacity 0.8s ease',
            }}
          >
            {welcomeMsg.text}
          </div>
        </div>
      )
    }

    if (pid === 'social') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.25em', color: headingMuted, marginBottom: 48, textAlign: 'center' }}>
            Connect With Us
          </div>
          <ul style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, listStyle: 'none', padding: 0 }}>
            {(s.social || []).map((soc: any, i: number) => (
              <li
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  fontSize: 'clamp(1.1rem, 2.2vw, 1.5rem)', fontWeight: 400, color: textColor,
                  opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)',
                  transition: `opacity 0.6s ease ${i * 100}ms, transform 0.6s ease ${i * 100}ms`,
                }}
              >
                <span style={{ fontSize: '1.3em' }}>{PLATFORM_ICONS[soc.platform?.toLowerCase()] || '\uD83D\uDD17'}</span>
                {soc.handle}
              </li>
            ))}
          </ul>
          {s.phone && (
            <div style={{
              fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 600, color: effectiveAccent,
              marginTop: 40, textAlign: 'center', letterSpacing: '0.04em',
              opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)',
              transition: `opacity 0.6s ease ${(s.social?.length || 0) * 100}ms, transform 0.6s ease ${(s.social?.length || 0) * 100}ms`,
            }}>
              📞 {s.phone}
            </div>
          )}
        </div>
      )
    }

    if (pid === 'promos') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.25em', color: headingMuted, marginBottom: 48, textAlign: 'center' }}>
            Special Offers
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center', maxWidth: 1100, padding: '0 24px' }}>
            {allPromos.map((pr: any, i: number) => (
              <div
                key={i}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 20, padding: '32px 40px', textAlign: 'center',
                  minWidth: 200, maxWidth: 300, position: 'relative',
                  opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(30px)',
                  transition: `opacity 0.6s ease ${i * 120}ms, transform 0.6s ease ${i * 120}ms`,
                }}
              >
                {pr.badge && (
                  <div style={{
                    position: 'absolute', top: 14, right: 14, background: effectiveAccent, color: '#fff',
                    fontSize: '0.65rem', fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    {pr.badge}
                  </div>
                )}
                {pr.emoji && <div style={{ fontSize: '2rem', marginBottom: 12 }}>{pr.emoji}</div>}
                <div style={{ fontSize: 'clamp(1rem, 1.8vw, 1.3rem)', fontWeight: 600, color: textColor, marginBottom: 12 }}>{pr.name}</div>
                <div style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 700, color: effectiveAccent }}>{pr.value}</div>
                {pr.items.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 'clamp(0.7rem, 1.2vw, 0.85rem)', fontWeight: 400, color: textColor, opacity: 0.7, lineHeight: 1.5 }}>
                    {pr.items.map((it: any) => `${it.quantity}x ${it.name}`).join(' + ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (pid.startsWith('slide-')) {
      const idx = parseInt(pid.split('-')[1])
      const slide = slides[idx]
      if (!slide) return null
      return (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <img src={slide.src} alt="" style={{ position: 'absolute', inset: -40, width: 'calc(100% + 80px)', height: 'calc(100% + 80px)', objectFit: 'cover', filter: 'blur(30px) brightness(0.3) saturate(1.2)' }} />
          <img src={slide.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 2 }} />
          {slide.caption && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3, textAlign: 'center', padding: '60px 24px 48px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', fontSize: 'clamp(1rem, 2vw, 1.6rem)', fontWeight: 400, color: textColor, letterSpacing: '0.02em' }}>
              {slide.caption}
            </div>
          )}
        </div>
      )
    }

    if (pid === 'orders') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: textColor, marginBottom: 48, textAlign: 'center' }}>
            Now Preparing
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, justifyContent: 'center', maxWidth: 1200, padding: '0 24px' }}>
            {orders.map((num, i) => (
              <div
                key={num}
                style={{
                  minWidth: 'clamp(140px, 18vw, 220px)', padding: '24px 36px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: effectiveAccent, borderRadius: 20, color: '#fff',
                  boxShadow: `0 8px 32px rgba(${accentRgb}, 0.3)`,
                  opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.8)',
                  transition: `opacity 0.5s ease ${i * 80}ms, transform 0.5s ease ${i * 80}ms`,
                  animation: 'badgeBounce 2s ease-in-out infinite',
                }}
              >
                <div style={{ fontSize: 'clamp(0.8rem, 1.5vw, 1.1rem)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', opacity: 0.85, marginBottom: 4 }}>Order</div>
                <div style={{ fontSize: 'clamp(3rem, 6vw, 5rem)', fontWeight: 800, lineHeight: 1 }}># {num}</div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (pid.startsWith('menu-')) {
      const pageIdx = parseInt(pid.split('-')[1])
      const page = menuPages[pageIdx]
      if (!page) return null
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.25em', color: headingMuted, marginBottom: 36, textAlign: 'center' }}>
            Menu {menuPages.length > 1 ? `(${pageIdx + 1}/${menuPages.length})` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxWidth: 1200, padding: '0 24px', width: '100%' }}>
            {page.map((cat, ci) => (
              <div
                key={ci}
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 14, padding: '14px 18px',
                  opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)',
                  transition: `opacity 0.6s ease ${ci * 100}ms, transform 0.6s ease ${ci * 100}ms`,
                }}
              >
                <div style={{
                  fontSize: 'clamp(1rem, 2vw, 1.4rem)', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.15em', color: effectiveAccent, marginBottom: 12, paddingBottom: 10,
                  borderBottom: `2px solid rgba(${accentRgb}, 0.3)`,
                }}>
                  {cat.catName}
                </div>
                {cat.items.map((item, ii) => (
                  <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                    <span style={{ fontSize: 'clamp(1rem, 1.8vw, 1.3rem)', fontWeight: 500, color: textColor, opacity: 0.9 }}>
                      {item.emoji && <span style={{ marginRight: 8 }}>{item.emoji}</span>}
                      {item.name}
                    </span>
                    <span style={{ flex: 1, borderBottom: '1px dotted currentColor', opacity: 0.2, margin: '0 8px', minWidth: 20, alignSelf: 'flex-end', marginBottom: 4 }} />
                    <span style={{ fontSize: 'clamp(1rem, 1.8vw, 1.3rem)', fontWeight: 700, color: effectiveAccent, whiteSpace: 'nowrap', marginLeft: 12 }}>
                      {fmtPrice(item.price, currency)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <>
      {/* Google Fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@300;400;600&family=DM+Serif+Display&family=Cormorant+Garamond:wght@400;600&family=Montserrat:wght@300;400;600&family=Raleway:wght@300;400;600&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes badgeBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes slowZoom {
          from { transform: scale(1); }
          to { transform: scale(1.03); }
        }
      `}</style>

      {/* Animated gradient background */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 0,
          background: GRADIENTS[gradientIdx],
          backgroundSize: '400% 400%',
          animation: 'gradientShift 15s ease infinite',
        }}
      />

      {/* Panel stage */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily, fontSize: `${textScale * 100}%`,
          padding: 40,
          opacity: visible ? 1 : 0,
          transition: 'opacity 1s ease',
        }}
      >
        {renderPanel()}
      </div>

      {/* YouTube music (hidden) */}
      {s.youtubeUrl && musicEnabled && (
        <iframe
          ref={ytRef}
          src={getYTSrc(s.youtubeUrl)}
          allow="autoplay; encrypted-media"
          style={{ position: 'fixed', top: -100, left: -100, width: 1, height: 1, opacity: 0.01, border: 'none' }}
        />
      )}

      {/* Music overlay */}
      {showMusicOverlay && (
        <div
          onClick={() => {
            setShowMusicOverlay(false)
            if (ytRef.current) { const src = ytRef.current.src; ytRef.current.src = ''; ytRef.current.src = src }
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '1.2rem', fontWeight: 300, color: textColor, letterSpacing: '0.1em', padding: '16px 32px', border: '1px solid rgba(128,128,128,0.2)', borderRadius: 16, background: 'rgba(128,128,128,0.1)' }}>
            Tap for music
          </div>
        </div>
      )}

      {/* Controls */}
      <div
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          display: 'flex', gap: 10,
          opacity: controlsVisible ? 1 : 0.5,
          transition: 'opacity 0.4s ease',
        }}
      >
        <button
          onClick={toggleMusic}
          style={{
            background: 'rgba(128,128,128,0.2)', backdropFilter: 'blur(16px)',
            border: '2px solid rgba(128,128,128,0.3)', color: textColor,
            width: 52, height: 52, borderRadius: 14, cursor: 'pointer', fontSize: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: musicEnabled ? 1 : 0.4,
          }}
        >
          🔊
        </button>
        <button
          onClick={toggleFS}
          style={{
            background: 'rgba(128,128,128,0.2)', backdropFilter: 'blur(16px)',
            border: '2px solid rgba(128,128,128,0.3)', color: textColor,
            width: 52, height: 52, borderRadius: 14, cursor: 'pointer', fontSize: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ⛶
        </button>
      </div>
    </>
  )
}
