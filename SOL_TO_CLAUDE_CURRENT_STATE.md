# Sol to Claude — current production-stabilization handoff

**From:** Sol / ChatGPT  
**To:** Claude Code  
**Date:** 2026-07-10 (Africa/Algiers)  
**Repository:** `D:\Fast Food Manager\Fastfood Manager\fastfood-manager`  
**Branch / starting HEAD:** `feature/ambient-tv-overhaul` / `150f24e8a82e`

Read this file fully before changing the tree. It is the current-tree delta after:

1. Claude's original 103-finding review,
2. Sol's independent A–E verification report,
3. Claude's round-two response and fixes, and
4. Sol's latest production-stabilization pass.

This is a real offline-first POS. Prioritize money loss, silent kitchen failures, destructive data operations, unauthorized access, and paying-customer lockouts. Do not spend the release window on a visual rewrite.

## 0. Required reading order and collaboration rules

Read, in this order:

1. This file — current state and unresolved release blockers.
2. `docs/CHATGPT_SECOND_PASS_REVIEW.md` — the complete A–E review and all F001–F103 verdicts.
3. `docs/CLAUDE_TO_SOL_ROUND2.md` — Claude's response and the changes that preceded this handoff.
4. `docs/HANDOFF_FOR_CHATGPT.md` — product invariants, accepted tradeoffs, and original report contract.
5. `docs/ffm_findings_raw.json` only when the original wording of an F-ID matters.

The tree is intentionally dirty. It contains Claude's work plus the changes recorded below. Do not reset, mass-format, or overwrite unrelated edits. Line numbers will move; use the named function as well as the current line.

When a proposed fix conflicts with the release sequence in §5, stop and reassess. In particular, **do not tighten live Supabase RLS before replacement server endpoints and a compatible desktop have shipped**; that can lock out existing customers.

No production database was read or mutated during this pass. No service-role key is included here.

## 1. Verification snapshot

At the end of this pass:

- `npx tsc --noEmit -p tsconfig.node.json` — PASS
- `npx tsc --noEmit -p tsconfig.web.json` — PASS
- `admin: npx tsc --noEmit` — PASS
- root `npm run build` / Electron Vite production build — PASS
- `admin: npm run build` / Next production build — PASS
- `git diff --check` — PASS

Build warnings remain:

- the Electron renderer bundle is about 3.1 MB and the splash asset about 5.3 MB;
- Vite reports modules that are both statically and dynamically imported;
- the admin is still on Next 14.2.35, which the read-only dependency audit reports in affected security ranges.

These passes prove compilation, not restaurant behavior. The existing screenshot/test artifacts predate the July 9–10 changes and are not release evidence.

## 2. Immediate external incident — verify before release

The configured Supabase hostname in `src/main/activation/cloud.ts:4`, the admin environment, and the shipped v3.0.3 tree returned **NXDOMAIN** from both Cloudflare 1.1.1.1 and Google 8.8.8.8 on 2026-07-10.

Concrete production behavior if that is still the configured live project:

- a new restaurant cannot start a trial;
- owner dashboard, remote ordering, analytics sync, cloud TV, and remote management fail;
- an existing trial eventually reaches the stale-cloud lock path;
- cloud-verified paid licenses survive an inconclusive DNS failure because the current tri-state logic does not equate network failure with revocation.

Mahmoud must check the Supabase dashboard directly: intended project ref, paused/deleted state, billing, backups, live schema, and live policies. Do not infer any of those from `admin/SETUP.md`.

## 3. Changes already made in the shared tree — preserve and test them

These are not recommendations. They are present now. Review them, add regression coverage, and do not accidentally reintroduce the old behavior.

### 3.1 Normal logout no longer deletes the restaurant

Files:

- `src/main/ipc/settings.ipc.ts:127` — `settings:logout`
- `src/preload/index.ts:29`
- `src/renderer/src/pages/settings/SettingsPage.tsx` — `handleLogout`

Old failure: Settings said data would be kept, then called the full reset path. Even a failed backup result was ignored. A paying restaurant clicking Logout could lose menu, stock, workers, orders, and settings.

Current behavior: logout clears entitlement/setup keys only and leaves operational tables untouched. There is currently no casual factory-reset button. If a factory reset is added later, it needs a verified backup, explicit destructive wording, typed confirmation, and a rollback path.

