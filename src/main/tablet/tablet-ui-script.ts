/**
 * Waiter page — core: config, i18n, theme, PIN, API helper, menu (chips + tiles), toast and the
 * click dispatcher. Plain ES5 inside String.raw (never use a dollar-brace or backticks here); the
 * three script parts share one closure (see tablet-ui.ts). Sheet + cart parts define the
 * functions referenced below (openSheet, addSimple, renderCart, ...).
 */
export const TABLET_CORE_SCRIPT = String.raw`
var C = window.TABLET_CONFIG;
function $(id) { return document.getElementById(id); }
var store = {
  get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } }
};
if (store.get('ffm_app_lang') !== C.lang) { store.del('ffm_lang'); store.set('ffm_app_lang', C.lang); }
var lang = store.get('ffm_lang') || C.lang;
if (!C.strings[lang]) lang = 'en';
var TOKEN_KEY = 'ffm_session_v' + C.pinVersion;
var token = C.pinEnabled ? store.get(TOKEN_KEY) : null;
var menu = { categories: [], items: [] }, byId = {}, catById = {}, currency = 'DA';
var activeCat = null, query = '', menuFailed = false;

function fmt(s, v) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] != null ? v[k] : m; }); }
function t(key, v) { var L = C.strings[lang] || C.strings.en; return fmt(L[key] != null ? L[key] : (C.strings.en[key] || key), v); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function nameOf(o) {
  if (!o) return '';
  if (lang === 'ar' && o.name_ar) return o.name_ar;
  if (lang === 'fr' && o.name_fr) return o.name_fr;
  return o.name || '';
}
function num(n) {
  var v = Math.round(Number(n || 0) * 100) / 100, neg = v < 0;
  v = Math.abs(v);
  var parts = (v % 1 === 0 ? String(v) : v.toFixed(2)).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '−' : '') + parts.join('.');
}
function money(n) { return '<bdi class="money">' + num(n) + ' <small>' + esc(currency) + '</small></bdi>'; }
function catVar(catId) { var c = catById[catId]; return 'var(--cat-' + (c && c.color ? c.color : 10) + ')'; }
function artOf(item) { return item.emoji ? esc(item.emoji) : '<em>' + esc(nameOf(item).charAt(0).toUpperCase() || '?') + '</em>'; }
function cleanError(msg) { return String(msg || '').replace(/^(Error|DomainError|CashError):\s*/, ''); }

// ── theme + language ─────────────────────────────────────────────────────────
function isDark() {
  var mode = store.get('ffm_tablet_theme');
  if (mode) return mode === 'dark';
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
function applyTheme() {
  var dark = isDark();
  document.documentElement.classList.toggle('dark', dark);
  $('themeBtn').textContent = dark ? '☀' : '☾';
  var meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', dark ? '#141110' : '#faf7f2');
}
function applyLang() {
  var root = document.documentElement;
  root.lang = lang; root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  var i, els = document.querySelectorAll('[data-t]');
  for (i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-t'));
  els = document.querySelectorAll('[data-tp]');
  for (i = 0; i < els.length; i++) els[i].setAttribute('placeholder', t(els[i].getAttribute('data-tp')));
  els = document.querySelectorAll('[data-ta]');
  for (i = 0; i < els.length; i++) els[i].setAttribute('aria-label', t(els[i].getAttribute('data-ta')));
  els = document.querySelectorAll('#langSeg button');
  for (i = 0; i < els.length; i++) els[i].setAttribute('aria-pressed', String(els[i].getAttribute('data-lang') === lang));
}
function setLang(l) {
  if (!C.strings[l]) return;
  lang = l; store.set('ffm_lang', l);
  applyLang(); renderChips(); renderGrid(); renderCart();
  if (sheet) renderSheet();
  if (!$('recentSheet').hidden) renderRecent();
}

// ── API ──────────────────────────────────────────────────────────────────────
function api(method, path, body) {
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  return fetch(path, { method: method, headers: headers, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) })
    .then(function (r) {
      return r.text().then(function (text) {
        var data = null;
        try { data = JSON.parse(text); } catch (e) { data = null; }
        if (r.status === 401 && C.pinEnabled) sessionExpired();
        return { status: r.status, ok: r.ok, data: data || {} };
      });
    });
}

// ── PIN ──────────────────────────────────────────────────────────────────────
var pinBuf = '';
function buildPad() {
  var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'], html = '';
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    html += '<button class="tap' + (k === 'ok' ? ' go' : '') + '" data-act="pin" data-k="' + k + '">' +
      (k === 'del' ? '⌫' : k === 'ok' ? '✓' : k) + '</button>';
  }
  $('pad').innerHTML = html;
}
function showPin(message) {
  $('app').hidden = true; $('pin').hidden = false; pinBuf = ''; paintPin();
  $('pinErr').textContent = message || '';
}
function paintPin() {
  var dots = $('pinDots').children;
  for (var i = 0; i < dots.length; i++) dots[i].className = i < pinBuf.length ? 'on' : '';
}
function pinKey(k) {
  if (k === 'del') pinBuf = pinBuf.slice(0, -1);
  else if (k === 'ok') { submitPin(); return; }
  else if (pinBuf.length < 4) pinBuf += k;
  paintPin();
  if (pinBuf.length === 4) submitPin();
}
function submitPin() {
  if (pinBuf.length !== 4) return;
  var pin = pinBuf; pinBuf = ''; paintPin();
  api('POST', '/api/pin', { pin: pin }).then(function (r) {
    if (r.data.ok && r.data.token) {
      token = r.data.token; store.set(TOKEN_KEY, token);
      $('pin').hidden = true; boot();
    } else { $('pinErr').textContent = t('pin_wrong'); }
  }).catch(function () { $('pinErr').textContent = t('err_network'); });
}
function sessionExpired() {
  token = null; store.del(TOKEN_KEY);
  closeAllLayers();
  showPin(t('session_expired'));
}

// ── menu ─────────────────────────────────────────────────────────────────────
function itemOff(item) {
  if (Number(item.sold_out) === 1 || item.sold_out === true) return 'sold_out';
  if (item.available_now === false || item.available_now === 0) return 'unavailable';
  return '';
}
/** Per-channel price when the menu read carries one (dine-in / takeout / delivery), else the menu price. */
function priceFor(item) {
  var cp = item && item.channel_prices, keys = orderType === 'local' ? ['local', 'dine_in', 'dinein', 'table']
    : orderType === 'takeout' ? ['takeout', 'takeaway', 'pickup'] : ['delivery'];
  if (cp && typeof cp === 'object') {
    var i, k, v;
    if (Object.prototype.toString.call(cp) === '[object Array]') {
      for (i = 0; i < cp.length; i++) {
        k = String(cp[i] && (cp[i].channel || cp[i].key) || '').toLowerCase(); v = Number(cp[i] && cp[i].price);
        if (keys.indexOf(k) >= 0 && isFinite(v) && cp[i].price !== null) return v;
      }
    } else {
      for (i = 0; i < keys.length; i++) { v = cp[keys[i]]; if (v !== null && v !== undefined && isFinite(Number(v))) return Number(v); }
    }
  }
  return Number(item && item.price) || 0;
}
function loadMenu() {
  $('grid').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  return api('GET', '/api/menu').then(function (r) {
    if (!r.ok) throw new Error('menu');
    menu = { categories: r.data.categories || [], items: r.data.items || [] };
    currency = r.data.currency || 'DA';
    byId = {}; catById = {};
    var i;
    for (i = 0; i < menu.items.length; i++) byId[menu.items[i].id] = menu.items[i];
    for (i = 0; i < menu.categories.length; i++) catById[menu.categories[i].id] = menu.categories[i];
    menu.categories = menu.categories.filter(function (c) { return menu.items.some(function (it) { return it.category_id === c.id; }); });
    if (!activeCat || !catById[activeCat]) activeCat = menu.categories.length ? menu.categories[0].id : null;
    menuFailed = false;
  }).catch(function () { menuFailed = true; }).then(function () { renderChips(); renderGrid(); renderCart(); });
}
function renderChips() {
  var html = '';
  for (var i = 0; i < menu.categories.length; i++) {
    var c = menu.categories[i];
    html += '<button class="chip tap" role="tab" data-act="cat" data-id="' + c.id + '" aria-pressed="' + String(!query && c.id === activeCat) +
      '" style="--cat:var(--cat-' + (c.color || 10) + ')"><i></i>' + (c.icon ? esc(c.icon) + ' ' : '') + esc(nameOf(c)) + '</button>';
  }
  $('chips').innerHTML = html;
}
function matches(item, q) {
  return [item.name, item.name_ar, item.name_fr].some(function (n) { return n && String(n).toLowerCase().indexOf(q) >= 0; });
}
function qtyInCart(id) {
  var n = 0;
  for (var i = 0; i < cart.length; i++) if (cart[i].id === id) n += cart[i].qty;
  return n;
}
function tileHtml(item) {
  var off = itemOff(item), q = qtyInCart(item.id);
  var tag = Number(item.is_combo) === 1 ? '<span class="tag combo">' + esc(t('tag_combo')) + '</span>'
    : item.has_modifiers ? '<span class="tag">' + esc(t('tag_options')) + '</span>' : '';
  return '<button class="tile tap" data-act="item" data-id="' + item.id + '" style="--cat:' + catVar(item.category_id) + '"' +
    (off ? ' aria-disabled="true"' : '') + '>' +
    '<div class="art">' + artOf(item) + '</div>' +
    (off ? '<span class="off">' + esc(t(off)) + '</span>' : '') +
    (q > 0 ? '<span class="qty" id="q' + item.id + '">×' + q + '</span>' : '') +
    '<div class="body"><div class="nm">' + esc(nameOf(item)) + '</div><div class="row"><span class="pr">' + money(priceFor(item)) +
    '</span>' + tag + '</div></div></button>';
}
function renderGrid() {
  var empty = $('menuEmpty'), grid = $('grid');
  if (menuFailed) {
    grid.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = '<div class="empty"><div class="ic">📡</div><b>' + esc(t('menu_error')) +
      '</b><button class="btn soft tap" data-act="reload">' + esc(t('retry')) + '</button></div>';
    return;
  }
  var q = query.toLowerCase();
  var list = menu.items.filter(function (it) { return q ? matches(it, q) : it.category_id === activeCat; });
  grid.innerHTML = list.map(tileHtml).join('');
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.innerHTML = '<div class="empty"><div class="ic">🍽️</div><b>' +
      esc(q ? t('no_results', { q: query }) : t('menu_empty')) + '</b></div>';
  }
}
function refreshTile(id) {
  var el = document.querySelector('.tile[data-id="' + id + '"]');
  var item = byId[id];
  if (!el || !item) return;
  var wrap = document.createElement('div');
  wrap.innerHTML = tileHtml(item);
  var fresh = wrap.firstChild;
  el.parentNode.replaceChild(fresh, el);
  var badge = fresh.querySelector('.qty');
  if (badge) badge.className = 'qty bump';
}
function tapItem(id) {
  var item = byId[id];
  if (!item) return;
  var off = itemOff(item);
  if (off) { toast(t(off === 'sold_out' ? 'sold_out_toast' : 'unavailable_toast', { item: nameOf(item) })); return; }
  if (Number(item.is_combo) === 1 || item.has_modifiers) openSheet(item, null);
  else addSimple(item);
}

// ── toast ────────────────────────────────────────────────────────────────────
var toastTimer = null, toastAction = null;
function toast(message, actionLabel, action) {
  $('toastText').textContent = message;
  var btn = $('toastBtn');
  toastAction = action || null;
  btn.hidden = !action; btn.textContent = actionLabel || '';
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { $('toast').hidden = true; toastAction = null; }, action ? 5000 : 3200);
}

// ── layers + dispatcher ──────────────────────────────────────────────────────
function syncScrim() {
  var open = !$('sheet').hidden || !$('recentSheet').hidden || ($('cart').className.indexOf('open') >= 0 && window.innerWidth < 900);
  $('scrim').hidden = !open;
}
function closeAllLayers() { closeSheet(); closeRecent(); closeCart(); }
function onClick(e) {
  var el = e.target;
  while (el && el !== document && !(el.getAttribute && el.getAttribute('data-act'))) el = el.parentNode;
  if (!el || el === document) return;
  var act = el.getAttribute('data-act'), id = Number(el.getAttribute('data-id'));
  switch (act) {
    case 'pin': pinKey(el.getAttribute('data-k')); break;
    case 'lang': setLang(el.getAttribute('data-lang')); break;
    case 'theme': store.set('ffm_tablet_theme', isDark() ? 'light' : 'dark'); applyTheme(); break;
    case 'cat': activeCat = id; query = ''; $('search').value = ''; renderChips(); renderGrid(); $('menu').scrollTop = 0; break;
    case 'item': tapItem(id); break;
    case 'reload': loadMenu(); break;
    case 'scrim': if (!$('sheet').hidden) closeSheet(); else if (!$('recentSheet').hidden) closeRecent(); else closeCart(); break;
    default: if (!sheetAction(act, el) && !cartAction(act, el)) return;
  }
}
function boot() {
  $('app').hidden = false;
  applyLang(); applyTheme();
  restoreCart();
  loadMenu();
  startStatusPolling();
}
function start() {
  document.addEventListener('click', onClick);
  $('toastBtn').addEventListener('click', function () { var a = toastAction; $('toast').hidden = true; toastAction = null; if (a) a(); });
  $('search').addEventListener('input', function () { query = this.value.trim(); renderChips(); renderGrid(); });
  bindCartFields();
  buildPad(); applyLang(); applyTheme();
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', applyTheme);
  }
  window.addEventListener('resize', syncScrim);
  if (C.pinEnabled && !token) showPin(''); else boot();
}
`
