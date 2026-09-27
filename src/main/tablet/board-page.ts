import { kdsStringsFor } from '../../shared/kds-strings'
import { LAN_BASE_CSS, lanIcon } from './kds-page'

/**
 * Customer-facing "Preparing / Ready" order board for a dining-room TV (GET /board, public:
 * it only shows order numbers). Ember dark, legible from 5 m: huge numerals, two columns, ready
 * numbers highlighted with a chime, auto-cleared after `ready_board_clear_minutes`. Live via
 * EventSource /board/stream with a reconnect watchdog. No blur; only a finite transform pop.
 */
export function getBoardPageHTML(lang: string): string {
  const strings = kdsStringsFor(lang)
  const safeLang = lang === 'fr' || lang === 'ar' ? lang : 'en'
  const config = JSON.stringify({ strings }).replace(/</g, '\\u003c')
  return /* html */ `<!DOCTYPE html>
<html lang="${safeLang}" dir="${safeLang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#141110">
<title>${strings.boardTitle}</title>
<style>${LAN_BASE_CSS}${BOARD_CSS}</style>
</head>
<body>
<header><span class="brand">${lanIcon('chef')}</span><h1 id="title">${strings.boardTitle}</h1><span class="clock" id="clock"></span></header>
<div class="cols">
  <section class="col prep"><h2>${lanIcon('flame')}<span>${strings.preparing}</span></h2><div class="nums" id="prep"></div></section>
  <section class="col ready">
    <h2>${lanIcon('circleCheck')}<span>${strings.ready}</span></h2><p class="hint">${strings.boardReadyHint}</p>
    <div class="nums" id="ready"></div>
  </section>
</div>
<div class="off" id="off">${lanIcon('wifiOff')}</div>
<script>window.BOARD_CONFIG = ${config};</script>
<script>${BOARD_SCRIPT}</script>
</body>
</html>`
}

const BOARD_CSS = `
  header { height: 13vh; display: flex; align-items: center; gap: 2vw; padding: 0 4vw; background: var(--surface);
    border-bottom: 1px solid var(--line); }
  header .brand { width: 8vh; height: 8vh; border-radius: 2vh; }
  header .brand .ic { width: 5vh; height: 5vh; }
  header h1 { flex: 1; min-width: 0; font-size: 5vh; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  header .clock { font-size: 5vh; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--muted); }
  .cols { display: flex; height: 87vh; }
  .col { padding: 3.5vh 3vw; overflow: hidden; min-width: 0; }
  .prep { width: 42%; }
  .ready { flex: 1; border-inline-start: 2px solid var(--line); background: rgba(20,42,28,.4); }
  .col h2 { display: flex; align-items: center; gap: 1vw; font-size: 5.2vh; font-weight: 900; line-height: 1.05; text-transform: uppercase;
    letter-spacing: .02em; margin-bottom: 3.5vh; }
  .col h2 .ic { width: 5.2vh; height: 5.2vh; }
  .ready h2 { margin-bottom: 1.4vh; }
  .prep h2 { color: var(--warning-ink); } .ready h2 { color: var(--success-ink); }
  .hint { font-size: 2.8vh; font-weight: 600; color: var(--ink-2); margin-bottom: 3.5vh; }
  .nums { display: flex; flex-wrap: wrap; gap: 2.4vh 2vw; align-content: flex-start; }
  .n { font-weight: 900; line-height: 1; min-width: 2.3ch; text-align: center; font-variant-numeric: tabular-nums; border-radius: 2vh; }
  .prep .n { font-size: 8vh; padding: 1.2vh 1.4vw; background: var(--surface-2); border: 2px solid var(--line-strong); color: var(--ink-2); }
  .ready .n { font-size: 12vh; padding: 1.4vh 1.6vw; background: var(--success-soft); border: 2px solid rgba(34,197,94,.5); color: var(--success-ink); }
  .ready .n.fresh { background: var(--success); border-color: var(--success); color: var(--canvas); animation: pop 1.2s ease-in-out 4;
    box-shadow: 0 14px 32px -8px rgba(0,0,0,.6); }
  .empty { font-size: 7vh; color: var(--faint); font-weight: 800; }
  .off { position: fixed; bottom: 2vh; inset-inline-end: 2vw; display: flex; align-items: center; justify-content: center;
    width: 6vh; height: 6vh; border-radius: 50%; background: var(--danger-strong); color: #fff; }
  .off .ic { width: 3.4vh; height: 3.4vh; }
  [dir="rtl"] .col h2 { text-transform: none; letter-spacing: 0; }
  @keyframes pop { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
`

const BOARD_SCRIPT = String.raw`(function () {
  'use strict';
  var S = window.BOARD_CONFIG.strings, state = null, skew = 0, seen = null, lastMsg = 0, es = null, audio = null;
  function $(id) { return document.getElementById(id); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function now() { return Date.now() + skew; }
  function chime() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      [0, 0.18, 0.36].forEach(function (offset, i) {
        var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + offset;
        o.frequency.value = [784, 988, 1319][i]; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + 0.55);
      });
    } catch (e) { /* no audio on this device */ }
  }
  function render() {
    if (!state) return;
    var clearMs = state.clearMinutes * 60000, t = now();
    var ready = state.ready.filter(function (r) { return t - Date.parse(r.readyAt) < clearMs; });
    $('title').textContent = state.restaurantName || S.boardTitle;
    $('prep').innerHTML = state.preparing.length
      ? state.preparing.map(function (p) { return '<div class="n">' + p.number + '</div>'; }).join('')
      : '<div class="empty">' + S.boardEmpty + '</div>';
    $('ready').innerHTML = ready.length
      ? ready.map(function (r) { return '<div class="n' + (t - Date.parse(r.readyAt) < 30000 ? ' fresh' : '') + '">' + r.number + '</div>'; }).join('')
      : '<div class="empty">' + S.boardEmpty + '</div>';
  }
  function apply(next) {
    skew = Date.parse(next.serverTime) - Date.now();
    var ids = {}, fresh = false;
    next.ready.forEach(function (r) { ids[r.orderId] = true; if (seen && !seen[r.orderId]) fresh = true; });
    seen = ids; state = next; render();
    if (fresh) chime();
  }
  function connect() {
    if (es) es.close();
    es = new EventSource('/board/stream');
    es.addEventListener('board', function (e) { lastMsg = Date.now(); $('off').hidden = true; apply(JSON.parse(e.data)); });
    es.addEventListener('ping', function () { lastMsg = Date.now(); $('off').hidden = true; });
    es.onerror = function () { $('off').hidden = false; };
  }
  setInterval(function () {
    var d = new Date(now()); $('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (Date.now() - lastMsg > 35000) { $('off').hidden = false; lastMsg = Date.now(); connect(); }
  }, 1000);
  setInterval(render, 5000);
  // Browsers only allow sound after a first interaction: one tap / remote OK unlocks the chime.
  document.addEventListener('click', function () { chime(); }, { once: true });
  document.addEventListener('keydown', function () { chime(); }, { once: true });
  connect();
})();`