Residual defect: it also clears `setup_complete`. After reactivation, an existing restaurant is sent through setup again and can reach the destructive setup Excel importer. Entitlement logout should preserve setup completion, or setup must offer a safe, explicit “reuse existing restaurant data” branch.

### 3.2 Admin and owner sessions are purpose-separated

Files:

- `admin/lib/auth.ts:10-92`
- `admin/middleware.ts:8-46`
- `admin/app/api/login/route.ts:3-29`

Old failure: an owner JWT could be replayed as `ffm_admin_session` because both token types used one key and middleware verified only the signature.

Current behavior: distinct issuer/audience and domain-separated keys; admin middleware requires `payload.admin === true`; missing/short session or admin password configuration fails closed; login input is bounded and compared with `timingSafeEqual`. Existing cookies are intentionally invalidated.

Required tests: owner-token-as-admin-cookie must be rejected; absent/short `SESSION_SECRET` and `ADMIN_PASSWORD` must return a service/configuration failure, never grant a session.

### 3.3 Restore and pre-import snapshots are materially safer

Files:

- `src/main/ipc/backup.ipc.ts:26-285`
- `src/main/ipc/data.ipc.ts:6-81`
- `src/main/database/backup.ts`
- `src/renderer/src/pages/excel/ExcelImportExport.tsx:150-170`

Old restore failure: the candidate file replaced the live DB before validation. A corrupt or unrelated SQLite file could strand the restaurant, with no verified rollback.

Current restore behavior:

- refuses an incomplete WAL checkpoint;
- copies and validates the candidate with `quick_check` plus required-table checks before touching live data;
- creates and validates a native SQLite rollback backup;
- restores current entitlement fields;
- reopens the DB after success or verified rollback.

Current import mitigation: `clearForImport` refuses to delete anything unless a native SQLite snapshot succeeds.

Still open: snapshot files have no retention policy, and Excel import itself remains destructive (§4.11). The snapshot is mitigation, not a correct round trip.

### 3.4 Recipe quantities are converted at the stock boundary

Files:

- `src/main/services/stock-units.ts:17-46`
- `src/main/database/repositories/orders.repo.ts:243,484`
- validation in `menu.repo.ts` and `stock.repo.ts`

Old failure: the UI describes grams/millilitres while stock is commonly stored in kilograms/litres. A 150 g recipe deducted 150 kg.

Current behavior: compatible g↔kg and ml↔litre quantities are converted before deduction; invalid/incompatible/non-positive values are rejected.

Migration warning: restaurants may already contain workaround recipes such as `0.15 g` against kg stock. After the correct conversion that becomes 0.00015 kg. Do not silently rewrite every recipe. Add a review report that identifies suspicious legacy ratios and requires owner confirmation.

### 3.5 Order, stock, menu, pack, and promotion inputs are bounded

Files:

- `src/main/database/repositories/orders.repo.ts:9-31`
- `src/main/database/repositories/menu.repo.ts`
- `src/main/database/repositories/stock.repo.ts`
- `src/main/database/repositories/promotions.repo.ts:62-199`
- `src/main/services/order-promotions.ts:57-101`
- `src/renderer/src/store/orderStore.ts:81`

Current behavior:

- order lines and aggregate units are capped and non-finite/negative values rejected;
- a new order uses `menuRepo.getActiveById()`, while historical reads can still resolve deactivated items;
- explicit workers must be active; fallback assignment is deterministic;
- stock quantities/prices/adjustments/purchases/deductions are validated;
- promotion percentages are limited to 0–100 and pack definitions validated;
- discounts are clamped sequentially per line, preventing an overlarge burger promotion from consuming the value of fries/drinks.

The 100-line/999-unit desktop cap is only a defensive last boundary. It is much too permissive as the public remote-order policy; see §4.7.

### 3.6 Trial, queue, date, and display corrections

Files:

- `src/renderer/src/App.tsx:58-68` — authoritative active status clears a stale lock and applies the returned expiry
- `src/renderer/src/pages/activation/TrialLockedPage.tsx` — local activation remains available offline
- `src/main/tablet/server.ts:140-150` and `OrderScreen.tsx:580-589` — newest ready orders are no longer omitted
- `admin/lib/dates.ts` and `admin/app/api/tv-html/route.ts:4-9` — Algeria date instead of UTC
- `admin/app/api/tv-html/route.ts:79+` — core query failure is non-200; queue-only failure preserves the last queue
- `src/main/sync/analytics-sync.ts` — zero-order days overwrite stale cloud stats and clear top items

