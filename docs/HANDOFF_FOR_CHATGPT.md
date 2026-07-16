# Fast Food Manager — Deep Review Handoff

**To:** ChatGPT (second reviewer)
**From:** Claude Code (first reviewer) + Mahmoud Ben Abdelmoumene (owner/developer)
**Date:** 2026-07-09
**Purpose:** You are the *independent second pass* on a production POS system. Read the code, verify or refute my findings, find what I missed, and critique the product/architecture. Then hand back a structured report I can act on directly.

---

## 0. TL;DR — what I need from you

1. **Verify or refute** the 103 findings in `docs/ffm_findings_raw.json` (same folder as this file). They are **unverified** — my adversarial verification pass was interrupted. Do not trust them. Read the actual code.
2. **Find what I missed.** My finders were subsystem-scoped and may have tunnel vision, especially on cross-cutting concerns and product-level flaws.
3. **Critique the design**, not just the code: data model, the trial/licensing architecture, the offline story, the multi-channel order problem (see §6).
4. **Report back** in the exact format in §9 so I can merge your findings with mine mechanically.

**Ground rule:** every claim must cite `file:line` and a *concrete* failure scenario (specific inputs/state → specific wrong behavior a restaurant would actually experience). No "consider adding error handling." No style opinions. If you cannot construct the failure, mark it speculative and say so.

---

## 1. ⚠️ Before you read the code: secrets

