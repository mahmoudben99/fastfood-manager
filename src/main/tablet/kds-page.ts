import { kdsStringsFor } from '../../shared/kds-strings'
import { KDS_CANCEL_FLASH_MS, KDS_CHANGE_HIGHLIGHT_MS, KDS_UNDO_MS } from '../../shared/kds'
import { KDS_PAGE_SCRIPT } from './kds-page-script'

/** Lucide icon bodies (24x24, stroke) inlined as SVG: the LAN pages load no external assets. */
const ICON_PATHS = {
  chef: '<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/><path d="M6 17h12"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  recall: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  list: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  vol: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
  wifiOff: '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.18-2.64"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"/><path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  play: '<path d="M6 3 20 12 6 21Z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  circleCheck: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  circleX: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  note: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  dineIn: '<path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/>',
  takeout: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  delivery: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>'
}
export type LanIcon = keyof typeof ICON_PATHS

export function lanIcon(name: LanIcon, cls = ''): string {
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`
}

/**
 * Ember v4 dark tokens (copied from src/renderer/src/styles/tokens.css `.dark`) + base reset shared by
 * the LAN kitchen screen and the customer board. The LAN server serves no font files, so the stack is
 * system fonts only (Segoe UI / Roboto / Noto Sans Arabic on Android TVs).
 */
export const LAN_BASE_CSS = `
  :root { color-scheme: dark;
    --canvas: #141110; --surface: #1d1916; --surface-2: #26211d; --surface-3: #312b26;
    --ink: #f5efe8; --ink-2: #ddd4ca; --muted: #aba196; --faint: #7b726a; --line: #2f2925; --line-strong: #403832;
    --inverse: #f5efe8; --on-inverse: #1c1917;
    --primary: #ea5a12; --primary-from: #ee6117; --primary-to: #c9440d; --primary-soft: #33211a; --primary-soft-2: #472a1b;
    --primary-ink: #ff9a52; --accent: #ff8a3d;
    --success: #22c55e; --success-soft: #142a1c; --success-ink: #5ee08e; --success-strong: #178a42;
    --warning: #f59e0b; --warning-soft: #2f2412; --warning-ink: #fbbf45;
    --danger: #ef4444; --danger-soft: #361a19; --danger-ink: #fb7d7d; --danger-strong: #d42a2a;
    --info-soft: #172338; --info-ink: #86b4ff;
    --elev-1: 0 0 0 1px rgba(255,255,255,.035), 0 1px 2px rgba(0,0,0,.4);
    --elev-4: 0 0 0 1px rgba(255,255,255,.06), 0 24px 56px -12px rgba(0,0,0,.7);
    --glow: 0 0 0 1px rgba(255,138,61,.25), 0 6px 20px -4px rgba(255,106,26,.4);
    --ember: linear-gradient(180deg, var(--primary-from), var(--primary-to)); }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  [hidden] { display: none !important; }
  html, body { height: 100%; background: var(--canvas); color: var(--ink); overflow: hidden; -webkit-font-smoothing: antialiased;
    font-family: "Segoe UI", system-ui, -apple-system, Roboto, "Noto Sans Arabic", "Noto Sans", Tahoma, sans-serif; }
  button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; touch-action: manipulation; }
  .ic { width: 20px; height: 20px; flex: 0 0 auto; }
  .brand { width: 44px; height: 44px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center;
    background: var(--primary); background-image: var(--ember); color: #fff; box-shadow: var(--glow); flex: 0 0 auto; }
  .brand .ic { width: 26px; height: 26px; }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
  @keyframes live { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
`

/**
 * Self-contained kitchen screen for any tablet / TV browser on the LAN (served at GET /kds).
 * No framework, no external assets: Ember dark, touch-first (48–56px targets), RTL-aware, and
 * only opacity / transform animations (no blur; the live dot is the only infinite one).
 * Behaviour lives in kds-page-script.ts; this file is the markup + styles.
 */
export function getKdsPageHTML(lang: string): string {
  const strings = kdsStringsFor(lang)
  const safeLang = lang === 'fr' || lang === 'ar' ? lang : 'en'
  const icons = Object.fromEntries((Object.keys(ICON_PATHS) as LanIcon[]).map((name) => [name, lanIcon(name)]))
  const config = JSON.stringify({
    lang: safeLang,
    strings,
    icons,
    cancelFlashMs: KDS_CANCEL_FLASH_MS,
    undoMs: KDS_UNDO_MS,
    highlightMs: KDS_CHANGE_HIGHLIGHT_MS
  }).replace(/</g, '\\u003c')
  return /* html */ `<!DOCTYPE html>
<html lang="${safeLang}" dir="${safeLang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#141110">
<title>${strings.title}</title>
<style>${LAN_BASE_CSS}${KDS_CSS}</style>
</head>
<body>
<header class="bar">
  <span class="brand">${lanIcon('chef')}</span>
  <h1>${strings.title}</h1>
  <span class="sel"><select id="station" aria-label="${strings.station}"></select>${lanIcon('chevron')}</span>
  <button class="btn" id="recall" title="${strings.recall}">${lanIcon('recall', 'flip')}<span class="lbl">${strings.recall}</span></button>
  <button class="btn tgl" id="alldayBtn" aria-pressed="true" title="${strings.allDay}">${lanIcon('list')}<span class="lbl">${strings.allDay}</span></button>
  <button class="btn tgl" id="soundBtn" aria-pressed="true" title="${strings.sound}">${lanIcon('vol', 'on')}${lanIcon('mute', 'off')}<span class="lbl">${strings.sound}</span></button>
  <span class="grow"></span>
  <span class="conn off" id="conn"><i></i><span id="connText">${strings.offline}</span></span>
  <span class="clock" id="clock"></span>
</header>
<div class="allday" id="allday" hidden></div>
<div class="offline-banner" id="offlineBanner" hidden>${lanIcon('wifiOff')}<span>${strings.offline}</span></div>
<main><div class="grid" id="grid"></div><div class="empty" id="empty" hidden><span class="empty-ic">${lanIcon('chef')}</span><p>${strings.noTickets}</p></div></main>
<div id="flash"></div>
<div class="toast" id="toast" hidden><span id="toastText"></span><button id="toastBtn" hidden>${strings.undo}</button></div>
<div class="overlay" id="pin" hidden>
  <span class="brand big">${lanIcon('chef')}</span>
  <h2>${strings.pinTitle}</h2><p>${strings.pinPrompt}</p>
  <div class="pin-dots" id="pinDots"></div><div class="err" id="pinErr"></div>
  <div class="pad" id="pad"></div>
</div>
<div class="overlay" id="start" hidden>
  <span class="brand big">${lanIcon('chef')}</span><h2>${strings.title}</h2>
  <span class="go">${lanIcon('play', 'flip')}</span><p>${strings.tapToStart}</p>
</div>
<script>window.KDS_CONFIG = ${config};</script>
<script>${KDS_PAGE_SCRIPT}</script>
</body>
</html>`
}

const KDS_CSS = `
  [dir="rtl"] .flip { transform: scaleX(-1); }
  .bar { position: fixed; top: 0; left: 0; right: 0; height: 72px; z-index: 10; display: flex; align-items: center; gap: 10px;
    padding: 0 16px; background: var(--surface); border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; }
  .bar::-webkit-scrollbar { display: none; }
  .bar h1 { font-size: 20px; font-weight: 800; white-space: nowrap; }
  .bar .grow { flex: 1; }
  .sel { position: relative; flex: 0 0 auto; }
  .sel .ic { position: absolute; top: 50%; inset-inline-end: 14px; margin-top: -10px; color: var(--muted); pointer-events: none; }
  .bar select { -webkit-appearance: none; appearance: none; height: 52px; min-width: 200px; max-width: 260px; border-radius: 12px;
    background: var(--surface-2); color: var(--ink); border: 1px solid var(--line-strong); padding-inline-start: 16px;
    padding-inline-end: 44px; font: inherit; font-size: 18px; font-weight: 700; }
  .bar .btn { flex: 0 0 auto; height: 52px; border-radius: 12px; background: var(--surface-2); color: var(--ink);
    border: 1px solid var(--line-strong); padding: 0 16px; font-size: 17px; font-weight: 700; display: inline-flex;
    align-items: center; gap: 8px; white-space: nowrap; }
  .bar .btn:active { transform: scale(.97); }
  .bar .btn:disabled { opacity: .45; cursor: default; transform: none; }
  .bar .tgl[aria-pressed="true"] { background: var(--primary-soft); color: var(--primary-ink); border-color: rgba(234,90,18,.4); }
  .bar .tgl[aria-pressed="false"] { color: var(--muted); }
  .tgl .off, .tgl[aria-pressed="false"] .on { display: none; } .tgl[aria-pressed="false"] .off { display: inline-block; }
  .conn { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: var(--success-ink); white-space: nowrap; }
  .conn i { width: 12px; height: 12px; border-radius: 50%; background: var(--success); display: inline-block; animation: live 1.4s ease-in-out infinite; }
  .conn.off { color: var(--danger-ink); } .conn.off i { background: var(--danger); animation: none; }
  .clock { font-size: 30px; font-weight: 800; font-variant-numeric: tabular-nums; min-width: 88px; text-align: end; }
  .allday { position: fixed; top: 72px; left: 0; right: 0; height: 56px; z-index: 9; display: flex; align-items: center; gap: 8px;
    padding: 0 16px; background: var(--surface-2); border-bottom: 1px solid var(--line); overflow-x: auto; white-space: nowrap; }
  .allday b { color: var(--muted); font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; margin-inline-end: 4px; }
  .allday span { display: inline-flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--line);
    border-radius: 999px; padding: 6px 14px; font-size: 18px; font-weight: 700; }
  .allday span em { font-style: normal; font-weight: 900; color: var(--primary-ink); font-variant-numeric: tabular-nums; }
  main { position: fixed; left: 0; right: 0; bottom: 0; top: 72px; overflow-y: auto; padding: 16px; }
  body.with-allday main { top: 128px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; align-items: start; }
  .empty { display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; color: var(--ink); font-size: 24px;
    font-weight: 700; padding: 90px 20px; }
  .empty-ic { width: 80px; height: 80px; border-radius: 24px; background: var(--primary-soft); color: var(--primary-ink);
    display: inline-flex; align-items: center; justify-content: center; }
  .empty-ic .ic { width: 40px; height: 40px; }
  .card { background: var(--surface); border-radius: 16px; overflow: hidden; border: 2px solid var(--line); box-shadow: var(--elev-1);
    display: flex; flex-direction: column; user-select: none; -webkit-user-select: none; cursor: pointer; transition: transform .1s; }
  .card:active { transform: scale(.985); }
  .card.st-ready { border-color: var(--success); }
  .card.lvl-warn { border-color: var(--warning); } .card.lvl-late { border-color: var(--danger); }
  .card.st-cancelled { border-color: var(--danger); animation: blink .8s ease-in-out 5; }
  .head { padding: 12px 16px; background: var(--surface-3); }
  .st-new .head { background: var(--primary-soft); } .st-ready .head, .st-bumped .head { background: var(--success-soft); }
  .st-cancelled .head { background: var(--danger-soft); }
  .row1 { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .num { font-size: 36px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
  .st-cancelled .num { color: var(--danger-ink); text-decoration: line-through; }
  .tpill { margin-inline-start: auto; display: inline-flex; align-items: center; gap: 6px; border-radius: 12px; padding: 4px 10px;
    font-size: 24px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
  .tpill .ic { width: 24px; height: 24px; }
  .tpill .tw { font-size: 16px; text-transform: uppercase; }
  .tpill .i-warn, .tpill .i-late, .tpill .tw { display: none; }
  .tpill .i-ok { color: var(--muted); }
  .lvl-warn .tpill { background: var(--warning); color: var(--canvas); }
  .lvl-late .tpill { background: var(--danger-strong); color: #fff; }
  .lvl-warn .tpill .i-ok, .lvl-late .tpill .i-ok { display: none; }
  .lvl-warn .tpill .i-warn, .lvl-warn .tpill .tw-warn, .lvl-late .tpill .i-late, .lvl-late .tpill .tw-late { display: inline-block; }
  .card.st-cancelled .tpill { background: none; color: var(--ink); }
  .card.st-cancelled .tpill .i-ok { display: inline-block; }
  .card.st-cancelled .tpill .i-warn, .card.st-cancelled .tpill .i-late, .card.st-cancelled .tpill .tw { display: none; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-top: 8px; font-size: 16px; font-weight: 700; color: var(--ink-2); }
  .meta .type { display: inline-flex; align-items: center; gap: 6px; background: rgba(20,17,16,.4); color: var(--ink); border-radius: 8px;
    padding: 2px 8px; text-transform: uppercase; }
  .meta .type .ic { width: 16px; height: 16px; }
  .meta .gst { margin-inline-start: auto; }
  .banner { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px 16px; font-size: 20px; font-weight: 900;
    letter-spacing: .04em; text-transform: uppercase; }
  .banner .ic { width: 24px; height: 24px; }
  .banner.updated { background: var(--warning); color: var(--canvas); animation: blink 1.2s ease-in-out 3; }
  .banner.restored, .banner.recalled { background: var(--info-soft); color: var(--info-ink); }
  .banner.cancelled { background: var(--danger-strong); color: #fff; font-size: 24px; }
  .note { display: flex; align-items: flex-start; gap: 8px; margin: 12px 12px 0; padding: 8px 12px; border-radius: 12px;
    background: var(--warning-soft); color: var(--warning-ink); font-size: 18px; font-weight: 800; }
  .note .ic, .inote .ic { margin-top: 2px; }
  .group { border-top: 1px solid var(--line); }
  .ghead { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 12px 16px 0; color: var(--muted);
    font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
  .gst { display: inline-flex; align-items: center; gap: 4px; border-radius: 8px; padding: 2px 8px; font-size: 14px; font-weight: 900;
    white-space: nowrap; letter-spacing: 0; background: var(--primary-soft-2); color: var(--primary-ink); }
  .gst .ic { width: 16px; height: 16px; }
  .gst.in_progress { background: var(--info-soft); color: var(--info-ink); }
  .gst.ready, .gst.bumped { background: var(--success-soft); color: var(--success-ink); }
  .gst.cancelled { background: var(--danger-soft); color: var(--danger-ink); }
  ul.items { list-style: none; padding: 6px 8px 10px; }
  .combo-head { display: flex; align-items: center; gap: 8px; padding: 8px 8px 0; color: var(--primary-ink); font-size: 16px;
    font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
  .item { display: flex; align-items: flex-start; gap: 12px; padding: 8px; border-radius: 12px; }
  .item.child { margin-inline-start: 16px; border-inline-start: 2px solid rgba(234,90,18,.4); padding-inline-start: 12px; }
  .chk { flex: 0 0 auto; width: 48px; height: 48px; border-radius: 12px; border: 2px solid var(--line-strong); background: var(--surface-2);
    color: transparent; display: inline-flex; align-items: center; justify-content: center; }
  .chk .ic { width: 28px; height: 28px; stroke-width: 3.5; }
  .item.done .chk { background: var(--success-strong); border-color: var(--success-strong); color: #fff; }
  .item.done .body { opacity: .45; }
  .body { flex: 1; min-width: 0; }
  .st-cancelled .body { opacity: .6; }
  .line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 24px; font-weight: 800; line-height: 1.2; }
  .qty { display: inline-flex; justify-content: center; min-width: 48px; padding: 0 6px; border-radius: 8px; background: var(--surface-3);
    color: var(--ink); font-weight: 900; line-height: 40px; font-variant-numeric: tabular-nums; }
  .qty.multi { background: var(--primary); background-image: var(--ember); color: #fff; }
  .name { min-width: 0; overflow-wrap: anywhere; word-wrap: break-word; }
  .st-cancelled .item .name { text-decoration: line-through; color: var(--muted); }
  .mark { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 4px 12px; font-size: 14px; font-weight: 900;
    text-transform: uppercase; }
  .mark .ic { width: 14px; height: 14px; stroke-width: 3; }
  .item.added .mark { background: var(--success-soft); color: var(--success-ink); }
  .item.changed .mark { background: var(--warning-soft); color: var(--warning-ink); }
  .item.removed .mark { background: var(--danger-soft); color: var(--danger-ink); }
  .item.removed .name { text-decoration: line-through; color: var(--danger-ink); } .item.removed .chk { visibility: hidden; }
  .item.removed .qty.multi { background: var(--surface-3); color: var(--ink); }
  ul.mods { list-style: none; margin-top: 6px; }
  .mod { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 18px; font-weight: 700; color: var(--ink-2); }
  .mod .mi { flex: 0 0 auto; width: 28px; height: 28px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;
    background: var(--surface-3); color: var(--muted); }
  .mod .mi .ic { width: 20px; height: 20px; stroke-width: 3; }
  .mod.no { color: var(--danger-ink); font-size: 20px; font-weight: 900; } .mod.no .mi { background: var(--danger-strong); color: #fff; }
  .mod.extra { color: var(--primary-ink); font-size: 20px; font-weight: 800; } .mod.extra .mi { background: var(--primary-soft-2); color: var(--accent); }
  .inote { display: flex; align-items: flex-start; gap: 8px; margin-top: 6px; padding: 6px 10px; border-radius: 8px;
    background: var(--warning-soft); color: var(--warning-ink); font-size: 18px; font-weight: 800; }
  .foot { margin-top: auto; display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; border-top: 1px solid var(--line); }
  .foot button { min-height: 56px; border-radius: 16px; padding: 0 20px; font-size: 18px; font-weight: 800; display: inline-flex;
    align-items: center; justify-content: center; gap: 10px; }
  .foot button .ic { width: 24px; height: 24px; }
  .foot button:active { transform: scale(.97); }
  .foot .start { background: var(--surface-2); color: var(--ink); border: 1px solid var(--line-strong); }
  .foot .bump { flex: 1; background: var(--success-strong); color: #fff; }
  .st-cancelled .foot .bump { background: var(--surface-2); color: var(--ink); border: 1px solid var(--line-strong); }
  #flash { position: fixed; top: 0; right: 0; bottom: 0; left: 0; background: var(--primary); opacity: 0; pointer-events: none; z-index: 30; }
  #flash.on { animation: screenFlash .9s ease-out; }
  .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 40; background: var(--inverse); color: var(--on-inverse);
    border-radius: 16px; padding: 12px; padding-inline-start: 20px; display: flex; align-items: center; gap: 16px; font-size: 20px;
    font-weight: 800; box-shadow: var(--elev-4); max-width: calc(100% - 32px); }
  .toast button { background: var(--primary); background-image: var(--ember); color: #fff; border-radius: 12px; min-height: 56px; padding: 0 24px;
    font-size: 18px; font-weight: 900; }
  .overlay { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 50; background: var(--canvas); display: flex; align-items: center;
    justify-content: center; flex-direction: column; gap: 16px; padding: 20px; text-align: center; }
  .brand.big { width: 72px; height: 72px; border-radius: 20px; } .brand.big .ic { width: 40px; height: 40px; }
  .overlay h2 { font-size: 32px; font-weight: 900; } .overlay p { color: var(--muted); font-size: 19px; font-weight: 600; }
  .go { width: 96px; height: 96px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
    background: var(--primary); background-image: var(--ember); color: #fff; box-shadow: var(--glow); margin-top: 8px; }
  .go .ic { width: 44px; height: 44px; }
  .pin-dots { font-size: 44px; letter-spacing: 14px; min-height: 56px; font-weight: 900; direction: ltr; color: var(--primary-ink); }
  .pad { display: grid; grid-template-columns: repeat(3, 96px); gap: 12px; direction: ltr; }
  .pad button { height: 76px; border-radius: 16px; background: var(--surface-2); border: 1px solid var(--line-strong); font-size: 30px; font-weight: 800; }
  .pad button:active { transform: scale(.97); background: var(--surface-3); }
  .pad button.ok { background: var(--primary); background-image: var(--ember); border-color: transparent; color: #fff; font-size: 20px; }
  .err { color: var(--danger-ink); font-weight: 800; min-height: 24px; font-size: 18px; }
  .offline-banner { position: fixed; top: 72px; left: 0; right: 0; z-index: 11; display: flex; align-items: center; justify-content: center;
    gap: 8px; background: var(--danger-strong); color: #fff; padding: 8px; font-size: 18px; font-weight: 800; }
  @keyframes screenFlash { 0% { opacity: 0; } 15% { opacity: .3; } 100% { opacity: 0; } }
  [dir="rtl"] .allday b, [dir="rtl"] .banner, [dir="rtl"] .ghead, [dir="rtl"] .combo-head, [dir="rtl"] .meta .type,
  [dir="rtl"] .tpill .tw, [dir="rtl"] .mark { text-transform: none; letter-spacing: 0; }
  @media (max-width: 1535px) { .bar h1 { display: none; } }
  @media (max-width: 1279px) { .bar .lbl, #connText { display: none; } .bar .btn { padding: 0 14px; } }
  @media (max-width: 760px) { .clock, .bar .brand { display: none; } .grid { grid-template-columns: 1fr; } .bar select { min-width: 150px; } }
`