Also standardized user-visible currency fallbacks to `currency_symbol || currency || 'DA'`, and escaped untrusted menu/order/display strings in the LAN/cloud HTML builders and tablet innerHTML.

### 3.7 First password-sync trigger and local backup date

`settings:setMultiple` and password-reset handlers now trigger `syncAdminPassword()`. This fixes the missing trigger after setup/reset, but delivery is still not durable during an outage (§4.9).

Internal backups now use the local Algeria calendar day and do not accidentally clear the periodic timer. A FULL WAL checkpoint must complete before a raw backup copy.

## 4. Open release blockers and high-risk defects

### 4.1 P0 — the cloud authorization model is not safe or reproducible

`admin/SETUP.md:117-133` documents anonymous `FOR ALL USING (TRUE)` access on installations/activations plus broad trial/reset reads. The same shipped anon identity writes or updates `remote_orders`, owner orders/PINs, analytics, menus, and display settings from:

- `src/main/sync/remote-order-listener.ts:95-134`
- `src/main/sync/owner-sync.ts`
- `src/main/sync/analytics-sync.ts`
- `src/main/sync/cloud-sync.ts`

Concrete scenario: anyone extracting the public anon key and a machine ID can create/delete entitlement rows, enumerate reset codes, read customer remote-order details, or mark a genuine pending remote order processed before the POS sees it.

There is no complete `supabase/migrations/` schema or policy set. If the DNS project is gone, the environment cannot be rebuilt faithfully from source.

Correct direction: version-controlled schema, constraints, indexes, RPCs, and policies; service-role-backed server endpoints; signed device entitlements/claims. Treat the publishable key as public. Follow the staged sequence in §5.

### 4.2 P0 — valid local serials are not remotely revocable

`src/main/index.ts:535-570` calls `checkCloudActivation()` for `CLOUD-VERIFIED` or after local serial validation fails. A locally valid serial never asks the cloud whether the subscription was revoked.

Scenario: a restaurant stops paying and admin deletes its activation. Its stored HMAC serial remains valid on every launch, so the POS remains fully licensed indefinitely.

Product decision required: if serials are lifetime/offline licenses, say so in the admin. If subscriptions are revocable, issue signed entitlement documents with revision/expiry, check them periodically, and provide a bounded offline grace. Do not claim 30-second revocation until the desktop actually enforces it.

### 4.3 P0 — reset codes and entitlement changes are non-atomic

- `src/main/activation/cloud.ts:188-216` SELECTs a reset row and then performs an unchecked UPDATE. Two callers can consume the same code; an RLS-denied UPDATE still mints a local reset ticket.
- `admin/app/api/trial/action/route.ts:107-143` changes activation and trial rows in separate operations and does not check all delete results.

Concrete set-mode failure: activation deletion succeeds but trial update fails; the admin receives 500 after revoking the customer. The reverse failure leaves Full access while the UI says Trial.

Use service-side transactions/RPCs with one returned final state. Reset consumption needs one conditional `UPDATE ... WHERE used=false AND expires_at>now() RETURNING id`.

### 4.4 P0 — trial authority still trusts customer/server clocks incorrectly

- `src/main/activation/cloud.ts` derives start/expiry and evaluates expiry using desktop time.
- `admin/app/api/trial/action/route.ts:25-31` extending a paused trial ignores `paused_remaining_ms`, activates it, and can discard saved days.
- `admin/app/admin/users/[machineId]/TrialControls.tsx:63-65,148-155` sends timezone-less `datetime-local`; Vercel can interpret it in UTC, shifting an Algeria choice by one hour.

Server time must author entitlement timestamps. Signed responses should include issued-at, expiry, entitlement revision, and key ID; the desktop should persist a monotonic maximum server time/revision.

### 4.5 P0 — TV builds are not safely updatable

- `.github/workflows/build-tv-apk.yml:32` distributes `assembleDebug`
- `tv-app/app/build.gradle:14-15` remains `versionCode 1`, `versionName 1.0`, with no protected release signing configuration

Separate CI runs normally get different debug certificates. Android then refuses an in-place update; staff must uninstall, which erases pairing.

