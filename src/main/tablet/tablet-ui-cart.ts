/**
 * Waiter page — order (cart), live quote, send, confirmation and "recent orders" with kitchen
 * status. Shares the closure of tablet-ui-script.ts (ES5, String.raw: never use a dollar-brace or
 * backticks here). The cart survives a page reload (localStorage) together with its request id, so
 * a retry after a network error can never create the order twice.
 */
export const TABLET_CART_SCRIPT = String.raw`
var cart = [], orderType = 'local', requestId = null, sending = false;
var quote = null, quoteErr = null, quoteSeq = 0, quoteTimer = null, quoting = false;
var recent = [];
var CART_KEY = 'ffm_tablet_cart', RECENT_KEY = 'ffm_tablet_recent';

function newRequestId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  var b = new Uint8Array(16), i;
  if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(b);
  else for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = ''; for (i = 0; i < 16; i++) h += (b[i] < 16 ? '0' : '') + b[i].toString(16);
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}
function field(id) { return $(id).value.trim(); }
function saveCart() {
  store.set(CART_KEY, JSON.stringify({ lines: cart, type: orderType, requestId: requestId, table: field('table'), phone: field('phone'),
    name: field('cname'), notes: field('notes') }));
}
function restoreCart() {
  try {
    var s = JSON.parse(store.get(CART_KEY) || 'null');
    if (s) {
      cart = s.lines || []; orderType = s.type || 'local'; requestId = s.requestId || null;
      $('table').value = s.table || ''; $('phone').value = s.phone || ''; $('cname').value = s.name || ''; $('notes').value = s.notes || '';
    }
  } catch (e) { cart = []; }
  try { recent = JSON.parse(store.get(RECENT_KEY) || '[]') || []; } catch (e) { recent = []; }
  var cutoff = Date.now() - 12 * 3600 * 1000;
  recent = recent.filter(function (r) { return r.at > cutoff; });
  scheduleQuote();
}
function lineKey(l) { return JSON.stringify([l.id, l.modifiers || null, l.children || null]); }
function cartChanged() { quote = null; saveCart(); renderCart(); scheduleQuote(); }
function addSimple(item) { putLine({ id: item.id, qty: 1, unit: priceFor(item), labels: { mods: [], picks: [] } }, null); }
function putLine(line, editIndex) {
  if (editIndex != null && cart[editIndex]) cart[editIndex] = line;
  else {
    var key = lineKey(line), hit = null;
    for (var i = 0; i < cart.length; i++) if (lineKey(cart[i]) === key) hit = cart[i];
    if (hit) hit.qty = Math.min(999, hit.qty + line.qty); else cart.push(line);
  }
  quoteErr = null; cartChanged(); refreshTile(line.id);
}
function changeQty(index, d) {
  var line = cart[index];
  if (!line) return;
  line.qty += d;
  if (line.qty <= 0) {
    var removed = cart.splice(index, 1)[0];
    toast(t('removed', { item: nameOf(byId[removed.id] || {}) }), t('undo'), function () {
      removed.qty = 1; cart.splice(Math.min(index, cart.length), 0, removed); cartChanged(); refreshTile(removed.id);
    });
  }
  quoteErr = null; cartChanged(); refreshTile(line.id);
}
function modText(m) {
  var n = esc(nameOf(m)), q = m.q > 1 ? ' <bdi dir="ltr">×' + m.q + '</bdi>' : '';
  if (m.kind === 'no') return '<span class="no">' + esc(t('no_prefix')) + ' ' + n + '</span>';
  if (m.kind === 'extra') return '+ ' + n + q;
  if (m.kind === 'light') return esc(t('light_prefix')) + ' ' + n + q;
  return n + q;
}
function subHtml(l) {
  var parts = [];
  if (l.labels && l.labels.mods.length) parts.push(l.labels.mods.map(modText).join(' · '));
  ((l.labels && l.labels.picks) || []).forEach(function (p) {
    parts.push('↳ ' + esc(nameOf(p)) + (p.mods && p.mods.length ? ' (' + p.mods.map(modText).join(' · ') + ')' : ''));
  });
  return parts.length ? '<div class="sub">' + parts.join('<br>') + '</div>' : '';
}
function unitsCount() { var n = 0; for (var i = 0; i < cart.length; i++) n += cart[i].qty; return n; }
function estimate() { var s = 0; for (var i = 0; i < cart.length; i++) s += cart[i].unit * cart[i].qty; return s; }
function lineTotal(l, i) { return quote && quote.lines && quote.lines[i] ? quote.lines[i].total : l.unit * l.qty; }
function grandTotal() { return quote ? quote.total : estimate(); }

function renderCart() {
  var units = unitsCount(), i, html = '';
  $('cartCount').textContent = units ? (units === 1 ? t('items_one') : t('items_n', { n: units })) : '';
  if (!cart.length) {
    html = '<div class="empty"><div class="ic">🧾</div><b>' + esc(t('cart_empty')) + '</b><span>' + esc(t('cart_empty_hint')) + '</span></div>';
  }
  for (i = 0; i < cart.length; i++) {
    var l = cart[i], item = byId[l.id] || {}, custom = !!(l.config || l.modifiers || l.children);
    var bad = quoteErr && quoteErr.line_index === i;
    html += '<div class="line' + (bad ? ' bad' : '') + '"><div class="step"><button data-act="dec" data-i="' + i + '" aria-label="-">−</button><span>' +
      l.qty + '</span><button data-act="inc" data-i="' + i + '" aria-label="+">+</button></div><div class="info"' +
      (custom ? ' role="button" tabindex="0" data-act="editLine" data-i="' + i + '"' : '') + '><div class="nm">' + esc(nameOf(item) || '#' + l.id) +
      '</div>' + subHtml(l) + (custom ? '<span class="chg">' + esc(t('edit')) + '</span>' : '') + '</div><div class="amt">' + money(lineTotal(l, i)) + '</div></div>';
  }
  $('lines').innerHTML = html;
  $('foot').hidden = !cart.length;
  var btns = document.querySelectorAll('#typeSeg button');
  for (i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', String(btns[i].getAttribute('data-type') === orderType));
  $('table').hidden = orderType !== 'local';
  $('phone').hidden = orderType !== 'delivery';
  $('cname').hidden = orderType === 'local';
  var tot = '';
  if (quote) {
    if (quote.discount > 0 || quote.delivery_fee > 0) tot += '<div class="r"><span>' + esc(t('subtotal')) + '</span>' + money(quote.subtotal) + '</div>';
    if (quote.discount > 0) {
      tot += '<div class="r promo"><span>' + esc(t('promo')) + (quote.discount_details ? ' · ' + esc(quote.discount_details.split(':')[0]) : '') +
        '</span>' + money(-quote.discount) + '</div>';
    }
    if (quote.delivery_fee > 0) tot += '<div class="r"><span>' + esc(t('delivery_fee')) + '</span>' + money(quote.delivery_fee) + '</div>';
  }
  tot += '<div class="r tot"><span>' + esc(t('total')) + '</span>' + money(grandTotal()) + '</div>';
  if (quoting && !quote) tot += '<div class="hint">' + esc(t('checking')) + '</div>';
  $('totals').innerHTML = tot;
  var err = $('cartErr');
  err.hidden = !quoteErr;
  if (quoteErr) err.textContent = quoteErr.text;
  var send = $('sendBtn');
  send.disabled = sending || !cart.length || !!(quoteErr && quoteErr.blocking);
  send.innerHTML = sending ? esc(t('sending')) : esc(t('send')) + (cart.length ? ' · ' + money(grandTotal()) : '');
  var bar = $('cartbar');
  bar.hidden = !cart.length;
  bar.innerHTML = '<span class="n">' + units + '</span><span class="go">' + esc(t('view_order')) + '</span>' + money(grandTotal());
}
function openCart() { $('cart').className = 'cart open'; syncScrim(); if (quoteErr && !quoteErr.local && cart.length) scheduleQuote(); }
function closeCart() { $('cart').className = 'cart'; syncScrim(); }

// ── quote (server dry run) ───────────────────────────────────────────────────
function payload() {
  return {
    order_type: orderType,
    table_number: orderType === 'local' ? field('table') || null : null,
    customer_phone: orderType === 'delivery' ? field('phone') || null : null,
    customer_name: orderType !== 'local' ? field('cname') || null : null,
    notes: field('notes') || null,
    items: cart.map(function (l) {
      var o = { menu_item_id: l.id, quantity: l.qty };
      if (l.modifiers) o.modifiers = l.modifiers;
      if (l.children) o.children = l.children;
      return o;
    })
  };
}
function describeError(data, status) {
  var msg = cleanError(data.message || data.error || '');
  if (data.code === 'no_open_shift' || /NO_OPEN_SHIFT/.test(msg)) return { text: t('err_no_shift'), blocking: false };
  var text = typeof data.line_index === 'number' && cart[data.line_index] && msg.indexOf('"') < 0 && msg.indexOf('«') < 0
    ? t('err_line', { n: data.line_index + 1, msg: msg }) : msg;
  return { text: t('err_prefix', { msg: text || String(status) }), blocking: data.code === 'inactive_item', line_index: data.line_index };
}
function scheduleQuote() {
  clearTimeout(quoteTimer);
  if (!cart.length) { quote = null; quoteErr = null; quoting = false; return; }
  quoting = true;
  quoteTimer = setTimeout(runQuote, 350);
}
function runQuote() {
  var seq = ++quoteSeq;
  api('POST', '/api/quote', payload()).then(function (r) {
    if (seq !== quoteSeq) return;
    quoting = false;
    if (r.status === 200 && r.data.ok) { quote = r.data; if (!quoteErr || !quoteErr.local) quoteErr = null; }
    else if (r.status >= 400 && r.status < 500 && r.status !== 401 && r.data.code) { quote = null; quoteErr = describeError(r.data, r.status); }
    else { quote = null; }
    renderCart();
  }).catch(function () { if (seq === quoteSeq) { quoting = false; quote = null; renderCart(); } });
}

// ── send ─────────────────────────────────────────────────────────────────────
function markField(id, bad) { $(id).className = 'field' + (id === 'notes' ? ' full' : '') + (bad ? ' bad' : ''); }
function sendOrder() {
  if (sending || !cart.length) return;
  markField('table', false); markField('phone', false);
  if (orderType === 'local' && !field('table')) { markField('table', true); quoteErr = { text: t('err_table'), local: true }; renderCart(); openCart(); $('table').focus(); return; }
  if (orderType === 'delivery' && !field('phone')) { markField('phone', true); quoteErr = { text: t('err_phone'), local: true }; renderCart(); openCart(); $('phone').focus(); return; }
  if (!requestId) requestId = newRequestId();
  var body = payload();
  body.source_request_id = requestId;
  sending = true; quoteErr = null; saveCart(); renderCart();
  api('POST', '/api/order', body).then(function (r) {
    sending = false;
    if (r.status === 401) { renderCart(); return; }
    if (r.data.ok) {
      recent.unshift({ id: r.data.id, n: r.data.order_number, at: Date.now(), type: orderType, table: body.table_number, units: unitsCount(), status: 'preparing' });
      recent = recent.slice(0, 12); store.set(RECENT_KEY, JSON.stringify(recent));
      var type = orderType, table = body.table_number;
      cart = []; requestId = null; quote = null; quoteErr = null;
      $('notes').value = ''; $('table').value = ''; $('phone').value = ''; $('cname').value = '';
      saveCart(); renderCart(); renderGrid(); closeCart();
      showDone(r.data.order_number, type, table);
      pollStatuses();
      return;
    }
    quoteErr = describeError(r.data, r.status);
    renderCart(); openCart(); scheduleQuote();
  }).catch(function () { sending = false; quoteErr = { text: t('err_network'), local: true }; renderCart(); openCart(); });
}
function showDone(n, type, table) {
  $('doneTitle').textContent = t('done_title', { n: n });
  $('doneSub').textContent = (type === 'local' && table ? t('table_n', { t: table }) + ' · ' : '') + t('done_sub');
  $('done').hidden = false;
}

// ── recent orders + kitchen status ───────────────────────────────────────────
var STATUS_KEYS = { preparing: 'st_preparing', ready: 'st_ready', completed: 'st_completed', cancelled: 'st_cancelled' };
function renderRecent() {
  var el = $('recentSheet'), rows = recent.map(function (r) {
    var when = new Date(r.at), hh = when.getHours(), mm = when.getMinutes();
    var desc = (r.type === 'local' && r.table ? t('table_n', { t: r.table }) : t(r.type === 'delivery' ? 'delivery' : r.type === 'takeout' ? 'takeout' : 'dine_in')) +
      ' · ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    return '<div class="ro"><b>#' + esc(r.n) + '</b><span class="d">' + esc(desc) + '</span><span class="st ' + esc(r.status) + '">' +
      (r.status === 'ready' ? '✓ ' : '') + esc(t(STATUS_KEYS[r.status] || 'st_preparing')) + '</span></div>';
  }).join('');
  el.innerHTML = '<div class="sh-head"><div class="t"><h3>' + esc(t('recent')) + '</h3></div><button class="icon-btn tap" data-act="closeRecent" aria-label="' +
    esc(t('close')) + '">✕</button></div><div class="sh-body"><div class="recent">' +
    (rows || '<div class="empty"><div class="ic">🧾</div><b>' + esc(t('recent_empty')) + '</b></div>') + '</div></div>';
}
function openRecent() { $('done').hidden = true; renderRecent(); $('recentSheet').hidden = false; syncScrim(); pollStatuses(); }
function closeRecent() { $('recentSheet').hidden = true; syncScrim(); }
function paintReadyDot() {
  var n = recent.filter(function (r) { return r.status === 'ready'; }).length, dot = $('readyDot');
  dot.hidden = !n; dot.textContent = n;
}
function pollStatuses() {
  var live = recent.filter(function (r) { return r.id && (r.status === 'preparing' || r.status === 'ready'); });
  if (!live.length || (C.pinEnabled && !token)) { paintReadyDot(); return; }
  api('GET', '/api/orders/status?ids=' + live.map(function (r) { return r.id; }).join(',')).then(function (res) {
    if (!res.ok) return;
    (res.data.orders || []).forEach(function (o) {
      recent.forEach(function (r) {
        if (r.id !== o.id) return;
        if (o.status === 'ready' && r.status !== 'ready') {
          toast(t('ready_toast', { n: r.n }));
          if (navigator.vibrate) { try { navigator.vibrate(200); } catch (e) { /* unsupported */ } }
        }
        r.status = o.status;
      });
    });
    store.set(RECENT_KEY, JSON.stringify(recent));
    paintReadyDot();
    if (!$('recentSheet').hidden) renderRecent();
  }).catch(function () { /* offline: keep the last known status */ });
}
var polling = false;
function startStatusPolling() {
  paintReadyDot(); pollStatuses();
  if (polling) return;
  polling = true;
  setInterval(function () { if (document.visibilityState !== 'hidden') pollStatuses(); }, 15000);
}

function bindCartFields() {
  ['table', 'phone', 'cname', 'notes'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      markField(id, false);
      if (quoteErr && !quoteErr.blocking) quoteErr = null;
      saveCart();
      if (id === 'phone' || id === 'cname') scheduleQuote();
    });
  });
}
function cartAction(act, el) {
  var i = Number(el.getAttribute('data-i'));
  switch (act) {
    case 'inc': changeQty(i, 1); return true;
    case 'dec': changeQty(i, -1); return true;
    case 'editLine': if (cart[i] && byId[cart[i].id]) openSheet(byId[cart[i].id], i); return true;
    case 'type': orderType = el.getAttribute('data-type'); quoteErr = null; cartChanged(); renderGrid(); return true;
    case 'send': sendOrder(); return true;
    case 'openCart': openCart(); return true;
    case 'closeCart': closeCart(); return true;
    case 'newOrder': $('done').hidden = true; return true;
    case 'recent': openRecent(); return true;
    case 'closeRecent': closeRecent(); return true;
    default: return false;
  }
}
`
