# Ember v4 — design rules (wave 2 MUST follow)

Warm, premium, fast. Built for cheap Windows touch PCs in bright kitchens. Living reference:
`#/styleguide` (admin password) shows every token and component in the current theme + direction.

## 1. Setup
- Import primitives from `components/ui` (barrel): `import { Button, Card, Money, toast } from '../../components/ui'`.
- Tokens: `styles/tokens.css` (`:root` light, `.dark` dark, `.perf` performance). Motion/utilities: `styles/motion.css`.
- Theme runtime: `theme/theme.ts`; store fields `themeMode` ('light'|'dark'|'system'), `darkMode` (resolved),
  `perfMode`, `density` + setters. Settings keys: `theme_mode`, `dark_mode` (kept in sync), `perf_mode`, `ui_density`.
- Fonts are bundled (offline, OFL): `FFM Inter` (variable 400–900) and `FFM Cairo` (400/600/700/900, `size-adjust:110%`).

## 2. Tokens → utilities (never hard-code hex, never use raw `gray-*`/`orange-*` in new code)
| Role | Utility | Use |
|---|---|---|
| Page background | `bg-canvas` | screens, app shell |
| Card / panel | `bg-surface` + `border border-line` | anything elevated |
| Sunken fill | `bg-surface-2`, `bg-surface-3` | chips, table heads, input wells, tracks, pressed |
| Inverse | `bg-inverse text-on-inverse` | active filter pill, tooltips |
| Text | `text-ink` (primary) · `text-ink-2` (secondary) · `text-muted` (meta, ≥4.5:1) · `text-faint` (placeholder/disabled ONLY) |
| Lines | `border-line` (default for every `border`) · `border-line-strong` (inputs, dashed dividers) |
| Brand fill | `bg-ember` (gradient + white text) · `bg-primary` (solid: toggles, bars) · `shadow-glow` |
| Brand tint | `bg-primary-soft` / `-soft-2` + `text-primary-ink` | selected, soft buttons, icon tiles |
| Brand text | `text-primary-ink` | links, highlighted numbers (never `text-primary` for body text) |
| Accent | `text-accent` / `bg-accent` | glows, active indicators, icons — never behind text |
| Status | `bg-{success,warning,danger,info}-soft` + `text-…-ink`; fills `bg-success-strong` / `bg-danger-strong` |
| Category | `bg-cat-1` … `bg-cat-10` (also `text-`, `border-`, `/15` opacity) |
| Elevation | `shadow-e1` (cards) · `shadow-e2` (hover/raised) · `shadow-e3` (popovers, toasts) · `shadow-e4` (modals) |
| Nav rail | `bg-nav text-nav-ink/-muted/-faint`, `bg-nav-hover`, `bg-nav-active`, `border-nav-line` |

Dark mode is automatic through the tokens (`.dark` on `<html>`). `dark:` variants follow that class;
use them only for rare tweaks (e.g. `dark:bg-surface-3` for an active pill that needs more lift).

## 3. Colour rules
- Contrast: body text ≥ 4.5:1, prices/totals ≥ 7:1 → prices are `text-ink` (bold), not orange.
- White on ember: only on `bg-ember` (≈4:1 at the label) with ≥ 16px/600 text. Never white on `accent`/orange-400.
- One primary (ember) action per view. Secondary actions: `secondary`/`soft`/`ghost` buttons.
- Status colour is never the only signal: add an icon or word (Paid ✓, Late ⏱).
- Dark: elevation = lighter surface + hairline, not shadow. No pure black, no navy.

### Category colours
- Pick by a stable key, never list index: `categoryColor(cat.id)`, `categoryTint(cat.id, 14)` (`theme/categoryColors.ts`).
- Use as a 4px start bar, a dot, or a tint (≤ 22% via `categoryTint`). Never a full saturated tile with text on it.
- Keep tile/category positions fixed (no auto-sort by popularity) — staff tap by muscle memory.

## 4. Typography & numbers
| Style | Class | Size/weight |
|---|---|---|
| Display | `text-display` | 40/800 |
| Order total | `text-total` | 32/800 |
| KPI value | `text-kpi` | 28/700 |
| Page title (PageHeader) | built-in | 28/800, tight tracking |
| H2 / section | `text-xl font-bold` | 20/700 |
| H3 / card title | `text-base font-semibold` (Card) / `text-lg font-semibold` | 16–18/600 |
| Body | `text-base` (POS) / `text-sm` (admin tables) | 16 / 14 |
| Meta / caption | `text-xs text-muted` / `text-[13px]` | 12–13/500 |
- Minimum text on POS screens: 14px; item names 15–16px/600 (Arabic reads larger via Cairo `size-adjust`).
- Arabic: line-heights are raised automatically on `html[lang=ar]`; no uppercase/letter-spacing tricks (`rtl:normal-case`).
- Numbers: body is `tabular-nums` globally. Money ALWAYS via `<Money value={n} />` (LTR-isolated, Inter digits,
  thin-space grouping "1 250.00 DA", smaller symbol). `animate` for live totals. `formatAmount()` for plain strings.
  End-align number columns (`text-end`). Latin digits in every language (Algeria uses Latin digits).
