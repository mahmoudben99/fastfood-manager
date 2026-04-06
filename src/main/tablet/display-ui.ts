export function getDisplayHTML(lang: string): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const langAttr = lang === 'ar' ? 'ar' : lang === 'fr' ? 'fr' : 'en'

  const t = {
    connectWithUs: lang === 'ar' ? '\u062A\u0627\u0628\u0639\u0648\u0646\u0627' : lang === 'fr' ? 'Suivez-nous' : 'Connect With Us',
    specialOffers: lang === 'ar' ? '\u0639\u0631\u0648\u0636 \u062E\u0627\u0635\u0629' : lang === 'fr' ? 'Offres Sp\u00e9ciales' : 'Special Offers',
    nowPreparing: lang === 'ar' ? '\u0642\u064A\u062F \u0627\u0644\u062A\u062D\u0636\u064A\u0631' : lang === 'fr' ? 'En pr\u00e9paration' : 'Now Preparing',
    deal: lang === 'ar' ? '\u0639\u0631\u0636' : lang === 'fr' ? 'Offre' : 'Deal',
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
      max-width: 200px; max-height: 200px;
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
      color: rgba(255,255,255,0.4);
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
      color: rgba(255,255,255,0.85);
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
      color: rgba(255,255,255,0.4);
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
      color: #fff;
      font-size: 0.65rem;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
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
      color: rgba(255,255,255,0.9);
      letter-spacing: 0.02em;
    }
    @keyframes slowZoom {
      from { transform: scale(1); }
      to { transform: scale(1.03); }
    }

    /* ── Orders panel ── */
    .orders-heading {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.25em;
      color: rgba(255,255,255,0.4);
      margin-bottom: 48px;
      text-align: center;
    }
    .orders-row {
      display: flex; flex-wrap: wrap;
      gap: 24px; justify-content: center;
    }
    .order-badge {
      width: clamp(80px, 12vw, 120px);
      height: clamp(80px, 12vw, 120px);
      display: flex; align-items: center; justify-content: center;
      background: rgba(var(--accent-rgb), 0.15);
      border: 2px solid rgba(var(--accent-rgb), 0.3);
      border-radius: 50%;
      font-size: clamp(1.6rem, 3.5vw, 2.8rem);
      font-weight: 700;
      color: var(--accent);
      animation: pulse 2.5s ease-in-out infinite;
      opacity: 0; transform: scale(0.8);
      transition: opacity 0.5s ease, transform 0.5s ease;
    }
    .order-badge.show { opacity: 1; transform: scale(1); }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0.2); }
      50% { box-shadow: 0 0 40px 8px rgba(var(--accent-rgb), 0.1); }
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
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.6);
      width: 44px; height: 44px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 18px;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s, color 0.2s;
    }
    .ctrl-btn:hover {
      background: rgba(255,255,255,0.12);
      color: #fff;
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
      color: rgba(255,255,255,0.7);
      letter-spacing: 0.1em;
      padding: 16px 32px;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 16px;
      background: rgba(255,255,255,0.05);
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
      queue: { preparing: [] }
    };

    var currentYTUrl = '';
    var musicEnabled = true;

    var PLATFORM_ICONS = {
      facebook: '\\u{1F4D8}', instagram: '\\u{1F4F8}', snapchat: '\\u{1F47B}',
      tiktok: '\\u{1F3B5}', twitter: '\\u{1F426}', x: '\\u{1F426}',
      youtube: '\\u25B6\\uFE0F', whatsapp: '\\u{1F4AC}', phone: '\\u{1F4DE}',
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

    function applyGradient(preset) {
      var bg = document.getElementById('gradientBg');
      if (!bg) return;
      // Remove old gradient class
      for (var i = 0; i <= 14; i++) bg.classList.remove('grad-' + i);
      var idx = Math.max(0, Math.min(14, parseInt(preset) || 0));
      bg.classList.add('grad-' + idx);
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

      // Panel 1: Welcome (always)
      panelDefs.push({
        id: 'welcome',
        duration: 10000,
        build: function() {
          var html = '<div class="panel" id="panel-welcome">';
          if (state.logo) {
            var src = state.logo.startsWith('data:') ? state.logo : 'data:image/png;base64,' + state.logo;
            html += '<img class="welcome-logo" src="' + src + '" alt="">';
          }
          html += '<div class="welcome-name">' + esc(state.name) + '</div>';
          html += '<div class="welcome-msg" id="welcomeMsg"></div>';
          html += '</div>';
          return html;
        },
        onEnter: function() { startWelcome(); },
        onLeave: function() { stopWelcome(); }
      });

      // Panel 2: Social & Contact
      var hasSocial = (state.social && state.social.length > 0) || state.phone;
      if (hasSocial) {
        panelDefs.push({
          id: 'social',
          duration: 8000,
          build: function() {
            var html = '<div class="panel" id="panel-social">';
            html += '<div class="social-heading">${esc(t.connectWithUs)}</div>';
            html += '<ul class="social-list">';
            if (state.social) {
              for (var i = 0; i < state.social.length; i++) {
                var s = state.social[i];
                var icon = PLATFORM_ICONS[(s.platform || '').toLowerCase()] || '\\u{1F517}';
                html += '<li class="social-item" style="transition-delay:' + (i * 100) + 'ms"><span class="icon">' + icon + '</span> ' + esc(s.handle) + '</li>';
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
          allPromos.push({ name: p.name, value: val, emoji: '', badge: '${esc(t.deal)}' });
        }
      }
      if (state.packs) {
        for (var i = 0; i < state.packs.length; i++) {
          var pk = state.packs[i];
          allPromos.push({ name: pk.name, value: fmtPrice(pk.pack_price || pk.price), emoji: pk.emoji || '', badge: '' });
        }
      }
      if (allPromos.length > 0) {
        panelDefs.push({
          id: 'promos',
          duration: 10000,
          build: function() {
            var html = '<div class="panel" id="panel-promos">';
            html += '<div class="promos-heading">${esc(t.specialOffers)}</div>';
            html += '<div class="promos-row">';
            for (var i = 0; i < allPromos.length; i++) {
              var pr = allPromos[i];
              html += '<div class="promo-card" style="transition-delay:' + (i * 120) + 'ms">';
              if (pr.badge) html += '<div class="promo-badge">' + esc(pr.badge) + '</div>';
              if (pr.emoji) html += '<div class="promo-emoji">' + pr.emoji + '</div>';
              html += '<div class="promo-name">' + esc(pr.name) + '</div>';
              html += '<div class="promo-value">' + esc(pr.value) + '</div>';
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
      if (state.slideshowImages && state.slideshowImages.length > 0) {
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
      if (state.queue && state.queue.preparing && state.queue.preparing.length > 0) {
        panelDefs.push({
          id: 'orders',
          duration: 6000,
          build: function() {
            var html = '<div class="panel" id="panel-orders">';
            html += '<div class="orders-heading">${esc(t.nowPreparing)}</div>';
            html += '<div class="orders-row">';
            for (var i = 0; i < state.queue.preparing.length; i++) {
              html += '<div class="order-badge" style="transition-delay:' + (i * 80) + 'ms">' + state.queue.preparing[i] + '</div>';
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

          applyColors(state.textColor, state.accentColor);
          applyFont(state.fontFamily);
          applyGradient(state.gradientPreset);
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
