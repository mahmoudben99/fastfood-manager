import { TABLET_CSS } from './tablet-ui-styles'
import { TABLET_STRINGS } from './tablet-ui-i18n'
import { TABLET_CORE_SCRIPT } from './tablet-ui-script'
import { TABLET_SHEET_SCRIPT } from './tablet-ui-sheet'
import { TABLET_CART_SCRIPT } from './tablet-ui-cart'

/**
 * v4 LAN waiter page (GET /): Ember look, light/dark, en/fr/ar (RTL), 48px+ targets. Category
 * chips + item tiles, options sheet (modifiers) and combo builder fed by /api/items/:id/options,
 * sold-out items greyed and untappable, live prices / promotions from /api/quote (a dry run of
 * the real order), orders sent with `modifiers` + `children` (the server re-validates and prices
 * everything), and "ready" status from the kitchen display. No framework, no external assets.
 * Markup + config here; styles in tablet-ui-styles.ts; behaviour in tablet-ui-{script,sheet,cart}.ts.
 */
export interface TabletPageOptions {
  restaurantName?: string
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export function getTabletHTML(lang: string, pinEnabled: boolean, pinVersion: string, options: TabletPageOptions = {}): string {
  const safeLang = lang === 'fr' || lang === 'ar' ? lang : 'en'
  const name = (options.restaurantName || '').trim()
  const config = JSON.stringify({
    lang: safeLang,
    pinEnabled,
    pinVersion: String(pinVersion),
    restaurantName: name,
    strings: TABLET_STRINGS
  }).replace(/</g, '\\u003c')
  const initial = escapeHtml((name || 'F').slice(0, 1).toUpperCase())
  return /* html */ `<!DOCTYPE html>
<html lang="${safeLang}" dir="${safeLang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#faf7f2">
<title>${escapeHtml(name || 'FFM')} · Orders</title>
<style>${TABLET_CSS}</style>
</head>
<body>
<div class="pin" id="pin" hidden>
  <div class="mark">${initial}</div>
  <h1 data-t="pin_title"></h1><p data-t="pin_prompt"></p>
  <div class="dots" id="pinDots"><i></i><i></i><i></i><i></i></div>
  <div class="err" id="pinErr"></div>
  <div class="pad" id="pad"></div>
</div>

<div id="app" hidden>
  <header class="top">
    <div class="brand"><div class="mark">${initial}</div><div><b id="brandName">${escapeHtml(name || 'Fast Food Manager')}</b><small data-t="app_sub"></small></div></div>
    <div class="seg lang" id="langSeg" role="group">
      <button data-act="lang" data-lang="ar" lang="ar">ع</button><button data-act="lang" data-lang="fr">FR</button><button data-act="lang" data-lang="en">EN</button>
    </div>
    <button class="icon-btn tap" data-act="theme" id="themeBtn" data-ta="theme"></button>
    <button class="icon-btn tap" data-act="recent" id="recentBtn" data-ta="recent">🧾<span class="dot" id="readyDot" hidden></span></button>
  </header>
  <div class="tool">
    <label class="search"><span aria-hidden="true">🔍</span><input id="search" type="search" autocomplete="off" data-tp="search"></label>
    <div class="chips" id="chips" role="tablist"></div>
  </div>
  <main class="menu" id="menu"><div class="grid" id="grid"></div><div id="menuEmpty" hidden></div></main>

  <aside class="cart" id="cart" aria-labelledby="cartTitle">
    <div class="cart-head">
      <h2 id="cartTitle" data-t="cart"></h2><span class="cnt" id="cartCount"></span>
      <button class="icon-btn x tap" data-act="closeCart" data-ta="close">✕</button>
    </div>
    <div class="lines" id="lines"></div>
    <div class="foot" id="foot">
      <div class="seg" id="typeSeg" role="group">
        <button data-act="type" data-type="local" data-t="dine_in"></button>
        <button data-act="type" data-type="takeout" data-t="takeout"></button>
        <button data-act="type" data-type="delivery" data-t="delivery"></button>
      </div>
      <div class="fields">
        <input class="field" id="table" inputmode="numeric" maxlength="20" data-tp="table_ph">
        <input class="field" id="phone" type="tel" maxlength="30" data-tp="phone_ph">
        <input class="field" id="cname" maxlength="60" data-tp="name_ph">
        <input class="field full" id="notes" maxlength="300" data-tp="notes_ph">
      </div>
      <div class="totals" id="totals"></div>
      <div class="banner err" id="cartErr" role="alert" hidden></div>
      <button class="btn ember xl tap" id="sendBtn" data-act="send"></button>
    </div>
  </aside>
  <button class="cartbar tap" id="cartbar" data-act="openCart" hidden></button>
</div>

<div class="scrim" id="scrim" data-act="scrim" hidden></div>
<section class="sheet" id="sheet" role="dialog" aria-modal="true" hidden></section>
<section class="sheet" id="recentSheet" role="dialog" aria-modal="true" hidden></section>
<div class="done" id="done" hidden>
  <div class="ok">✓</div>
  <h2 id="doneTitle"></h2><p id="doneSub"></p>
  <div class="acts">
    <button class="btn ember tap" data-act="newOrder" data-t="new_order"></button>
    <button class="btn ghost tap" data-act="recent" data-t="recent"></button>
  </div>
</div>
<div class="toast" id="toast" role="status" hidden><span id="toastText"></span><button id="toastBtn" hidden></button></div>

<script>window.TABLET_CONFIG = ${config};</script>
<script>(function () {
'use strict';
${TABLET_CORE_SCRIPT}
${TABLET_SHEET_SCRIPT}
${TABLET_CART_SCRIPT}
start();
})();</script>
</body>
</html>`
}
