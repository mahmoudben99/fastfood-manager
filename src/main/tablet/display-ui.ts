export function getDisplayHTML(lang: string): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const langAttr = lang === 'ar' ? 'ar' : lang === 'fr' ? 'fr' : 'en'

  return /* html */ `<!DOCTYPE html>
<html lang="${langAttr}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Display</title>
  <style>
    :root {
      --accent: #f97316;
      --bg: #0a0a0f;
      --text: #ffffff;
      --text-dim: rgba(255,255,255,0.6);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%; width: 100%;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: var(--bg); color: var(--text);
      overflow: hidden;
    }

    /* ── Fullscreen ── */
    body.fullscreen { font-size: 110%; }
    .fs-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      background: rgba(255,255,255,0.08); backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.7);
      padding: 10px 20px; border-radius: 12px; cursor: pointer;
      font-size: 13px; font-weight: 600;
      transition: opacity 0.4s, background 0.2s;
    }
    .fs-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
    .fs-btn.fs-hidden { opacity: 0; pointer-events: none; }

    /* ── Particles canvas ── */
    #particleCanvas {
      position: fixed; inset: 0; z-index: 0;
      pointer-events: none;
    }

    /* ── Panel container ── */
    #panelStage {
      position: fixed; inset: 0; z-index: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .panel {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      opacity: 0; pointer-events: none;
    }
    .panel.active { opacity: 1; pointer-events: auto; }

    /* ── Panel: Welcome ── */
    .welcome-logo {
      width: clamp(120px, 18vw, 260px); height: auto;
      border-radius: 20px;
      animation: breathe 4s ease-in-out infinite;
    }
    .welcome-name {
      font-size: clamp(2.4rem, 5.5vw, 5rem);
      font-weight: 900; color: var(--text);
      margin-top: 24px; text-align: center;
      letter-spacing: -0.02em;
      animation: textBreathe 5s ease-in-out infinite;
    }
    .welcome-msg {
      font-size: clamp(1.2rem, 2.8vw, 2rem);
      color: var(--text-dim); font-weight: 400;
      margin-top: 16px; text-align: center;
      min-height: 1.4em;
    }

    /* ── Panel: Social ── */
    .social-title {
      font-size: clamp(1.6rem, 3.5vw, 2.8rem);
      font-weight: 800; color: var(--text);
      margin-bottom: 40px; text-align: center;
    }
    .social-grid {
      display: flex; flex-wrap: wrap; gap: 20px;
      justify-content: center; max-width: 900px;
      padding: 0 24px;
    }
    .social-card {
      display: flex; align-items: center; gap: 14px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px; padding: 16px 28px;
      font-size: clamp(1rem, 2vw, 1.4rem);
      font-weight: 600; color: var(--text);
      opacity: 0; transform: translateY(30px);
    }
    .social-card .icon { font-size: 1.5em; }
    .social-phone {
      font-size: clamp(1.4rem, 3vw, 2.2rem);
      font-weight: 800; color: var(--accent);
      margin-top: 20px; text-align: center;
      opacity: 0; transform: translateY(20px);
    }
    .social-qr {
      width: clamp(100px, 14vw, 180px); height: auto;
      border-radius: 12px; margin-top: 24px;
      opacity: 0; transform: scale(0.8);
    }

    /* ── Panel: Promos ── */
    .promos-title {
      font-size: clamp(1.6rem, 3.5vw, 2.8rem);
      font-weight: 800; color: var(--text);
      margin-bottom: 36px; text-align: center;
      text-shadow: 0 0 30px rgba(var(--accent-rgb, 249,115,22), 0.3);
    }
    .promos-grid {
      display: flex; flex-wrap: wrap; gap: 20px;
      justify-content: center; max-width: 1100px;
      padding: 0 24px;
    }
    .promo-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px; padding: 24px 32px;
      text-align: center; min-width: 180px;
      position: relative; overflow: hidden;
      opacity: 0; transform: translateY(40px) rotate(-2deg);
    }
    .promo-card::before {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.03) 50%, transparent 60%);
      animation: shimmer 3s ease-in-out infinite;
    }
    .promo-emoji { font-size: clamp(1.8rem, 3.5vw, 2.6rem); margin-bottom: 8px; }
    .promo-name {
      font-size: clamp(1rem, 2vw, 1.4rem);
      font-weight: 700; color: var(--text); margin-bottom: 8px;
    }
    .promo-price {
      font-size: clamp(1.3rem, 2.8vw, 1.8rem);
      font-weight: 900; color: var(--accent);
    }
    .promo-badge {
      position: absolute; top: 12px; right: 12px;
      background: var(--accent); color: #fff;
      font-size: 0.75rem; font-weight: 800;
      padding: 4px 10px; border-radius: 20px;
      text-transform: uppercase;
    }

    /* ── Panel: Slideshow ── */
    .slideshow-wrap {
      position: absolute; inset: 0;
    }
    .slideshow-bg {
      position: absolute; inset: -30px;
      width: calc(100% + 60px); height: calc(100% + 60px);
      object-fit: cover; filter: blur(28px) brightness(0.35) saturate(1.2);
    }
    .slideshow-img {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      object-fit: contain; z-index: 2;
    }
    .slideshow-caption {
      position: absolute; bottom: 0; left: 0; right: 0;
      z-index: 3; text-align: center;
      padding: 40px 24px 48px;
      background: linear-gradient(transparent, rgba(0,0,0,0.7));
      font-size: clamp(1.2rem, 2.5vw, 2rem);
      font-weight: 600; color: var(--text);
    }

    /* ── Panel: Orders ── */
    .orders-title {
      font-size: clamp(1.6rem, 3.5vw, 2.8rem);
      font-weight: 800; color: var(--text);
      margin-bottom: 40px; text-align: center;
    }
    .orders-grid {
      display: flex; flex-wrap: wrap; gap: 20px;
      justify-content: center;
    }
    .order-badge {
      background: var(--accent); color: #fff;
      font-size: clamp(1.8rem, 4vw, 3rem);
      font-weight: 900; padding: 20px 40px;
      border-radius: 18px; min-width: 100px;
      text-align: center;
      animation: badgePulse 2s ease-in-out infinite;
      opacity: 0; transform: scale(0.7);
    }

    /* ── Element animation classes ── */
    .anim-in-fade { animation: animInFade 0.7s ease forwards; }
    .anim-in-up { animation: animInUp 0.7s ease forwards; }
    .anim-in-down { animation: animInDown 0.7s ease forwards; }
    .anim-in-left { animation: animInLeft 0.7s ease forwards; }
    .anim-in-right { animation: animInRight 0.7s ease forwards; }
    .anim-in-scale { animation: animInScale 0.7s ease forwards; }
    .anim-out-fade { animation: animOutFade 0.5s ease forwards; }
    .anim-out-up { animation: animOutUp 0.5s ease forwards; }
    .anim-out-down { animation: animOutDown 0.5s ease forwards; }
    .anim-out-left { animation: animOutLeft 0.5s ease forwards; }
    .anim-out-right { animation: animOutRight 0.5s ease forwards; }
    .anim-out-scale { animation: animOutScale 0.5s ease forwards; }

    /* ── Keyframes ── */
    @keyframes breathe {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }
    @keyframes textBreathe {
      0%, 100% { opacity: 0.92; }
      50% { opacity: 1; }
    }
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      50%, 100% { transform: translateX(100%); }
    }
    @keyframes badgePulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb, 249,115,22), 0.4); }
      50% { box-shadow: 0 0 30px 8px rgba(var(--accent-rgb, 249,115,22), 0.2); }
    }
    @keyframes animInFade {
      from { opacity: 0; } to { opacity: 1; }
    }
    @keyframes animInUp {
      from { opacity: 0; transform: translateY(40px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes animInDown {
      from { opacity: 0; transform: translateY(-40px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes animInLeft {
      from { opacity: 0; transform: translateX(-50px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes animInRight {
      from { opacity: 0; transform: translateX(50px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes animInScale {
      from { opacity: 0; transform: scale(0.7); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes animOutFade {
      from { opacity: 1; } to { opacity: 0; }
    }
    @keyframes animOutUp {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(-40px); }
    }
    @keyframes animOutDown {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(40px); }
    }
    @keyframes animOutLeft {
      from { opacity: 1; transform: translateX(0); }
      to { opacity: 0; transform: translateX(-50px); }
    }
    @keyframes animOutRight {
      from { opacity: 1; transform: translateX(0); }
      to { opacity: 0; transform: translateX(50px); }
    }
    @keyframes animOutScale {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.7); }
    }
    @keyframes slowZoom {
      from { transform: scale(1); }
      to { transform: scale(1.05); }
    }

    /* ── RTL adjustments ── */
    [dir="rtl"] .social-card { flex-direction: row-reverse; }
    [dir="rtl"] .promo-badge { right: auto; left: 12px; }
  </style>
</head>
<body>
  <canvas id="particleCanvas"></canvas>
  <div id="panelStage"></div>
  <div id="ytContainer" style="position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;"></div>
  <button id="fsBtn" class="fs-btn" onclick="toggleFS()">Fullscreen</button>

  <script>
    /* ═══════════════════════════════════════════
       STATE
    ═══════════════════════════════════════════ */
    var state = {
      name: '', logo: '', themeColor: '#f97316',
      promos: [], packs: [], social: [], phone: '', qrCode: '',
      youtubeUrl: '', slideshowImages: [],
      welcomeMode: 'animated', welcomeText: '',
      queue: { preparing: [] },
      currency: ''
    };
    var currentYTUrl = '';

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
      return state.currency ? v.toLocaleString() + ' ' + state.currency : v.toLocaleString();
    }

    /* ═══════════════════════════════════════════
       PARTICLES
    ═══════════════════════════════════════════ */
    (function initParticles() {
      var canvas = document.getElementById('particleCanvas');
      var ctx = canvas.getContext('2d');
      var dots = [];
      var COUNT = 50;

      function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      resize();
      window.addEventListener('resize', resize);

      for (var i = 0; i < COUNT; i++) {
        dots.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 2 + 0.5,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          alpha: Math.random() * 0.15 + 0.05
        });
      }

      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (var i = 0; i < dots.length; i++) {
          var d = dots[i];
          d.x += d.vx; d.y += d.vy;
          if (d.x < 0) d.x = canvas.width;
          if (d.x > canvas.width) d.x = 0;
          if (d.y < 0) d.y = canvas.height;
          if (d.y > canvas.height) d.y = 0;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,' + d.alpha + ')';
          ctx.fill();
        }
        requestAnimationFrame(draw);
      }
      draw();
    })();

    /* ═══════════════════════════════════════════
       FULLSCREEN
    ═══════════════════════════════════════════ */
    var fsTimer = null;
    function toggleFS() {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    }
    document.addEventListener('fullscreenchange', function() {
      var isFs = !!document.fullscreenElement;
      document.body.classList.toggle('fullscreen', isFs);
      document.getElementById('fsBtn').textContent = isFs ? 'Exit Fullscreen' : 'Fullscreen';
    });
    document.addEventListener('mousemove', function() {
      var btn = document.getElementById('fsBtn');
      btn.classList.remove('fs-hidden');
      clearTimeout(fsTimer);
      fsTimer = setTimeout(function() { btn.classList.add('fs-hidden'); }, 3000);
    });
    fsTimer = setTimeout(function() { document.getElementById('fsBtn').classList.add('fs-hidden'); }, 3000);

    /* ═══════════════════════════════════════════
       THEME COLOR
    ═══════════════════════════════════════════ */
    function applyTheme(hex) {
      if (!hex || !/^#[0-9a-fA-F]{3,8}$/.test(hex)) return;
      document.documentElement.style.setProperty('--accent', hex);
      // Parse RGB for box-shadow rgba usage
      var r = parseInt(hex.slice(1,3),16) || 249;
      var g = parseInt(hex.slice(3,5),16) || 115;
      var b = parseInt(hex.slice(5,7),16) || 22;
      document.documentElement.style.setProperty('--accent-rgb', r+','+g+','+b);
    }

    /* ═══════════════════════════════════════════
       YOUTUBE
    ═══════════════════════════════════════════ */
    function setupYT(url) {
      if (url === currentYTUrl) return;
      currentYTUrl = url;
      var c = document.getElementById('ytContainer');
      if (!url) { c.innerHTML = ''; return; }
      var listM = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
      var vidM = url.match(/(?:youtu\\.be\\/|v=|embed\\/)([a-zA-Z0-9_-]{11})/);
      var src = '';
      if (listM) {
        src = 'https://www.youtube.com/embed/videoseries?list=' + listM[1] + '&autoplay=1&loop=1&mute=0';
      } else if (vidM) {
        src = 'https://www.youtube.com/embed/' + vidM[1] + '?autoplay=1&loop=1&playlist=' + vidM[1] + '&mute=0';
      } else { c.innerHTML = ''; return; }
      c.innerHTML = '<iframe width="1" height="1" src="' + src + '" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
    }

    /* ═══════════════════════════════════════════
       PANEL ENGINE
    ═══════════════════════════════════════════ */
    var panelDefs = []; // [{id, build(), duration, elements: [{selector, inClass, outClass, delay}]}]
    var currentPanelIdx = -1;
    var panelTimeout = null;
    var slideshowSubIdx = 0;

    // Animation class sets for variety
    var IN_ANIMS = ['anim-in-up','anim-in-down','anim-in-left','anim-in-right','anim-in-scale','anim-in-fade'];
    var OUT_ANIMS = ['anim-out-up','anim-out-down','anim-out-left','anim-out-right','anim-out-scale','anim-out-fade'];

    function randomIn() { return IN_ANIMS[Math.floor(Math.random() * IN_ANIMS.length)]; }
    function randomOut() { return OUT_ANIMS[Math.floor(Math.random() * OUT_ANIMS.length)]; }

    function buildPanels() {
      panelDefs = [];

      // Panel 1: Welcome (always shown)
      panelDefs.push({
        id: 'welcome',
        duration: 10000,
        build: function() {
          var logoHtml = '';
          if (state.logo) {
            var src = state.logo.startsWith('data:') ? state.logo : 'data:image/png;base64,' + state.logo;
            logoHtml = '<img class="welcome-logo" src="' + src + '" alt="">';
          }
          var nameHtml = '<div class="welcome-name">' + esc(state.name) + '</div>';
          var msgHtml = '<div class="welcome-msg" id="welcomeMsg"></div>';
          return '<div class="panel" id="panel-welcome">'
            + '<div data-anim>' + logoHtml + '</div>'
            + '<div data-anim>' + nameHtml + '</div>'
            + '<div data-anim>' + msgHtml + '</div>'
            + '</div>';
        },
        onEnter: function() { startWelcomeText(); },
        onLeave: function() { stopWelcomeText(); }
      });

      // Panel 2: Social (skip if no social, phone, or qr)
      var hasSocial = (state.social && state.social.length > 0) || state.phone || state.qrCode;
      if (hasSocial) {
        panelDefs.push({
          id: 'social',
          duration: 8000,
          build: function() {
            var title = ${JSON.stringify(lang === 'ar' ? 'تابعونا' : lang === 'fr' ? 'Suivez-nous' : 'Follow Us')};
            var html = '<div class="panel" id="panel-social">';
            html += '<div class="social-title" data-anim>' + title + '</div>';
            html += '<div class="social-grid">';
            if (state.social) {
              for (var i = 0; i < state.social.length; i++) {
                var s = state.social[i];
                var icon = PLATFORM_ICONS[s.platform.toLowerCase()] || '\\u{1F517}';
                html += '<div class="social-card" data-anim><span class="icon">' + icon + '</span> ' + esc(s.handle) + '</div>';
              }
            }
            html += '</div>';
            if (state.phone) {
              html += '<div class="social-phone" data-anim>\\u{1F4DE} ' + esc(state.phone) + '</div>';
            }
            if (state.qrCode) {
              var qrSrc = state.qrCode.startsWith('data:') ? state.qrCode : 'data:image/png;base64,' + state.qrCode;
              html += '<img class="social-qr" data-anim src="' + qrSrc + '" alt="QR">';
            }
            html += '</div>';
            return html;
          }
        });
      }

      // Panel 3: Promos & Packs (skip if none)
      var allPromos = [];
      if (state.promos) {
        for (var i = 0; i < state.promos.length; i++) {
          var p = state.promos[i];
          var val = p.type === 'percentage' ? ('-' + p.value + '%') : ('-' + fmtPrice(p.value));
          allPromos.push({ name: p.name, value: val, emoji: '', badge: ${JSON.stringify(lang === 'ar' ? 'عرض' : lang === 'fr' ? 'Offre' : 'Deal')} });
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
            var title = ${JSON.stringify(lang === 'ar' ? 'عروض خاصة' : lang === 'fr' ? 'Offres Sp\\u00e9ciales' : 'Special Offers')};
            var html = '<div class="panel" id="panel-promos">';
            html += '<div class="promos-title" data-anim>' + title + '</div>';
            html += '<div class="promos-grid">';
            for (var i = 0; i < allPromos.length; i++) {
              var pr = allPromos[i];
              html += '<div class="promo-card" data-anim>';
              if (pr.badge) html += '<div class="promo-badge">' + esc(pr.badge) + '</div>';
              if (pr.emoji) html += '<div class="promo-emoji">' + pr.emoji + '</div>';
              html += '<div class="promo-name">' + esc(pr.name) + '</div>';
              html += '<div class="promo-price">' + esc(pr.value) + '</div>';
              html += '</div>';
            }
            html += '</div></div>';
            return html;
          }
        });
      }

      // Panel 4: Slideshow images (one panel per image, skip if none)
      if (state.slideshowImages && state.slideshowImages.length > 0) {
        for (var si = 0; si < state.slideshowImages.length; si++) {
          (function(idx) {
            var imgData = state.slideshowImages[idx];
            var imgSrc = typeof imgData === 'string' ? imgData : imgData.src;
            var caption = typeof imgData === 'object' ? imgData.caption : '';
            if (imgSrc && !imgSrc.startsWith('data:')) imgSrc = 'data:image/png;base64,' + imgSrc;
            panelDefs.push({
              id: 'slide-' + idx,
              duration: 8000,
              build: function() {
                var html = '<div class="panel" id="panel-slide-' + idx + '">';
                html += '<div class="slideshow-wrap" data-anim>';
                html += '<img class="slideshow-bg" src="' + imgSrc + '" alt="">';
                html += '<img class="slideshow-img" src="' + imgSrc + '" alt="" style="animation: slowZoom 8s ease-in-out forwards;">';
                if (caption) {
                  html += '<div class="slideshow-caption">' + esc(caption) + '</div>';
                }
                html += '</div></div>';
                return html;
              }
            });
          })(si);
        }
      }

      // Panel 5: Orders preparing (skip if none)
      if (state.queue && state.queue.preparing && state.queue.preparing.length > 0) {
        panelDefs.push({
          id: 'orders',
          duration: 6000,
          build: function() {
            var title = ${JSON.stringify(lang === 'ar' ? 'قيد التحضير' : lang === 'fr' ? 'En pr\\u00e9paration' : 'Now Preparing')};
            var html = '<div class="panel" id="panel-orders">';
            html += '<div class="orders-title" data-anim>' + title + '</div>';
            html += '<div class="orders-grid">';
            for (var i = 0; i < state.queue.preparing.length; i++) {
              html += '<div class="order-badge" data-anim>#' + state.queue.preparing[i] + '</div>';
            }
            html += '</div></div>';
            return html;
          }
        });
      }
    }

    /* ── Welcome text cycling ── */
    var welcomeInterval = null;
    var welcomeMsgIdx = 0;
    var WELCOME_MSGS = [
      { text: 'Welcome', dir: 'ltr' },
      { text: 'Bienvenue', dir: 'ltr' },
      { text: '\\u0645\\u0631\\u062D\\u0628\\u0627 \\u0628\\u0643\\u0645', dir: 'rtl' }
    ];

    function startWelcomeText() {
      stopWelcomeText();
      var el = document.getElementById('welcomeMsg');
      if (!el) return;

      if (state.welcomeMode === 'static' && state.welcomeText) {
        el.textContent = state.welcomeText;
        el.style.opacity = '1';
        return;
      }

      welcomeMsgIdx = 0;
      showNextWelcome();
      welcomeInterval = setInterval(showNextWelcome, 3000);
    }

    function showNextWelcome() {
      var el = document.getElementById('welcomeMsg');
      if (!el) return;
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
      setTimeout(function() {
        var msg = WELCOME_MSGS[welcomeMsgIdx % WELCOME_MSGS.length];
        el.textContent = msg.text;
        el.dir = msg.dir;
        el.style.opacity = '1';
        welcomeMsgIdx++;
      }, 500);
    }

    function stopWelcomeText() {
      if (welcomeInterval) { clearInterval(welcomeInterval); welcomeInterval = null; }
    }

    /* ── Panel transition engine ── */
    function showPanel(idx) {
      if (panelDefs.length === 0) return;
      idx = idx % panelDefs.length;

      var stage = document.getElementById('panelStage');
      var prevPanel = stage.querySelector('.panel.active');
      var def = panelDefs[idx];

      // Call onLeave on previous
      if (currentPanelIdx >= 0 && currentPanelIdx < panelDefs.length && panelDefs[currentPanelIdx].onLeave) {
        panelDefs[currentPanelIdx].onLeave();
      }

      // Animate out previous panel elements
      if (prevPanel) {
        var prevElems = prevPanel.querySelectorAll('[data-anim]');
        for (var i = 0; i < prevElems.length; i++) {
          prevElems[i].className = '';
          prevElems[i].classList.add(randomOut());
        }
      }

      // After out-animation, swap panels
      setTimeout(function() {
        // Build new panel HTML
        stage.innerHTML = def.build();
        var newPanel = stage.querySelector('.panel');
        if (!newPanel) return;

        // Brief pause then animate in
        setTimeout(function() {
          newPanel.classList.add('active');
          var elems = newPanel.querySelectorAll('[data-anim]');
          for (var i = 0; i < elems.length; i++) {
            (function(el, delay) {
              var cls = randomIn();
              el.style.animationDelay = delay + 'ms';
              el.classList.add(cls);
            })(elems[i], i * 120);
          }

          // Call onEnter
          if (def.onEnter) def.onEnter();

          currentPanelIdx = idx;

          // Schedule next panel
          clearTimeout(panelTimeout);
          panelTimeout = setTimeout(function() {
            showPanel(idx + 1);
          }, def.duration);
        }, 300);
      }, 500);
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

    /* ═══════════════════════════════════════════
       SSE
    ═══════════════════════════════════════════ */
    function handleSSE(data) {
      switch (data.type) {
        case 'info':
          state.name = data.name || '';
          state.logo = data.logo || '';
          state.promos = data.promos || [];
          state.packs = data.packs || [];
          state.social = data.social || [];
          state.phone = data.phone || '';
          state.qrCode = data.qrCode || '';
          state.youtubeUrl = data.youtubeUrl || '';
          state.slideshowImages = data.slideshowImages || [];
          state.welcomeMode = data.welcomeMode || 'animated';
          state.welcomeText = data.welcomeText || '';
          if (data.currency) state.currency = data.currency;
          if (data.queue) state.queue = data.queue;
          if (data.themeColor) { state.themeColor = data.themeColor; applyTheme(data.themeColor); }
          setupYT(state.youtubeUrl);
          startLoop();
          break;

        case 'queue':
          state.queue = { preparing: data.preparing || [] };
          // Rebuild to include/exclude orders panel
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
        catch(err) { console.error('SSE parse error:', err); }
      };
      es.onerror = function() {
        es.close();
        setTimeout(connect, 3000);
      };
    }

    applyTheme(state.themeColor);
    connect();
  </script>
</body>
</html>`
}