- `formatCurrency()` (v3) stays for receipts/printing; UI should move to `<Money>` (in RTL v3 renders "DA 300.00").

## 5. Spacing, layout, radius
- 4px grid (Tailwind spacing). Gaps: 8 (tight), 12 (lists), 16 (cards), 24 (sections), 32 (page padding lg).
- Admin pages render inside AdminLayout `main` (already `p-6 lg:p-8`, canvas bg). Start with `<PageHeader>`; don't add
  your own page background or outer padding.
- Radius: `rounded-lg` (8, small chips) · `rounded-xl` (12, buttons/inputs) · `rounded-2xl` (16, cards/tiles/modals) ·
  `rounded-3xl` (24, hero panels) · `rounded-full` (badges/pills).
- Density setting scales everything rem-based (root 15/16/18px). Never use px for spacing/type in new code except
  hairlines and icon sizes.

## 6. Touch targets
- Minimum 48px (`Button size="lg"`, `IconButton size="lg"`, inputs are 44px+). Primary POS actions 56–64px
  (`size="xl"` / `"touch"`). Gaps between targets ≥ 8px. No hover-only affordances; no tooltips as the only label.
- Double-tap guard on Pay / Print / Send: `<Button cooldownMs={800}>` and disable on empty cart.
- Destructive reversible actions → `toast.info(msg, { action: { label: t('ui.undo'), onClick } })` (5s), not a dialog.
  `ConfirmDialog` only for irreversible ones (void a paid order, delete with history).

## 7. Motion (CSS only, transform/opacity only)
- Tap: add `tap` to any custom touchable (scale .97, 100ms). Buttons/tiles from the kit already have it.
- Enter: `animate-pop-in` (modals, popovers 250ms), `animate-slide-in-end` (toasts), `animate-fade-in` (overlays),
  `animate-bump` (qty badge), `flash` (new ticket line, 600ms), `animate-pulse-soft` (skeletons, "live").
- Never animate `box-shadow`, `width`, `height`, `top/left`, `filter`. No infinite animations except spinners/live dots.
- `prefers-reduced-motion` and Performance mode switch animations off globally — don't fight it. `useCountUp` is
  already a no-op there.

## 8. RTL
- Logical utilities ONLY: `ms/me/ps/pe`, `start/end`, `border-s/e`, `rounded-s/e`, `text-start/end`. Never `ml/mr/pl/pr/left/right`
  (except centring tricks like `left-1/2 -translate-x-1/2`).
- Mirror directional icons: `className="rtl:-scale-x-100"` on arrows/chevrons/back/panel icons. Never mirror numbers,
  clocks, checkmarks, charts' time axis, media controls or logos.
- Horizontal transforms: use `var(--dir)` (1 LTR / -1 RTL), e.g. `translateX(calc(20px * var(--dir)))`.
- Latin data inside Arabic (item names, codes, money): wrap in `<bdi>`; `<Money>` already does.

## 9. Performance rules (weak PCs)
- No `backdrop-filter`/`blur` anywhere (overlays are flat `bg-overlay`). No big blurred glows or animated blobs.
- Shadows are static tokens (`shadow-e*`); Performance mode (`perf_mode`) replaces them with hairlines.
- Grids/lists: `contain-card` on tiles/cards; `auto-visibility` (content-visibility) on long lists; virtualise > 300 rows.
- Charts: prefer `<Sparkline>` / CSS bars; recharts only on analytics pages, lazy-loaded, `isAnimationActive={false}`.
- Heavy routes (`analytics`, `settings`, `receipt-editor`) should become `React.lazy` in App.tsx; keep `/orders` eager.
- Zustand: select narrow slices (`useAppStore((s) => s.currencySymbol)`), never the whole store in tiles/lines.
  Memo tiles and ticket lines. Images: fixed size, `loading="lazy" decoding="async"`.

## 10. Components (API cheatsheet)
- `Button` variant `primary|secondary|soft|outline|ghost|success|danger`, size `sm|md|lg|xl|touch`, `loading`, `icon`,
  `iconEnd`, `fullWidth`, `cooldownMs`. v3 props unchanged; a `bg-*` className still recolours a primary button.
- `IconButton` `icon`, `label` (required, a11y), variant `ghost|secondary|soft|primary|danger`, size `sm|md|lg|xl`, `badge`.
- `Card` `title`, `subtitle`, `icon`, `actions`, `padding`, variant `elevated|flat|sunken|interactive`.
- `Badge` variant `success|warning|danger|info|default|neutral|primary|solid`, `size`, `dot`, `icon`.
- `Input` / `Textarea` / `Select`: `label`, `error`, `helperText`; Input `leading`, `trailing`, `inputSize md|lg`;
  Select `selectSize`. All set `data-ui` (opts out of the legacy dark repaint). `Field` + `controlClass()` for custom controls.
