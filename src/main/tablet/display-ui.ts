export function getDisplayHTML(lang: string): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const langAttr = lang === 'ar' ? 'ar' : 'en'

  return /* html */ `<!DOCTYPE html>
<html lang="${langAttr}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Customer Display</title>
  <style>
    :root { --accent: #f97316; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%; width: 100%;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      background: #111; color: #fff;
      overflow: hidden;
    }

    /* ── Fullscreen mode ── */
    body.fullscreen { font-size: 120%; }
    body.fullscreen .header { padding: 20px 32px; }
    body.fullscreen .items-list { padding: 20px 32px; }
    body.fullscreen .totals { padding: 28px 32px; }
    body.fullscreen .idle-view { padding: 40px; gap: 40px; }

    /* ── Fullscreen button ── */
    .fs-btn {
      position: fixed; bottom: 20px; right: 20px; z-index: 9999;
      background: rgba(255,255,255,0.15); backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.25); color: #fff;
      padding: 10px 18px; border-radius: 10px; cursor: pointer;
      font-size: 14px; font-weight: 600;
      transition: opacity 0.3s, background 0.2s;
    }
    .fs-btn:hover { background: rgba(255,255,255,0.25); }
    .fs-btn.fs-hidden { opacity: 0; pointer-events: none; }

    /* ── Slideshow ── */
    .slideshow-container {
      position: absolute; inset: 0; z-index: 1;
      overflow: hidden;
    }
    .slideshow-bg {
      position: absolute; inset: -20px;
      width: calc(100% + 40px); height: calc(100% + 40px);
      object-fit: cover; filter: blur(20px) brightness(0.4);
    }
    .slideshow-img {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      object-fit: contain; z-index: 2;
      animation: slideZoom 8s ease-in-out forwards;
    }
    .slideshow-container.fade-out { animation: fadeOut 1s ease forwards; }
    .slideshow-container.fade-in { animation: fadeIn 1s ease forwards; }
    @keyframes slideZoom {
      from { transform: scale(1); }
      to { transform: scale(1.05); }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    /* ── Shared ── */
    .container { height: 100vh; display: flex; flex-direction: column; }
    .header {
      background: #1a1a1a; padding: 16px 24px;
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 2px solid var(--accent);
      flex-shrink: 0;
    }
    .header-name {
      font-size: clamp(1.4rem, 3vw, 2.2rem);
      font-weight: 800; color: var(--accent);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .header-logo {
      height: 48px; width: auto; border-radius: 8px;
      margin-inline-end: 12px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
    .order-type-badge {
      background: var(--accent); color: #fff; padding: 6px 16px;
      border-radius: 20px; font-size: clamp(0.9rem, 1.8vw, 1.2rem);
      font-weight: 700; white-space: nowrap; flex-shrink: 0;
    }

    /* ── Active mode ── */
    .active-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .items-list {
      flex: 1; overflow-y: auto; padding: 16px 24px;
      scrollbar-width: thin; scrollbar-color: #444 transparent;
    }
    .item-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 0; border-bottom: 1px solid #2a2a2a;
      animation: slideIn 0.35s ease-out;
    }
    .item-row:last-child { border-bottom: none; }
    .item-name {
      font-size: clamp(1.2rem, 2.5vw, 1.8rem);
      font-weight: 600; color: #eee; flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .item-qty {
      font-size: clamp(1rem, 2vw, 1.4rem);
      color: var(--accent); font-weight: 700;
      margin-inline-start: 12px; flex-shrink: 0; min-width: 40px; text-align: center;
    }
    .item-price {
      font-size: clamp(1.1rem, 2.2vw, 1.6rem);
      font-weight: 700; color: #fff;
      margin-inline-start: 16px; flex-shrink: 0; min-width: 80px;
      text-align: end;
    }
    .totals {
      background: #1a1a1a; padding: 20px 24px;
      border-top: 2px solid #333; flex-shrink: 0;
    }
    .total-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 0;
    }
    .total-label {
      font-size: clamp(1rem, 2vw, 1.4rem);
      color: #999; font-weight: 600;
    }
    .total-value {
      font-size: clamp(1rem, 2vw, 1.4rem);
      color: #ccc; font-weight: 700;
    }
    .total-row.discount .total-value { color: #ef4444; }
    .total-row.grand {
      border-top: 2px solid var(--accent); margin-top: 8px; padding-top: 12px;
    }
    .total-row.grand .total-label {
      font-size: clamp(1.4rem, 2.8vw, 2rem);
      color: #fff; font-weight: 800;
    }
    .total-row.grand .total-value {
      font-size: clamp(1.6rem, 3.2vw, 2.4rem);
      color: var(--accent); font-weight: 900;
    }
    .table-number {
      font-size: clamp(0.9rem, 1.6vw, 1.1rem);
      color: #888; margin-top: 4px; text-align: center;
    }

    /* ── Idle mode ── */
    .idle-view {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 32px; overflow-y: auto; gap: 32px;
    }
    .idle-logo {
      width: clamp(100px, 20vw, 200px);
      height: auto; border-radius: 16px;
      animation: pulse 3s ease-in-out infinite;
    }
    .idle-name {
      font-size: clamp(2rem, 5vw, 4rem);
      font-weight: 900; color: var(--accent);
      text-align: center; animation: fadeIn 1.5s ease-out;
    }

    /* Queue section */
    .queue-section {
      width: 100%; max-width: 800px;
    }
    .queue-title {
      font-size: clamp(1rem, 2vw, 1.4rem);
      color: #999; font-weight: 700;
      margin-bottom: 10px; text-transform: uppercase;
      letter-spacing: 1px;
    }
    .queue-badges {
      display: flex; flex-wrap: wrap; gap: 10px;
    }
    .badge {
      padding: 10px 20px; border-radius: 12px;
      font-size: clamp(1.2rem, 2.5vw, 1.8rem);
      font-weight: 800; min-width: 60px; text-align: center;
    }
    .badge-preparing { background: var(--accent); color: #fff; }
    .badge-ready {
      background: #22c55e; color: #fff;
      animation: readyPulse 1.5s ease-in-out infinite;
    }

    /* Promos */
    .promos-section {
      width: 100%; max-width: 800px;
    }
    .promo-carousel {
      display: flex; gap: 16px; overflow-x: auto;
      padding: 8px 0; scrollbar-width: none;
    }
    .promo-carousel::-webkit-scrollbar { display: none; }
    .promo-card {
      flex-shrink: 0; background: #1f1f1f;
      border: 1px solid #333; border-radius: 14px;
      padding: 16px 24px; min-width: 200px;
      text-align: center; transition: transform 0.3s;
    }
    .promo-card:hover { transform: scale(1.03); }
    .promo-name {
      font-size: clamp(1rem, 2vw, 1.3rem);
      font-weight: 700; color: #fff; margin-bottom: 6px;
    }
    .promo-value {
      font-size: clamp(1.2rem, 2.5vw, 1.6rem);
      font-weight: 800; color: var(--accent);
    }
    .promo-emoji {
      font-size: clamp(1.6rem, 3vw, 2.2rem);
      margin-bottom: 6px;
    }

    /* Social */
    .social-section {
      display: flex; flex-wrap: wrap; gap: 16px; justify-content: center;
    }
    .social-item {
      display: flex; align-items: center; gap: 8px;
      background: #1f1f1f; border: 1px solid #333;
      border-radius: 10px; padding: 10px 18px;
      font-size: clamp(0.9rem, 1.6vw, 1.1rem);
      color: #ccc; font-weight: 600;
    }
    .social-icon { font-size: 1.3em; }

    /* ── Animations ── */
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(${dir === 'rtl' ? '-30px' : '30px'}); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.85; transform: scale(1.03); }
    }
    @keyframes readyPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
      50% { box-shadow: 0 0 20px 6px rgba(34, 197, 94, 0.3); }
    }

    /* Mode transitions */
    .active-view, .idle-view {
      transition: opacity 0.4s ease;
    }
    .hidden { display: none !important; }

    /* Responsive tweaks */
    @media (max-width: 480px) {
      .header { padding: 10px 14px; }
      .items-list { padding: 10px 14px; }
      .totals { padding: 14px; }
      .idle-view { padding: 20px; gap: 20px; }
    }
    @media (min-width: 1200px) {
      .item-row { padding: 18px 0; }
      .totals { padding: 28px 40px; }
    }
  </style>
</head>
<body>
  <!-- Fullscreen button -->
  <button id="fsBtn" class="fs-btn" onclick="toggleFullscreen()">Fullscreen</button>

  <!-- YouTube hidden iframe -->
  <div id="ytContainer" style="position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;"></div>

  <!-- Slideshow overlay (shown during idle) -->
  <div id="slideshowOverlay" class="hidden" style="position:absolute;inset:0;z-index:5;pointer-events:none;"></div>

  <div class="container">
    <div class="header">
      <div class="header-left">
        <img id="headerLogo" class="header-logo hidden" src="" alt="">
        <span id="headerName" class="header-name"></span>
      </div>
      <span id="orderTypeBadge" class="order-type-badge hidden"></span>
    </div>

    <!-- Active mode: cart being built -->
    <div id="activeView" class="active-view hidden">
      <div id="itemsList" class="items-list"></div>
      <div id="totalsSection" class="totals">
        <div class="total-row" id="subtotalRow">
          <span class="total-label">${lang === 'ar' ? 'المجموع الفرعي' : lang === 'fr' ? 'Sous-total' : 'Subtotal'}</span>
          <span class="total-value" id="subtotalValue">0</span>
        </div>
        <div class="total-row discount hidden" id="discountRow">
          <span class="total-label">${lang === 'ar' ? 'خصم' : lang === 'fr' ? 'Remise' : 'Discount'}</span>
          <span class="total-value" id="discountValue">-0</span>
        </div>
        <div class="total-row grand">
          <span class="total-label">${lang === 'ar' ? 'الإجمالي' : lang === 'fr' ? 'Total' : 'Total'}</span>
          <span class="total-value" id="totalValue">0</span>
        </div>
        <div class="table-number hidden" id="tableNumber"></div>
      </div>
    </div>

    <!-- Idle mode: branding + queue -->
    <div id="idleView" class="idle-view">
      <img id="idleLogo" class="idle-logo hidden" src="" alt="">
      <div id="idleName" class="idle-name"></div>

      <div id="preparingSection" class="queue-section hidden">
        <div class="queue-title">${lang === 'ar' ? 'قيد التحضير' : lang === 'fr' ? 'En pr\\u00e9paration' : 'Now Preparing'}</div>
        <div id="preparingBadges" class="queue-badges"></div>
      </div>

      <div id="readySection" class="queue-section hidden">
        <div class="queue-title">${lang === 'ar' ? 'جاهز' : lang === 'fr' ? 'Pr\\u00eat' : 'Ready'}</div>
        <div id="readyBadges" class="queue-badges"></div>
      </div>

      <div id="promosSection" class="promos-section hidden">
        <div class="queue-title">${lang === 'ar' ? 'عروض' : lang === 'fr' ? 'Promotions' : 'Promotions'}</div>
        <div id="promoCarousel" class="promo-carousel"></div>
      </div>

      <div id="socialSection" class="social-section hidden"></div>
    </div>
  </div>

  <script>
    const PLATFORM_ICONS = {
      facebook: '\\u{1F310}',
      instagram: '\\u{1F4F7}',
      tiktok: '\\u{1F3B5}',
      twitter: '\\u{1F426}',
      x: '\\u{1F426}',
      youtube: '\\u{25B6}\\uFE0F',
      snapchat: '\\u{1F47B}',
      whatsapp: '\\u{1F4AC}',
      phone: '\\u{1F4DE}',
      email: '\\u{2709}\\uFE0F'
    };

    const ORDER_TYPE_LABELS = {
      local: '${lang === 'ar' ? 'في المكان' : lang === 'fr' ? 'Sur place' : 'Dine In'}',
      takeout: '${lang === 'ar' ? 'للأخذ' : lang === 'fr' ? '\\u00c0 emporter' : 'Take Out'}',
      delivery: '${lang === 'ar' ? 'توصيل' : lang === 'fr' ? 'Livraison' : 'Delivery'}'
    };

    let state = {
      mode: 'idle',
      info: { name: '', logo: '', promos: [], packs: [], social: [], youtubeUrl: '', themeColor: '#f97316', slideshowImages: [] },
      cart: { items: [], subtotal: 0, discount: 0, total: 0, orderType: 'local', tableNumber: '' },
      queue: { preparing: [], ready: [] },
      currency: ''
    };

    // DOM refs
    const $ = (id) => document.getElementById(id);

    function formatPrice(val) {
      if (state.currency) return val.toLocaleString() + ' ' + state.currency;
      return val.toLocaleString();
    }

    // ── Fullscreen ──
    let fsHideTimer = null;
    function toggleFullscreen() {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    }

    document.addEventListener('fullscreenchange', () => {
      const isFs = !!document.fullscreenElement;
      document.body.classList.toggle('fullscreen', isFs);
      $('fsBtn').textContent = isFs ? 'Exit Fullscreen' : 'Fullscreen';
    });

    document.addEventListener('mousemove', () => {
      const btn = $('fsBtn');
      btn.classList.remove('fs-hidden');
      clearTimeout(fsHideTimer);
      fsHideTimer = setTimeout(() => btn.classList.add('fs-hidden'), 3000);
    });
    // Auto-hide after initial 3s
    fsHideTimer = setTimeout(() => $('fsBtn').classList.add('fs-hidden'), 3000);

    // ── Theme Color ──
    function applyThemeColor(color) {
      if (color && /^#[0-9a-fA-F]{3,8}$/.test(color)) {
        document.documentElement.style.setProperty('--accent', color);
      }
    }

    // ── YouTube Music ──
    let currentYoutubeUrl = '';
    function extractYoutubeId(url) {
      if (!url) return null;
      // Playlist detection
      const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
      if (listMatch) return { type: 'playlist', id: listMatch[1] };
      // Video ID
      const vidMatch = url.match(/(?:youtu\\.be\\/|v=|embed\\/)([a-zA-Z0-9_-]{11})/);
      if (vidMatch) return { type: 'video', id: vidMatch[1] };
      return null;
    }

    function setupYoutube(url) {
      if (url === currentYoutubeUrl) return;
      currentYoutubeUrl = url;
      const container = $('ytContainer');
      if (!url) { container.innerHTML = ''; return; }
      const info = extractYoutubeId(url);
      if (!info) { container.innerHTML = ''; return; }
      let src = '';
      if (info.type === 'playlist') {
        src = 'https://www.youtube.com/embed/videoseries?list=' + info.id + '&autoplay=1&loop=1&mute=0';
      } else {
        src = 'https://www.youtube.com/embed/' + info.id + '?autoplay=1&loop=1&playlist=' + info.id + '&mute=0';
      }
      container.innerHTML = '<iframe width="1" height="1" src="' + src + '" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
    }

    // ── Slideshow ──
    let slideshowImages = [];
    let slideshowIndex = 0;
    let slideshowTimer = null;
    let slideshowPhase = 'branding'; // 'branding' | 'image'
    const BRANDING_DURATION = 10000;
    const IMAGE_DURATION = 8000;
    const FADE_DURATION = 1000;

    function startSlideshow() {
      stopSlideshow();
      if (slideshowImages.length === 0) return;
      slideshowPhase = 'branding';
      slideshowIndex = 0;
      $('idleView').style.position = 'relative';
      scheduleSlideshowNext();
    }

    function stopSlideshow() {
      clearTimeout(slideshowTimer);
      slideshowTimer = null;
      const overlay = $('slideshowOverlay');
      overlay.classList.add('hidden');
      overlay.innerHTML = '';
    }

    function scheduleSlideshowNext() {
      if (state.mode !== 'idle' || slideshowImages.length === 0) return;
      if (slideshowPhase === 'branding') {
        // Show branding for BRANDING_DURATION, then switch to image
        $('slideshowOverlay').classList.add('hidden');
        $('idleView').style.opacity = '1';
        slideshowTimer = setTimeout(() => {
          slideshowPhase = 'image';
          showSlideshowImage();
        }, BRANDING_DURATION);
      }
    }

    function showSlideshowImage() {
      if (state.mode !== 'idle' || slideshowImages.length === 0) return;
      const overlay = $('slideshowOverlay');
      const imgSrc = slideshowImages[slideshowIndex % slideshowImages.length];
      slideshowIndex = (slideshowIndex + 1) % slideshowImages.length;

      overlay.innerHTML =
        '<div class="slideshow-container fade-in">' +
          '<img class="slideshow-bg" src="' + imgSrc + '" alt="">' +
          '<img class="slideshow-img" src="' + imgSrc + '" alt="">' +
        '</div>';
      overlay.classList.remove('hidden');

      // After IMAGE_DURATION, fade out and go back to branding
      slideshowTimer = setTimeout(() => {
        const container = overlay.querySelector('.slideshow-container');
        if (container) container.classList.add('fade-out');
        setTimeout(() => {
          overlay.classList.add('hidden');
          overlay.innerHTML = '';
          slideshowPhase = 'branding';
          scheduleSlideshowNext();
        }, FADE_DURATION);
      }, IMAGE_DURATION);
    }

    function showMode(mode) {
      state.mode = mode;
      if (mode === 'active') {
        $('activeView').classList.remove('hidden');
        $('idleView').classList.add('hidden');
        stopSlideshow();
      } else {
        $('activeView').classList.add('hidden');
        $('idleView').classList.remove('hidden');
        startSlideshow();
      }
    }

    function renderInfo(info) {
      state.info = info;
      if (info.currency) state.currency = info.currency;
      $('headerName').textContent = info.name || '';
      $('idleName').textContent = info.name || '';

      if (info.logo) {
        const src = info.logo.startsWith('data:') ? info.logo : 'data:image/png;base64,' + info.logo;
        $('headerLogo').src = src;
        $('headerLogo').classList.remove('hidden');
        $('idleLogo').src = src;
        $('idleLogo').classList.remove('hidden');
      }

      // Theme color
      if (info.themeColor) applyThemeColor(info.themeColor);

      // YouTube
      if (info.youtubeUrl !== undefined) setupYoutube(info.youtubeUrl);

      // Slideshow images
      if (info.slideshowImages && info.slideshowImages.length > 0) {
        slideshowImages = info.slideshowImages;
        if (state.mode === 'idle') startSlideshow();
      } else {
        slideshowImages = [];
        stopSlideshow();
      }

      // Promos + packs
      const allPromos = [];
      if (info.promos) {
        info.promos.forEach(p => {
          const val = p.type === 'percentage' ? p.value + '%' : formatPrice(p.value);
          allPromos.push({ name: p.name, value: '-' + val, emoji: '' });
        });
      }
      if (info.packs) {
        info.packs.forEach(p => {
          allPromos.push({ name: p.name, value: formatPrice(p.price), emoji: p.emoji || '' });
        });
      }

      if (allPromos.length > 0) {
        $('promosSection').classList.remove('hidden');
        $('promoCarousel').innerHTML = allPromos.map(p =>
          '<div class="promo-card">' +
            (p.emoji ? '<div class="promo-emoji">' + p.emoji + '</div>' : '') +
            '<div class="promo-name">' + escapeHtml(p.name) + '</div>' +
            '<div class="promo-value">' + escapeHtml(p.value) + '</div>' +
          '</div>'
        ).join('');

        // Auto-scroll carousel
        startCarousel();
      } else {
        $('promosSection').classList.add('hidden');
      }

      // Social
      if (info.social && info.social.length > 0) {
        $('socialSection').classList.remove('hidden');
        $('socialSection').innerHTML = info.social.map(s => {
          const icon = PLATFORM_ICONS[s.platform.toLowerCase()] || '\\u{1F517}';
          return '<div class="social-item"><span class="social-icon">' + icon + '</span>' + escapeHtml(s.handle) + '</div>';
        }).join('');
      } else {
        $('socialSection').classList.add('hidden');
      }
    }

    function renderCart(data) {
      state.cart = data;
      showMode('active');

      // Order type badge
      const badge = $('orderTypeBadge');
      const label = ORDER_TYPE_LABELS[data.orderType] || data.orderType;
      badge.textContent = label;
      badge.classList.remove('hidden');

      // Items list
      const list = $('itemsList');
      list.innerHTML = data.items.map(item =>
        '<div class="item-row">' +
          '<span class="item-name">' + escapeHtml(item.name) + '</span>' +
          '<span class="item-qty">x' + item.qty + '</span>' +
          '<span class="item-price">' + formatPrice(item.price * item.qty) + '</span>' +
        '</div>'
      ).join('');

      // Scroll to bottom to show latest item
      list.scrollTop = list.scrollHeight;

      // Totals
      $('subtotalValue').textContent = formatPrice(data.subtotal);

      if (data.discount > 0) {
        $('discountRow').classList.remove('hidden');
        $('discountValue').textContent = '-' + formatPrice(data.discount);
      } else {
        $('discountRow').classList.add('hidden');
      }

      $('totalValue').textContent = formatPrice(data.total);

      // Table number
      if (data.tableNumber && data.orderType === 'local') {
        $('tableNumber').textContent = '${lang === 'ar' ? 'طاولة' : lang === 'fr' ? 'Table' : 'Table'} ' + data.tableNumber;
        $('tableNumber').classList.remove('hidden');
      } else {
        $('tableNumber').classList.add('hidden');
      }
    }

    function renderQueue(data) {
      state.queue = data;

      // Only update queue in idle mode
      if (state.mode !== 'idle') return;

      if (data.preparing && data.preparing.length > 0) {
        $('preparingSection').classList.remove('hidden');
        $('preparingBadges').innerHTML = data.preparing.map(n =>
          '<div class="badge badge-preparing">#' + n + '</div>'
        ).join('');
      } else {
        $('preparingSection').classList.add('hidden');
      }

      if (data.ready && data.ready.length > 0) {
        $('readySection').classList.remove('hidden');
        $('readyBadges').innerHTML = data.ready.map(n =>
          '<div class="badge badge-ready">#' + n + '</div>'
        ).join('');
      } else {
        $('readySection').classList.add('hidden');
      }
    }

    function goIdle() {
      showMode('idle');
      $('orderTypeBadge').classList.add('hidden');
      // Re-render queue badges now that we're in idle
      renderQueue(state.queue);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Carousel auto-scroll
    let carouselInterval = null;
    function startCarousel() {
      if (carouselInterval) clearInterval(carouselInterval);
      const el = $('promoCarousel');
      if (!el) return;
      carouselInterval = setInterval(() => {
        if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 10) {
          el.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          el.scrollBy({ left: 220, behavior: 'smooth' });
        }
      }, 4000);
    }

    // SSE connection with auto-reconnect
    function connect() {
      const es = new EventSource('/api/display-events');

      es.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'info':
              renderInfo(data);
              break;
            case 'cart':
              renderCart(data);
              break;
            case 'idle':
              goIdle();
              break;
            case 'queue':
              renderQueue(data);
              break;
          }
        } catch (err) {
          console.error('SSE parse error:', err);
        }
      };

      es.onerror = function() {
        es.close();
        setTimeout(connect, 3000);
      };
    }

    connect();
  </script>
</body>
</html>`
}
