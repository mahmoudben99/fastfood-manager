import { kdsStringsFor } from '../../shared/kds-strings'

/**
 * Customer-facing "Preparing / Ready" order board for a dining-room TV (GET /board, public:
 * it only shows order numbers). Legible from 5 m: huge numerals, two columns, ready numbers
 * highlighted with a chime, auto-cleared after `ready_board_clear_minutes`. Live via
 * EventSource /board/stream with a reconnect watchdog. No blur, only opacity/transform motion.
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
<title>${strings.boardTitle}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  [hidden] { display: none !important; }
  html, body { height: 100%; background: #0b0f17; color: #f8fafc; overflow: hidden;
    font-family: system-ui, -apple-system, "Segoe UI", Tahoma, "Noto Sans Arabic", sans-serif; }
  header { height: 12vh; display: flex; align-items: center; justify-content: space-between; padding: 0 4vw;
    border-bottom: 2px solid #1f2937; }
  header h1 { font-size: 5vh; font-weight: 900; }
  header .clock { font-size: 5vh; font-weight: 800; font-variant-numeric: tabular-nums; color: #94a3b8; }
  .cols { display: flex; height: 88vh; }
  .col { flex: 1; padding: 3vh 3vw; overflow: hidden; }
  .col + .col { border-inline-start: 2px solid #1f2937; }
  .col h2 { font-size: 6vh; font-weight: 900; margin-bottom: 3vh; text-transform: uppercase; letter-spacing: .05em; }
  .prep h2 { color: #fbbf24; } .ready h2 { color: #4ade80; }
  .nums { display: flex; flex-wrap: wrap; gap: 2.2vh 2.2vw; align-content: flex-start; }
  .n { font-size: 11vh; font-weight: 900; line-height: 1; min-width: 2.2ch; text-align: center; font-variant-numeric: tabular-nums;
    padding: 1.2vh 1.4vw; border-radius: 2vh; background: #111827; }
  .ready .n { background: #14532d; color: #dcfce7; }
  .ready .n.fresh { background: #22c55e; color: #052e16; animation: pop 1.2s ease-in-out 4; }
  .prep .n { color: #e2e8f0; font-size: 8vh; }
  .empty { font-size: 7vh; color: #334155; font-weight: 800; }
  .off { position: fixed; bottom: 2vh; inset-inline-end: 2vw; width: 2.2vh; height: 2.2vh; border-radius: 50%; background: #ef4444;
    animation: blink 1s infinite; }
  @keyframes pop { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
</style>
</head>
<body>
<header><h1 id="title">${strings.boardTitle}</h1><span class="clock" id="clock"></span></header>
<div class="cols">
  <section class="col prep"><h2>${strings.preparing}</h2><div class="nums" id="prep"></div></section>
  <section class="col ready"><h2>${strings.ready}</h2><div class="nums" id="ready"></div></section>
</div>
<div class="off" id="off"></div>
<script>window.BOARD_CONFIG = ${config};</script>
<script>${BOARD_SCRIPT}</script>
</body>
</html>`
}

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
