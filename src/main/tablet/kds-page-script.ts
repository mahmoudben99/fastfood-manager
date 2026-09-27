/**
 * Client script of the LAN kitchen screen (GET /kds). Plain ES5-style JavaScript so old TV
 * browsers run it; kept as String.raw so regex backslashes survive (never use `${` or backticks
 * inside). Data flow: PIN → token (localStorage) → EventSource /kds/stream (snapshot events,
 * ping heartbeats) → render. Actions POST /kds/api/action. A watchdog reconnects after 35 s of
 * silence and shows the offline banner meanwhile.
 */
export const KDS_PAGE_SCRIPT = String.raw`(function () {
  'use strict';
  var C = window.KDS_CONFIG, S = C.strings, LANG = C.lang;
  function $(id) { return document.getElementById(id); }
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  var params = new URLSearchParams(location.search);
  var station = params.get('station') || store.get('kds_station') || 'all';
  var token = store.get('kds_token') || '';
  var snap = null, skew = 0, es = null, lastMsg = 0, known = null, online = false;
  var hidden = {}, dismissed = {}, stationSig = '', toastTimer = null, undoFn = null, audio = null, pinValue = '';
  var soundOn = store.get('kds_sound_local') !== '0';
  var showAllDay = store.get('kds_allday') !== '0';

  function fmt(s, v) { return String(s).replace(/\{\{(\w+)\}\}/g, function (_, k) { return v && v[k] != null ? v[k] : ''; }); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function now() { return Date.now() + skew; }
  function ms(iso) { var t = Date.parse(iso); return isNaN(t) ? now() : t; }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function elapsed(v) {
    var t = Math.max(0, Math.floor(v / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }
  function level(v) {
    var m = v / 60000;
    return m >= snap.settings.lateMinutes ? 'late' : m >= snap.settings.warnMinutes ? 'warn' : 'ok';
  }
  function localName(o) { return LANG === 'ar' && o.nameAr ? o.nameAr : LANG === 'fr' && o.nameFr ? o.nameFr : o.name; }
  function modLabel(m) {
    var name = LANG === 'ar' && m.name_ar ? m.name_ar : LANG === 'fr' && m.name_fr ? m.name_fr : m.name;
    var kind = String(m.kind || 'none').toLowerCase();
    var prefix = kind === 'no' ? S.modNo : kind === 'extra' ? S.modExtra : kind === 'light' ? S.modLight : '';
    var lower = name.toLowerCase(), label;
    if (!prefix) label = '+ ' + name;
    else if (lower.indexOf(prefix.toLowerCase() + ' ') === 0 || lower.indexOf(kind + ' ') === 0) label = name.toUpperCase();
    else label = (prefix + ' ' + name).toUpperCase();
    return Number(m.quantity) > 1 ? label + ' x' + m.quantity : label;
  }
  function typeLabel(t) { return t === 'local' ? S.dineIn : t === 'delivery' ? S.delivery : S.takeout; }
  function typeIcon(t) { return t === 'local' ? 'dineIn' : t === 'delivery' ? 'delivery' : 'takeout'; }
  function stationLabel(id, name) { return Number(id) === 0 ? S.expo : name; }
  function statusLabel(st) {
    return { 'new': S.statusNew, in_progress: S.statusInProgress, ready: S.statusReady, bumped: S.statusBumped, cancelled: S.statusCancelled }[st] || st;
  }
  // Inline SVG icons from KDS_CONFIG (markup only; no behaviour hangs on them).
  function ic(name, cls) { var svg = (C.icons || {})[name] || ''; return cls ? svg.replace('class="ic"', 'class="ic ' + cls + '"') : svg; }
  function statusChip(st) {
    var icon = st === 'in_progress' ? ic('flame') : st === 'ready' || st === 'bumped' ? ic('check') : st === 'cancelled' ? ic('x') : '';
    return '<span class="gst ' + st + '">' + icon + esc(statusLabel(st)) + '</span>';
  }

  // ── Network ──
  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) { showPin(''); throw new Error('unauthorized'); }
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'failed'); return j; });
    });
  }
  function setOnline(on) {
    online = on;
    $('conn').className = on ? 'conn' : 'conn off';
    $('connText').textContent = on ? S.live : S.offline;
    $('offlineBanner').hidden = on || !token;
  }
  function connect() {
    if (es) { es.close(); es = null; }
    if (!token) { showPin(''); return; }
    es = new EventSource('/kds/stream?station=' + encodeURIComponent(station) + '&token=' + encodeURIComponent(token));
    es.addEventListener('snapshot', function (e) { lastMsg = Date.now(); setOnline(true); apply(JSON.parse(e.data)); });
    es.addEventListener('ping', function () { lastMsg = Date.now(); setOnline(true); });
    es.onerror = function () { setOnline(false); };
  }
  setInterval(function () {
    if (!token || !$('pin').hidden) return;
    if (Date.now() - lastMsg > 35000) {
      setOnline(false);
      lastMsg = Date.now();
      // Also detects a changed PIN (401 → PIN screen) that EventSource would retry forever.
      api('GET', '/kds/api/snapshot?station=' + encodeURIComponent(station)).then(function (s) { apply(s); connect(); }, function () {});
    }
  }, 5000);

  // ── PIN ──
  function showPin(msg) {
    if (es) { es.close(); es = null; }
    token = ''; store.set('kds_token', ''); pinValue = '';
    $('pin').hidden = false; $('start').hidden = true; $('pinErr').textContent = msg || ''; renderPin();
  }
  function renderPin() { $('pinDots').textContent = pinValue.replace(/./g, '•') || ' '; }
  function submitPin() {
    if (pinValue.length < 4) return;
    fetch('/kds/api/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: pinValue }) })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (res.status === 200 && res.body.token) {
          token = res.body.token; store.set('kds_token', token); $('pin').hidden = true; unlockAudio(); connect();
        } else { pinValue = ''; renderPin(); $('pinErr').textContent = res.status === 429 ? S.pinLocked : S.pinWrong; }
      }, function () { $('pinErr').textContent = S.offline; });
  }
  (function buildPad() {
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'], html = '';
    keys.forEach(function (k) { html += '<button data-k="' + k + '"' + (k === 'OK' ? ' class="ok"' : '') + '>' + (k === 'OK' ? esc(S.enter) : k) + '</button>'; });
    $('pad').innerHTML = html;
    $('pad').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var k = b.getAttribute('data-k');
      if (k === 'OK') submitPin(); else if (k === '⌫') pinValue = pinValue.slice(0, -1); else if (pinValue.length < 6) pinValue += k;
      renderPin();
    });
    document.addEventListener('keydown', function (e) {
      if ($('pin').hidden) return;
      if (/^[0-9]$/.test(e.key) && pinValue.length < 6) pinValue += e.key;
      else if (e.key === 'Backspace') pinValue = pinValue.slice(0, -1);
      else if (e.key === 'Enter') submitPin();
      renderPin();
    });
  })();

  // ── Alerts ──
  function unlockAudio() {
    try { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { audio = null; }
  }
  function beep() {
    if (!soundOn || !snap.settings.sound || !audio) return;
    [0, 0.22].forEach(function (offset, i) {
      var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + offset;
      o.frequency.value = i ? 1175 : 880; o.type = 'square';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + 0.2);
    });
  }
  function flash() {
    if (!snap.settings.flash) return;
    var f = $('flash'); f.className = ''; void f.offsetWidth; f.className = 'on';
  }
  function toast(text, undo) {
    $('toastText').textContent = text; $('toast').hidden = false; $('toastBtn').hidden = !undo; undoFn = undo || null;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { $('toast').hidden = true; undoFn = null; }, undo ? C.undoMs : 2500);
  }
  $('toastBtn').addEventListener('click', function () { var fn = undoFn; $('toast').hidden = true; undoFn = null; if (fn) fn(); });

  // ── Render ──
  function apply(next) {
    skew = Date.parse(next.serverTime) - Date.now();
    var keys = {}, fresh = false;
    next.cards.forEach(function (c) { keys[c.key] = true; if (known && !known[c.key] && c.status === 'new') fresh = true; });
    Object.keys(hidden).forEach(function (k) { if (!keys[k]) delete hidden[k]; });
    known = keys; snap = next; render();
    if (fresh) { beep(); flash(); }
  }
  function modHtml(m) {
    var kind = String(m.kind || 'none').toLowerCase(), label = modLabel(m);
    var cls = kind === 'no' ? ' no' : kind === 'extra' ? ' extra' : kind === 'light' ? ' light' : '';
    if (!cls) label = label.replace(/^\+\s*/, '');
    return '<li class="mod' + cls + '"><span class="mi">' + ic(kind === 'no' ? 'x' : kind === 'light' ? 'minus' : 'plus') + '</span><bdi>' + esc(label) + '</bdi></li>';
  }
  function itemHtml(item) {
    var cls = 'item' + (item.doneAt ? ' done' : '') + (item.change ? ' ' + item.change : '') + (item.parentOrderItemId ? ' child' : '');
    var mark = item.change === 'added' ? S.added : item.change === 'removed' ? S.removed : item.change === 'changed' ? S.changed : '';
    if (item.change === 'changed' && item.previousQuantity != null && item.previousQuantity !== item.quantity) mark += ' · ' + fmt(S.wasQty, { n: item.previousQuantity });
    var markIcon = item.change === 'added' ? ic('plus') : item.change === 'removed' ? ic('minus') : ic('refresh');
    var html = '<li class="' + cls + '"><button class="chk" data-item="' + item.id + '" data-done="' + (item.doneAt ? 1 : 0) + '" aria-label="' + esc(S.markDone) + '">' + ic('check') + '</button><div class="body">';
    html += '<div class="line"><span class="qty' + (item.quantity > 1 ? ' multi' : '') + '">' + item.quantity + '×</span><span class="name"><bdi>' + esc(localName(item)) + '</bdi></span>' + (mark ? '<span class="mark">' + markIcon + esc(mark) + '</span>' : '') + '</div>';
    if (item.modifiers && item.modifiers.length) html += '<ul class="mods">' + item.modifiers.map(modHtml).join('') + '</ul>';
    if (item.notes) html += '<div class="inote">' + ic('alert') + '<bdi>' + esc(item.notes) + '</bdi></div>';
    return html + '</div></li>';
  }
  // Combo children arrive right after each other: one combo header, then the indented children.
  function itemsHtml(items) {
    var html = '', prev = null;
    items.forEach(function (item) {
      var parent = item.parentOrderItemId == null ? null : item.parentOrderItemId;
      if (parent !== null && item.comboName && parent !== prev) html += '<li class="combo-head">' + ic('layers') + '<bdi>' + esc(fmt(S.combo, { name: item.comboName })) + '</bdi></li>';
      prev = parent;
      html += itemHtml(item);
    });
    return html;
  }
  function cardHtml(card) {
    var expo = snap.station === 'all', start = ms(card.timerStart), cancelled = card.status === 'cancelled';
    var banner = cancelled ? 'cancelled' : card.change && card.changedAt && now() - ms(card.changedAt) < C.highlightMs ? card.change : '';
    var html = '<div class="card st-' + card.status + ' lvl-' + level(now() - start) + '" title="' + esc(S.tapToBump) + '" data-key="' + card.key + '" data-order="' + card.orderId + '" data-number="' + card.dailyNumber + '"' +
      (card.tickets.length === 1 ? ' data-ticket="' + card.tickets[0].id + '"' : '') + (card.cancelledAt ? ' data-cancelled="' + ms(card.cancelledAt) + '"' : '') + '>';
    html += '<div class="head"><div class="row1"><span class="num">#' + card.dailyNumber + '</span><span class="tpill">' + ic('clock', 'i-ok') + ic('hourglass', 'i-warn') + ic('alert', 'i-late') +
      '<span class="timer" data-start="' + start + '">' + elapsed(now() - start) + '</span><span class="tw tw-warn">' + esc(S.timerWarn) + '</span><span class="tw tw-late">' + esc(S.timerLate) + '</span></span></div>';
    html += '<div class="meta"><span class="type">' + ic(typeIcon(card.orderType)) + esc(typeLabel(card.orderType)) + '</span>';
    if (card.tableNumber) html += '<span>' + esc(fmt(S.table, { n: card.tableNumber })) + '</span>';
    if (card.customerName) html += '<bdi>' + esc(card.customerName) + '</bdi>';
    if (!cancelled) html += statusChip(card.status);
    html += '</div></div>';
    if (banner) {
      html += '<div class="banner ' + banner + '">' + (banner === 'cancelled' ? ic('circleX') : banner === 'updated' ? ic('refresh') : ic('recall', 'flip')) +
        esc(banner === 'cancelled' ? S.statusCancelled : S[banner] || banner) + '</div>';
    }
    if (card.orderNote) html += '<div class="note">' + ic('note') + '<bdi>' + esc(card.orderNote) + '</bdi></div>';
    card.tickets.forEach(function (t) {
      html += '<div class="group">';
      if (expo) html += '<div class="ghead"><bdi>' + esc(stationLabel(t.stationId, t.stationName)) + '</bdi>' + statusChip(t.status) + '</div>';
      html += '<ul class="items">' + itemsHtml(t.items) + '</ul></div>';
    });
    html += '<div class="foot">';
    if (!expo && card.status === 'new') html += '<button class="start" data-start-ticket="' + card.tickets[0].id + '">' + ic('play', 'flip') + esc(S.start) + '</button>';
    // No data attribute: a tap here falls through to the card handler (bump, or dismiss when cancelled).
    html += '<button class="bump">' + (cancelled ? ic('x') + esc(S.close) : ic('circleCheck') + esc(S.bump)) + '</button>';
    return html + '</div></div>';
  }
  function render() {
    if (!snap) return;
    var sel = $('station'), opts = '<option value="all">' + esc(S.expoView) + '</option>';
    snap.stations.forEach(function (st) { opts += '<option value="' + st.id + '">' + esc(stationLabel(st.id, st.name)) + '</option>'; });
    if (opts !== stationSig) { stationSig = opts; sel.innerHTML = opts; }
    sel.value = String(station);
    $('recall').disabled = !snap.canRecall;
    $('alldayBtn').setAttribute('aria-pressed', showAllDay ? 'true' : 'false');
    $('soundBtn').setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    var strip = $('allday');
    strip.hidden = !showAllDay || snap.allDay.length === 0;
    document.body.className = strip.hidden ? '' : 'with-allday';
    strip.innerHTML = '<b>' + esc(S.allDay) + '</b>' + snap.allDay.map(function (r) { return '<span><bdi>' + esc(localName(r)) + '</bdi><em>×' + r.quantity + '</em></span>'; }).join('');
    var cards = snap.cards.filter(function (c) {
      return !hidden[c.key] && !dismissed[c.key + (c.cancelledAt || '')] && !(c.cancelledAt && now() - ms(c.cancelledAt) > C.cancelFlashMs);
    });
    $('grid').innerHTML = cards.map(cardHtml).join('');
    $('empty').hidden = cards.length > 0;
  }
  setInterval(function () {
    var d = new Date(now()); $('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (!snap) return;
    var nodes = document.querySelectorAll('.card');
    for (var i = 0; i < nodes.length; i++) {
      var card = nodes[i], timer = card.querySelector('.timer'), cancelled = card.getAttribute('data-cancelled');
      if (cancelled && now() - Number(cancelled) > C.cancelFlashMs) { card.parentNode.removeChild(card); continue; }
      var v = now() - Number(timer.getAttribute('data-start'));
      timer.textContent = elapsed(v);
      card.className = card.className.replace(/lvl-\w+/, 'lvl-' + level(v));
    }
  }, 1000);
  setInterval(render, 30000);

  // ── Actions ──
  function act(body, onFail) {
    return api('POST', '/kds/api/action', body).then(function () {}, function (e) {
      if (e.message !== 'unauthorized') toast(e.message === 'nothing_to_recall' ? S.nothingToRecall : S.actionFailed);
      if (onFail) onFail();
    });
  }
  $('grid').addEventListener('click', function (e) {
    unlockAudio();
    var chk = e.target.closest('[data-item]');
    if (chk) { act({ type: 'line-done', itemId: Number(chk.getAttribute('data-item')), done: chk.getAttribute('data-done') !== '1' }); return; }
    var startBtn = e.target.closest('[data-start-ticket]');
    if (startBtn) { act({ type: 'start', ticketId: Number(startBtn.getAttribute('data-start-ticket')) }); return; }
    var card = e.target.closest('.card'); if (!card) return;
    var key = card.getAttribute('data-key');
    if (card.getAttribute('data-cancelled')) { dismissed[key + (snap.cards.filter(function (c) { return c.key === key; })[0] || {}).cancelledAt] = true; render(); return; }
    var orderId = Number(card.getAttribute('data-order')), ticketId = Number(card.getAttribute('data-ticket'));
    var expo = snap.station === 'all';
    hidden[key] = true; render();
    var failed = false;
    var restore = function () { delete hidden[key]; render(); };
    act(expo ? { type: 'bump-order', orderId: orderId } : { type: 'bump', ticketId: ticketId }, function () { failed = true; restore(); }).then(function () {
      if (failed) return;
      toast(fmt(S.bumpedToast, { n: card.getAttribute('data-number') }), function () {
        act(expo ? { type: 'recall-order', orderId: orderId } : { type: 'recall', ticketId: ticketId }).then(restore);
      });
    });
  });
  $('recall').addEventListener('click', function () { act({ type: 'recall-last', station: station }); });
  $('station').addEventListener('change', function (e) {
    station = e.target.value; store.set('kds_station', station); known = null; snap = null; $('grid').innerHTML = ''; connect();
  });
  $('alldayBtn').addEventListener('click', function () { showAllDay = !showAllDay; store.set('kds_allday', showAllDay ? '1' : '0'); render(); });
  $('soundBtn').addEventListener('click', function () { soundOn = !soundOn; store.set('kds_sound_local', soundOn ? '1' : '0'); unlockAudio(); render(); });

  // ── Boot ──
  if (!token) showPin('');
  else {
    $('start').hidden = false;
    var go = function () { $('start').hidden = true; unlockAudio(); document.removeEventListener('keydown', go); };
    $('start').addEventListener('click', go); document.addEventListener('keydown', go);
    connect();
  }
})();`
