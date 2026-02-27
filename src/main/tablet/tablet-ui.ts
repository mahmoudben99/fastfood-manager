export function getTabletHTML(lang: string, pinEnabled: boolean, pinVersion: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="${lang === 'ar' ? 'ar' : 'fr'}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>FFM Orders</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body { height: 100%; font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; color: #1a1a1a; }

    /* ── Top bar ── */
    .topbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      background: #1a1a1a; color: #fff; display: flex; align-items: center;
      justify-content: space-between; padding: 0 16px; height: 54px;
    }
    .topbar-title { font-weight: 700; font-size: 17px; display: flex; align-items: center; gap: 8px; }
    .cart-btn {
      background: #f97316; border: none; color: #fff; border-radius: 20px;
      padding: 7px 14px; font-size: 14px; font-weight: 600; cursor: pointer;
      display: flex; align-items: center; gap: 6px; position: relative;
    }
    .cart-badge {
      background: #fff; color: #f97316; border-radius: 50%;
      width: 20px; height: 20px; font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Categories ── */
    .cats {
      position: fixed; top: 54px; left: 0; right: 0; z-index: 90;
      background: #fff; border-bottom: 1px solid #e5e5e5;
      display: flex; overflow-x: auto; gap: 4px; padding: 8px 12px;
      scrollbar-width: none;
    }
    .cats::-webkit-scrollbar { display: none; }
    .cat-btn {
      flex-shrink: 0; border: 1.5px solid #e5e5e5; background: #fff;
      border-radius: 20px; padding: 6px 14px; font-size: 13px; font-weight: 500;
      cursor: pointer; white-space: nowrap; transition: all .15s;
    }
    .cat-btn.active { background: #f97316; border-color: #f97316; color: #fff; }

    /* ── Items grid ── */
    .items-area {
      margin-top: 110px; padding: 12px; margin-bottom: 200px;
      display: grid; gap: 10px;
      grid-template-columns: repeat(2, 1fr);
    }
    @media (min-width: 600px)  { .items-area { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 900px)  { .items-area { grid-template-columns: repeat(4, 1fr); } }
    @media (min-width: 1200px) { .items-area { grid-template-columns: repeat(5, 1fr); } }

    .item-card {
      background: #fff; border-radius: 12px; overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,.08); cursor: pointer;
      transition: transform .1s, box-shadow .1s; position: relative;
      border: 2px solid transparent;
    }
    .item-card:active { transform: scale(.97); }
    .item-card.in-cart { border-color: #f97316; }
    .item-img {
      width: 100%; aspect-ratio: 1; object-fit: cover; background: #fafafa;
      display: flex; align-items: center; justify-content: center; font-size: 48px;
    }
    .item-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .item-info { padding: 8px 10px 10px; }
    .item-name { font-size: 13px; font-weight: 600; line-height: 1.3; margin-bottom: 4px; }
    .item-name-sub { font-size: 11px; color: #888; margin-bottom: 4px; }
    .item-price { font-size: 14px; font-weight: 700; color: #f97316; }
    .item-qty-badge {
      position: absolute; top: 6px; right: 6px;
      background: #f97316; color: #fff; border-radius: 50%;
      width: 24px; height: 24px; font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Bottom panel ── */
    .bottom-panel {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
      background: #fff; border-top: 1px solid #e5e5e5;
      padding: 12px 16px 16px;
    }
    .order-meta { display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
    .type-btns { display: flex; gap: 6px; }
    .type-btn {
      border: 1.5px solid #e5e5e5; background: #fff; border-radius: 8px;
      padding: 7px 12px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all .15s;
    }
    .type-btn.active { background: #1a1a1a; border-color: #1a1a1a; color: #fff; }
    .meta-input {
      flex: 1; min-width: 120px; border: 1.5px solid #e5e5e5; border-radius: 8px;
      padding: 7px 10px; font-size: 13px; outline: none;
    }
    .meta-input:focus { border-color: #f97316; }
    .notes-row { margin-bottom: 10px; }
    .notes-input {
      width: 100%; border: 1.5px solid #e5e5e5; border-radius: 8px;
      padding: 8px 10px; font-size: 13px; outline: none; resize: none; height: 38px;
    }
    .notes-input:focus { border-color: #f97316; }
    .submit-btn {
      width: 100%; background: #f97316; border: none; color: #fff;
      border-radius: 10px; padding: 14px; font-size: 16px; font-weight: 700;
      cursor: pointer; transition: background .15s;
    }
    .submit-btn:disabled { background: #ccc; cursor: not-allowed; }
    .submit-btn:not(:disabled):active { background: #ea6c00; }

    /* ── Cart sheet ── */
    .cart-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 200;
      display: none; align-items: flex-end;
    }
    .cart-overlay.open { display: flex; }
    .cart-sheet {
      width: 100%; max-height: 80vh; background: #fff;
      border-radius: 16px 16px 0 0; overflow-y: auto; padding: 16px;
    }
    .cart-header { font-size: 17px; font-weight: 700; margin-bottom: 12px; display: flex; justify-content: space-between; }
    .cart-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .cart-item-name { flex: 1; font-size: 14px; }
    .cart-item-price { font-size: 14px; color: #f97316; font-weight: 600; min-width: 60px; text-align: right; }
    .qty-ctrl { display: flex; align-items: center; gap: 8px; }
    .qty-btn {
      width: 28px; height: 28px; border-radius: 50%; border: none;
      font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .qty-btn.minus { background: #f5f5f5; color: #888; }
    .qty-btn.plus  { background: #f97316; color: #fff; }
    .qty-num { font-size: 15px; font-weight: 700; min-width: 20px; text-align: center; }
    .cart-total { margin-top: 12px; font-size: 16px; font-weight: 700; text-align: right; }
    .close-btn { background: none; border: none; font-size: 22px; cursor: pointer; color: #888; }

    /* ── PIN screen ── */
    .pin-screen {
      position: fixed; inset: 0; background: #1a1a1a; z-index: 500;
      display: flex; align-items: center; justify-content: center;
    }
    .pin-box { text-align: center; color: #fff; padding: 24px; max-width: 320px; width: 100%; }
    .pin-title { font-size: 28px; margin-bottom: 6px; }
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
      gap: 20px; padding: 32px; text-align: center;
    }
    .confirm-screen.show { display: flex; }
    .confirm-icon { font-size: 72px; }
    .confirm-num { font-size: 28px; font-weight: 800; color: #f97316; }
    .confirm-msg { font-size: 18px; color: #555; }
    .new-order-btn {
      background: #f97316; border: none; color: #fff; border-radius: 10px;
      padding: 14px 32px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 10px;
    }
  </style>
</head>
<body>

<!-- PIN screen -->
<div class="pin-screen" id="pinScreen" style="display:none">
  <div class="pin-box">
    <div class="pin-title">🍔 FFM</div>
    <div class="pin-subtitle" id="pinSubtitle">Entrez votre PIN</div>
    <div class="pin-dots" id="pinDots">
      <div class="pin-dot" id="d0"></div>
      <div class="pin-dot" id="d1"></div>
      <div class="pin-dot" id="d2"></div>
      <div class="pin-dot" id="d3"></div>
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
    <div class="topbar-title">🍔 FFM</div>
    <button class="cart-btn" onclick="openCart()">
      🛒 <span id="cartCount">0</span>
    </button>
  </div>

  <div class="cats" id="catsBar"></div>

  <div class="items-area" id="itemsGrid"></div>

  <div class="bottom-panel">
    <div class="order-meta">
      <div class="type-btns" id="typeBtns">
        <button class="type-btn active" onclick="setType('local')" id="btnLocal">🍽 Local</button>
        <button class="type-btn" onclick="setType('takeout')" id="btnTakeout">🥡 Emporter</button>
        <button class="type-btn" onclick="setType('delivery')" id="btnDelivery">🛵 Livraison</button>
      </div>
      <input class="meta-input" id="tableInput" type="text" inputmode="numeric" placeholder="Table #" />
      <input class="meta-input" id="phoneInput" type="tel" placeholder="Téléphone" style="display:none" />
    </div>
    <div class="notes-row">
      <input class="notes-input" id="notesInput" type="text" placeholder="Notes..." />
    </div>
    <button class="submit-btn" id="submitBtn" onclick="placeOrder()">Commander</button>
  </div>
</div>

<!-- Cart sheet -->
<div class="cart-overlay" id="cartOverlay" onclick="closeCart()">
  <div class="cart-sheet" onclick="event.stopPropagation()">
    <div class="cart-header">
      <span>🛒 Panier</span>
      <button class="close-btn" onclick="closeCart()">✕</button>
    </div>
    <div id="cartItems"></div>
    <div class="cart-total" id="cartTotal"></div>
  </div>
</div>

<!-- Confirmation screen -->
<div class="confirm-screen" id="confirmScreen">
  <div class="confirm-icon">✅</div>
  <div class="confirm-num" id="confirmNum"></div>
  <div class="confirm-msg" id="confirmMsg">Commande envoyée en cuisine !</div>
  <button class="new-order-btn" onclick="resetOrder()">Nouvelle commande</button>
</div>

<script>
const PIN_ENABLED = ${pinEnabled};
const PIN_VERSION = '${pinVersion}';
const LANG = '${lang}';

// ── i18n ──────────────────────────────────────────────────────────────────────
const T = {
  fr: {
    pin_subtitle: 'Entrez votre PIN',
    pin_wrong: 'PIN incorrect. Réessayez.',
    local: '🍽 Local', takeout: '🥡 Emporter', delivery: '🛵 Livraison',
    table: 'Table #', phone: 'Téléphone', notes: 'Notes...',
    order_btn: (n) => n > 0 ? \`Commander (\${n} articles)\` : 'Commander',
    cart_title: '🛒 Panier', total: 'Total',
    confirm_title: (n) => \`Commande #\${n} reçue !\`,
    confirm_msg: 'Envoyée en cuisine !',
    new_order: 'Nouvelle commande',
    err_table: 'Veuillez entrer le numéro de table.',
    err_phone: 'Veuillez entrer le numéro de téléphone.',
    err_cart: 'Le panier est vide.',
    all: 'Tout',
  },
  ar: {
    pin_subtitle: 'أدخل رمز PIN',
    pin_wrong: 'الرمز غير صحيح. حاول مجدداً.',
    local: '🍽 محلي', takeout: '🥡 خارج', delivery: '🛵 توصيل',
    table: 'رقم الطاولة', phone: 'هاتف', notes: 'ملاحظات...',
    order_btn: (n) => n > 0 ? \`طلب (\${n} أصناف)\` : 'طلب',
    cart_title: '🛒 السلة', total: 'المجموع',
    confirm_title: (n) => \`تم استلام الطلب #\${n} !\`,
    confirm_msg: 'تم الإرسال إلى المطبخ !',
    new_order: 'طلب جديد',
    err_table: 'أدخل رقم الطاولة.',
    err_phone: 'أدخل رقم الهاتف.',
    err_cart: 'السلة فارغة.',
    all: 'الكل',
  }
};
const t = T[LANG] || T.fr;

// ── State ─────────────────────────────────────────────────────────────────────
let menu = { categories: [], items: [] };
let cart = []; // { menu_item_id, name, price, quantity }
let activeCategory = null;
let orderType = 'local';
let sessionToken = null;

// ── PIN logic ─────────────────────────────────────────────────────────────────
let pinBuffer = '';
const STORAGE_KEY = 'ffm_session_v' + PIN_VERSION;

function checkStoredSession() {
  if (!PIN_ENABLED) { bootApp(); return; }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) { sessionToken = stored; bootApp(); return; }
  showPin();
}

function showPin() {
  document.getElementById('pinSubtitle').textContent = t.pin_subtitle;
  document.getElementById('pinScreen').style.display = 'flex';
}

function numPress(val) {
  if (val === 'del') { pinBuffer = pinBuffer.slice(0, -1); }
  else if (pinBuffer.length < 4) { pinBuffer += val; }
  renderDots();
  if (pinBuffer.length === 4) submitPin();
}

function renderDots() {
  for (let i = 0; i < 4; i++) {
    document.getElementById('d' + i).classList.toggle('filled', i < pinBuffer.length);
  }
}

async function submitPin() {
  if (pinBuffer.length !== 4) return;
  const pin = pinBuffer;
  pinBuffer = '';
  renderDots();
  try {
    const r = await fetch('/api/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await r.json();
    if (data.ok) {
      sessionToken = data.token;
      localStorage.setItem(STORAGE_KEY, sessionToken);
      // Remove old version keys
      Object.keys(localStorage).filter(k => k.startsWith('ffm_session_')).forEach(k => {
        if (k !== STORAGE_KEY) localStorage.removeItem(k);
      });
      document.getElementById('pinScreen').style.display = 'none';
      bootApp();
    } else {
      document.getElementById('pinError').textContent = t.pin_wrong;
      setTimeout(() => { document.getElementById('pinError').textContent = ''; }, 2000);
    }
  } catch {
    document.getElementById('pinError').textContent = 'Erreur réseau.';
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function bootApp() {
  document.getElementById('app').style.display = 'block';
  const r = await fetch('/api/menu');
  menu = await r.json();
  renderCats();
  renderItems(null);
  updateSubmitBtn();
}

// ── Category filter ───────────────────────────────────────────────────────────
function getName(item) {
  if (LANG === 'ar' && item.name_ar) return item.name_ar;
  if (LANG === 'fr' && item.name_fr) return item.name_fr;
  return item.name;
}

function renderCats() {
  const bar = document.getElementById('catsBar');
  const all = document.createElement('button');
  all.className = 'cat-btn' + (activeCategory === null ? ' active' : '');
  all.textContent = t.all;
  all.onclick = () => filterCat(null);
  bar.appendChild(all);
  menu.categories.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn' + (activeCategory === c.id ? ' active' : '');
    btn.textContent = (c.icon ? c.icon + ' ' : '') + getName(c);
    btn.onclick = () => filterCat(c.id);
    bar.appendChild(btn);
  });
}

function filterCat(id) {
  activeCategory = id;
  document.querySelectorAll('.cat-btn').forEach((b, i) => {
    b.classList.toggle('active', i === 0 ? id === null : menu.categories[i-1]?.id === id);
  });
  renderItems(id);
}

function renderItems(catId) {
  const grid = document.getElementById('itemsGrid');
  grid.innerHTML = '';
  const items = catId === null ? menu.items : menu.items.filter(i => i.category_id === catId);
  items.forEach(item => {
    if (!item.is_active) return;
    const inCart = cart.find(c => c.menu_item_id === item.id);
    const qty = inCart ? inCart.quantity : 0;
    const card = document.createElement('div');
    card.className = 'item-card' + (qty > 0 ? ' in-cart' : '');
    card.id = 'card-' + item.id;
    card.onclick = () => addToCart(item);
    card.innerHTML = \`
      <div class="item-img">\${item.image_path
        ? \`<img src="/api/image/\${encodeURIComponent(item.image_path)}" onerror="this.parentElement.textContent='\${item.emoji||'🍽'}'"/>\`
        : (item.emoji || '🍽')
      }</div>
      <div class="item-info">
        <div class="item-name">\${getName(item)}</div>
        <div class="item-price">\${item.price.toFixed(2)} DA</div>
      </div>
      \${qty > 0 ? \`<div class="item-qty-badge">\${qty}</div>\` : ''}
    \`;
    grid.appendChild(card);
  });
}

// ── Cart ──────────────────────────────────────────────────────────────────────
function addToCart(item) {
  const existing = cart.find(c => c.menu_item_id === item.id);
  if (existing) { existing.quantity++; }
  else { cart.push({ menu_item_id: item.id, name: getName(item), price: item.price, quantity: 1 }); }
  updateUI();
}

function updateCart(itemId, delta) {
  const idx = cart.findIndex(c => c.menu_item_id === itemId);
  if (idx === -1) return;
  cart[idx].quantity += delta;
  if (cart[idx].quantity <= 0) cart.splice(idx, 1);
  updateUI();
  renderCartItems(); // refresh cart sheet
}

function updateUI() {
  const total = cart.reduce((s, c) => s + c.quantity, 0);
  document.getElementById('cartCount').textContent = total;
  updateSubmitBtn();
  // Refresh any visible cards
  renderItems(activeCategory);
}

function updateSubmitBtn() {
  const total = cart.reduce((s, c) => s + c.quantity, 0);
  document.getElementById('submitBtn').textContent = t.order_btn(total);
}

function openCart() {
  renderCartItems();
  document.getElementById('cartOverlay').classList.add('open');
}

function closeCart() {
  document.getElementById('cartOverlay').classList.remove('open');
}

function renderCartItems() {
  const container = document.getElementById('cartItems');
  container.innerHTML = '';
  if (cart.length === 0) { container.innerHTML = '<p style="color:#aaa;text-align:center;padding:16px">' + t.err_cart + '</p>'; return; }
  cart.forEach(c => {
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = \`
      <div class="cart-item-name">\${c.name}</div>
      <div class="qty-ctrl">
        <button class="qty-btn minus" onclick="updateCart(\${c.menu_item_id},-1)">−</button>
        <span class="qty-num">\${c.quantity}</span>
        <button class="qty-btn plus" onclick="updateCart(\${c.menu_item_id},1)">+</button>
      </div>
      <div class="cart-item-price">\${(c.price * c.quantity).toFixed(2)}</div>
    \`;
    container.appendChild(row);
  });
  const grandTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  document.getElementById('cartTotal').textContent = t.total + ': ' + grandTotal.toFixed(2) + ' DA';
}

// ── Order type ────────────────────────────────────────────────────────────────
function setType(type) {
  orderType = type;
  ['local','takeout','delivery'].forEach(t => {
    document.getElementById('btn' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === type);
  });
  document.getElementById('tableInput').style.display = type === 'local' ? '' : 'none';
  document.getElementById('phoneInput').style.display = type === 'delivery' ? '' : 'none';
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
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = 'Bearer ' + sessionToken;
    const r = await fetch('/api/order', { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = await r.json();
    if (r.status === 401) {
      // Session expired — show PIN again
      localStorage.removeItem(STORAGE_KEY);
      sessionToken = null;
      document.getElementById('app').style.display = 'none';
      showPin();
      return;
    }
    if (data.ok) {
      showConfirm(data.order_number);
    } else {
      alert('Erreur: ' + (data.error || 'Inconnue'));
      btn.disabled = false;
      updateSubmitBtn();
    }
  } catch {
    alert('Erreur réseau. Vérifiez la connexion.');
    btn.disabled = false;
    updateSubmitBtn();
  }
}

function showConfirm(orderNum) {
  document.getElementById('confirmNum').textContent = t.confirm_title(orderNum);
  document.getElementById('confirmMsg').textContent = t.confirm_msg;
  document.getElementById('confirmScreen').classList.add('show');
}

function resetOrder() {
  cart = [];
  document.getElementById('tableInput').value = '';
  document.getElementById('phoneInput').value = '';
  document.getElementById('notesInput').value = '';
  document.getElementById('confirmScreen').classList.remove('show');
  updateUI();
}

// ── Start ─────────────────────────────────────────────────────────────────────
checkStoredSession();
</script>
</body>
</html>`
}
