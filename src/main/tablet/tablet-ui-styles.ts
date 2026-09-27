/**
 * Ember v4 look for the LAN waiter page — token values copied from src/renderer/src/styles/tokens.css
 * (light on :root, warm charcoal on .dark). No blur, no animated shadows, 48px+ targets, logical
 * (RTL-safe) properties only. Fonts come from /tablet/fonts (the POS's bundled Inter / Cairo).
 */
export const TABLET_CSS = String.raw`
@font-face { font-family: 'FFM Inter'; font-style: normal; font-weight: 400 900; font-display: swap;
  src: url('/tablet/fonts/inter-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC, U+2212; }
@font-face { font-family: 'FFM Cairo'; font-style: normal; font-weight: 400 500; font-display: swap; size-adjust: 110%;
  src: url('/tablet/fonts/cairo-400-arabic.woff2') format('woff2'); unicode-range: U+0600-06FF, U+0750-077F, U+200C-200E, U+FB50-FDFF, U+FE70-FEFC; }
@font-face { font-family: 'FFM Cairo'; font-style: normal; font-weight: 600 900; font-display: swap; size-adjust: 110%;
  src: url('/tablet/fonts/cairo-700-arabic.woff2') format('woff2'); unicode-range: U+0600-06FF, U+0750-077F, U+200C-200E, U+FB50-FDFF, U+FE70-FEFC; }
:root {
  color-scheme: light;
  --canvas: #faf7f2; --surface: #ffffff; --surface-2: #f4efe8; --surface-3: #e9e2d8; --inverse: #1c1917; --on-inverse: #faf7f2;
  --overlay: rgb(28 25 23 / .5);
  --ink: #1c1917; --ink-2: #44403c; --muted: #6f665e; --faint: #a39a91;
  --line: #e9e2d8; --line-strong: #d6ccbf;
  --primary: #dc4f0d; --primary-from: #ea580c; --primary-to: #c2410c; --primary-soft: #fff0e3; --primary-soft-2: #ffdcc0;
  --primary-ink: #c2410c; --accent: #ff7a1a;
  --success-soft: #e7f6ec; --success-ink: #15803d; --warning-soft: #fdf2dc; --warning-ink: #a15c07;
  --danger: #dc2626; --danger-soft: #fdeceb; --danger-ink: #b91c1c; --danger-strong: #c81e1e;
  --cat-1: #ef5b1b; --cat-2: #d99a00; --cat-3: #3c9a4a; --cat-4: #0f9790; --cat-5: #2f78dc;
  --cat-6: #6b57e0; --cat-7: #bf3d9e; --cat-8: #dc3f57; --cat-9: #8b6546; --cat-10: #5b7086;
  --elev-1: 0 1px 2px rgb(41 37 36 / .05), 0 1px 3px rgb(41 37 36 / .06);
  --elev-3: 0 2px 4px rgb(41 37 36 / .04), 0 14px 32px -8px rgb(41 37 36 / .16);
  --elev-4: 0 24px 56px -12px rgb(41 37 36 / .28), 0 4px 12px rgb(41 37 36 / .06);
  --elev-primary: 0 1px 2px rgb(194 65 12 / .3), 0 6px 16px -4px rgb(234 88 12 / .45);
  --ease: cubic-bezier(.22, 1, .36, 1);
  --top: 64px; --tool: 68px; --cartw: 384px;
}
.dark {
  color-scheme: dark;
  --canvas: #141110; --surface: #1d1916; --surface-2: #26211d; --surface-3: #312b26; --inverse: #f5efe8; --on-inverse: #1c1917;
  --overlay: rgb(8 6 5 / .66);
  --ink: #f5efe8; --ink-2: #ddd4ca; --muted: #aba196; --faint: #7b726a;
  --line: #2f2925; --line-strong: #403832;
  --primary: #ea5a12; --primary-from: #ee6117; --primary-to: #c9440d; --primary-soft: #33211a; --primary-soft-2: #472a1b;
  --primary-ink: #ff9a52; --accent: #ff8a3d;
  --success-soft: #142a1c; --success-ink: #5ee08e; --warning-soft: #2f2412; --warning-ink: #fbbf45;
  --danger: #ef4444; --danger-soft: #361a19; --danger-ink: #fb7d7d; --danger-strong: #d42a2a;
  --cat-1: #ff7433; --cat-2: #f0b429; --cat-3: #5bbf69; --cat-4: #2dbdb4; --cat-5: #5a9cf5;
  --cat-6: #8f7ef5; --cat-7: #e062c0; --cat-8: #f76a7e; --cat-9: #b58b69; --cat-10: #8a9db2;
  --elev-1: 0 0 0 1px rgb(255 255 255 / .035), 0 1px 2px rgb(0 0 0 / .4);
  --elev-3: 0 0 0 1px rgb(255 255 255 / .05), 0 14px 32px -8px rgb(0 0 0 / .6);
  --elev-4: 0 0 0 1px rgb(255 255 255 / .06), 0 24px 56px -12px rgb(0 0 0 / .7);
  --elev-primary: 0 0 0 1px rgb(255 138 61 / .25), 0 6px 20px -4px rgb(255 106 26 / .4);
}
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
[hidden] { display: none !important; }
html, body { height: 100%; overflow: hidden; background: var(--canvas); color: var(--ink); font-size: 16px;
  font-family: 'FFM Inter', 'FFM Cairo', system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Arabic', sans-serif, 'Segoe UI Emoji', 'Noto Color Emoji';
  font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }
html[lang=ar] body { font-family: 'FFM Cairo', 'FFM Inter', system-ui, 'Segoe UI', Tahoma, 'Noto Sans Arabic', sans-serif, 'Segoe UI Emoji'; line-height: 1.45; }
button, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; border: 0; background: none; }
button:disabled { cursor: not-allowed; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.money { unicode-bidi: isolate; direction: ltr; white-space: nowrap; font-family: 'FFM Inter', system-ui, sans-serif; }
.money small { font-size: .78em; font-weight: 600; opacity: .8; }
.tap { transition: transform .1s var(--ease); } .tap:active:not(:disabled):not([aria-disabled=true]) { transform: scale(.97); }

/* top bar + toolbar */
.top { position: fixed; top: 0; inset-inline: 0; height: var(--top); z-index: 20; display: flex; align-items: center; gap: 10px;
  padding-inline: 12px; background: var(--surface); border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
.mark { flex: none; width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; color: #fff; font-weight: 900;
  font-size: 19px; background: linear-gradient(135deg, var(--primary-from), var(--primary-to)); box-shadow: var(--elev-primary); }
.brand b { display: block; font-size: 18px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.brand small { display: block; font-size: 13px; font-weight: 600; color: var(--muted); }
.seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 13px; background: var(--surface-2); flex: none; }
.seg button { min-height: 42px; min-width: 44px; padding-inline: 12px; border-radius: 10px; font-weight: 700; font-size: 15px; color: var(--ink-2); }
.seg button[aria-pressed=true] { background: var(--surface); color: var(--ink); box-shadow: var(--elev-1); }
.dark .seg button[aria-pressed=true] { background: var(--surface-3); }
.icon-btn { position: relative; flex: none; width: 48px; height: 48px; border-radius: 12px; background: var(--surface-2); display: grid;
  place-items: center; font-size: 20px; color: var(--ink); }
.icon-btn .dot { position: absolute; top: 6px; inset-inline-end: 6px; min-width: 20px; height: 20px; border-radius: 999px; padding-inline: 5px;
  background: var(--success-ink); color: var(--surface); font-size: 12px; font-weight: 800; display: grid; place-items: center; }
.tool { position: fixed; top: var(--top); inset-inline: 0; height: var(--tool); z-index: 15; display: flex; align-items: center; gap: 10px;
  padding-inline: 12px; background: var(--canvas); }
.search { position: relative; flex: 0 0 230px; }
.search input { width: 100%; height: 48px; border-radius: 12px; border: 1px solid var(--line-strong); background: var(--surface);
  padding-inline: 40px 12px; font-size: 16px; }
.search span { position: absolute; inset-inline-start: 13px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.chips { flex: 1; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding-block: 8px; }
.chips::-webkit-scrollbar { display: none; }
.chip { flex: none; display: flex; align-items: center; gap: 8px; min-height: 48px; padding-inline: 12px 16px; border-radius: 999px;
  background: var(--surface); border: 1px solid var(--line); font-weight: 700; font-size: 15px; color: var(--ink-2); white-space: nowrap; }
.chip i { width: 10px; height: 10px; border-radius: 50%; background: var(--cat); flex: none; }
.chip[aria-pressed=true] { background: var(--inverse); color: var(--on-inverse); border-color: transparent; }
@media (max-width: 640px) {
  :root { --tool: 116px; }
  .tool { flex-direction: column; align-items: stretch; gap: 4px; padding-top: 8px; }
  .search { flex: none; } .brand small { display: none; } .lang button { min-width: 40px; padding-inline: 8px; }
}

/* menu grid */
.menu { position: fixed; top: calc(var(--top) + var(--tool)); bottom: 0; inset-inline: 0; overflow-y: auto; padding: 4px 12px 96px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.tile { position: relative; display: flex; flex-direction: column; text-align: start; min-height: 164px; overflow: hidden; contain: layout paint;
  border-radius: 16px; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--elev-1); }
.tile .art { height: 76px; display: grid; place-items: center; font-size: 40px; border-top: 4px solid var(--cat); background: var(--surface-2);
  background: linear-gradient(160deg, color-mix(in oklab, var(--cat) 18%, var(--surface)), color-mix(in oklab, var(--cat) 8%, var(--surface))); }
.tile .art em { font-style: normal; font-size: 30px; font-weight: 800; color: var(--cat); }
.tile .body { flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 12px; }
.tile .nm { font-size: 15.5px; font-weight: 650; line-height: 1.25; color: var(--ink); display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden; }
.tile .row { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.tile .pr { font-size: 16px; font-weight: 800; color: var(--ink); }
.tag { flex: none; font-size: 12px; font-weight: 700; border-radius: 999px; padding: 3px 9px; background: var(--surface-2); color: var(--ink-2); }
.tag.combo { background: var(--primary-soft); color: var(--primary-ink); }
.tile .qty { position: absolute; top: 10px; inset-inline-end: 10px; min-width: 32px; height: 32px; padding-inline: 8px; border-radius: 999px; direction: ltr;
  display: grid; place-items: center; font-weight: 800; color: #fff; background: linear-gradient(180deg, var(--primary-from), var(--primary-to));
  box-shadow: var(--elev-primary); }
.tile .off { position: absolute; top: 10px; inset-inline-start: 10px; font-size: 12.5px; font-weight: 800; border-radius: 999px; padding: 4px 10px;
  background: var(--danger-soft); color: var(--danger-ink); }
.tile[aria-disabled=true] { cursor: not-allowed; }
.tile[aria-disabled=true] .art, .tile[aria-disabled=true] .body { opacity: .45; filter: grayscale(1); }
.bump { animation: bump .3s var(--ease); }
.empty { padding: 56px 20px; text-align: center; color: var(--muted); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty .ic { width: 72px; height: 72px; border-radius: 22px; display: grid; place-items: center; font-size: 34px; background: var(--primary-soft); }
.empty b { font-size: 18px; color: var(--ink); }

/* order (cart) — docked on wide screens, bottom sheet on phones */
.cart { position: fixed; z-index: 30; display: flex; flex-direction: column; background: var(--surface); }
.cart-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 12px; border-bottom: 1px dashed var(--line-strong); }
.cart-head h2 { font-size: 20px; font-weight: 800; flex: 1; } .cart-head .cnt { color: var(--muted); font-weight: 600; font-size: 14px; }
.lines { flex: 1; overflow-y: auto; padding: 4px 12px; min-height: 80px; }
.line { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: start; padding: 12px 2px; border-bottom: 1px solid var(--line); }
.line.bad { background: var(--danger-soft); border-radius: 12px; padding-inline: 8px; }
.step { display: flex; align-items: center; border-radius: 12px; background: var(--surface-2); }
.step button { width: 44px; height: 44px; font-size: 22px; font-weight: 700; color: var(--ink); }
.step span { min-width: 26px; text-align: center; font-weight: 800; font-size: 16px; }
.line .info { min-width: 0; text-align: start; padding-top: 2px; }
.line .nm { font-weight: 700; font-size: 16px; line-height: 1.3; }
.line .sub { margin-top: 3px; font-size: 13.5px; line-height: 1.4; color: var(--muted); }
.sub .no { color: var(--danger-ink); font-weight: 800; }
.line .chg { display: inline-block; margin-top: 4px; font-size: 13.5px; font-weight: 700; color: var(--primary-ink); }
.line .amt { padding-top: 10px; font-weight: 800; font-size: 15.5px; }
.foot { display: flex; flex-direction: column; gap: 10px; padding: 12px 16px calc(14px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--line); background: var(--surface); }
.foot .seg { display: flex; } .foot .seg button { flex: 1; min-height: 48px; }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.field { width: 100%; height: 48px; border-radius: 12px; border: 1px solid var(--line-strong); background: var(--surface); padding-inline: 12px; font-size: 16px; }
.field::placeholder { color: var(--faint); }
.field.full, #table { grid-column: 1 / -1; } .field.bad { border-color: var(--danger); background: var(--danger-soft); }
.totals { display: flex; flex-direction: column; gap: 4px; }
.totals .r { display: flex; justify-content: space-between; gap: 8px; font-size: 15px; color: var(--ink-2); }
.totals .r.promo { color: var(--success-ink); font-weight: 700; }
.totals .r.tot { font-size: 26px; font-weight: 800; color: var(--ink); padding-top: 6px; border-top: 1px dashed var(--line-strong); }
.totals .hint { font-size: 12.5px; color: var(--muted); }
.banner { display: flex; gap: 8px; align-items: flex-start; border-radius: 12px; padding: 10px 12px; font-size: 14.5px; font-weight: 650; line-height: 1.4; }
.banner.err { background: var(--danger-soft); color: var(--danger-ink); }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding-inline: 18px; border-radius: 12px;
  font-weight: 700; font-size: 16px; }
.btn.ember { color: #fff; background: linear-gradient(180deg, var(--primary-from), var(--primary-to)); box-shadow: var(--elev-primary), inset 0 1px 0 rgb(255 255 255 / .2); }
.btn.ember:disabled { background: var(--surface-3); color: var(--muted); box-shadow: none; }
.btn.xl { min-height: 60px; font-size: 18px; width: 100%; }
.btn.soft { background: var(--primary-soft); color: var(--primary-ink); } .btn.ghost { background: var(--surface-2); color: var(--ink); }
.cartbar { position: fixed; z-index: 25; inset-inline: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); height: 62px; border-radius: 16px;
  display: flex; align-items: center; gap: 12px; padding-inline: 14px 18px; color: #fff; font-size: 17px; font-weight: 700;
  background: linear-gradient(180deg, var(--primary-from), var(--primary-to)); box-shadow: var(--elev-primary), var(--elev-3); }
.cartbar .n { min-width: 34px; height: 34px; border-radius: 999px; display: grid; place-items: center; background: rgb(255 255 255 / .22); font-weight: 800; }
.cartbar .go { flex: 1; text-align: start; } .cartbar .money { font-weight: 800; }
@media (min-width: 900px) {
  .menu { inset-inline-end: var(--cartw); padding-bottom: 16px; }
  .tool { inset-inline-end: var(--cartw); }
  .cart { top: var(--top); bottom: 0; inset-inline-end: 0; width: var(--cartw); border-inline-start: 1px solid var(--line); }
  .cartbar, .cart .x { display: none !important; }
}
@media (max-width: 899px) {
  .cart { z-index: 36; inset-inline: 0; bottom: 0; max-height: 92vh; border-radius: 24px 24px 0 0; box-shadow: var(--elev-4);
    transform: translateY(105%); transition: transform .25s var(--ease); visibility: hidden; }
  .cart.open { transform: none; visibility: visible; }
}

/* scrim, options sheet, done screen, toast, PIN */
.scrim { position: fixed; inset: 0; z-index: 35; background: var(--overlay); animation: fade .2s ease-out; }
.sheet { position: fixed; z-index: 40; display: flex; flex-direction: column; background: var(--surface); box-shadow: var(--elev-4); animation: pop .25s var(--ease); }
@media (max-width: 699px) { .sheet { inset-inline: 0; bottom: 0; max-height: 94vh; border-radius: 24px 24px 0 0; } }
@media (min-width: 700px) { .sheet { top: 50%; left: 50%; width: min(620px, 92vw); max-height: 88vh; border-radius: 24px; transform: translate(-50%, -50%); animation: none; } }
.sh-head { display: flex; align-items: center; gap: 14px; padding: 16px; border-bottom: 1px solid var(--line); }
.sh-head .art { flex: none; width: 60px; height: 60px; border-radius: 16px; display: grid; place-items: center; font-size: 32px;
  background: color-mix(in oklab, var(--cat) 16%, var(--surface)); border-bottom: 3px solid var(--cat); }
.sh-head h3 { font-size: 21px; font-weight: 800; line-height: 1.2; } .sh-head .base { color: var(--muted); font-weight: 600; font-size: 14.5px; }
.sh-head .t { flex: 1; min-width: 0; }
.sh-body { flex: 1; overflow-y: auto; padding: 4px 16px 16px; }
.grp { padding: 14px 0 12px; border-bottom: 1px dashed var(--line-strong); } .grp:last-child { border-bottom: 0; }
.grp-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.grp-h b { font-size: 17px; font-weight: 800; }
.rule { flex: none; font-size: 12.5px; font-weight: 800; border-radius: 999px; padding: 4px 10px; background: var(--surface-2); color: var(--ink-2); }
.rule.req { background: var(--warning-soft); color: var(--warning-ink); }
.grp.met .rule.req { background: var(--success-soft); color: var(--success-ink); }
.grp.need .rule { background: var(--danger-soft); color: var(--danger-ink); }
.opts { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 8px; }
.opt { display: flex; align-items: center; gap: 10px; min-height: 54px; padding: 8px 12px; border-radius: 12px; text-align: start;
  border: 1.5px solid var(--line-strong); background: var(--surface); font-weight: 650; font-size: 15px; color: var(--ink); cursor: pointer; }
.opt .mk { flex: none; width: 22px; height: 22px; border-radius: 7px; border: 2px solid var(--line-strong); display: grid; place-items: center;
  font-size: 13px; font-weight: 900; color: transparent; }
.opt.radio .mk { border-radius: 50%; }
.opt .lb { flex: 1; min-width: 0; line-height: 1.25; } .opt .em { font-size: 22px; flex: none; }
.opt .dp { flex: none; font-size: 13px; font-weight: 700; color: var(--muted); direction: ltr; unicode-bidi: isolate; }
.opt[aria-pressed=true] { border-color: var(--primary); background: var(--primary-soft); }
.opt[aria-pressed=true] .mk { background: var(--primary); border-color: var(--primary); color: #fff; }
.opt.no[aria-pressed=true] { border-color: var(--danger); background: var(--danger-soft); }
.opt.no[aria-pressed=true] .mk { background: var(--danger-strong); border-color: var(--danger-strong); }
.opt[aria-disabled=true] { opacity: .45; cursor: not-allowed; }
.opt.has-q { grid-column: span 2; }
.opt .mini { display: flex; align-items: center; gap: 2px; border-radius: 10px; background: var(--surface); }
.opt .mini button { width: 36px; height: 36px; font-size: 18px; font-weight: 800; } .opt .mini span { min-width: 18px; text-align: center; font-weight: 800; }
.child { margin-top: 10px; padding: 4px 12px; border-radius: 14px; background: var(--surface-2); }
.child .grp { border-color: var(--line-strong); } .child h4 { padding-top: 10px; font-size: 13.5px; font-weight: 800; color: var(--muted); }
.sh-foot { display: flex; align-items: center; gap: 12px; padding: 12px 16px calc(14px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--line); }
.sh-foot .btn.ember { flex: 1; min-height: 58px; font-size: 17px; }
.skel { height: 54px; border-radius: 12px; background: var(--surface-2); margin-top: 10px; animation: pulse 1.2s ease-in-out infinite; }
.done { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  padding: 24px; text-align: center; background: var(--canvas); }
.done .ok { width: 104px; height: 104px; border-radius: 50%; display: grid; place-items: center; font-size: 54px; font-weight: 900;
  background: var(--success-soft); color: var(--success-ink); animation: pop .3s var(--ease); }
.done h2 { font-size: 32px; font-weight: 800; } .done p { font-size: 17px; color: var(--muted); }
.done .acts { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 8px; } .done .btn { min-width: 200px; min-height: 58px; }
.recent { display: flex; flex-direction: column; gap: 8px; padding-block: 12px; }
.ro { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--surface-2); }
.ro b { font-size: 22px; font-weight: 800; min-width: 64px; } .ro .d { flex: 1; color: var(--muted); font-size: 14px; font-weight: 600; }
.st { border-radius: 999px; padding: 6px 12px; font-size: 13.5px; font-weight: 800; background: var(--warning-soft); color: var(--warning-ink); }
.st.ready { background: var(--success-soft); color: var(--success-ink); } .st.completed { background: var(--surface-3); color: var(--ink-2); }
.st.cancelled { background: var(--danger-soft); color: var(--danger-ink); }
.toast { position: fixed; z-index: 70; left: 50%; bottom: 92px; transform: translateX(-50%); max-width: calc(100vw - 32px); display: flex;
  align-items: center; gap: 14px; padding: 10px 12px 10px 18px; border-radius: 14px; background: var(--inverse); color: var(--on-inverse);
  font-weight: 650; font-size: 15px; box-shadow: var(--elev-3); animation: fade .2s ease-out; }
.toast button { min-height: 40px; padding-inline: 12px; border-radius: 10px; font-weight: 800; color: var(--primary-soft-2); }
.pin { position: fixed; inset: 0; z-index: 80; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  padding: 24px; text-align: center; background: var(--canvas); }
.pin h1 { font-size: 26px; font-weight: 800; } .pin p { color: var(--muted); font-size: 16px; }
.dots { display: flex; gap: 16px; direction: ltr; margin-block: 8px; }
.dots i { width: 18px; height: 18px; border-radius: 50%; background: var(--surface-3); } .dots i.on { background: var(--primary); }
.pin .err { min-height: 22px; color: var(--danger-ink); font-weight: 700; }
.pad { display: grid; grid-template-columns: repeat(3, 88px); gap: 12px; direction: ltr; }
.pad button { height: 72px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--elev-1); font-size: 28px; font-weight: 700; }
.pad button.go { color: #fff; border: 0; background: linear-gradient(180deg, var(--primary-from), var(--primary-to)); }
@keyframes pop { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes bump { 0% { transform: scale(1); } 40% { transform: scale(1.25); } 100% { transform: scale(1); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`