Gate release on a protected long-lived release keystore, `assembleRelease`, monotonically increasing `versionCode`, tag/main release workflow, and a real `adb install -r` v1→v2 test proving pairing survives.

### 4.6 P0 — Android TV connection state still races and persists failures

`tv-app/app/src/main/java/com/fastfood/tv/MainActivity.kt` still has:

- LAN reprobe persistence before verified HTTP load (`reprobeLanIfOnCloud`, around 138–161);
- no generation token preventing an old slow `connectWithCode` attempt from overwriting a newer code;
- success handling that can fire on later navigations;
- anonymous delayed reprobe callbacks not removed in `onDestroy`;
- immediate renderer recreation without bounded backoff;
- resolver 503/network failures presented as “Code Not Found.”

Implement one UI-thread-owned attempt state machine: generation ID, cancellable callbacks, one-shot verified load, atomic persistence only after success, 404 vs 5xx vs network distinction, and bounded renderer-crash backoff.

### 4.7 P0 — remote ordering is an unauthenticated stock/print/revenue endpoint

- `admin/app/api/remote-order/route.ts` accepts a public machine ID and items without durable rate limiting, restaurant-enabled policy, quote/menu revision, or staff approval.
- `admin/app/r/[machineId]/RemoteOrder.tsx:229-239` says “Order Placed” after only a cloud insert and displays the last four UUID characters, which is not the POS daily order number.
- `src/main/sync/remote-order-listener.ts:149-205` commits locally, records a settings-based dedupe ID, then fire-and-forgets printing/sync.

Scenarios:

- a former customer with a QR URL floods distinct requests; each accepted row can deduct stock, accrue loyalty, inflate revenue, and print;
- the POS is offline, but the customer is told the order was placed;
- the app crashes after storing the dedupe ID but before printing; restart suppresses the required kitchen ticket;
- a remote order does not call the LAN `broadcastQueue()`, so Preparing can stay stale.
- an old pending row has no TTL, so a Saturday request can print when the restaurant PC starts on Monday;
- polling handles the five oldest rows first, so a flood delays legitimate new requests.

Required model: `submitted → accepted | rejected | expired`; conservative API validation; durable machine/IP throttling; opaque idempotency token; menu/price quote revision; visible staff accept/reject; real daily number only after acceptance; transactionally recorded outbox/print jobs.

The retry code at `RemoteOrder.tsx:40-105` also closes over the initial `retryCount`, so an outage can loop forever without reaching the advertised retry limit.

Tablet has no request UUID either (`src/main/tablet/tablet-ui.ts`, submit path around line 667). If the server commits but the HTTP response is lost, a user retry creates a second order. Add a unique `(source, source_request_id)` key inside the same transaction that creates the order; duplicates must return the existing order without repeating stock, loyalty, or print effects.

Both customer surfaces also need an authoritative quote:

- tablet shows cached gross menu totals while the main process applies current promotions;
- remote shows cached cloud prices while the POS forces current local prices/promotions.

A customer can see 1,000 DA and receive an 800 DA receipt, or see 500 DA and be charged the current 650 DA. Publish a catalog/pricing revision; submission includes its revision and request ID; mismatch returns changed lines and requires reconfirmation before commit.

### 4.8 P0 — owner PIN is brute-forceable

`admin/app/api/owner/verify-pin/route.ts` exposes unthrottled bcrypt for a numeric credential whose UI minimum is four digits.

Scenario: with a known QR machine ID, all 10,000 four-digit PINs can be tried remotely; parallel bcrypt also exhausts the Next worker.

Use durable per-machine and per-IP throttling/backoff, not process memory. Prefer a longer remote-dashboard credential distinct from the local touchscreen PIN. Preserve the session domain separation already added.

### 4.9 P0/P1 — required side effects need a durable outbox

`owner-sync.ts`, Telegram, analytics, printing, queue broadcast, and cloud status updates are mostly invoked after the local order transaction and often fire-and-forget.

Concrete failures:

- network outage during first admin-password sync leaves the cloud owner PIN stale until a later trigger/restart;
- lunchtime owner-order rows are permanently missing even if aggregate stats later self-heal;
- crash after order commit but before kitchen print leaves a paid/accepted order uncooked;
- a settings-backed 500-ID dedupe set can suppress effects or eventually allow duplication.

