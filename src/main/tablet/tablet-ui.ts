export function getTabletHTML(lang: string, pinEnabled: boolean, pinVersion: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="${lang === 'ar' ? 'ar' : 'en'}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>FFM Orders</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body { height: 100%; font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; color: #1a1a1a; overflow: hidden; }

    /* ── Top bar ── */
    .topbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      background: #1a1a1a; color: #fff; display: flex; align-items: center;
      justify-content: space-between; padding: 0 12px; height: 54px; gap: 8px;
    }
    .topbar-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
    .back-btn {
      background: rgba(255,255,255,.15); border: none; color: #fff; border-radius: 8px;
      padding: 6px 10px; font-size: 18px; cursor: pointer; flex-shrink: 0; line-height: 1;
    }
    .topbar-title { font-weight: 700; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .topbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .lang-switcher { display: flex; gap: 2px; }
    .lang-btn {
      background: rgba(255,255,255,.1); border: 1.5px solid transparent; color: #aaa;
      border-radius: 6px; padding: 3px 6px; font-size: 10px; font-weight: 700; cursor: pointer;
      transition: all .15s; letter-spacing: .3px;
    }
    .lang-btn.active { background: #f97316; border-color: #f97316; color: #fff; }
    .cart-btn {
      background: #f97316; border: none; color: #fff; border-radius: 20px;
      padding: 7px 12px; font-size: 14px; font-weight: 600; cursor: pointer;
      display: flex; align-items: center; gap: 6px; flex-shrink: 0;
    }
    .cart-badge {
      background: #fff; color: #f97316; border-radius: 50%;
      width: 20px; height: 20px; font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Category grid ── */
    #categoryView {
      position: fixed; top: 54px; left: 0; right: 0; bottom: 0;
      overflow-y: auto; padding: 12px;
      display: grid; gap: 10px;
      grid-template-columns: repeat(2, 1fr);
    }
    @media (min-width: 500px)  { #categoryView { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 800px)  { #categoryView { grid-template-columns: repeat(4, 1fr); } }
    @media (min-width: 1100px) { #categoryView { grid-template-columns: repeat(5, 1fr); } }

    .cat-card {
      background: #fff; border-radius: 14px; padding: 20px 10px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,.08);
      transition: transform .1s; min-height: 100px;
    }
    .cat-card:active { transform: scale(.96); }
    .cat-icon { font-size: 36px; line-height: 1; }
    .cat-name { font-size: 13px; font-weight: 700; text-align: center; line-height: 1.2; }

    /* ── Items list view ── */
    #itemsView {
      position: fixed; top: 54px; left: 0; right: 0; bottom: 0;
      overflow-y: auto; background: #f0f0f0; display: none;
    }
    #itemsView.active { display: block; }
    #itemsListInner { background: #fff; }

    .item-row {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px; background: #fff;
      border-bottom: 1px solid #f0f0f0; min-height: 62px;
    }
    .item-row.in-cart { background: #fff8f3; }
    .item-emoji-sm {
      width: 38px; height: 38px; flex-shrink: 0; border-radius: 8px;
      background: #f5f5f5; display: flex; align-items: center; justify-content: center;
      font-size: 24px; overflow: hidden;
    }
    .item-info { flex: 1; min-width: 0; }
    .item-name-text {
      font-size: 14px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .item-price-text { font-size: 13px; color: #f97316; font-weight: 600; margin-top: 2px; }
    .item-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .item-qty-label {
      font-size: 13px; font-weight: 800; color: #f97316;
      min-width: 22px; text-align: center; display: none;
    }
    .item-row.in-cart .item-qty-label { display: block; }
    .item-add-btn {
      width: 34px; height: 34px; border-radius: 8px; border: none;
      background: #f97316; color: #fff; font-size: 20px; font-weight: 700;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .item-add-btn:active { background: #ea6c00; }
    .item-remove-btn {
      width: 34px; height: 34px; border-radius: 8px; border: none;
      background: #fee2e2; color: #ef4444; font-size: 16px; font-weight: 700;
      cursor: pointer; display: none; align-items: center; justify-content: center;
    }
    .item-remove-btn:active { background: #fecaca; }
    .item-row.in-cart .item-remove-btn { display: flex; }

    /* ── Cart overlay ── */
    .cart-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 200;
      display: none; align-items: flex-end;
    }
    .cart-overlay.open { display: flex; }
    .cart-sheet {
      width: 100%; max-height: 92vh; background: #fff;
      border-radius: 16px 16px 0 0; overflow-y: auto;
      display: flex; flex-direction: column;
    }
    .cart-header {
      font-size: 17px; font-weight: 700; padding: 16px 16px 12px;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #f0f0f0; position: sticky; top: 0; background: #fff; z-index: 1;
    }
    .close-btn { background: none; border: none; font-size: 22px; cursor: pointer; color: #888; }
    .cart-item-row {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 16px; border-bottom: 1px solid #f0f0f0;
    }
    .cart-item-name { flex: 1; font-size: 14px; font-weight: 500; }
    .cart-item-price { font-size: 14px; color: #f97316; font-weight: 700; min-width: 64px; text-align: right; }
    .qty-ctrl { display: flex; align-items: center; gap: 8px; }
    .qty-btn {
      width: 30px; height: 30px; border-radius: 50%; border: none;
      font-size: 16px; font-weight: 700; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    .qty-btn.minus { background: #f5f5f5; color: #666; }
    .qty-btn.plus  { background: #f97316; color: #fff; }
    .qty-btn.minus:active { background: #e8e8e8; }
    .qty-btn.plus:active { background: #ea6c00; }
    .qty-num { font-size: 15px; font-weight: 700; min-width: 20px; text-align: center; }
    .cart-total-row {
      padding: 12px 16px; font-size: 16px; font-weight: 700; text-align: right;
      background: #fafafa; border-bottom: 2px solid #f97316;
    }

    /* ── Checkout section (inside cart) ── */
    .checkout-section { padding: 14px 16px 20px; }
    .checkout-label {
      font-size: 11px; font-weight: 700; color: #aaa; letter-spacing: .5px;
      text-transform: uppercase; margin-bottom: 8px;
    }
    .type-btns { display: flex; gap: 6px; margin-bottom: 10px; }
    .type-btn {
      flex: 1; border: 1.5px solid #e5e5e5; background: #fff; border-radius: 8px;
      padding: 8px 4px; font-size: 13px; font-weight: 600; cursor: pointer;
      transition: all .15s; text-align: center;
    }
    .type-btn.active { background: #1a1a1a; border-color: #1a1a1a; color: #fff; }
    .meta-input {
      width: 100%; border: 1.5px solid #e5e5e5; border-radius: 8px;
      padding: 9px 12px; font-size: 14px; outline: none; margin-bottom: 8px;
      display: block;
    }
    .meta-input:focus { border-color: #f97316; }
    .notes-input {
      width: 100%; border: 1.5px solid #e5e5e5; border-radius: 8px;
      padding: 9px 12px; font-size: 14px; outline: none; resize: none;
      height: 42px; margin-bottom: 12px; display: block;
    }
    .notes-input:focus { border-color: #f97316; }
    .submit-btn {
      width: 100%; background: #f97316; border: none; color: #fff;
      border-radius: 10px; padding: 14px; font-size: 16px; font-weight: 700;
      cursor: pointer; transition: background .15s;
    }
    .submit-btn:disabled { background: #ccc; cursor: not-allowed; }
    .submit-btn:not(:disabled):active { background: #ea6c00; }

    /* ── Empty cart message ── */
    .cart-empty { padding: 32px 16px; text-align: center; color: #aaa; font-size: 15px; }

    /* ── PIN screen ── */
    .pin-screen {
      position: fixed; inset: 0; background: #1a1a1a; z-index: 500;
      display: flex; align-items: center; justify-content: center;
    }
    .pin-box { text-align: center; color: #fff; padding: 24px; max-width: 320px; width: 100%; }
    .pin-title { font-size: 26px; font-weight: 700; margin-bottom: 6px; }
    .pin-subtitle { font-size: 15px; color: #aaa; margin-bottom: 28px; }
    .pin-dots { display: flex; gap: 16px; justify-content: center; margin-bottom: 32px; }
    .pin-dot { width: 16px; height: 16px; border-radius: 50%; background: #444; transition: background .1s; }
    .pin-dot.filled { background: #f97316; }
    .pin-error { color: #f87171; font-size: 14px; min-height: 20px; margin-bottom: 8px; }
    .numpad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .num-btn {
      background: #2a2a2a; border: none; color: #fff; border-radius: 12px;
      padding: 18px; font-size: 22px; font-weight: 600; cursor: pointer; transition: background .1s;
    }
    .num-btn:active { background: #f97316; }
    .num-btn.del { font-size: 18px; color: #aaa; }

    /* ── Confirmation ── */
    .confirm-screen {
      position: fixed; inset: 0; background: #fff; z-index: 400;
      display: none; flex-direction: column; align-items: center; justify-content: center;
      gap: 16px; padding: 32px; text-align: center;
    }
    .confirm-screen.show { display: flex; }
    .confirm-icon { font-size: 64px; }
    .confirm-num { font-size: 26px; font-weight: 800; color: #f97316; }
    .confirm-msg { font-size: 17px; color: #555; }
    .new-order-btn {
      background: #f97316; border: none; color: #fff; border-radius: 10px;
      padding: 14px 36px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px;
    }

    /* RTL support */
    [dir="rtl"] .item-actions { flex-direction: row-reverse; }
    [dir="rtl"] .cart-item-price { text-align: left; }
  </style>
</head>
<body>

<!-- PIN screen -->
<div class="pin-screen" id="pinScreen" style="display:none">
  <div class="pin-box">
    <div class="pin-title">FFM Orders</div>
    <div class="pin-subtitle" id="pinSubtitle">Enter PIN</div>
    <div class="pin-dots" id="pinDots">
      <div class="pin-dot" id="d0"></div><div class="pin-dot" id="d1"></div>
      <div class="pin-dot" id="d2"></div><div class="pin-dot" id="d3"></div>
    </div>
    <div class="pin-error" id="pinError"></div>
    <div class="numpad">
      <button class="num-btn" onclick="numPress('1')">1</button>
      <button class="num-btn" onclick="numPress('2')">2</button>
      <button class="num-btn" onclick="numPress('3')">3</button>
      <button class="num-btn" onclick="numPress('4')">4</button>
      <button class="num-btn" onclick="numPress('5')">5</button>
      <button class="num-btn" onclick="numPress('6')">6</button>
      <button class="num-btn" onclick="numPress('7')">7</button>
      <button class="num-btn" onclick="numPress('8')">8</button>
      <button class="num-btn" onclick="numPress('9')">9</button>
      <button class="num-btn del" onclick="numPress('del')">⌫</button>
      <button class="num-btn" onclick="numPress('0')">0</button>
      <button class="num-btn" onclick="submitPin()" style="background:#f97316">✓</button>
    </div>
  </div>
</div>

<!-- Main app -->
<div id="app" style="display:none">
  <div class="topbar">
    <div class="topbar-left">
      <button class="back-btn" id="backBtn" onclick="showCategories()" style="display:none">←</button>
      <span class="topbar-title" id="topbarTitle">FFM Orders</span>
    </div>
    <div class="topbar-right">
      <div class="lang-switcher">
        <button class="lang-btn" id="langAR" onclick="switchLang('ar')">AR</button>
        <button class="lang-btn" id="langFR" onclick="switchLang('fr')">FR</button>
        <button class="lang-btn" id="langEN" onclick="switchLang('en')">EN</button>
      </div>
      <button class="cart-btn" onclick="openCart()">
        🛒 <div class="cart-badge" id="cartCount">0</div>
      </button>
    </div>
  </div>

  <!-- Category grid -->
  <div id="categoryView"></div>

  <!-- Items list -->
  <div id="itemsView">
    <div id="itemsListInner"></div>
  </div>
</div>

<!-- Cart overlay (includes checkout) -->
<div class="cart-overlay" id="cartOverlay" onclick="closeCart()">
  <div class="cart-sheet" onclick="event.stopPropagation()">
    <div class="cart-header">
      <span id="cartTitle">Cart</span>
      <button class="close-btn" onclick="closeCart()">✕</button>
    </div>
    <div id="cartItemsContainer"></div>
    <div class="checkout-section" id="checkoutSection" style="display:none">
      <div class="checkout-label" id="checkoutLabel">Order Details</div>
      <div class="type-btns">
        <button class="type-btn active" onclick="setType('local')" id="btnLocal">Local</button>
        <button class="type-btn" onclick="setType('takeout')" id="btnTakeout">Takeout</button>
        <button class="type-btn" onclick="setType('delivery')" id="btnDelivery">Delivery</button>
      </div>
      <input class="meta-input" id="tableInput" type="text" inputmode="numeric" placeholder="Table #" />
      <input class="meta-input" id="phoneInput" type="tel" placeholder="Phone" style="display:none" />
      <input class="notes-input" id="notesInput" type="text" placeholder="Notes..." />
      <button class="submit-btn" id="submitBtn" onclick="placeOrder()">Place Order</button>
    </div>
  </div>
</div>

<!-- Confirmation -->
<div class="confirm-screen" id="confirmScreen">
  <div class="confirm-icon">✅</div>
  <div class="confirm-num" id="confirmNum"></div>
  <div class="confirm-msg" id="confirmMsg"></div>
  <button class="new-order-btn" onclick="resetOrder()" id="newOrderBtn">New Order</button>
</div>

<script>
const PIN_ENABLED = ${pinEnabled};
const PIN_VERSION = '${pinVersion}';
const APP_LANG = '${lang}';

// ── i18n ─────────────────────────────────────────────────────────────────────
const T = {
  en: {
    pin_subtitle: 'Enter your PIN',
    pin_wrong: 'Wrong PIN. Try again.',
    local: 'Local', takeout: 'Takeout', delivery: 'Delivery',
    table: 'Table #', phone: 'Phone', notes: 'Notes...',
    order_btn: (n) => n > 0 ? \`Place Order (\${n} items)\` : 'Place Order',
    cart_title: 'Cart', total: 'Total', order_details: 'Order Details',
    confirm_title: (n) => \`Order #\${n} received!\`,
    confirm_msg: 'Sent to the kitchen!',
    new_order: 'New Order',
    err_table: 'Please enter the table number.',
    err_phone: 'Please enter the phone number.',
    err_cart: 'Your cart is empty.',
    err_network: 'Network error. Check connection.',
    err_unknown: 'Unknown error',
  },
  fr: {
    pin_subtitle: 'Entrez votre PIN',
    pin_wrong: 'PIN incorrect. Réessayez.',
    local: 'Local', takeout: 'Emporter', delivery: 'Livraison',
    table: 'Table #', phone: 'Téléphone', notes: 'Notes...',
    order_btn: (n) => n > 0 ? \`Commander (\${n} articles)\` : 'Commander',
    cart_title: 'Panier', total: 'Total', order_details: 'Détails',
    confirm_title: (n) => \`Commande #\${n} reçue !\`,
    confirm_msg: 'Envoyée en cuisine !',
    new_order: 'Nouvelle commande',
    err_table: 'Entrez le numéro de table.',
    err_phone: 'Entrez le numéro de téléphone.',
    err_cart: 'Le panier est vide.',
    err_network: 'Erreur réseau.',
    err_unknown: 'Erreur inconnue',
  },
  ar: {
    pin_subtitle: 'أدخل رمز PIN',
    pin_wrong: 'الرمز غير صحيح. حاول مجدداً.',
    local: 'محلي', takeout: 'خارج', delivery: 'توصيل',
    table: 'رقم الطاولة', phone: 'هاتف', notes: 'ملاحظات...',
    order_btn: (n) => n > 0 ? \`طلب (\${n} أصناف)\` : 'طلب',
    cart_title: 'السلة', total: 'المجموع', order_details: 'تفاصيل الطلب',
    confirm_title: (n) => \`تم استلام الطلب #\${n} !\`,
    confirm_msg: 'تم الإرسال إلى المطبخ !',
    new_order: 'طلب جديد',
    err_table: 'أدخل رقم الطاولة.',
    err_phone: 'أدخل رقم الهاتف.',
    err_cart: 'السلة فارغة.',
    err_network: 'خطأ في الشبكة.',
    err_unknown: 'خطأ غير معروف',
  }
};

// ── Language management ───────────────────────────────────────────────────────
// If the server-side app language changed, clear the per-device override so it
// defaults to the new app language instead of a stale stored preference.
const storedAppLang = localStorage.getItem('ffm_app_lang');
if (storedAppLang !== APP_LANG) {
  localStorage.removeItem('ffm_lang');
  localStorage.setItem('ffm_app_lang', APP_LANG);
}

let currentLang = localStorage.getItem('ffm_lang') || APP_LANG || 'en';
if (!T[currentLang]) currentLang = 'en';
let t = T[currentLang];

function switchLang(lang) {
  currentLang = lang;
  t = T[lang] || T.en;
  localStorage.setItem('ffm_lang', lang);
  document.documentElement.lang = lang === 'ar' ? 'ar' : 'en';
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  updateLangBtns();
  applyTranslations();
  if (currentCategoryId !== null) renderItems(currentCategoryId);
  else renderCats();
}

function updateLangBtns() {
  ['ar','fr','en'].forEach(l => {
    const btn = document.getElementById('lang' + l.toUpperCase());
    if (btn) btn.classList.toggle('active', l === currentLang);
  });
}

function applyTranslations() {
  const el = (id) => document.getElementById(id);
  if (el('pinSubtitle')) el('pinSubtitle').textContent = t.pin_subtitle;
  if (el('btnLocal')) el('btnLocal').textContent = t.local;
  if (el('btnTakeout')) el('btnTakeout').textContent = t.takeout;
  if (el('btnDelivery')) el('btnDelivery').textContent = t.delivery;
  if (el('tableInput')) el('tableInput').placeholder = t.table;
  if (el('phoneInput')) el('phoneInput').placeholder = t.phone;
  if (el('notesInput')) el('notesInput').placeholder = t.notes;
  if (el('cartTitle')) el('cartTitle').textContent = t.cart_title;
  if (el('checkoutLabel')) el('checkoutLabel').textContent = t.order_details;
  if (el('newOrderBtn')) el('newOrderBtn').textContent = t.new_order;
  updateSubmitBtn();
}

// ── State ─────────────────────────────────────────────────────────────────────
let menu = { categories: [], items: [] };
let cart = []; // { menu_item_id, name, price, quantity }
let currentCategoryId = null;
let orderType = 'local';
let sessionToken = null;

// ── PIN logic ─────────────────────────────────────────────────────────────────
let pinBuffer = '';
const STORAGE_KEY = 'ffm_session_v' + PIN_VERSION;

function checkStoredSession() {
  if (!PIN_ENABLED) { bootApp(); return; }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) { sessionToken = stored; bootApp(); return; }
  document.getElementById('pinScreen').style.display = 'flex';
  document.getElementById('pinSubtitle').textContent = t.pin_subtitle;
}

function numPress(val) {
  if (val === 'del') { pinBuffer = pinBuffer.slice(0, -1); }
  else if (pinBuffer.length < 4) { pinBuffer += val; }
  for (let i = 0; i < 4; i++)
    document.getElementById('d' + i).classList.toggle('filled', i < pinBuffer.length);
  if (pinBuffer.length === 4) submitPin();
}

async function submitPin() {
  if (pinBuffer.length !== 4) return;
  const pin = pinBuffer; pinBuffer = '';
  for (let i = 0; i < 4; i++) document.getElementById('d' + i).classList.remove('filled');
  try {
    const r = await fetch('/api/pin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await r.json();
    if (data.ok) {
      sessionToken = data.token;
      localStorage.setItem(STORAGE_KEY, sessionToken);
      Object.keys(localStorage).filter(k => k.startsWith('ffm_session_') && k !== STORAGE_KEY).forEach(k => localStorage.removeItem(k));
      document.getElementById('pinScreen').style.display = 'none';
      bootApp();
    } else {
      document.getElementById('pinError').textContent = t.pin_wrong;
      setTimeout(() => { document.getElementById('pinError').textContent = ''; }, 2000);
    }
  } catch {
    document.getElementById('pinError').textContent = t.err_network;
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
async function bootApp() {
  document.getElementById('app').style.display = 'block';
  updateLangBtns();
  applyTranslations();
  try {
    const r = await fetch('/api/menu');
    menu = await r.json();
  } catch { menu = { categories: [], items: [] }; }
  showCategories();
}

// ── Navigation ───────────────────────────────────────────────────────────────
function showCategories() {
  currentCategoryId = null;
  document.getElementById('categoryView').style.display = '';
  document.getElementById('itemsView').classList.remove('active');
  document.getElementById('backBtn').style.display = 'none';
  document.getElementById('topbarTitle').textContent = 'FFM Orders';
  renderCats();
}

function showItems(catId) {
  currentCategoryId = catId;
  const cat = menu.categories.find(c => c.id === catId);
  document.getElementById('categoryView').style.display = 'none';
  document.getElementById('itemsView').classList.add('active');
  document.getElementById('backBtn').style.display = '';
  const catName = cat ? ((cat.icon ? cat.icon + ' ' : '') + getName(cat)) : '';
  document.getElementById('topbarTitle').textContent = catName;
  renderItems(catId);
}

// ── Name helper ───────────────────────────────────────────────────────────────
function getName(item) {
  if (currentLang === 'ar' && item.name_ar) return item.name_ar;
  if (currentLang === 'fr' && item.name_fr) return item.name_fr;
  return item.name;
}

// ── Render categories ─────────────────────────────────────────────────────────
function renderCats() {
  const view = document.getElementById('categoryView');
  view.innerHTML = '';
  menu.categories.forEach(c => {
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.onclick = () => showItems(c.id);
    card.innerHTML = \`
      <div class="cat-icon">\${c.icon || '🍽'}</div>
      <div class="cat-name">\${getName(c)}</div>
    \`;
    view.appendChild(card);
  });
}

// ── Render items (full list, called once per category) ────────────────────────
function renderItems(catId) {
  const container = document.getElementById('itemsListInner');
  container.innerHTML = '';
  const items = menu.items.filter(i => i.category_id === catId && i.is_active);
  items.forEach(item => {
    const inCart = cart.find(c => c.menu_item_id === item.id);
    const qty = inCart ? inCart.quantity : 0;
    const row = document.createElement('div');
    row.className = 'item-row' + (qty > 0 ? ' in-cart' : '');
    row.id = 'item-' + item.id;
    const emojiChar = item.emoji || '';
    row.innerHTML = \`
      <div class="item-emoji-sm">\${emojiChar || '·'}</div>
      <div class="item-info">
        <div class="item-name-text">\${getName(item)}</div>
        <div class="item-price-text">\${item.price.toFixed(2)} DA</div>
      </div>
      <div class="item-actions">
        <span class="item-qty-label" id="qty-\${item.id}">\${qty > 0 ? qty + '×' : ''}</span>
        <button class="item-add-btn" onclick="addToCart(\${item.id})">+</button>
        <button class="item-remove-btn" onclick="removeFromCart(\${item.id})">✕</button>
      </div>
    \`;
    container.appendChild(row);
  });
}

// ── Update a single item row (no full re-render, prevents freezing) ───────────
function updateItemRow(itemId) {
  const row = document.getElementById('item-' + itemId);
  if (!row) return;
  const inCart = cart.find(c => c.menu_item_id === itemId);
  const qty = inCart ? inCart.quantity : 0;
  row.classList.toggle('in-cart', qty > 0);
  const label = document.getElementById('qty-' + itemId);
  if (label) label.textContent = qty > 0 ? qty + '×' : '';
}

// ── Cart operations ───────────────────────────────────────────────────────────
function addToCart(itemId) {
  const item = menu.items.find(i => i.id === itemId);
  if (!item) return;
  const existing = cart.find(c => c.menu_item_id === itemId);
  if (existing) { existing.quantity++; }
  else { cart.push({ menu_item_id: itemId, name: getName(item), price: item.price, quantity: 1 }); }
  updateItemRow(itemId);
  updateCartBadge();
}

function removeFromCart(itemId) {
  const idx = cart.findIndex(c => c.menu_item_id === itemId);
  if (idx === -1) return;
  cart.splice(idx, 1);
  updateItemRow(itemId);
  updateCartBadge();
}

function updateCartQty(itemId, delta) {
  const idx = cart.findIndex(c => c.menu_item_id === itemId);
  if (idx === -1) return;
  cart[idx].quantity += delta;
  if (cart[idx].quantity <= 0) cart.splice(idx, 1);
  renderCartContents(); // re-render cart sheet (we're inside it already)
  updateItemRow(itemId);
  updateCartBadge();
}

function updateCartBadge() {
  const total = cart.reduce((s, c) => s + c.quantity, 0);
  document.getElementById('cartCount').textContent = total;
  updateSubmitBtn();
}

function updateSubmitBtn() {
  const total = cart.reduce((s, c) => s + c.quantity, 0);
  const btn = document.getElementById('submitBtn');
  if (btn) btn.textContent = t.order_btn(total);
}

// ── Cart sheet ────────────────────────────────────────────────────────────────
function openCart() {
  renderCartContents();
  document.getElementById('cartOverlay').classList.add('open');
}

function closeCart() {
  document.getElementById('cartOverlay').classList.remove('open');
}

function renderCartContents() {
  const container = document.getElementById('cartItemsContainer');
  const checkout = document.getElementById('checkoutSection');
  container.innerHTML = '';
  if (cart.length === 0) {
    container.innerHTML = '<div class="cart-empty">' + t.err_cart + '</div>';
    checkout.style.display = 'none';
    return;
  }
  cart.forEach(c => {
    const row = document.createElement('div');
    row.className = 'cart-item-row';
    row.innerHTML = \`
      <span class="cart-item-name">\${c.name}</span>
      <div class="qty-ctrl">
        <button class="qty-btn minus" onclick="updateCartQty(\${c.menu_item_id},-1)">−</button>
        <span class="qty-num">\${c.quantity}</span>
        <button class="qty-btn plus" onclick="updateCartQty(\${c.menu_item_id},1)">+</button>
      </div>
      <span class="cart-item-price">\${(c.price * c.quantity).toFixed(2)}</span>
    \`;
    container.appendChild(row);
  });
  const grandTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const totalRow = document.createElement('div');
  totalRow.className = 'cart-total-row';
  totalRow.textContent = t.total + ': ' + grandTotal.toFixed(2) + ' DA';
  container.appendChild(totalRow);
  checkout.style.display = '';
  updateSubmitBtn();
}

// ── Order type ────────────────────────────────────────────────────────────────
function setType(type) {
  orderType = type;
  ['local','takeout','delivery'].forEach(tp => {
    const id = 'btn' + tp.charAt(0).toUpperCase() + tp.slice(1);
    document.getElementById(id).classList.toggle('active', tp === type);
  });
  document.getElementById('tableInput').style.display = type === 'local' ? 'block' : 'none';
  document.getElementById('phoneInput').style.display = type === 'delivery' ? 'block' : 'none';
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function placeOrder() {
  if (cart.length === 0) { alert(t.err_cart); return; }
  const tableVal = document.getElementById('tableInput').value.trim();
  const phoneVal = document.getElementById('phoneInput').value.trim();
  if (orderType === 'local' && !tableVal) { alert(t.err_table); return; }
  if (orderType === 'delivery' && !phoneVal) { alert(t.err_phone); return; }

  const payload = {
    order_type: orderType,
    table_number: orderType === 'local' ? tableVal : null,
    customer_phone: orderType === 'delivery' ? phoneVal : null,
    notes: document.getElementById('notesInput').value.trim() || null,
    items: cart.map(c => ({ menu_item_id: c.menu_item_id, quantity: c.quantity, unit_price: c.price }))
  };

  const btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = '...';

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = 'Bearer ' + sessionToken;
    const r = await fetch('/api/order', { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = await r.json();
    if (r.status === 401) {
      localStorage.removeItem(STORAGE_KEY); sessionToken = null;
      document.getElementById('app').style.display = 'none';
      document.getElementById('cartOverlay').classList.remove('open');
      document.getElementById('pinScreen').style.display = 'flex';
      document.getElementById('pinSubtitle').textContent = t.pin_subtitle;
      btn.disabled = false; updateSubmitBtn(); return;
    }
    if (data.ok) {
      closeCart();
      showConfirm(data.order_number);
    } else {
      alert(data.error || t.err_unknown);
      btn.disabled = false; updateSubmitBtn();
    }
  } catch {
    alert(t.err_network);
    btn.disabled = false; updateSubmitBtn();
  }
}

function showConfirm(orderNum) {
  document.getElementById('confirmNum').textContent = t.confirm_title(orderNum);
  document.getElementById('confirmMsg').textContent = t.confirm_msg;
  document.getElementById('newOrderBtn').textContent = t.new_order;
  document.getElementById('confirmScreen').classList.add('show');
}

function resetOrder() {
  cart = [];
  document.getElementById('tableInput').value = '';
  document.getElementById('phoneInput').value = '';
  document.getElementById('notesInput').value = '';
  document.getElementById('confirmScreen').classList.remove('show');
  const btn = document.getElementById('submitBtn');
  if (btn) { btn.disabled = false; }
  updateCartBadge();
  showCategories();
}

// ── Start ─────────────────────────────────────────────────────────────────────
checkStoredSession();
</script>
</body>
</html>`
}