This repo has **hardcoded secrets in source**, deliberately (they're client-side and the owner accepts the tradeoff):

- Supabase URL + anon/publishable key — `src/main/activation/cloud.ts:3-4`
- An HMAC secret used for activation integrity checksums
- Supabase **service-role** key in `admin/` env config (this one is genuinely sensitive)

If this repo is being uploaded to you as a zip, the owner should strip `admin/.env*` first. Flag anything else you find that looks like a live credential. The owner already had one Anthropic API key leak in a sibling repo — assume hygiene is imperfect.

---

## 2. What the product is

**Fast Food Manager (FFM)** is a Windows desktop point-of-sale and management system for small fast-food restaurants, sold to independent operators in **Algeria**. It is a real, shipping, paid product — restaurants run their day on it. Bugs that lose money or lock out a paying customer are the ones that matter.

Business context that shapes correctness requirements:

- **Timezone: Algeria is UTC+1, and there is no DST.** Fast-food shops are busiest **late at night, past local midnight**. Any code that buckets a "day" by UTC will misfile the busiest hour of the day. This is the single most repeated bug class in the codebase (see §7).
- **Currency:** configurable, default `DA` (Algerian dinar). Some code still hardcodes `'DA'`.
- **Languages:** English, Arabic (RTL), French. All three are first-class; menu items carry `name`, `name_ar`, `name_fr`.
- **Connectivity is unreliable.** The app must work fully offline. Cloud sync is best-effort. But the *trial/license lock* depends on the cloud — that tension is where the worst bug lives (`src/main/index.ts:470`).
- **Staff are not technical.** A confusing error message means a phone call to the owner. An unattended TV screen stuck on an error page stays stuck for days.

Licensing model: 7-day trial, then a paid license. The owner can extend, pause, expire, or revoke any installation remotely from an admin portal, keyed by a `machineId` derived from hardware.

---

## 3. Where the code is

**Repo root:** `D:\Fast Food Manager\Fastfood Manager\fastfood-manager`
**Git:** `mahmoudben99/fastfood-manager`
**Current branch:** `feature/ambient-tv-overhaul` (NOT merged to `main`)
**Version:** `3.1.0` in `package.json`; `main` is tagged `v3.0.3` (what customers are actually running)

⚠️ **The working tree has ~1,600 lines of uncommitted changes.** Review the *current working-tree state* — that is the newest code. `git diff` shows a recent bug-fix pass (discount persistence, local-date handling, TV pairing, remote-order hardening). Several of my findings are *about* that uncommitted diff.

### Four deployables in one repo

| Component | Path | Stack | Ships as |
|---|---|---|---|
| **Desktop POS** | `src/` | Electron 33 + electron-vite + React 19 + Tailwind v4 + better-sqlite3 + Zustand | NSIS installer, auto-update via electron-updater |
| **Admin portal** | `admin/` | Next.js 15 (App Router) + Supabase service key | Vercel |
| **TV kiosk app** | `tv-app/` | Kotlin, dependency-free WebView kiosk | sideloaded APK (debug-signed), built by GitHub Actions |
| **License server** | `license-server/` | Cloudflare Worker + D1 | ⚠️ **untracked, unfinished, not wired up** — see §6.1 |

### Size

```
src/main       61 files   9,574 lines   (Electron main process)
src/preload     1 file      322 lines   (IPC bridge — the contract surface)
src/renderer   47 files  13,089 lines   (React UI)
admin          49 files   5,880 lines   (Next.js)
tv-app          2 files     491 lines   (Kotlin)
license-server  2 files     327 lines   (untracked skeleton)
```

### Read these first (highest bug density × highest stakes)

1. `src/main/database/repositories/orders.repo.ts` (489 lines) — **the money.** `create()`, `updateItems()`, `cancelOrder()`, `updateStatus()`. Stock deduction, loyalty accrual, discount persistence, and the atomic daily-number counter all live here.
2. `src/main/index.ts` (580 lines) — app lifecycle, **the trial/license state machine** (`setupTrialWatcher`), teardown ordering.
3. `src/main/activation/` — `activation.ts` (machineId, HMAC integrity checksums), `cloud.ts` (Supabase trial checks).
4. `src/main/ipc/printer.ipc.ts` (559 lines) — receipt + kitchen ticket HTML generation. What the **customer physically receives**.
5. `src/main/tablet/server.ts` — an embedded HTTP server on the LAN serving a customer-facing ordering tablet page, a TV ambient display, and `POST /api/order`. **Untrusted input surface.**
6. `src/renderer/src/pages/orders/OrderScreen.tsx` (2,119 lines) — the POS screen staff use all day. Cart, promos, keyboard shortcuts, edit flow.
7. `src/main/sync/` — `owner-sync.ts`, `analytics-sync.ts`, `cloud-sync.ts`, `remote-order-listener.ts`. Fire-and-forget Supabase writes.
8. `admin/app/api/` — 14 routes. `owner/data`, `pair`, `tv-html`, `trial/action` are the interesting ones.

---

## 4. Data model

### Local SQLite (`better-sqlite3`, **synchronous API**)

Migrations: `src/main/database/migrations/001_initial.ts` … `013_loyalty.ts` (+ `index.ts` runner).

Tables: `orders`, `order_items`, `order_item_deductions`, `daily_counters`, `menu_items`, `menu_item_ingredients`, `categories`, `customers`, `promotions`, `promotion_items`, `packs`, `pack_items`, `stock_items`, `stock_purchases`, `stock_adjustments`, `workers`, `worker_attendance`, `worker_categories`, `work_schedule`, `printer_assignments`, `receipt_templates`, `social_media`, `settings`, `_migrations`.

Key invariants you should check the code actually maintains:

- `orders.order_date` is the **restaurant-local** calendar day (`localDate()` in `orders.repo.ts`), **not** UTC. `orders.created_at` **is** UTC ISO. Confusing these is the #1 bug source.
- `orders.daily_number` restarts at 1 each **local** day, allocated atomically via `daily_counters` (`INSERT … ON CONFLICT … RETURNING`).
- `orders.total = subtotal - discount_amount`. Every surface that displays a total must respect `discount_amount`.
- `order_item_deductions` is the **cost snapshot** at sale time — profit reporting depends on it, so cancel/restore must not double-apply.
- Loyalty (`customers.total_spent`, `customers.order_count`) is mutated by `create()`, `cancelOrder()`, `updateStatus()` (restore path), and `updateItems()`. **All four must agree.** They currently may not.
- `better-sqlite3` is synchronous: **any `await` inside a `db.transaction()` callback silently breaks atomicity.** Grep for this.

### Supabase (cloud, Postgres)

`installations`, `trials`, `activations`, `owner_orders`, `owner_pins`, `remote_orders`, `display_settings`, `short_codes`, `daily_stats`, `daily_top_items`, `menu_sync`, `menu_upload_requests`, `reset_codes`.

Known house patterns (learned the hard way — don't "fix" these):

- **PostgREST FK joins silently return 0 rows.** Always do separate queries and merge in JS.
- Next.js caches the Supabase client's internal `fetch()` even with `force-dynamic`. `admin/lib/supabase.ts` **must** set `cache: 'no-store'` in global fetch options.
- `owner_orders` upserts on conflict key `(machine_id, order_number, order_date)`.
- `navigator.onLine` and browser online/offline events are **unreliable in Electron on Windows**. Use `net.isOnline()` from Electron. Supabase `fetch()` hangs 30–60s when offline before throwing, so it can never be used for offline detection.

### The three display surfaces (a recurring source of confusion)

1. **Tablet ordering page** — `src/main/tablet/tablet-ui.ts`, served on the LAN, customers self-order → `POST /api/order`.
2. **LAN ambient TV display** — `src/main/tablet/display-ui.ts` (1,137 lines), served on the LAN, SSE-driven.
3. **Cloud ambient TV display** — `admin/lib/display-ui.ts` (1,135 lines), served from Vercel as a fallback.

⚠️ **(2) and (3) are near-duplicate 1,100-line files that have drifted apart.** Divergences between them are real bugs (different default fonts, different queue logic). Consider whether this duplication is the actual root cause worth reporting.

**Display profiles:** settings keys are `display_<profile>_*` for named profiles, bare `display_*` for the `default` profile. Both the desktop renderer (`AmbianceScreen.tsx`) and the admin cloud route must agree on this scheme. They historically did not.

---

## 5. How to build / verify

```bash
cd "D:/Fast Food Manager/Fastfood Manager/fastfood-manager"
npm install
npx electron-builder install-app-deps   # rebuild better-sqlite3 for Electron's Node ABI
npm run build                            # electron-vite build — currently PASSES
npx tsc --noEmit -p tsconfig.node.json   # main+preload — 71 pre-existing errors
npx tsc --noEmit -p tsconfig.web.json    # renderer    —  9 pre-existing errors
cd admin && npx tsc --noEmit             # PASSES clean
```

**Important:** `electron-vite build` does **not** typecheck. It transpiles. A green build means nothing about type safety.

The 80 type errors are **pre-existing and known** (I'm fixing them separately — don't report them):
- 71 in `src/main/activation/cloud.ts` — untyped Supabase client makes every `.upsert()` resolve to `never`.
- `APP_VERSION` used in `SettingsPage.tsx` but only defined as a Vite `define` — no ambient declaration.
- `settings` missing from `AppState` (`SplashScreen.tsx`).
- `qrUrl` missing from `BlockConfig` (`ReceiptEditor.tsx`).
- `helperText` prop passed to `Input` which doesn't accept it.
- Locale JSONs not in `tsconfig.web.json`'s `include`.

### There is a working E2E test lab

`test-harness/` drives the **real built app**: POS via Playwright-Electron (isolated `--user-data-dir`, `FFM_MACHINE_ID_OVERRIDE=TESTLAB000000001` so it never touches real data or cloud), TV via `adb` against an Android TV emulator.

```bash
cd test-harness && node run.js <scenario>
```

Scenarios: `pos-smoke`, `pos-seeded`, `order-discount`, `order-edit`, `loyalty`, `i18n`, `price-integrity`, `tv-ui`, `tv-e2e`, `ambiance`, `admin-sweep`.

**If you can propose a scenario that would have caught a bug you find, say so.** That's high value — it turns a fix into a regression guard.

---

## 6. Architecture questions I actually want your opinion on

These are judgment calls, not bugs. I want a second brain on them.

### 6.1 The licensing rewrite (`license-server/`, untracked)

Today, licensing is: app asks Supabase "am I still on trial?" using an **anon key**, and the app's own renderer decides whether to show the lock screen. The `machineId` is effectively the only secret. A determined customer can trivially bypass it.

The untracked `license-server/` folder is a half-built replacement: a Cloudflare Worker + D1 that returns an **Ed25519-signed token** the app verifies with an embedded public key. It has no `wrangler.toml`, no `package.json`, and `crypto.ts` references a `scripts/genkeys.mjs` that doesn't exist.

**Questions:** Is the signed-token design sound? It currently has no nonce — is replay + client clock rollback a real threat for this threat model, or am I over-engineering against a customer who could just... not pay? What's the *minimum* correct version of this? Is Cloudflare Workers + D1 the right substrate, or should this just live in the existing Supabase/Vercel stack the owner already runs?

Be blunt. If the honest answer is "the current Supabase approach is good enough for a business selling to small restaurants, and this rewrite is a distraction," say that.

### 6.2 The multi-channel order problem

Orders can be created from **four** places: the POS renderer (`orders.ipc.ts`), the LAN tablet (`tablet/server.ts` → `POST /api/order`), the cloud remote-order page (`remote-order-listener.ts`), and order edits.

Every one of them needs the same side effects: persist discount, deduct stock, accrue loyalty, sync to `owner_orders`, push the TV queue, auto-backup, fire the Telegram alert, auto-print. **They have each drifted, and each drift is a bug** (my findings include tablet orders skipping owner-sync, skipping the TV queue, and skipping promotions entirely).

**Question:** what's the right refactor? A single `placeOrder()` service in `src/main/services/` that all four channels call? An event bus? I want the shape that makes the *next* channel impossible to get wrong. Give me a concrete file-level design, not a principle.

### 6.3 Duplicated display renderers

`src/main/tablet/display-ui.ts` and `admin/lib/display-ui.ts` are ~1,135 lines each, ~90% identical, and drifting. They can't trivially share a module (one is bundled into Electron, the other into Next.js).

**Question:** shared package? Codegen? Accept the duplication and add a diff test? What's cheapest for a solo developer?

### 6.4 What I'd want if I were the restaurant owner

Step outside the code. You have the data model and the feature list. **What is missing that a fast-food owner in Algeria would actually pay more for?** What existing feature is more complex than its value? Where is this product over-built? Be opinionated. The owner's own instinct is that the analytics/promotions surface is deep but the day-to-day speed of taking an order is what actually sells the product.

---

## 7. The bug taxonomy I already found (so you can look for *more of the same*)

Rather than just re-verifying my list, use these as **patterns to hunt**:

1. **UTC-vs-local-midnight.** ~10 separate instances. Any `new Date().toISOString().split('T')[0]` is suspect. Also `.slice(0,10)`. Check: Day Recap, Analytics dashboard, worker attendance, Telegram `/status`, `/today`, `/revenue`, owner dashboard, `daily_stats` sync, the TV queue, orders-history default date. **Have I found them all?**
2. **Fire-and-forget writes whose result is never checked**, then state is marked "synced." (`analytics-sync.ts`, `remote-order-listener.ts markRemoteOrder`, `cloud.ts validateCloudResetCode`.) Each one silently drops data.
3. **A feature exists in the UI but nothing consumes it.** (Text-scale on the TV, divider styles on receipts, pack prices that no order path can charge, `type:'cart'` SSE pushes nothing renders, QR `qrContent:'phone'` nothing reads.) Grep for settings keys that are *written* but never *read*.
4. **Two code paths compute the same number differently.** POS edit vs admin edit; default receipt vs custom template receipt; `/today` vs `/status`; LAN display vs cloud display.
5. **Preload/handler contract mismatches.** `src/preload/index.ts` exposes channels with no `ipcMain` handler (rejects at runtime), and the renderer sometimes treats `{valid: boolean}` as a boolean. Diff all three layers.
6. **Untrusted input into `innerHTML`** on the LAN-served tablet/display pages (owner-controlled data, but still).
7. **Interval/timer lifecycle.** Which `setInterval`s are stopped on every exit path? Teardown order vs `closeDatabase()`.

---

## 8. What NOT to report (known and accepted)

The owner has explicitly accepted these. Reporting them wastes both our time:

- Hardcoded Supabase anon key / HMAC secret in client source.
- `machineId` used as a bearer secret.
- Renderer-side (not main-process-enforced) trial lock.
- Unsigned auto-update.
- Tablet PIN has no brute-force protection.
- Files over 500 lines.
- The 80 pre-existing `tsc` errors listed in §5.
- Style, formatting, naming, "add JSDoc," "extract this into a hook."
- Anything in `node_modules/`, `out/`, `dist/`, `build/`.

**Do report** if you think one of these accepted risks is *far worse than the owner believes* — but say explicitly that you're overriding the accept-list and why.

---

## 9. The report format I need back

Write me a markdown document with these sections. **Section B is the one that matters most — put your best work there.**

### A. Verdicts on my 103 findings

Read `docs/ffm_findings_raw.json`. Each finding has an `id` (`F001`…`F103`), `file`, `line`, `severity`, `title`, `evidence`, `scenario`, `fix`.

One row per finding. Do not skip any.

| id | verdict | confidence | note |
|---|---|---|---|
| F001 | CONFIRMED / REFUTED / PARTIAL / CANT_VERIFY | high/med/low | If REFUTED: why, quoting the code that makes it safe. If PARTIAL: what's right and what's wrong. If CONFIRMED but my proposed `fix` is wrong: say so — this is valuable. |

Be genuinely adversarial. I would rather you refute 40 of my findings with evidence than confirm all 103 politely. My finders were confident and unverified; some are certainly wrong.

### B. New findings I missed

Same schema as my JSON, so I can merge them:

```json
{
  "file": "src/main/...", "line": 123,
  "severity": "critical|high|medium|low",
  "category": "bug|glitch|cleanup|perf",
  "title": "one line",
  "evidence": "quoted code + why it is wrong",
  "scenario": "concrete inputs/state -> wrong observable behavior a restaurant would experience",
  "fix": "minimal correct fix"
}
```

### C. Architecture & product opinions

Answer §6.1–6.4 directly. Concrete, file-level, opinionated. Disagree with me where you disagree.

### D. Fix ordering

Given everything (mine + yours), what is the correct **merge order**, accounting for fixes that touch the same code or depend on each other? What ships in a hotfix to `main` (customers are on v3.0.3 *today*), versus what waits for the `feature/ambient-tv-overhaul` merge?

### E. Regression guards

For the top ~10 fixes, name the `test-harness/` scenario (existing or new) that would prove the fix and catch the regression.

---

## 10. Current known state, so you don't re-derive it

- ✅ `npm run build` passes (desktop). `admin` typechecks clean.
- ❌ 80 pre-existing `tsc` errors in the desktop app (§5). Being fixed separately.
- ⚠️ 103 findings, **unverified**, in `docs/ffm_findings_raw.json`. 1 critical, 17 high.
- ⚠️ `license-server/` is untracked and undeployable.
- ⚠️ Working tree is dirty; branch `feature/ambient-tv-overhaul` is pushed but **not merged**. Customers run `v3.0.3` from `main`.
- The single worst finding, if true: **`src/main/index.ts:470` — an offline startup wipes an admin-granted CLOUD-VERIFIED full license, locking out a paying restaurant.** Please verify this one first and carefully. If it's real it's a hotfix to `main` today.
- Second worst: **`src/main/ipc/printer.ipc.ts:265` — the default printed receipt prints `subtotal` as `TOTAL`, ignoring `discount_amount`.** The customer is handed a receipt whose total is not what they paid.

---

## 11. Working agreement

I (Claude) will be applying fixes to the working tree in parallel with your review. To avoid us colliding:

- **You do not edit code.** Read-only. Report only.
- Cite `file:line` against the **current working tree** (dirty, `feature/ambient-tv-overhaul`). If a line number has shifted under you, cite the enclosing function name too.
- If you believe a fix I'm likely to make is *wrong*, say so loudly in section A — that's the highest-leverage thing you can do, because I'll be writing it before I read you.

Thanks. Be harsh. This is a product real people run their business on.