Add local transactional outbox rows and durable print jobs with idempotent consumers, attempt count, last error, retry/backoff, and cashier-visible state. The order transaction should commit the business row and required jobs together.

### 4.10 P0/P1 — order editing rewrites historical stock truth

`src/main/database/repositories/orders.repo.ts:428-506` restores every old deduction, deletes every line/deduction, then recomputes all deductions using the **current** recipe and current stock cost—even for a header-only edit.

Scenario: a burger sold at lunch used 150 g beef. At 16:00 the owner changes the recipe to 180 g, then the cashier fixes only that order's phone number. The edit restores 150 g and deducts 180 g, rewriting historical consumption and cost for a sale that already happened.

Separate header edits from line edits. For unchanged lines preserve original `order_item_deductions` and cost snapshots. For changed quantities use the original per-line recipe snapshot, or explicitly post an auditable delta. Do not rebuild history from today's menu recipe.

Pricing is inconsistent between edit screens too:

- `OrderScreen.tsx` recomputes a discount from **currently active** promotions on every edit;
- `OrdersHistory.tsx` preserves the old flat discount.

Scenario: a 1,000 DA order predates a new 50% promotion. Correcting only its phone in OrderScreen turns it into a 500 DA historical sale; editing through OrdersHistory does not. Persist sale-time promotion/line allocations. Header-only edits preserve them exactly. Legacy orders without snapshots preserve their stored flat discount. A separate explicit “Reprice using current menu/promotions” action should show old/new totals and require confirmation.

Also change `updateStatus` at `orders.repo.ts:323-357`: restoring a completed order to Preparing currently retains the old `completed_at` because of `COALESCE`. Active statuses should clear it.

Define and enforce one status transition matrix. Update/cancel/restore actions currently do not create kitchen change tickets. A customer who reduces three burgers to one can still receive three because the cook only has the original ticket. Generate explicit `UPDATED`, `CANCELLED`, and `RESTORED` jobs, routed to both old and new stations when assignments change.

Finally, `create()` captures `order_date` and then `getNextDailyNumber()` derives a second date. A call crossing midnight can store yesterday's date with today's counter. Pass the captured date and, after auditing duplicates, add a unique `(order_date, daily_number)` index.

### 4.11 P0/P1 — Excel import/version restore is still destructive

`src/main/ipc/data.ipc.ts:35-81` explicitly deletes every recipe, worker-category route, stock purchase/adjustment history, and deactivates catalog rows before importing a workbook that cannot restore all of that data.

Concrete scenarios:

- owner exports, adjusts one menu price, imports: every recipe disappears, so future orders stop deducting stock;
- workbook catalog IDs are regenerated, stranding promotions/pack references;
- a stale workbook overwrites live stock counts and erases the audit trail;
- menu-version restore rewinds current inventory and remaps items by non-unique name.
- an unrelated or empty but valid workbook is parsed, clears the restaurant, imports zero rows, and reports success;
- each row is a separate IPC/transaction, so a failure on row 40 leaves a half-imported live catalog;
- the renderer ignores the main process's `recipesLost: true` result and still displays success;
- setup has a second importer in `src/renderer/src/pages/setup/steps/ExcelSetup.tsx`; it clears before full validation, ignores the clear result, and replaces the ingredient sheet's unit with the stock unit.

The safety snapshot makes recovery possible only if the owner knows there is damage and restores the whole database, which also rewinds orders entered afterward. **The snapshot-only hotfix is not sufficient. Disable the destructive admin “Update Menu” import for production now.** A temporary legacy mode may perform only previewed, unambiguous, non-destructive scalar updates. Retain first-run import only after it validates every sheet/reference before any clear.

Build import v2 around stable external IDs, dry-run validation, diff preview, explicit per-domain choices, and one synchronous transaction. Recipes, routing, promotions, and inventory history need first-class representations. A menu workbook must never overwrite current inventory or delete purchases/adjustments.

### 4.12 P0/P1 — cashier money controls lack approval and audit

`src/renderer/src/pages/orders/OrderScreen.tsx:1471-1628` lets any cashier set a line price to zero. Cancellation at roughly `:833-855,1693-1713` needs only a generic confirmation.

Scenario: cashier overrides a 5,000 DA item to 0, completes it, and later cancels/adjusts orders with no immutable record of original value, reason, approver, or timestamp.

