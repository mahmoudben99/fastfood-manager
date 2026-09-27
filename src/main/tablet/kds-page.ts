import { kdsStringsFor } from '../../shared/kds-strings'
import { KDS_CANCEL_FLASH_MS, KDS_CHANGE_HIGHLIGHT_MS, KDS_UNDO_MS } from '../../shared/kds'
import { KDS_PAGE_SCRIPT } from './kds-page-script'

/**
 * Self-contained kitchen screen for any tablet / TV browser on the LAN (served at GET /kds).
 * No framework, no external assets: dark theme, touch-first, RTL-aware, and only opacity /
 * transform animations (no blur) so weak TV browsers keep up. Behaviour lives in
 * kds-page-script.ts; this file is the markup + styles.
 */
export function getKdsPageHTML(lang: string): string {
  const strings = kdsStringsFor(lang)
  const safeLang = lang === 'fr' || lang === 'ar' ? lang : 'en'
  const config = JSON.stringify({
    lang: safeLang,
    strings,
    cancelFlashMs: KDS_CANCEL_FLASH_MS,
    undoMs: KDS_UNDO_MS,
    highlightMs: KDS_CHANGE_HIGHLIGHT_MS
  }).replace(/</g, '\\u003c')
  return /* html */ `<!DOCTYPE html>
<html lang="${safeLang}" dir="${safeLang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#0b0f17">
<title>${strings.title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  [hidden] { display: none !important; }
  html, body { height: 100%; background: #0b0f17; color: #f1f5f9; overflow: hidden;
    font-family: system-ui, -apple-system, "Segoe UI", Tahoma, "Noto Sans Arabic", sans-serif; }
  button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
  .bar { position: fixed; top: 0; left: 0; right: 0; height: 64px; z-index: 10; display: flex; align-items: center;
    gap: 10px; padding: 0 14px; background: #111827; border-bottom: 1px solid #1f2937; }
  .bar h1 { font-size: 20px; font-weight: 800; white-space: nowrap; }
  .bar .grow { flex: 1; }
  .bar select, .bar .btn { height: 44px; border-radius: 10px; background: #1f2937; color: #f1f5f9; border: 1px solid #334155;
    padding: 0 14px; font-size: 17px; font-weight: 700; }
  .bar .btn[aria-pressed="false"] { opacity: .55; }
  .bar .btn:disabled { opacity: .35; cursor: default; }
  .conn { display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 700; color: #86efac; white-space: nowrap; }
  .conn i { width: 12px; height: 12px; border-radius: 50%; background: #22c55e; display: inline-block; }
  .conn.off { color: #fca5a5; } .conn.off i { background: #ef4444; animation: blink 1s infinite; }
  .clock { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; min-width: 72px; text-align: end; }
  .allday { position: fixed; top: 64px; left: 0; right: 0; height: 52px; z-index: 9; display: flex; align-items: center; gap: 8px;
    padding: 0 14px; background: #0f172a; border-bottom: 1px solid #1f2937; overflow-x: auto; white-space: nowrap; }
  .allday b { color: #94a3b8; font-size: 15px; text-transform: uppercase; margin-inline-end: 4px; }
  .allday span { background: #1e293b; border-radius: 999px; padding: 6px 12px; font-size: 18px; font-weight: 700; }
  .allday span em { font-style: normal; color: #fbbf24; }
  main { position: fixed; left: 0; right: 0; bottom: 0; top: 64px; overflow-y: auto; padding: 14px; }
  body.with-allday main { top: 116px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; align-items: start; }
  .empty { text-align: center; color: #64748b; font-size: 26px; font-weight: 700; padding: 80px 20px; }
  .card { background: #151b26; border-radius: 16px; overflow: hidden; border: 2px solid #1f2937; animation: cardIn .35s ease-out;
    user-select: none; transition: transform .1s; }
  .card:active { transform: scale(.985); }
  .card .head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #166534; }
  .card.lvl-warn .head { background: #b45309; } .card.lvl-late .head { background: #b91c1c; }
  .card .num { font-size: 32px; font-weight: 900; line-height: 1; }
  .card .meta { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 16px; font-weight: 700; }
  .card .meta .type { background: rgba(0,0,0,.28); border-radius: 6px; padding: 2px 8px; text-transform: uppercase; }
  .card .timer { font-size: 26px; font-weight: 900; font-variant-numeric: tabular-nums; }
  .banner { padding: 6px 14px; font-size: 18px; font-weight: 900; letter-spacing: .04em; text-align: center; }
  .banner.updated { background: #fbbf24; color: #111827; animation: pulse 1.2s ease-in-out infinite; }
  .banner.restored, .banner.recalled { background: #38bdf8; color: #0b0f17; }
  .banner.cancelled { background: #ef4444; color: #fff; }
  .card.st-cancelled { border-color: #ef4444; animation: blink .8s ease-in-out infinite; }
  .card.st-cancelled .item .name { text-decoration: line-through; }
  .card.st-ready { border-color: #22c55e; }
  .note { margin: 10px 14px 0; padding: 8px 10px; border-radius: 8px; background: #422006; color: #fde68a; font-size: 18px; font-weight: 800; }
  .group { border-top: 1px solid #1f2937; }
  .group:first-of-type { border-top: 0; }
  .ghead { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px 0; color: #94a3b8; font-size: 15px;
    font-weight: 800; text-transform: uppercase; }
  .gst { border-radius: 6px; padding: 2px 8px; background: #1e293b; color: #cbd5e1; }
  .gst.ready, .gst.bumped { background: #14532d; color: #86efac; } .gst.in_progress { background: #1e3a8a; color: #bfdbfe; }
  .gst.cancelled { background: #7f1d1d; color: #fecaca; }
  ul.items { list-style: none; padding: 6px 8px 10px; }
  .item { display: flex; align-items: flex-start; gap: 8px; padding: 6px; border-radius: 10px; }
  .item.child { margin-inline-start: 22px; }
  .chk { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 10px; border: 2px solid #475569; font-size: 22px; font-weight: 900;
    color: transparent; }
  .item.done .chk { background: #16a34a; border-color: #16a34a; color: #fff; }
  .item.done .body { opacity: .45; }
  .body { flex: 1; min-width: 0; }
  .line { font-size: 24px; font-weight: 800; line-height: 1.2; word-wrap: break-word; }
  .qty { color: #fbbf24; margin-inline-end: 6px; }
  .mark { display: inline-block; font-size: 13px; font-weight: 900; border-radius: 6px; padding: 2px 6px; margin-inline-start: 6px;
    vertical-align: middle; }
  .item.added .mark { background: #16a34a; color: #fff; } .item.changed .mark { background: #f59e0b; color: #111827; }
  .item.removed .mark { background: #ef4444; color: #fff; }
  .item.removed .line { text-decoration: line-through; color: #fca5a5; } .item.removed .chk { visibility: hidden; }
  .combo { font-size: 14px; font-weight: 800; color: #93c5fd; text-transform: uppercase; }
  .mod { font-size: 19px; font-weight: 700; color: #fde68a; }
  .mod.no { color: #fca5a5; font-weight: 900; }
  .inote { margin-top: 2px; font-size: 18px; font-weight: 800; color: #fbbf24; }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 14px 12px; color: #64748b;
    font-size: 14px; font-weight: 700; }
  .foot .start { height: 44px; padding: 0 18px; border-radius: 10px; background: #2563eb; color: #fff; font-size: 17px; font-weight: 800; }
  #flash { position: fixed; inset: 0; background: #fff; opacity: 0; pointer-events: none; z-index: 30; }
  #flash.on { animation: screenFlash .9s ease-out; }
  .toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 40; background: #f8fafc; color: #0f172a;
    border-radius: 14px; padding: 12px 14px 12px 20px; display: flex; align-items: center; gap: 16px; font-size: 19px; font-weight: 800;
    box-shadow: 0 10px 30px rgba(0,0,0,.5); }
  .toast button { background: #0f172a; color: #fff; border-radius: 10px; height: 48px; padding: 0 20px; font-weight: 900; }
  .overlay { position: fixed; inset: 0; z-index: 50; background: #0b0f17; display: flex; align-items: center; justify-content: center;
    flex-direction: column; gap: 18px; padding: 20px; text-align: center; }
  .overlay h2 { font-size: 30px; font-weight: 900; } .overlay p { color: #94a3b8; font-size: 19px; font-weight: 600; }
  .pin-dots { font-size: 44px; letter-spacing: 14px; min-height: 56px; font-weight: 900; direction: ltr; }
  .pad { display: grid; grid-template-columns: repeat(3, 84px); gap: 12px; direction: ltr; }
  .pad button { height: 72px; border-radius: 14px; background: #1f2937; font-size: 30px; font-weight: 800; }
  .pad button.ok { background: #16a34a; font-size: 20px; }
  .err { color: #fca5a5; font-weight: 800; min-height: 24px; font-size: 18px; }
  .offline-banner { position: fixed; top: 64px; left: 0; right: 0; z-index: 11; background: #7f1d1d; color: #fff; text-align: center;
    padding: 8px; font-size: 18px; font-weight: 800; }
  @keyframes cardIn { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .7; } }
  @keyframes screenFlash { 0% { opacity: 0; } 15% { opacity: .35; } 100% { opacity: 0; } }
  @media (max-width: 640px) { .bar h1 { display: none; } .clock { display: none; } .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header class="bar">
  <h1>${strings.title}</h1>
  <select id="station" aria-label="${strings.station}"></select>
  <button class="btn" id="recall">${strings.recall}</button>
  <button class="btn" id="alldayBtn" aria-pressed="true">${strings.allDay}</button>
  <button class="btn" id="soundBtn" aria-pressed="true">${strings.sound}</button>
  <span class="grow"></span>
  <span class="conn off" id="conn"><i></i><span id="connText">${strings.offline}</span></span>
  <span class="clock" id="clock"></span>
</header>
<div class="allday" id="allday" hidden></div>
<div class="offline-banner" id="offlineBanner" hidden>${strings.offline}</div>
<main><div class="grid" id="grid"></div><div class="empty" id="empty" hidden>${strings.noTickets}</div></main>
<div id="flash"></div>
<div class="toast" id="toast" hidden><span id="toastText"></span><button id="toastBtn" hidden>${strings.undo}</button></div>
<div class="overlay" id="pin" hidden>
  <h2>${strings.pinTitle}</h2><p>${strings.pinPrompt}</p>
  <div class="pin-dots" id="pinDots"></div><div class="err" id="pinErr"></div>
  <div class="pad" id="pad"></div>
</div>
<div class="overlay" id="start" hidden><h2>${strings.title}</h2><p>${strings.tapToStart}</p></div>
<script>window.KDS_CONFIG = ${config};</script>
<script>${KDS_PAGE_SCRIPT}</script>
</body>
</html>`
}