- `Modal` `isOpen`, `onClose`, `title`, `description`, `size sm|md|lg|xl|2xl`, `footer`, `closeOnBackdrop`, `zIndex`.
- `ConfirmDialog` `title`, `message`, `confirmLabel`, `tone danger|warning|primary`, `busy`, `error` (superset of both page-local ones).
- `toast.success|error|warning|info(title, { description, action, duration, id })`; `<Toaster/>` is mounted in App.
- `Tabs` (underline | pills, `count`), `SegmentedControl` (`size`, `fullWidth`, icon-only via `ariaLabel`), `Toggle`.
- `StatCard` `label`, `value`, `icon`, `tone`, `delta`, `deltaLabel`, `invertDelta`, `sparkline`, `footer`, `loading`;
  `Sparkline` `data`, `color` (CSS var), `height`.
- `EmptyState` `icon`, `title`, `description`, `action`, `compact`. `Skeleton`, `SkeletonText`.
- `PageHeader` `title`, `subtitle`, `icon`, `actions`, `onBack`. `Money` `value`, `decimals`, `animate`, `grouping`.
- Shell: new admin page → add one entry to `components/layout/navConfig.ts` (group `sales|catalog|restaurant`).

## 11. Legacy layer (delete as pages migrate)
- `tokens.css` remaps Tailwind `gray-*` → warm stone and `orange-*` → ember (orange-500 = #ea580c, 600 = #c2410c) so v3
  pages already look warm. Keep this remap until no page uses raw gray/orange, then delete it.
- `styles/legacy.css` repaints v3 raw classes in dark mode with `!important`, grouped [G1]–[G7]: surfaces, text,
  borders, form controls, tinted status fills, hover states, tables. When a page is migrated to tokens, re-run
  `grep -rE "bg-white|bg-gray-|text-gray-|border-gray-|bg-(red|green|blue|orange|amber|yellow)-(50|100)" src/renderer/src/pages`;
  delete each group whose classes no longer appear. `.receipt-paper` stays white forever.
- Base layer sets every border to `var(--line)` (Tailwind v4 defaulted to currentColor = black hairlines).

## 12. Do / Don't
- DO build with kit components first; extend via props, not copies. DON'T fork page-local Toast/ConfirmDialog.
- DO use `bg-surface`/`text-ink`; DON'T write `bg-white dark:bg-…` pairs or add new rules to legacy.css.
- DO one ember CTA per region; DON'T colour whole panels orange or put orange text on orange tints under 4.5:1.
- DO show empty states with one action; DON'T leave blank white areas or "No data" alone.
- DO keep the POS usable in Performance mode (no info conveyed only by shadow/animation).
- DON'T nest modals; DON'T use `window.confirm/alert`; DON'T add npm UI libraries.

## 13. Order screen blueprint (see `styleguide/OrderBlueprint.tsx`, live in #/styleguide)
```
┌ rail 168px ┐┌──────────── items (flex) ────────────┐┌──── ticket 360–380px ────┐
│ ▌🍔 Burgers ││ [🔍 search / F4 ............... ]    ││ ﹏﹏ perforated top ﹏﹏ │
│  🍕 Pizza   ││ ┌tile┐ ┌tile┐ ┌tile┐ ┌tile┐           ││ Ticket #0042   3 items  │
│  🌮 Tacos   ││ │tint│ │    │ │ ×2 │ │    │           ││ [Dine in|Takeaway|Deliv]│
│  🥤 Drinks  ││ │name│ ...                           ││ − 1 + Double Burger 500 │
│  (≥64px)    ││ │500 DA (ink, bold, tabular)│         ││   no onions (muted 13px)│
│             ││ └────┘ fixed positions, 3–4 cols     ││ ------ dashed --------- │
│             ││                                      ││ Total      1 250 DA ↑   │
│             ││                                      ││ [500][1000][2000]       │
│             ││                                      ││ [■■■ Pay (64px) ■■■]    │
└─────────────┘└──────────────────────────────────────┘└ ﹏﹏ perforated bottom ﹏┘
```
- Rail: category bar colour + emoji, active = raised surface. Favourites first; search always visible (F4).
- Tile: `categoryTint` gradient block (or photo ≤ 128px thumb) + 1px category bar, 2-line clamped name, price in ink.
  Tap adds; `×n` ember badge bumps. No hover effects required.
- Ticket: `receipt-edge-top` / `receipt-edge` strips around a `bg-surface` body; steppers 44px; modifiers indented,
  muted; new line `flash`; total `text-total` + `<Money animate>`; quick tender (Exact/500/1000/2000); Pay `size="touch"`
  `cooldownMs={800}`, disabled when empty. Change due ≥ 40px in success colour on the payment sheet.

## 14. Admin dashboard blueprint (see `styleguide/DashboardBlueprint.tsx`)
- Header: title + one-line subtitle, period `SegmentedControl` (Today/Week/Month) at the end.
- Row of ≤ 4 `StatCard`s (revenue, orders, avg ticket, prep time) with delta chip vs previous period + `Sparkline`.
- Below: 3/5 + 2/5 grid — hourly CSS bar chart (peak bar `bg-ember`, others `bg-primary-soft-2`) and ranked
  "Top items" with category dots and thin progress bars. Tables in `Card padding={false}`, sticky `bg-surface-2` head,
  end-aligned tabular numbers, 48px rows. Empty periods use `EmptyState compact`.