Keep the fast UI, but require configurable manager authorization for price overrides and voids. Persist immutable audit events with original/new value, reason, operator/approver, and time.

### 4.13 P0/P1 — order and print failures are still invisible in the POS

- Create/update catches at `OrderScreen.tsx:731,785` log to console; the cashier gets no persistent explanation.
- Most print buttons call IPC and ignore `{success,error}`, e.g. `OrderScreen.tsx:1655-1680,1966-1989`.
- Electron's callback is handled in `printer.ipc.ts:580-614`, but the result is not surfaced as a retryable job.
- auto-print paths attach only `.catch()`; `printOrder()` normally resolves `{success:false}`, so unplugged printers are silently treated as success;
- split printing can encounter a worker group with no printer, `continue`, and leave `allSuccess === true`;
- per-printer `auto_print` is collapsed into global receipt/kitchen booleans, so one worker's auto-on setting can print every worker's ticket;
- split tickets are generated using one arbitrary kitchen width, so a 58 mm and 80 mm worker printer cannot both render correctly.

Scenario: disk full prevents order creation, or the kitchen printer is offline. Spinner stops, cart appears to move on, and staff reasonably assume the order/ticket succeeded.

Preserve the cart on create failure and show a persistent banner with Retry. Display pending/failed print jobs and permit reprint. Use destination-level jobs and resolve the physical printer/width at attempt time. A timeout after possible OS spooling should enter an `attention` state requiring a human decision, not blindly retry and produce duplicate food tickets. Do not use a transient toast as the only evidence for a kitchen-critical failure.

### 4.14 P1 — cloud TV media payload can OOM every 30 seconds

`src/main/sync/cloud-sync.ts:38-70` embeds the logo and up to ten raw images as base64. `admin/app/api/tv-html/route.ts` returns the full settings payload on each poll. The UI limits only image count at `AmbianceScreen.tsx:821-841`, not bytes or dimensions.

Ten 4 MB phone images become about 53 MB of JSON and can be downloaded twice per minute, stutter, exhaust data, and trigger the WebView renderer-recreate loop.

Resize on import to bounded dimensions/bytes, store versioned media URLs in object storage, poll only small revision/queue data, fetch settings only when revision changes, and use cache validators.

### 4.15 P1 — customer identity and favorites are inconsistent

`src/main/database/repositories/customers.repo.ts:30-86` compares raw phone strings. `0550 12 34 56`, `0550123456`, and `+213550123456` become separate customers, splitting loyalty.

`getFavoriteItems()` at `:43-56` does not exclude cancelled orders, so food a customer cancelled can remain a “favorite.”

Normalize Algerian phone numbers once at the repository/API boundary; store a display form separately if desired. Filter cancelled orders from favorites.

### 4.16 P1 — recipe compatibility is not checked when saving

The new conversion service correctly rejects incompatible units at order time, but `menu.repo.ts` validates only that the recipe unit belongs to a global allow-list. It does not verify the referenced stock row exists, is active, and has a compatible base unit.

Scenario: owner saves “100 g” against oil tracked in litres. Save succeeds; every order containing that menu item then throws in `stock-units.ts`, while the POS only logs the create error.

Validate each ingredient against the actual active stock row during menu create/update and show the owner the exact incompatible pair before saving.

### 4.17 P1 — revenue drilldowns disagree with headline revenue

Headline analytics sum net `orders.total`, while top/worst items, categories, and workers sum gross `order_items.total_price` in `analytics.repo.ts`.

Scenario: one 1,000 DA burger receives a 20% discount. Headline revenue is 800 DA, but burger/category/worker revenue each report 1,000 DA.

Persist per-line discount allocation and net line totals. All dimensions must reconcile to the same net order revenue.

### 4.18 P1 — packs are advertised but not priced at checkout

Packs can be created and displayed on TV/cloud, but no cart/order pricing path consumes `pack_price`.

Scenario: the display advertises Burger + Fries + Drink for 900 DA; the cashier adds those items and the POS charges their full individual total.

Implement deterministic pack matching with sale-time snapshot/allocation, or remove packs from customer-facing claims until they can actually be sold.

### 4.19 P1 — owner/admin outage semantics remain incomplete

Core owner data/stats/verify routes now return 503 on query errors, but UI/server components and admin overview/users pages still have paths that render “Restaurant Not Found,” empty arrays, or zero cards on infrastructure failure.

