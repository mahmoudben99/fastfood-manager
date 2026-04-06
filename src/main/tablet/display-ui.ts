export function getDisplayHTML(lang: string): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const langAttr = lang === 'ar' ? 'ar' : lang === 'fr' ? 'fr' : 'en'

  const t = {
    connectWithUs: lang === 'ar' ? '\u062A\u0627\u0628\u0639\u0648\u0646\u0627' : lang === 'fr' ? 'Suivez-nous' : 'Connect With Us',
    specialOffers: lang === 'ar' ? '\u0639\u0631\u0648\u0636 \u062E\u0627\u0635\u0629' : lang === 'fr' ? 'Offres Sp\u00e9ciales' : 'Special Offers',
    nowPreparing: lang === 'ar' ? '\u0642\u064A\u062F \u0627\u0644\u062A\u062D\u0636\u064A\u0631' : lang === 'fr' ? 'En pr\u00e9paration' : 'Now Preparing',
    order: lang === 'ar' ? '\u0637\u0644\u0628' : lang === 'fr' ? 'Commande' : 'Order',
    deal: lang === 'ar' ? '\u0639\u0631\u0636' : lang === 'fr' ? 'Offre' : 'Deal',
    includes: lang === 'ar' ? '\u064A\u0634\u0645\u0644' : lang === 'fr' ? 'Contient' : 'Includes',
    tapForMusic: lang === 'ar' ? '\u0627\u0636\u063A\u0637 \u0644\u0644\u0645\u0648\u0633\u064A\u0642\u0649' : lang === 'fr' ? 'Appuyez pour la musique' : 'Tap for music'
  }

  return /* html */ `<!DOCTYPE html>
<html lang="${langAttr}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Display</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@300;400;600&family=DM+Serif+Display&family=Cormorant+Garamond:wght@400;600&family=Montserrat:wght@300;400;600&family=Raleway:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --text: #ffffff;
      --accent: #f97316;
      --accent-rgb: 249,115,22;
      --heading-muted: rgba(255,255,255,0.4);
      --badge-text: #fff;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      height: 100%; width: 100%;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: var(--text);
      overflow: hidden;
      background: #0a0a0f;
    }

    /* ── Gradient presets ── */
    .gradient-bg {
      position: fixed; inset: 0; z-index: 0;
      background-size: 400% 400%;
      animation: gradientShift 15s ease infinite;
      transition: opacity 2s ease;
    }
    @keyframes gradientShift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .grad-0  { background: linear-gradient(-45deg, #0f0c29, #302b63, #24243e, #0f0c29); }
    .grad-1  { background: linear-gradient(-45deg, #000428, #004e92, #000428, #003366); }
    .grad-2  { background: linear-gradient(-45deg, #1a0a00, #b44d12, #e65c00, #1a0a00); }
    .grad-3  { background: linear-gradient(-45deg, #0a1a0a, #1b4332, #2d6a4f, #0a1a0a); }
    .grad-4  { background: linear-gradient(-45deg, #1a0024, #3c096c, #7b2cbf, #1a0024); }
    .grad-5  { background: linear-gradient(-45deg, #1a0000, #800020, #b5003c, #1a0000); }
    .grad-6  { background: linear-gradient(-45deg, #1a1200, #3e2723, #795548, #1a1200); }
    .grad-7  { background: linear-gradient(-45deg, #0a0f1a, #1a3a5c, #4a90d9, #0a0f1a); }
    .grad-8  { background: linear-gradient(-45deg, #1a0500, #bf360c, #ff6e40, #1a0500); }
    .grad-9  { background: linear-gradient(-45deg, #001a1a, #004d4d, #009688, #001a1a); }
    .grad-10 { background: linear-gradient(-45deg, #1a1400, #544a00, #c6a700, #1a1400); }
    .grad-11 { background: linear-gradient(-45deg, #1a0a10, #6b2048, #c2185b, #1a0a10); }
    .grad-12 { background: linear-gradient(-45deg, #0a0a0a, #1a1a2e, #3a3a5c, #0a0a0a); }
    .grad-13 { background: linear-gradient(-45deg, #1a0f0a, #4a2c1a, #8d5524, #1a0f0a); }
    .grad-14 { background: linear-gradient(-45deg, #0a0a0f, #111118, #0a0a0f, #111118); }
    .grad-15 { background: linear-gradient(-45deg, #fff1eb, #ace0f9, #fff1eb, #ffd6a5); }
    .grad-16 { background: linear-gradient(-45deg, #fce4ec, #e8eaf6, #fce4ec, #f3e5f5); }
    .grad-17 { background: linear-gradient(-45deg, #e8f5e9, #b2dfdb, #e8f5e9, #c8e6c9); }
    .grad-18 { background: linear-gradient(-45deg, #fff3e0, #ffe0b2, #fff3e0, #ffccbc); }
    .grad-19 { background: linear-gradient(-45deg, #e3f2fd, #bbdefb, #e3f2fd, #b3e5fc); }

    /* ── Panel system ── */
    #panelStage {
      position: fixed; inset: 0; z-index: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .panel {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      opacity: 0;
      transition: opacity 1s ease;
      pointer-events: none;
      padding: 40px;
    }
    .panel.active {
      opacity: 1;
      pointer-events: auto;
    }

    /* ── Welcome panel ── */
    .welcome-logo {
      max-width: var(--logo-size, 200px); max-height: var(--logo-size, 200px);
      width: auto; height: auto;
      border-radius: 24px;
      filter: drop-shadow(0 8px 32px rgba(0,0,0,0.4));
      margin-bottom: 48px;
    }
    .welcome-name {
      font-size: clamp(2.6rem, 6vw, 5.5rem);
      font-weight: 700;
      color: var(--text);
      text-align: center;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
    .welcome-msg {
      font-size: clamp(1.1rem, 2.5vw, 1.8rem);
      font-weight: 300;
      color: var(--accent);
      margin-top: 24px;
      text-align: center;
      min-height: 1.6em;
      opacity: 0;
      transition: opacity 0.8s ease;
      letter-spacing: 0.05em;
    }
    .welcome-msg.visible { opacity: 1; }

    /* ── Social panel ── */
    .social-heading {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.25em;
      color: var(--heading-muted);
      margin-bottom: 48px;
      text-align: center;
    }
    .social-list {
      display: flex; flex-direction: column;
      align-items: center; gap: 20px;
      list-style: none;
    }
    .social-item {
      display: flex; align-items: center; gap: 16px;
      font-size: clamp(1.1rem, 2.2vw, 1.5rem);
      font-weight: 400;
      color: var(--text);
      opacity: 0; transform: translateY(20px);
      transition: opacity 0.6s ease, transform 0.6s ease;
    }
    .social-item.show { opacity: 1; transform: translateY(0); }
    .social-item .icon { font-size: 1.3em; }
    .social-phone {
      font-size: clamp(1.6rem, 3.5vw, 2.4rem);
      font-weight: 600;
      color: var(--accent);
      margin-top: 40px;
      text-align: center;
      letter-spacing: 0.04em;
      opacity: 0; transform: translateY(20px);
      transition: opacity 0.6s ease, transform 0.6s ease;
    }
    .social-phone.show { opacity: 1; transform: translateY(0); }

    /* ── Promos panel ── */
    .promos-heading {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.25em;
      color: var(--heading-muted);
      margin-bottom: 48px;
      text-align: center;
    }
    .promos-row {
      display: flex; flex-wrap: wrap;
      gap: 24px; justify-content: center;
      max-width: 1100px;
      padding: 0 24px;
    }
    .promo-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      padding: 32px 40px;
      text-align: center;
      min-width: 200px;
      max-width: 300px;
      position: relative;
      opacity: 0; transform: translateY(30px);
      transition: opacity 0.6s ease, transform 0.6s ease;
    }
    .promo-card.show { opacity: 1; transform: translateY(0); }
    .promo-card::after {
      content: '';
      position: absolute; inset: -1px;
      border-radius: 20px;
      background: linear-gradient(135deg, rgba(var(--accent-rgb),0.15), transparent 60%);
      opacity: 0;
      transition: opacity 0.4s ease;
      pointer-events: none;
    }
    .promo-card.show::after { opacity: 1; }
    .promo-name {
      font-size: clamp(1rem, 1.8vw, 1.3rem);
      font-weight: 600;
      color: var(--text);
      margin-bottom: 12px;
    }
    .promo-value {
      font-size: clamp(1.5rem, 3vw, 2.2rem);
      font-weight: 700;
      color: var(--accent);
    }
    .promo-emoji {
      font-size: 2rem;
      margin-bottom: 12px;
    }
    .promo-badge {
      position: absolute;
      top: 14px; right: 14px;
      background: var(--accent);
      color: var(--badge-text, #fff);
      font-size: 0.65rem;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .promo-pack-items {
      margin-top: 10px;
      font-size: clamp(0.7rem, 1.2vw, 0.85rem);
      font-weight: 400;
      color: var(--text);
      opacity: 0.7;
      line-height: 1.5;
    }

    /* ── Slideshow panel ── */
    .slide-wrap {
      position: absolute; inset: 0;
      overflow: hidden;
    }
    .slide-bg {
      position: absolute; inset: -40px;
      width: calc(100% + 80px); height: calc(100% + 80px);
      object-fit: cover;
      filter: blur(30px) brightness(0.3) saturate(1.2);
    }
    .slide-img {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      object-fit: contain;
      z-index: 2;
      animation: slowZoom 8s ease-out forwards;
    }
    .slide-caption {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      z-index: 3;
      text-align: center;
      padding: 60px 24px 48px;
      background: linear-gradient(transparent, rgba(0,0,0,0.6));
      font-size: clamp(1rem, 2vw, 1.6rem);
      font-weight: 400;
      color: var(--text);
      letter-spacing: 0.02em;
    }
    @keyframes slowZoom {
      from { transform: scale(1); }
      to { transform: scale(1.03); }
    }

    /* ── Orders panel ── */
    .orders-heading {
      font-size: clamp(2rem, 5vw, 3.5rem);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--text);
      margin-bottom: 48px;
      text-align: center;
    }
    .orders-row {
      display: flex; flex-wrap: wrap;
      gap: 32px; justify-content: center;
      max-width: 1200px;
      padding: 0 24px;
    }
    .order-badge {
      min-width: clamp(140px, 18vw, 220px);
      padding: 24px 36px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: var(--accent);
      border-radius: 20px;
      color: var(--badge-text, #fff);
      animation: badgeBounce 2s ease-in-out infinite;
      opacity: 0; transform: scale(0.8);
      transition: opacity 0.5s ease, transform 0.5s ease;
      box-shadow: 0 8px 32px rgba(var(--accent-rgb), 0.3);
    }
    .order-badge.show { opacity: 1; transform: scale(1); }
    .order-badge-label {
      font-size: clamp(0.8rem, 1.5vw, 1.1rem);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      opacity: 0.85;
      margin-bottom: 4px;
    }
    .order-badge-number {
      font-size: clamp(3rem, 6vw, 5rem);
      font-weight: 800;
      line-height: 1;
    }
    @keyframes badgeBounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }

    /* ── Controls ── */
    .controls {
      position: fixed;
      bottom: 24px; right: 24px;
      z-index: 9999;
      display: flex; gap: 10px;
      opacity: 0;
      transition: opacity 0.4s ease;
      pointer-events: none;
    }
    .controls.visible {
      opacity: 1;
      pointer-events: auto;
    }
    .ctrl-btn {
      background: rgba(128,128,128,0.15);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(128,128,128,0.2);
      color: var(--text);
      width: 44px; height: 44px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 18px;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s, color 0.2s;
    }
    .ctrl-btn:hover {
      background: rgba(128,128,128,0.25);
      color: var(--text);
    }

    /* ── Music overlay ── */
    .music-overlay {
      position: fixed; inset: 0; z-index: 9998;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.3);
      backdrop-filter: blur(4px);
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.5s ease;
    }
    .music-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }
    .music-overlay-text {
      font-size: 1.2rem;
      font-weight: 300;
      color: var(--text);
      letter-spacing: 0.1em;
      padding: 16px 32px;
      border: 1px solid rgba(128,128,128,0.2);
      border-radius: 16px;
      background: rgba(128,128,128,0.1);
    }

    /* ── RTL ── */
    [dir="rtl"] .promo-badge { right: auto; left: 14px; }
    [dir="rtl"] .social-item { flex-direction: row-reverse; }

    /* ── Responsive ── */
    @media (max-width: 600px) {
      .panel { padding: 24px; }
      .promos-row { flex-direction: column; align-items: center; }
      .promo-card { min-width: 0; width: 100%; max-width: 340px; }
    }
    @media (orientation: portrait) {
      .promos-row { flex-direction: column; align-items: center; }
    }

    /* ── Menu panel ── */
    .menu-heading {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.25em;
      color: var(--menu-heading-color, rgba(255,255,255,0.4));
      margin-bottom: 36px;
      text-align: center;
    }
    .menu-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      max-width: 1200px;
      padding: 0 24px;
      width: 100%;
    }
    .menu-category {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 14px 18px;
      opacity: 0; transform: translateY(20px);
      transition: opacity 0.6s ease, transform 0.6s ease;
    }
    .menu-category.show { opacity: 1; transform: translateY(0); }
    .menu-cat-name {
      font-size: clamp(1rem, 2vw, 1.4rem);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--accent);
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 2px solid rgba(var(--accent-rgb),0.3);
    }
    .menu-item-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
    }
    .menu-item-name {
      font-size: clamp(1rem, 1.8vw, 1.3rem);
      font-weight: 500;
      color: var(--text);
      opacity: 0.9;
    }
    .menu-item-emoji {
      margin-right: 8px;
      font-size: 1.1em;
    }
    .menu-item-price {
      font-size: clamp(1rem, 1.8vw, 1.3rem);
      font-weight: 700;
      color: var(--accent);
      white-space: nowrap;
      margin-left: 12px;
    }
    .menu-item-dots {
      flex: 1;
      border-bottom: 1px dotted currentColor; opacity: 0.2;
      margin: 0 8px;
      min-width: 20px;
      align-self: flex-end;
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div id="gradientBg" class="gradient-bg grad-0"></div>
  <div id="panelStage"></div>
  <div id="ytContainer" style="position:fixed;top:-100px;left:-100px;width:1px;height:1px;overflow:hidden;"></div>

  <div class="music-overlay" id="musicOverlay">
    <div class="music-overlay-text">${t.tapForMusic}</div>
  </div>

  <div class="controls" id="controls">
    <button class="ctrl-btn" id="musicBtn" onclick="toggleMusic()" title="Music">&#x1F50A;</button>
    <button class="ctrl-btn" id="fsBtn" onclick="toggleFS()" title="Fullscreen">&#x26F6;</button>
  </div>

  <script>
    /* ═══════════════════════════════════
       TRANSLATIONS
    ═══════════════════════════════════ */
    var t = {
      connectWithUs: ${JSON.stringify(t.connectWithUs)},
      specialOffers: ${JSON.stringify(t.specialOffers)},
      nowPreparing: ${JSON.stringify(t.nowPreparing)},
      order: ${JSON.stringify(t.order)},
      deal: ${JSON.stringify(t.deal)},
      includes: ${JSON.stringify(t.includes)},
      tapForMusic: ${JSON.stringify(t.tapForMusic)}
    };

    /* ═══════════════════════════════════
       STATE
    ═══════════════════════════════════ */
    var state = {
      name: '', logo: '',
      promos: [], packs: [],
      social: [], phone: '',
      youtubeUrl: '',
      gradientPreset: 0,
      fontFamily: 'Inter',
      textColor: '#ffffff',
      accentColor: '#f97316',
      welcomeMode: 'animated',
      welcomeText: '',
      slideshowImages: [],
      currency: 'DA',
      queue: { preparing: [] },
      textScale: 'medium',
      showMenu: false,
      menuItems: [],
      showName: true,
      logoScale: 1,
      panelWelcome: true,
      panelSocial: true,
      panelPromos: true,
      panelSlideshow: true,
      panelOrders: true,
      panelMenu: true
    };

    var currentYTUrl = '';
    var musicEnabled = true;

    var PLATFORM_ICONS = {
      facebook: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
      instagram: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#E4405F"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
      snapchat: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#FFFC00"><path d="M12.017.001c3.3.02 5.3 1.836 6.3 3.9.5 1.1.7 2.3.7 4.6 0 .5 0 1.1-.1 1.6.3.1.7.2 1.1.2.3 0 .6-.1.8-.2.2-.1.3-.1.5-.1.4 0 .8.2 1 .5.3.4.2.8-.1 1.2-.5.6-1.3.9-2.3 1.1 0 .1-.1.3-.1.5 0 .2.1.3.1.5 1.3 2.2 3 3.5 4.5 3.9.3.1.5.2.5.5 0 .3-.1.5-.3.7-.8.6-2 .9-3.3 1-.1.3-.2.6-.4.9-.2.3-.4.4-.7.4h-.1c-.3 0-.7-.1-1.2-.2-.6-.2-1.3-.3-2.2-.3-.3 0-.7 0-1 .1-.8.2-1.5.8-2.3 1.5-.9.8-1.8 1.2-2.8 1.2s-2-.4-2.8-1.2c-.8-.7-1.5-1.3-2.3-1.5-.3-.1-.7-.1-1-.1-.9 0-1.6.1-2.2.3-.5.2-.9.2-1.2.2h-.1c-.3 0-.5-.1-.7-.4-.2-.3-.3-.6-.4-.9-1.3-.1-2.5-.4-3.3-1-.2-.2-.3-.4-.3-.7 0-.3.2-.4.5-.5 1.5-.4 3.2-1.7 4.5-3.9 0-.2.1-.3.1-.5 0-.2-.1-.4-.1-.5-1-.2-1.8-.5-2.3-1.1-.3-.4-.4-.8-.1-1.2.2-.3.6-.5 1-.5.2 0 .3 0 .5.1.2.1.5.2.8.2.4 0 .8-.1 1.1-.2-.1-.5-.1-1.1-.1-1.6 0-2.3.2-3.5.7-4.6 1-2.064 3-3.88 6.3-3.9h.334z"/></svg>',
      tiktok: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ff0050"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.53v-3.4a4.85 4.85 0 01-.81-.14z"/></svg>',
      twitter: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
      x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
      youtube: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
      whatsapp: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
      threads: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#000"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.199.408-2.3 1.332-3.1.855-.74 2.05-1.218 3.394-1.218h.039c.768.004 1.46.115 2.06.33.154-.89.228-1.868.196-2.938l2.09-.058c.045 1.399-.074 2.675-.354 3.818 1.04.648 1.839 1.534 2.315 2.63.784 1.807.726 4.448-1.327 6.526-1.814 1.836-4.07 2.63-7.317 2.578zm-.186-7.99c-1.035 0-2.416.418-2.53 1.726.044.476.328.895.8 1.18.536.325 1.264.479 2.05.44 1.053-.058 1.864-.44 2.413-1.122.387-.483.667-1.14.82-1.96-.576-.168-1.208-.259-1.553-.264z"/></svg>',
      telegram: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#0088CC"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
      phone: '\\u{1F4DE}',
      email: '\\u2709\\uFE0F'
    };

    function esc(s) {
      if (!s) return '';
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function fmtPrice(v) {
      return state.currency ? Number(v).toLocaleString() + ' ' + state.currency : Number(v).toLocaleString();
    }

    /* ═══════════════════════════════════
       COLORS & FONTS
    ═══════════════════════════════════ */
    function applyColors(textHex, accentHex) {
      if (textHex && /^#[0-9a-fA-F]{3,8}$/.test(textHex)) {
        document.documentElement.style.setProperty('--text', textHex);
      }
      if (accentHex && /^#[0-9a-fA-F]{3,8}$/.test(accentHex)) {
        document.documentElement.style.setProperty('--accent', accentHex);
        var r = parseInt(accentHex.slice(1,3),16) || 249;
        var g = parseInt(accentHex.slice(3,5),16) || 115;
        var b = parseInt(accentHex.slice(5,7),16) || 22;
        document.documentElement.style.setProperty('--accent-rgb', r+','+g+','+b);
      }
    }

    function applyFont(family) {
      if (family) document.body.style.fontFamily = "'" + family + "', system-ui, sans-serif";
    }

    function applyTextScale(scale) {
      var multiplier = scale === 'small' ? 0.8 : scale === 'large' ? 1.3 : 1.0;
      document.getElementById('panelStage').style.fontSize = (multiplier * 100) + '%';
    }

    function applyGradient(preset) {
      var bg = document.getElementById('gradientBg');
      if (!bg) return;
      // Remove old gradient class
      for (var i = 0; i <= 19; i++) bg.classList.remove('grad-' + i);
      var idx = Math.max(0, Math.min(19, parseInt(preset) || 0));
      bg.classList.add('grad-' + idx);

      // For bright gradients (15+), force dark text, dark accent and dark headings
      if (idx >= 15) {
        document.documentElement.style.setProperty('--text', '#1a1a1a');
        document.documentElement.style.setProperty('--heading-muted', 'rgba(0,0,0,0.45)');
        document.documentElement.style.setProperty('--menu-heading-color', 'rgba(0,0,0,0.45)');
        document.documentElement.style.setProperty('--badge-text', '#fff');
        // Force dark accent if current accent is too bright for light bg
        var currentAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        if (currentAccent === '#f97316' || currentAccent === '#ff6b35') {
          document.documentElement.style.setProperty('--accent', '#c2410c');
          document.documentElement.style.setProperty('--accent-rgb', '194,65,12');
        }
      } else {
        document.documentElement.style.setProperty('--heading-muted', 'rgba(255,255,255,0.4)');
        document.documentElement.style.setProperty('--menu-heading-color', 'rgba(255,255,255,0.4)');
        document.documentElement.style.setProperty('--badge-text', '#fff');
      }
    }

    /* ═══════════════════════════════════
       FULLSCREEN & CONTROLS
    ═══════════════════════════════════ */
    var controlsTimer = null;

    function toggleFS() {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    }

    function showControls() {
      var c = document.getElementById('controls');
      c.classList.add('visible');
      clearTimeout(controlsTimer);
      controlsTimer = setTimeout(function() { c.classList.remove('visible'); }, 3000);
    }

    document.addEventListener('mousemove', showControls);
    document.addEventListener('touchstart', showControls);
    controlsTimer = setTimeout(function() {}, 3000);

    /* ═══════════════════════════════════
       YOUTUBE MUSIC
    ═══════════════════════════════════ */
    function extractYTId(url) {
      if (!url) return null;
      var listM = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
      if (listM) return { type: 'list', id: listM[1] };
      var vidM = url.match(/(?:youtu\\.be\\/|[?&]v=|embed\\/)([a-zA-Z0-9_-]{11})/);
      if (vidM) return { type: 'video', id: vidM[1] };
      return null;
    }

    function setupYT(url) {
      if (url === currentYTUrl) return;
      currentYTUrl = url;
      var c = document.getElementById('ytContainer');
      if (!url) { c.innerHTML = ''; return; }
      var info = extractYTId(url);
      if (!info) { c.innerHTML = ''; return; }

      var src = '';
      if (info.type === 'list') {
        src = 'https://www.youtube.com/embed/videoseries?list=' + info.id + '&autoplay=1&loop=1&mute=0&controls=0';
      } else {
        src = 'https://www.youtube.com/embed/' + info.id + '?autoplay=1&loop=1&playlist=' + info.id + '&mute=0&controls=0';
      }

      c.innerHTML = '<iframe id="ytFrame" src="' + src + '" allow="autoplay; encrypted-media" style="position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0.01;border:none;"></iframe>';

      // Show music overlay for user interaction (autoplay policy)
      setTimeout(function() {
        var overlay = document.getElementById('musicOverlay');
        if (overlay) overlay.classList.add('visible');
      }, 2000);
    }

    function toggleMusic() {
      var frame = document.getElementById('ytFrame');
      if (!frame) return;
      musicEnabled = !musicEnabled;
      if (musicEnabled) {
        // Reload iframe to restart
        var src = frame.src;
        frame.src = '';
        frame.src = src;
      } else {
        frame.src = '';
      }
      document.getElementById('musicBtn').style.opacity = musicEnabled ? '1' : '0.4';
    }

    // Dismiss music overlay on click/tap
    document.getElementById('musicOverlay').addEventListener('click', function() {
      this.classList.remove('visible');
      // Attempt to reload iframe to trigger autoplay after interaction
      var frame = document.getElementById('ytFrame');
      if (frame) {
        var src = frame.src;
        frame.src = '';
        frame.src = src;
      }
    });

    /* ═══════════════════════════════════
       PANEL ENGINE
    ═══════════════════════════════════ */
    var panelDefs = [];
    var currentPanelIdx = -1;
    var panelTimeout = null;
    var welcomeInterval = null;
    var welcomeMsgIdx = 0;

    var WELCOME_MSGS = [
      { text: 'Welcome', dir: 'ltr' },
      { text: 'Bienvenue', dir: 'ltr' },
      { text: '\\u0645\\u0631\\u062D\\u0628\\u0627 \\u0628\\u0643\\u0645', dir: 'rtl' }
    ];

    function stopWelcome() {
      if (welcomeInterval) { clearInterval(welcomeInterval); welcomeInterval = null; }
    }

    function startWelcome() {
      stopWelcome();
      var el = document.getElementById('welcomeMsg');
      if (!el) return;

      if (state.welcomeMode === 'static' && state.welcomeText) {
        el.textContent = state.welcomeText;
        el.dir = 'auto';
        el.classList.add('visible');
        return;
      }

      welcomeMsgIdx = 0;
      cycleWelcome();
      welcomeInterval = setInterval(cycleWelcome, 3000);
    }

    function cycleWelcome() {
      var el = document.getElementById('welcomeMsg');
      if (!el) return;
      el.classList.remove('visible');
      setTimeout(function() {
        var msg = WELCOME_MSGS[welcomeMsgIdx % WELCOME_MSGS.length];
        el.textContent = msg.text;
        el.dir = msg.dir;
        el.classList.add('visible');
        welcomeMsgIdx++;
      }, 400);
    }

    function buildPanels() {
      panelDefs = [];

      // Panel 1: Welcome
      if (state.panelWelcome)
      panelDefs.push({
        id: 'welcome',
        duration: 10000,
        build: function() {
          var html = '<div class="panel" id="panel-welcome">';
          if (state.logo) {
            var src = state.logo.startsWith('data:') ? state.logo : 'data:image/png;base64,' + state.logo;
            html += '<img class="welcome-logo" src="' + src + '" alt="">';
          }
          if (state.showName) {
            html += '<div class="welcome-name">' + esc(state.name) + '</div>';
          }
          html += '<div class="welcome-msg" id="welcomeMsg"></div>';
          html += '</div>';
          return html;
        },
        onEnter: function() { startWelcome(); },
        onLeave: function() { stopWelcome(); }
      });

      // Panel 2: Social & Contact
      var hasSocial = (state.social && state.social.length > 0) || state.phone;
      if (hasSocial && state.panelSocial) {
        panelDefs.push({
          id: 'social',
          duration: 8000,
          build: function() {
            var html = '<div class="panel" id="panel-social">';
            html += '<div class="social-heading">' + esc(t.connectWithUs) + '</div>';
            html += '<ul class="social-list">';
            if (state.social) {
              for (var i = 0; i < state.social.length; i++) {
                var s = state.social[i];
                var icon = PLATFORM_ICONS[(s.platform || '').toLowerCase()] || '\\u{1F517}';
                html += '<li class="social-item" style="transition-delay:' + (i * 100) + 'ms"><span class="icon" style="display:inline-flex;align-items:center;">' + icon + '</span> ' + esc(s.handle) + '</li>';
              }
            }
            html += '</ul>';
            if (state.phone) {
              var delay = (state.social ? state.social.length : 0) * 100;
              html += '<div class="social-phone" style="transition-delay:' + delay + 'ms">\\u{1F4DE} ' + esc(state.phone) + '</div>';
            }
            html += '</div>';
            return html;
          },
          onEnter: function() {
            setTimeout(function() {
              var items = document.querySelectorAll('#panel-social .social-item, #panel-social .social-phone');
              for (var i = 0; i < items.length; i++) items[i].classList.add('show');
            }, 100);
          }
        });
      }

      // Panel 3: Promos
      var allPromos = [];
      if (state.promos) {
        for (var i = 0; i < state.promos.length; i++) {
          var p = state.promos[i];
          var val = p.type === 'percentage' ? ('-' + p.value + '%') : ('-' + fmtPrice(p.value));
          allPromos.push({ name: p.name, value: val, emoji: '', badge: esc(t.deal), items: [] });
        }
      }
      if (state.packs) {
        for (var i = 0; i < state.packs.length; i++) {
          var pk = state.packs[i];
          allPromos.push({ name: pk.name, value: fmtPrice(pk.pack_price || pk.price), emoji: pk.emoji || '', badge: '', items: pk.items || [] });
        }
      }
      if (allPromos.length > 0 && state.panelPromos) {
        panelDefs.push({
          id: 'promos',
          duration: 10000,
          build: function() {
            var html = '<div class="panel" id="panel-promos">';
            html += '<div class="promos-heading">' + esc(t.specialOffers) + '</div>';
            html += '<div class="promos-row">';
            for (var i = 0; i < allPromos.length; i++) {
              var pr = allPromos[i];
              html += '<div class="promo-card" style="transition-delay:' + (i * 120) + 'ms">';
              if (pr.badge) html += '<div class="promo-badge">' + esc(pr.badge) + '</div>';
              if (pr.emoji) html += '<div class="promo-emoji">' + pr.emoji + '</div>';
              html += '<div class="promo-name">' + esc(pr.name) + '</div>';
              html += '<div class="promo-value">' + esc(pr.value) + '</div>';
              if (pr.items && pr.items.length > 0) {
                var itemStrs = [];
                for (var ii = 0; ii < pr.items.length; ii++) {
                  itemStrs.push(pr.items[ii].quantity + 'x ' + esc(pr.items[ii].name));
                }
                html += '<div class="promo-pack-items">' + itemStrs.join(' + ') + '</div>';
              }
              html += '</div>';
            }
            html += '</div></div>';
            return html;
          },
          onEnter: function() {
            setTimeout(function() {
              var cards = document.querySelectorAll('#panel-promos .promo-card');
              for (var i = 0; i < cards.length; i++) cards[i].classList.add('show');
            }, 100);
          }
        });
      }

      // Panel 4: Slideshow images (one sub-panel per image)
      if (state.slideshowImages && state.slideshowImages.length > 0 && state.panelSlideshow) {
        for (var si = 0; si < state.slideshowImages.length; si++) {
          (function(idx) {
            var imgData = state.slideshowImages[idx];
            var imgSrc = typeof imgData === 'string' ? imgData : imgData.src;
            var caption = typeof imgData === 'object' ? (imgData.caption || '') : '';
            if (imgSrc && !imgSrc.startsWith('data:') && !imgSrc.startsWith('http')) {
              imgSrc = 'data:image/png;base64,' + imgSrc;
            }
            panelDefs.push({
              id: 'slide-' + idx,
              duration: 8000,
              build: function() {
                var html = '<div class="panel" id="panel-slide-' + idx + '">';
                html += '<div class="slide-wrap">';
                html += '<img class="slide-bg" src="' + imgSrc + '" alt="">';
                html += '<img class="slide-img" src="' + imgSrc + '" alt="">';
                if (caption) html += '<div class="slide-caption">' + esc(caption) + '</div>';
                html += '</div></div>';
                return html;
              }
            });
          })(si);
        }
      }

      // Panel 5: Orders preparing
      if (state.queue && state.queue.preparing && state.queue.preparing.length > 0 && state.panelOrders) {
        panelDefs.push({
          id: 'orders',
          duration: 6000,
          build: function() {
            var html = '<div class="panel" id="panel-orders">';
            html += '<div class="orders-heading">' + esc(t.nowPreparing) + '</div>';
            html += '<div class="orders-row">';
            for (var i = 0; i < state.queue.preparing.length; i++) {
              html += '<div class="order-badge" style="transition-delay:' + (i * 80) + 'ms">';
              html += '<div class="order-badge-label">' + esc(t.order) + '</div>';
              html += '<div class="order-badge-number"># ' + state.queue.preparing[i] + '</div>';
              html += '</div>';
            }
            html += '</div></div>';
            return html;
          },
          onEnter: function() {
            setTimeout(function() {
              var badges = document.querySelectorAll('#panel-orders .order-badge');
              for (var i = 0; i < badges.length; i++) badges[i].classList.add('show');
            }, 100);
          }
        });
      }

      // Panel 6: Menu items (paginated, max 10 items per page)
      if (state.showMenu && state.panelMenu && state.menuItems && state.menuItems.length > 0) {
        // Group items by category
        var catMap = {};
        var catOrder = [];
        for (var mi = 0; mi < state.menuItems.length; mi++) {
          var item = state.menuItems[mi];
          var cat = item.category_name || 'Other';
          if (!catMap[cat]) {
            catMap[cat] = [];
            catOrder.push(cat);
          }
          catMap[cat].push(item);
        }
        // Build pages with max 10 items each
        var MAX_ITEMS_PER_PAGE = 10;
        var menuPages = []; // each page: [{catName, items:[...]}]
        var currentPage = [];
        var currentPageCount = 0;
        for (var ci = 0; ci < catOrder.length; ci++) {
          var cName = catOrder[ci];
          var cItems = catMap[cName];
          // If adding this category would exceed limit, start a new page
          if (currentPageCount > 0 && currentPageCount + cItems.length > MAX_ITEMS_PER_PAGE) {
            menuPages.push(currentPage);
            currentPage = [];
            currentPageCount = 0;
          }
          // If category itself has more than MAX items, split it across pages
          if (cItems.length > MAX_ITEMS_PER_PAGE) {
            for (var si = 0; si < cItems.length; si += MAX_ITEMS_PER_PAGE) {
              var chunk = cItems.slice(si, si + MAX_ITEMS_PER_PAGE);
              if (currentPageCount > 0) {
                menuPages.push(currentPage);
                currentPage = [];
                currentPageCount = 0;
              }
              currentPage.push({ catName: cName, items: chunk });
              currentPageCount += chunk.length;
              if (currentPageCount >= MAX_ITEMS_PER_PAGE) {
                menuPages.push(currentPage);
                currentPage = [];
                currentPageCount = 0;
              }
            }
          } else {
            currentPage.push({ catName: cName, items: cItems });
            currentPageCount += cItems.length;
          }
        }
        if (currentPage.length > 0) menuPages.push(currentPage);

        for (var pi = 0; pi < menuPages.length; pi++) {
          (function(pageIdx, pageCats) {
            panelDefs.push({
              id: 'menu-' + pageIdx,
              duration: 10000,
              build: function() {
                var html = '<div class="panel" id="panel-menu-' + pageIdx + '">';
                html += '<div class="menu-heading">Menu</div>';
                html += '<div class="menu-grid">';
                for (var c = 0; c < pageCats.length; c++) {
                  var catName = pageCats[c].catName;
                  var items = pageCats[c].items;
                  html += '<div class="menu-category" style="transition-delay:' + (c * 120) + 'ms">';
                  html += '<div class="menu-cat-name">' + esc(catName) + '</div>';
                  for (var j = 0; j < items.length; j++) {
                    html += '<div class="menu-item-row">';
                    html += '<span class="menu-item-name">';
                    if (items[j].emoji) html += '<span class="menu-item-emoji">' + items[j].emoji + '</span>';
                    html += esc(items[j].name) + '</span>';
                    html += '<span class="menu-item-dots"></span>';
                    html += '<span class="menu-item-price">' + fmtPrice(items[j].price) + '</span>';
                    html += '</div>';
                  }
                  html += '</div>';
                }
                html += '</div></div>';
                return html;
              },
              onEnter: function() {
                setTimeout(function() {
                  var cats = document.querySelectorAll('#panel-menu-' + pageIdx + ' .menu-category');
                  for (var i = 0; i < cats.length; i++) cats[i].classList.add('show');
                }, 100);
              }
            });
          })(pi, menuPages[pi]);
        }
      }
    }

    /* ── Panel transition ── */
    function showPanel(idx) {
      if (panelDefs.length === 0) return;
      idx = idx % panelDefs.length;

      var stage = document.getElementById('panelStage');
      var current = stage.querySelector('.panel.active');
      var def = panelDefs[idx];

      // Leave previous
      if (currentPanelIdx >= 0 && currentPanelIdx < panelDefs.length) {
        var prev = panelDefs[currentPanelIdx];
        if (prev.onLeave) prev.onLeave();
      }

      // Fade out current
      if (current) current.classList.remove('active');

      // After fade-out (1s transition), swap content
      setTimeout(function() {
        stage.innerHTML = def.build();
        var panel = stage.querySelector('.panel');
        if (!panel) return;

        // Trigger reflow then fade in
        void panel.offsetWidth;
        panel.classList.add('active');

        currentPanelIdx = idx;
        if (def.onEnter) def.onEnter();

        // Schedule next
        clearTimeout(panelTimeout);
        panelTimeout = setTimeout(function() {
          showPanel(idx + 1);
        }, def.duration);
      }, current ? 1000 : 50);
    }

    function startLoop() {
      clearTimeout(panelTimeout);
      buildPanels();
      if (panelDefs.length === 0) {
        document.getElementById('panelStage').innerHTML = '';
        return;
      }
      currentPanelIdx = -1;
      showPanel(0);
    }

    /* ═══════════════════════════════════
       SSE
    ═══════════════════════════════════ */
    function handleSSE(data) {
      switch (data.type) {
        case 'info':
          state.name = data.name || '';
          state.logo = data.logo || '';
          state.promos = data.promos || [];
          state.packs = data.packs || [];
          state.social = data.social || [];
          state.phone = data.phone || '';
          state.youtubeUrl = data.youtubeUrl || '';
          state.slideshowImages = data.slideshowImages || [];
          state.welcomeMode = data.welcomeMode || 'animated';
          state.welcomeText = data.welcomeText || '';
          state.currency = data.currency || 'DA';
          if (data.queue) state.queue = data.queue;

          state.gradientPreset = data.gradientPreset != null ? data.gradientPreset : 0;
          state.fontFamily = data.fontFamily || 'Inter';
          state.textColor = data.textColor || '#ffffff';
          state.accentColor = data.accentColor || '#f97316';
          state.textScale = data.textScale || 'medium';
          state.showMenu = data.showMenu === 'true' || data.showMenu === true;
          state.menuItems = data.menuItems || [];
          state.showName = data.showName === 'true' || data.showName === true || data.showName == null;
          state.logoScale = data.logoScale || 1;
          state.panelWelcome = data.panelWelcome !== false && data.panelWelcome !== 'false';
          state.panelSocial = data.panelSocial !== false && data.panelSocial !== 'false';
          state.panelPromos = data.panelPromos !== false && data.panelPromos !== 'false';
          state.panelSlideshow = data.panelSlideshow !== false && data.panelSlideshow !== 'false';
          state.panelOrders = data.panelOrders !== false && data.panelOrders !== 'false';
          state.panelMenu = data.panelMenu !== false && data.panelMenu !== 'false';

          // Apply logo size
          document.documentElement.style.setProperty('--logo-size', (200 * state.logoScale) + 'px');

          applyColors(state.textColor, state.accentColor);
          applyFont(state.fontFamily);
          applyGradient(state.gradientPreset);
          applyTextScale(state.textScale);
          setupYT(state.youtubeUrl);
          startLoop();
          break;

        case 'queue':
          state.queue = { preparing: data.preparing || [] };
          var hadOrders = panelDefs.some(function(p) { return p.id === 'orders'; });
          var hasOrders = data.preparing && data.preparing.length > 0;
          if (hadOrders !== hasOrders) startLoop();
          break;
      }
    }

    function connect() {
      var es = new EventSource('/api/display-events');
      es.onmessage = function(e) {
        try { handleSSE(JSON.parse(e.data)); }
        catch(err) { console.error('SSE parse:', err); }
      };
      es.onerror = function() {
        es.close();
        setTimeout(connect, 3000);
      };
    }

    /* ═══════════════════════════════════
       INIT
    ═══════════════════════════════════ */
    applyColors('#ffffff', '#f97316');
    applyGradient(0);
    connect();
  </script>
</body>
</html>`
}