With the current DNS incident, zero revenue is a believable but false business statement. Preserve the last known snapshot with age and show Unavailable/Offline; distinguish genuine 404 from 503.

### 4.20 P1 — caught SQLite failures can escape transaction guarantees

`orders.repo.ts` catches broad database errors around customer/loyalty writes inside better-sqlite3 transactions. Errors such as `SQLITE_FULL` or `SQLITE_BUSY` may invalidate/rollback the transaction; continuing after a broad catch risks later statements running outside the intended atomic operation.

Catch only expected domain conflicts. Re-throw database/infrastructure errors so the entire order fails visibly and the cart remains intact.

### 4.21 P1 — dependency upgrade is required, but not with force

A read-only `npm audit --omit=dev` reported high advisories affecting installed Next 14.2.35 and `ws` 8.19.0, plus a moderate PostCSS issue.

Do not run `npm audit fix --force` and accept a blind Next 16 migration. Upgrade Next/Supabase/ws/PostCSS in a tested branch and exercise middleware, server components, public owner/remote/TV APIs, and production build.

## 5. Safe implementation/deployment order

1. **Recover or confirm the Supabase project.** Record the real project ref, backup status, schema, policies, and deployment environment.
2. **Freeze and test current local safety fixes.** Especially logout, restore rollback, recipe conversion, admin-token replay, and promotion bounds.
3. **Export/version-control the complete cloud schema and current policies.** Do not invent live state from SETUP.md.
4. **Add server-side atomic endpoints/RPCs while old clients still work.** Entitlement check/start, reset consume, admin transitions, authenticated sync, remote submit/status.
5. **Ship the compatible desktop.** Signed/revisioned entitlement checks, bounded offline grace, monotonic server time, durable outbox/print jobs.
6. **Only then remove broad anonymous access.** Monitor old-client errors during a deliberate compatibility window.
7. **Change remote orders to submitted/accepted.** Add rate limits, quote revision, idempotency, staff decision, real order number, and durable effects.
8. **Repair order edit/history and Excel import semantics.**
9. **Build and field-test the signed TV release/update path and bounded media pipeline.**
10. **Upgrade admin dependencies in an isolated, tested branch.**
11. **After safety is stable, make the targeted UI refinements in §6.**

## 6. Product/UI work worth doing after the blockers

Keep the navy/orange product identity. Do not redesign the navigation or force staff to relearn the POS during a stabilization release.

High-value targeted improvements:

- Arabic/French touchscreen keyboard or allow the OS keyboard; current touch inputs are read-only and the virtual keyboard is Latin-only.
- Make table/phone requirements consistent across desktop and remote ordering; show required fields and inline validation.
- Reset admin lock on actual pointer/keyboard activity; current “inactivity” lock is a fixed ten-minute deadline and can discard an active owner's unsaved form.
- Add one modal stack so Escape closes only the top dialog; add dialog semantics, focus trap, and focus restoration.
- Replace destructive cart Clear/Delete with a ten-second Undo snapshot.
- Route remaining operational English/French strings through i18n, including remote ordering; use RTL for Arabic.
- Replace the blocking every-order success modal with a non-blocking success strip unless printer selection is needed.
- Fix light-mode ongoing cards, mobile owner summary overflow, and misleading price-helper copy.
- Hide the placeholder owner Stock tab until it does real work.
- Bundle fonts locally so LAN/offline display choices do not disappear.
- Improve contrast/touch targets/reduced-motion centrally through tokens, not page-by-page redesign.

The larger product opinion remains: **cash drawer / shift reconciliation is a bigger commercial gap than a visual rewrite.** Restaurants need opening float, cash/card/delivery split, paid-outs, expected-versus-counted cash, variance, and manager close. Build it as an append-only ledger/reporting feature after the safety foundations, not as a replacement for SQLite or Electron.

## 7. Architecture opinion

Do not rewrite the whole application.

- SQLite is the correct primary store for an Algerian restaurant POS that must sell during internet outages.
- Electron/React is serviceable; the problem is that pricing, stock, loyalty, printing, and cloud effects are spread across UI/IPC/listener paths.
- Next can remain the admin/remote surface, but public writes and privileged operations must move behind server-controlled authorization and transactions.
- Android WebView is acceptable for the kiosk if connection state and update signing are made explicit and testable.

Refactor incrementally around:

1. one authoritative main-process order command service;
2. integer minor currency units and persisted pricing/promotion snapshots;
3. immutable audit events for overrides/voids/status changes;
4. transactional outbox and durable print jobs;
5. versioned cloud schema/migrations and typed server APIs;
6. one shared TV data contract/renderer implementation;
7. deterministic behavioral tests around those boundaries.

A wholesale rewrite would create more regression surface without fixing the authorization/deployment facts.

## 8. Minimum release regression matrix

Automate these; do not accept screenshots alone:

- click normal Logout with a populated DB → orders/menu/stock remain byte-for-byte present;
- corrupt/non-FFM restore candidate → live DB reopens unchanged;
- forced failure after live restore replacement → verified rollback restores service;
- 150 g recipe against kg stock and 250 ml against litres → correct deduction;
- legacy suspicious recipe → explicit review warning, no silent migration;
- owner JWT replayed as admin cookie → rejected;
- missing/short secrets/password → fail closed;
- pause/resume/extend/expire across Algeria midnight and UTC deployment;
- definitive revocation vs DNS/503 → no false revoke and no indefinite paid access;
- same reset code consumed concurrently twice → exactly one success;
- old desktop during staged RLS rollout → no mass lockout;
- public remote flood → 429/no stock effect; submitted request waits for staff; accepted response exposes real daily number;
- crash after local order commit before print → durable job prints exactly once after restart;
- disk full/SQLite create failure → cart preserved and visible Retry;
- printer offline → visible failed job and successful reprint;
- header-only order edit after recipe/cost change → historical deductions unchanged;
- export/change one price/import → recipes/routing/promotions/history preserved or import refused before mutation;
- price override/void → manager approval plus immutable audit event;
- cancel only order after analytics sync → cloud day becomes explicit zero;
- Algerian phone variants → one customer; cancelled order does not affect favorites;
- owner/admin/cloud TV Supabase 503 → last-known data remains visible with Unavailable state, never fake zero/not-found;
- Android resolver 404/503/offline/stale-attempt race/LAN HTTP 500/renderer crash/lifecycle teardown;
- signed TV v1→v2 `adb install -r` → pairing retained;
- oversized TV image → resized/rejected; unchanged poll transfers only small revision payload;
- 1024×700 keyboard, 1280×800 touch, dark mode, Arabic RTL, and 320/360 px owner/remote views.

## 9. Test harness gaps

- `test-harness/scenarios/admin-sweep.js` records caught exceptions as `ERROR` but its final gate checks only `FAIL`.
- `tv-ui.js` types and screenshots without asserting submit/error/display success.
- `tv-e2e.js` queries Supabase directly with service role and bypasses resolver, Android, LAN probing, cloud fallback, and WebView verification.
- no deterministic Next owner/remote-order scenarios exist;
- root `package.json` has no real release test gate;
- the TV workflow builds only debug.

Add CI for all three type checks, both production builds, repository-level domain tests using a scratch SQLite DB, and deterministic browser/API scenarios. Keep tests requiring a real Supabase project in a separately authorized job.

## 10. Decisions Mahmoud must make explicitly

Claude should not silently choose these:

1. Are locally generated serials lifetime offline licenses, or revocable subscriptions?
2. How long may a paid restaurant remain offline before a subscription entitlement locks?
3. Must dine-in table numbers always be required?
4. Are remote orders staff-approved requests or immediately accepted sales? Recommendation: staff-approved.
5. What credential policy is acceptable for the remote owner dashboard? Recommendation: separate longer credential plus rate limiting.
6. What are the retention rules for pre-import/pre-restore backups and audit events?
7. What limits should apply to remote order lines/units/value and media dimensions/bytes?

## 11. Definition of done for this handoff

Do not report “fixed” because TypeScript compiles. For each item:

- cite the current function/file;
- construct a restaurant-realistic failure test;
- implement or refute based on that test;
- verify failure before and success after;
- record any migration/deployment dependency;
- do not hide unresolved production operations behind a UI message.

The current tree is safer than the starting tree, but it is **not release-ready** until the Supabase incident/authorization model, remote-order acceptance, durable print/outbox path, TV signing/update path, and destructive edit/import semantics are resolved or explicitly disabled.
