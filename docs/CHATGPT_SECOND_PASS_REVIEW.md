# Fast Food Manager — independent second-pass review

Review cutoff: **2026-07-09 21:27 Algeria time**, branch `feature/ambient-tv-overhaul`, HEAD `150f24e8a82e`. The working tree changed while I reviewed it. I made no edits during the review.

Verdicts cover whether each submitted finding was valid when encountered. “Fixed concurrently” means Claude’s live patch removed the original failure before the cutoff; I did not turn a real finding into a refutation merely because it was patched mid-review.

Summary: **88 confirmed, 10 partial, 5 refuted.** Several confirmed entries are duplicates or unreachable cleanup findings, not 88 distinct production bugs.

## A. Verdicts on the 103 findings

| id | verdict | confidence | note |
|---|---|---|---|
| F001 | CONFIRMED | high | The starting `checkCloudActivation()` converted any Supabase failure to `false`, and startup revoked `CLOUD-VERIFIED`; Wi-Fi down during launch therefore locked out a paid site. Fixed concurrently at `src/main/activation/cloud.ts:142` and `src/main/index.ts:500`: network errors are now inconclusive. This belongs in today’s hotfix. |
| F002 | CONFIRMED | high | `admin/app/api/owner/data/route.ts:11,26` still filters `created_at` from UTC midnight instead of `order_date`. An order at 00:30 Algeria time has the previous UTC date and disappears from the owner’s “Today” total. The owner-sync local-date patch does not fix this API. |
| F003 | CONFIRMED | high | `admin/app/api/owner/data/route.ts:22-35` limits the source rows to 100 and then aggregates them in JavaScript. A shop processing 150 valid orders sees revenue and count for only the latest 100. Use database aggregates plus separately paginated order rows. |
| F004 | CONFIRMED | high | Every profile receives the same code at `src/main/sync/cloud-sync.ts:74-85`; `admin/app/api/pair/route.ts:30-39` selects the freshest matching row. If a named profile syncs after Main Display, entering the restaurant’s code opens that named profile. Selecting the lexicographically first row would also be wrong; publish pairing only for an explicit default profile. |
| F005 | PARTIAL | high | `license-server/src/index.ts:214-219` stores arbitrary `until`, so `31/12/2026` becomes an invalid date and `effective()` at `:59-69` treats the paid license as expired. The claimed later `extend` 500 is false: `:227` rejects the invalid date as a base and extends from now. Require strict ISO/date-only input; `Date.parse()` alone is too permissive. |
| F006 | CONFIRMED | high | The original `checkTrialStatus()` swallowed resolved PostgREST failures as `not_found`. The tri-state patch at `src/main/activation/cloud.ts:104-140` fixes that part, but `src/main/index.ts:222-258` now stamps cloud success before interpreting the result and ignores confirmed `not_found`. Deleting a trial row can therefore refresh verification forever without locking it. Add explicit `not_found` handling and one shared in-flight request. |
| F007 | PARTIAL | high | The stale fallback in `src/main/database/repositories/printer-assignments.repo.ts:82` is real, but removal only misroutes when split mode remains enabled through another assignment. Removing Ali’s assignment while another cook remains split can still send Ali’s ticket to a retired printer. The claimed Settings UI resurrection was not established. Clear both representations transactionally. |
| F008 | CONFIRMED | high | `reset:validateTelegram` consumes the one-shot code at `src/main/ipc/activation.ipc.ts:63-65`; `reset:resetPassword` consumes it again at `:73-81`. A correct code reaches the new-password form and then always fails. Use a non-consuming precheck followed by one atomic consume-and-reset operation in main. |
| F009 | CONFIRMED | high | The baseline printed `subtotal` as TOTAL. Fixed concurrently at `src/main/ipc/printer.ipc.ts:236-286`, which now prints `order.total` and a discount line. With a 1,000 DA basket and 20% promo, the receipt now correctly says 800 DA rather than 1,000 DA. |
| F010 | CONFIRMED | high | `src/main/sync/analytics-sync.ts:16-50` still syncs only the immediately preceding day. If the POS is off Monday through Wednesday, Thursday syncs Wednesday while Monday and Tuesday remain absent forever. Persist a durable per-date cursor and backfill every missing closed date. |
| F011 | CONFIRMED | high | Exact duplicate of F004. `syncAllDisplayProfiles()` at `src/main/sync/cloud-sync.ts:209-218` writes one pairing code into every profile and the resolver chooses the freshest. Do not count this as a second root cause. |
| F012 | CONFIRMED | high | `markRemoteOrder()` at `src/main/sync/remote-order-listener.ts:75-82` still ignores the resolved `{error}` from `.update()`. If local creation succeeds and Supabase returns a 503, the row stays pending. The new in-memory `inFlight` set prevents same-session duplication only; restart clears it and creates a second order. Require a durable unique remote ID in the same local transaction. |
| F013 | CONFIRMED | high | The nested single quoting in `src/main/tablet/firewall.ts:31` produces an invalid PowerShell/netsh command, while the wrapper reports the shell launch rather than the rule result. On a default Windows firewall, the tablet cannot reach port 3333 even though Settings reports success. Pass arguments safely and inspect exit code plus the resulting rule. |
| F014 | CONFIRMED | high | `src/main/tablet/server.ts:288-295` checks only finite ID and `quantity > 0`; it still accepts `0.5`, `1e9`, or an exponent that becomes infinity. Such an order writes nonsensical revenue, stock and loyalty. Require a finite positive integer with a defensible per-line and order cap in the main service. |
| F015 | CONFIRMED | high | Tablet creation at `src/main/tablet/server.ts:300-317` performs backup, Telegram and print but never `syncOrderToCloud`. Twenty tablet orders therefore remain absent from the owner dashboard. A one-shot call is insufficient because owner sync itself has no retry/outbox. |
| F016 | PARTIAL | high | Cloud validation succeeds at `PasswordGate.tsx:157-170` but records method `support`; final reset at `activation.ipc.ts:73-79` accepts only an HMAC support code. The path is therefore broken. “Trust the renderer because it already validated” is unsafe, and whether the code is burned depends on live RLS—documented RLS makes the consume update fail. Use one server/main atomic consume-and-reset operation. |
| F017 | CONFIRMED | high | `src/renderer/src/pages/analytics/DayRecapModal.tsx:49` derives today from UTC. At 00:30 local on July 9 it asks for July 8 and labels those figures as today. Use the shared local calendar helper. |
| F018 | CONFIRMED | high | `MainActivity.kt:151-156` persists `last_url` and `via_cloud=false` before verifying the LAN page and ignores the callback result. If TCP reachability succeeds but `/display` returns an error, the TV abandons a working cloud URL and remembers the broken LAN URL. Persist both only after verified main-frame success. |
| F019 | CONFIRMED | high | `admin/app/api/tv-html/route.ts:33` preserves `menu_item_name`, while `admin/lib/display-ui.ts:826-833` reads `name`. A “2 Burgers + 1 Fries” pack renders as `2x + 1x`. Normalize the serializer contract rather than special-casing the renderer. |
| F020 | CONFIRMED | high | `admin/app/r/[machineId]/RemoteOrder.tsx:28` emits `dine-in` and `takeaway`; local code accepts `local`, `takeout`, `delivery`. A takeaway order is stored with an unknown type and the printer falls through to “At Table.” Canonicalize at the API boundary. |
| F021 | CONFIRMED | high | `license-server/src/index.ts:59-68` interprets a date-only paid-through value as UTC midnight. `2026-12-31` expires at 01:00 Algeria time on December 31, removing almost the whole paid final day. Normalize a date-only subscription to the end of that restaurant-local day. |
| F022 | REFUTED | high | A nonce would stop only a naïve online response replay; it does not stop reuse of the stored offline token when the server is blocked, nor client-clock rollback. The token is signed over exact payload bytes at `license-server/src/crypto.ts:33-38`, and no desktop verifier is wired yet. A hosts-file responder also cannot impersonate HTTPS without certificate compromise. Use monotonic last-seen server time/revision and bounded grace, not a nonce as the primary defense. |
| F023 | CONFIRMED | high | `src/main/activation/cloud.ts:196-216` performs SELECT then ignores the reset-code UPDATE result. Documented RLS at `admin/SETUP.md:131-133` allows SELECT only, so the same support code remains reusable. Move validation and conditional `used=false → true` consumption into a service-role RPC returning the consumed row. |
| F024 | CONFIRMED | high | Current `updateItems()` writes the new phone at `orders.repo.ts:459-465` but retains the old `customer_id`; its new loyalty adjustment at `:467-471` makes the patch more visibly wrong. Changing an order from customer A to B credits the total delta to A. Relink and reverse/accrue both customers atomically. |
| F025 | CONFIRMED | high | Exact duplicate of F024. The header phone and loyalty foreign key can disagree at `orders.repo.ts:459-471`; do not treat this as two separate fixes. |
| F026 | CONFIRMED | high | `src/main/ipc/backup.ipc.ts:15-35` copies the live `.db` file without the WAL. An order committed seconds before backup may exist only in `-wal`, so restoring the copied file loses that paid order. Use SQLite’s backup API or a controlled checkpoint/snapshot. |
| F027 | CONFIRMED | high | Kitchen HTML obtains width/fonts from receipt-level settings at `src/main/ipc/printer.ipc.ts:180-205`, not the actual destination printer. An 80 mm receipt plus 58 mm kitchen printer clips tickets. A generic `getKitchenSettings()` with `LIMIT 1` is also wrong when cooks have different printers; resolve settings for the exact destination. |
| F028 | PARTIAL | high | Duplicate of F007. Stale `workers.printer_name` can route Ali to the removed printer, but only while split routing remains active. Clear the legacy field transactionally or remove it as a routing source. |
| F029 | CONFIRMED | high | `doPrint()` loads encoded HTML as a data URL at `printer.ipc.ts:552`; large base64 logos can exceed Chromium’s 2 MiB URL ceiling and only resolve as a timeout at `:573-578`. A receipt with a roughly 1.6 MiB image can fail every time. Use a temporary file/custom protocol or `loadFile`; the ceiling is defined in [Chromium URL constants](https://chromium.googlesource.com/chromium/src/%2B/HEAD/url/url_constants.h). |
| F030 | CONFIRMED | high | `analytics-sync.ts:24-50` creates one daily snapshot and advances the date latch. Cancelling or editing yesterday’s order after its first sync never revises revenue or top items. Reconcile a rolling date window and delete/replace stale rankings, including days that now contain zero orders. |
| F031 | CONFIRMED | high | The `daily_stats` and `daily_top_items` upserts at `analytics-sync.ts:47` do not inspect resolved errors before marking the date synced. A transient 503 silently creates a permanent reporting gap. Only advance a durable cursor after every write succeeds. |
| F032 | CONFIRMED | high | Tablet and remote inputs at `tablet/server.ts:300-307` and `remote-order-listener.ts:113-120` omit `discount_amount`; promotion calculation exists only in the POS renderer. A 20% advertised promotion charges those channels full price. Promotion pricing belongs in the authoritative main service. |
| F033 | CONFIRMED | high | `src/main/tablet/display-ui.ts:567` applies percentage font size to an ancestor while most descendants use explicit `rem`, `vw` or `px`. Selecting Large leaves those panels unchanged. Drive all component sizes from shared CSS variables. |
| F034 | CONFIRMED | high | Baseline decoded each Buffer chunk independently, corrupting Arabic split across TCP packets. Fixed concurrently at `src/main/tablet/server.ts:208-240` by buffering bytes and decoding once. A split UTF-8 customer note now survives unchanged. |
| F035 | CONFIRMED | high | Tablet creation at `server.ts:300-317` sends only `tablet:new-order`; it does not broadcast the queue. A tablet order can be printed yet remain absent from “Now Preparing” until another POS action or reconnect. Broadcast centrally after commit. |
| F036 | CONFIRMED | high | Category, item and cart values are interpolated into `innerHTML` throughout `tablet-ui.ts:539-640`. An Excel-imported name such as `<style>body{display:none}</style>` blanks the ordering page for customers. Build nodes with `textContent` or consistently escape every field. |
| F037 | CONFIRMED | high | `startBot()` guards only `isRunning`, which remains false while Telegram authenticates at `bot.ts:20-66`. The current patch still returns success immediately and can make re-entry easier: two fast Start actions create competing pollers, and one rejection can null the live instance. Guard with a shared start promise and instance identity. |
| F038 | CONFIRMED | high | `PasswordGate.tsx:128-135` treats `{valid:false}` as truthy, so a wrong Telegram code advances to the password screen. Final reset still fails, so this is not an auth bypass, but field-checking alone does not solve F008. Read `result.valid` and repair the consume flow. |
| F039 | CONFIRMED | high | `ExcelImportExport.tsx:161-245` commits `clearForImport` before per-row IPC writes. An invalid row halfway through leaves a half-empty production menu. Validation plus one main-process transaction is required; a transaction alone still would not preserve relationships and IDs. |
| F040 | PARTIAL | high | Orders History preserves the old flat discount while POS edit recalculates current promotions. A 100 DA discount on a 1,000 DA order remains 100 after subtotal becomes 2,000. The inconsistency is real, but “recompute current promotions” is unsafe: promotions may have changed since sale. Persist the applied rule snapshot or expose an explicit Reprice action. |
| F041 | CONFIRMED | high | `OrdersHistory.tsx:227` renders raw UTC `created_at`. An order at 20:00 local appears as a raw `19:00:00.000Z` string. Format in restaurant-local time. |
| F042 | CONFIRMED | high | The Escape handler around `OrderScreen.tsx:246-310` omits the Day Recap and recap-password overlays, so Escape closes/falls through and clears the active cart. With a 10-item cart open behind the recap password modal, one Escape destroys it. Stop handling once any overlay consumes the key. |
| F043 | CONFIRMED | high | F2 submission at `OrderScreen.tsx:264-310` does not reject price/note overlays. Pressing F2 while changing a line from 500 to 600 can submit the stale 500 and close the edit. The new `updatingOrder` guard does not cover those overlays. |
| F044 | CONFIRMED | high | `ordersRepo.updateItems()` rejects non-preparing orders, but `OrderScreen.tsx:665-703` clears edit state without surfacing an unchanged/undefined result. If another action completes the order before Save, the cashier sees a successful edit while the database remains unchanged. Return an explicit conflict and keep the edit open. |
| F045 | CONFIRMED | high | `LoyaltyDashboard.tsx:117` passes local Algerian numbers directly to `wa.me`. `0551234567` is rejected or routed incorrectly because WhatsApp expects `213551234567`. Normalize Algerian formats before constructing the URL. |
| F046 | CONFIRMED | high | `PromotionsPage.tsx:199` exposes pack prices and savings, but no order path adds a pack-priced cart line. A 1,200 DA combo made from 1,500 DA of items can only be charged as 1,500 DA. Implement an applied pack snapshot and interaction rules or remove the feature. |
| F047 | CONFIRMED | high | Receipt Editor writes the `social_media` table at `ReceiptEditor.tsx:219`, while print and TV read a settings value. The preview can show an Instagram handle that never appears on a receipt. Consolidate one source; merely changing the printer leaves TV and other consumers divergent. |
| F048 | CONFIRMED | high | `TelegramSettings.tsx:70` treats synchronous `startBot()` success as “Running,” while `bot.start()` authenticates asynchronously at `bot.ts:52-66`. A revoked token therefore shows Running before failing. Make the IPC async and report actual start state. |
| F049 | CONFIRMED | high | `WorkerManagement.tsx:58` defaults attendance with UTC date. At 00:30 local, marking today can overwrite yesterday’s worker row. Use the local calendar helper. |
| F050 | CONFIRMED | high | Duplicate of F018. `MainActivity.kt:151-156` saves the reprobed LAN target before load verification. Count one underlying bug. |
| F051 | CONFIRMED | high | `MainActivity.kt:246-248` recreates immediately on every renderer crash. A persistent WebView OOM causes a tight crash/recreate loop and an unusable kiosk. Add bounded backoff, a crash counter and a simple fallback screen. |
| F052 | CONFIRMED | high | `resolve()` maps every non-200 to null and `connectWithCode()` labels null “Code not found” at `MainActivity.kt:263-273,327-350`. A Vercel 503 sends staff hunting for a new code instead of checking service availability. Distinguish 404 from 5xx. |
| F053 | CONFIRMED | high | Removing `retryRunnable` at `MainActivity.kt:396-400` does not cancel an already running `connectWithCode` thread. If code 1111’s slow request completes after staff submit 2222, the old attempt can overwrite prefs and display. Use an attempt generation token checked at every callback. |
| F054 | CONFIRMED | high | `admin/app/admin/users/page.tsx:92` interpolates search text into a raw PostgREST `.or()` expression. Searching `ACME, SARL` changes the filter grammar and returns an error/empty list. Quote and escape according to PostgREST syntax; stripping punctuation changes legitimate names. |
| F055 | CONFIRMED | high | Extending a paused trial at `admin/app/api/trial/action/route.ts:25-31` both leaves stale `paused_remaining_ms` and discards the saved entitlement. A paused trial with five days remaining extended by one day becomes one day, not six. Clear-only is insufficient; add days to the paused remaining duration. |
| F056 | CONFIRMED | high | Cloud TV defaults to Inter at `admin/app/api/tv-html/route.ts:42`, while LAN defaults to Playfair Display. A failover visibly changes typography without any settings change. Share one effective default. |
| F057 | CONFIRMED | high | Cloud queue filtering at `tv-html/route.ts:75` derives today from UTC. At 00:30 local it still includes yesterday’s preparing numbers. Filter by the same local `order_date` used by the POS. |
| F058 | CONFIRMED | high | `admin/app/tv/[machineId]/TVDisplay.tsx:130` is unreachable because the page redirects to `/api/tv-html`; related endpoints are orphaned. No restaurant failure is constructible today—this is cleanup, not a production bug. |
| F059 | CONFIRMED | high | `admin/app/tv/[machineId]/page.tsx:18` embeds profile names without encoding. A profile named `Terrace & Family` truncates the query and loads the wrong/default profile. Encode every redirect parameter. |
| F060 | PARTIAL | med | `license-server/` lacks its package, Wrangler config and referenced key generator at `license-server/src/crypto.ts:27`; it is not deployable from this repository. External deployment configuration could exist, so “cannot be deployed at all” is too absolute. It has no current customer impact because it is unwired. |
| F061 | CONFIRMED | high | The unknown-machine SELECT/INSERT at `license-server/src/index.ts:101-116` is not atomic. Two first checks can both observe no row and one gets a primary-key 500. Use `INSERT ... ON CONFLICT` and reread. Unwired today. |
| F062 | PARTIAL | high | `/v1/license/check` overwrites metadata and creates arbitrary rows at `license-server/src/index.ts:121-136`. A request can replace an admin-cleaned restaurant name or flood junk IDs, but whether app-reported or admin-entered metadata is authoritative is a product decision. Separate those fields and rate-limit. Unwired today. |
| F063 | CONFIRMED | high | `reinstate` at `license-server/src/index.ts:239-242` can set status active while retaining an already-past `subscription_until`. The response says success, but the next check remains expired. Reject missing duration or require an explicit lifetime grant. |
| F064 | CONFIRMED | high | Local expiry checks are rollbackable, and `startTrial()` still creates `expires_at` from client `Date.now()` at `src/main/activation/cloud.ts:65-83`. Setting the PC months forward when starting can mint an excessive trial; setting it back extends local enforcement. The server must derive expiry and the client must persist monotonic last-seen server time. |
| F065 | CONFIRMED | high | Dormant `triggerBackupAfterChange()` at `src/main/database/backup.ts:119` clears the interval handle as though it were a timeout and fails to retain the replacement timer. Wiring it would stop periodic live backups. No current failure because it is unused. |
| F066 | CONFIRMED | high | Exact duplicate of F065. Cleanup only; do not count separately. |
| F067 | CONFIRMED | high | Dead `categoriesRepo.delete()` at `categories.repo.ts:73` violates menu-item foreign keys. A future caller deleting a populated category throws. Setting category to NULL is not a valid fix because the schema is non-null; soft-delete or explicitly reassign items. |
| F068 | CONFIRMED | high | Dead `menuRepo.hardDelete()` at `menu.repo.ts:170` violates historical order-item references. Calling it for any sold product throws and could break an import/admin flow. Keep soft deletion. |
| F069 | REFUTED | high | `settings.repo.ts:30` would build `WHERE key IN ()`, but SQLite permits an empty `IN` list and evaluates it false; direct execution returns `{}` rather than a syntax error. There is also no caller. The guard is harmless cleanup, not a bug. |
| F070 | CONFIRMED | high | The original sleep/wake lock was real. The concurrent patch at `src/main/index.ts:173-199,268-274` removes the instant lock, but resetting `lastCloudSuccessTime` on resume falsely records verification, and the three-second loop can start about 20 overlapping checks during a hung 60-second request. Use a single in-flight check and never record success before a response. |
| F071 | CONFIRMED | high | Main sends `updater:up-to-date` at `src/main/index.ts:316-318` and preload exposes it at `preload/index.ts:189-193`, but no renderer subscribes. No restaurant-facing failure; remove the dead contract or add intentional UI. |
| F072 | CONFIRMED | high | The original UTC cutoff was real and was fixed concurrently with `localDate()` at `src/main/index.ts:571-580`. The patch still ignores resolved cloud errors and runs only when local `completed > 0`: if its first cloud update gets a 503, future startups see zero local changes and never retry, leaving ghost Preparing orders. |
| F073 | PARTIAL | high | Exact-minute scheduling at `backup.ipc.ts:197-204` misses a 23:00 backup when the PC sleeps until 23:03. Per-order backups and the internal live backup reduce impact, but menu/settings changes after the last order remain unprotected. `currentTime >= scheduled` alone misses overnight resume; persist last successful scheduled date and run catch-up. |
| F074 | CONFIRMED | high | Snapshots omit `printer_name` at `data.ipc.ts:70-75`, then restore workers with new IDs at `:223-230`; old printer assignments no longer point to them. **Do not remap by worker name:** names are non-unique, so two Mohameds can be assigned the same printer. Preserve snapshot-local stable IDs or require an explicit unambiguous remap. |
| F075 | CONFIRMED | high | Presets write `qrContent:'phone'`. The current printer patch at `printer.ipc.ts:120-137` correctly turns it into `tel:<phone>`, but preview still reads only `qrUrl` at `ReceiptEditor.tsx:442-448`, so the supplied preset looks blank in the editor. Apply one resolver to preview and print. |
| F076 | CONFIRMED | high | `tablet:isRunning` exists at `tablet.ipc.ts:66-68`, but preload and renderer never invoke it; `tablet:status` supersedes it. Cleanup only. |
| F077 | REFUTED | high | The error/no-row conflation in `cloud-sync.ts:111-146` is real inside the function, but `getShortCodes` has no renderer caller—only definition, IPC and preload references. The proposed blank-link customer scenario cannot occur. Delete the dead API rather than adding a cache. |
| F078 | CONFIRMED | high | `syncAllDisplayProfiles()` at `cloud-sync.ts:209-218` runs every five minutes at `:262-267`; each profile rereads and base64-encodes every image. Ten profiles with ten photos repeatedly hit disk, CPU and network. Hashing the final blob still performs the expensive work; use dirty flags or path/mtime/size fingerprints and persist only after successful upload. |
| F079 | CONFIRMED | high | Emoji is interpolated raw in both `src/main/tablet/display-ui.ts:826,973` and `admin/lib/display-ui.ts:826,973`. `<3` itself is harmless, but an Excel-imported `</div><style>...` breaks the panel. Escape all four sites, not only LAN. |
| F080 | CONFIRMED | high | `display-ui.ts:1063` handles only `info` and `queue`; parsed `cart` and `idle` events are dropped. A cashier cart action generates traffic but no customer-facing cart. This is a missing feature/dead protocol rather than a money bug; either implement it or delete the producer. |
| F081 | CONFIRMED | high | `stopTabletServer()` at `server.ts:420-424` closes the listener but does not end responses or clear `displayClients`. After stopping/restarting, old SSE connections can remain writable and accumulate. Destroy every response and clear the set before closing. |
| F082 | CONFIRMED | high | Tablet prices hardcode `DA` at `tablet-ui.ts:540,640`. A restaurant configured for euros still shows DA. **The submitted fix is wrong:** `currency` defaults to `DZD`; the display value must be `currency_symbol || currency || 'DA'`. The same rule should fix LAN/cloud TV drift. |
| F083 | CONFIRMED | high | `/status` counts all rows at `bot.ts:297-306`, whereas `/today` excludes cancelled orders. With ten orders and three cancellations, the owner sees 10 in one command and 7 in the other. Derive count and last order from the same filtered set or show both counts explicitly. |
| F084 | CONFIRMED | high | `/status` emits raw UTC `created_at` at `bot.ts:308`. An order taken at 20:00 local appears as `19:00Z`. Format explicitly in `Africa/Algiers`. |
| F085 | CONFIRMED | high | Preload exposes `printer.setAssignment` and `clearAssignments` at `preload/index.ts:144-146`, but main has no handlers and renderer has no callers. No current restaurant failure; cleanup only. |
| F086 | CONFIRMED | high | `AnalyticsDashboard.tsx:37-54` and `DayRecapModal.tsx:49` still use UTC dates. At 00:30 local, Today shows July 8 under a July 9 session. Use the local helper; the calendar-range definitions are separately wrong in Section B. |
| F087 | CONFIRMED | high | `OrdersHistory.tsx:47-65` changes status and reloads only its list. Completing order #7 there leaves #7 on the push-only customer queue until another broadcast or reconnect. Broadcast from the centralized main status transition, not individual screens. |
| F088 | REFUTED | high | `OrderScreen.tsx:549` does send the English cart name, but no display consumes `type:'cart'` because of F080. Customers cannot observe the alleged language mismatch. Do not add localization-only dead SSE writes. |
| F089 | CONFIRMED | high | Producer-side duplicate of F080: `OrderScreen.tsx:543-561` broadcasts cart payloads that nothing renders. One root cause, cleanup or feature implementation. |
| F090 | CONFIRMED | high | Ongoing cards at `OrderScreen.tsx:1852-1856` use dark-theme container, badge and hover colors inside a white modal. Timestamps and summaries are barely legible during service. Fix the entire card palette, not only its background. |
| F091 | REFUTED | high | Quick edit omits a cart push at `OrderScreen.tsx:1965-1973`, but cart events have no consumer. There is no visible stale display today. This becomes relevant only if F080 is implemented. |
| F092 | PARTIAL | med | One-tap hard deletion at `PromotionsPage.tsx:110-113,162-165` can permanently lose a promotion when a touchscreen tap misses Edit. That is a concrete data-safety risk, but it is a product-wide destructive-action policy issue rather than an isolated logic error. Prefer soft-delete/undo or consistent confirmation. |
| F093 | CONFIRMED | high | Divider styles are selectable at `ReceiptEditor.tsx:293-306`, but preview at `:483-486` and printer at `printer.ipc.ts:94-96` always render dashed lines. Choosing Stars produces no change. Implement the decoration in both paths or remove the control. |
| F094 | CONFIRMED | high | The legacy printer state and `handleTestPrint` around `SettingsPage.tsx:422` are unreachable; top-level `printerName` and `paperWidth` belong to the same dead cluster. Cleanup only. |
| F095 | CONFIRMED | high | `orderStore.ts:33-34` declares `discountAmount` and `discountDetails`, initializes and resets them, but all calculations use getters. No shipping failure; remove them or deliberately repurpose them for applied-promotion snapshots. |
| F096 | CONFIRMED | high | `MainActivity.kt:117` clamps the shift exponent to two, so delay is 10, 20, then 40 seconds; the documented 60-second cap is unreachable. Comment/code cleanup only. |
| F097 | CONFIRMED | high | `retryAttempt` is mutated from connection threads and the UI thread at `MainActivity.kt:57,113-119,272,295,319,398`. Competing failures can reset/increment it unpredictably. Serialize retry state on the main looper, plus the generation guard required by F053. |
| F098 | CONFIRMED | med | Anonymous delayed reprobes at `MainActivity.kt:138-163` are neither deduplicated nor removed on destroy. Repeated cloud reconnect success creates multiple periodic resolver threads. The issue is multiplying callbacks, not stale WebViewClient instances. |
| F099 | CONFIRMED | high | Main-frame HTTP error handling at `MainActivity.kt:237-244` requires API 23, while minSdk is 21. An Android 5.x kiosk can treat a 503 page as successful and remember it. Use a known success marker or out-of-band GET for legacy devices. |
| F100 | CONFIRMED | high | Every later `onPageFinished` calls success again at `MainActivity.kt:251-253`, multiplying reprobes and preference writes. A generic `done` flag is dangerous if it also suppresses later runtime failure recovery; guard duplicate initial success separately from explicit runtime failure handling. |
| F101 | CONFIRMED | high | `loadDisplay()` always calls `removePairing()` at `MainActivity.kt:255-258`; a saved retry can fire while staff type a replacement code and erase their input. Keep the overlay until verified success or suspend automatic retry once the user edits. |
| F102 | CONFIRMED | high | `via_cloud` is saved at `MainActivity.kt:299-307` before load succeeds while `last_url` waits. A failed LAN attempt can leave a cloud URL paired with `via_cloud=false`, disabling future LAN reprobes. Commit code, URL and transport atomically after success. |
| F103 | PARTIAL | high | `setStatus()` at `MainActivity.kt:429-431` rebuilds failures from the old saved code. The submitted resolve-success/load-failure scenario is wrong because `showPairing(code)` at `:310` rebuilds the attempted code correctly. The real failure is resolve-null/IOException, where status recreates or retains the old code. Thread the attempt ID/code through those paths. |

## B. New findings Claude’s raw report missed

I am explicitly overriding the §8 acceptance of `machineId` as a bearer secret for the first and third findings below. The problem is not that the identifier is technically secret; it is that the product presents owner PIN protection and staff acceptance while the actual server APIs bypass them. Full machine IDs are deliberately distributed in TV and remote-order URLs.

```json
[
  {
    "file": "admin/middleware.ts",
    "line": 10,
    "severity": "high",
    "category": "bug",
    "title": "Owner PIN protects only the React screen; owner data APIs have no authenticated session",
    "evidence": "admin/middleware.ts:10-16 explicitly bypasses both /owner and /api/owner. OwnerDashboard.tsx:69-91 stores a client-only localStorage flag after verify-pin, while /api/owner/data and /api/owner/stats accept only machineId at data/route.ts:4-28 and stats/route.ts:4-24. Those routes use the service-role client from admin/lib/supabase.ts:3-16.",
    "scenario": "A customer scans or copies a restaurant's remote/TV URL, extracts the full machine ID, and directly requests /api/owner/data?machineId=.... The server returns orders and revenue without ever asking for the owner PIN.",
    "fix": "On successful PIN verification issue a signed, short-lived HttpOnly session cookie bound to machineId. Require and verify it in every /api/owner route; localStorage may remain only as UI state."
  },
  {
    "file": "admin/SETUP.md",
    "line": 117,
    "severity": "high",
    "category": "bug",
    "title": "Documented RLS lets any anon client mutate every installation and activation",
    "evidence": "admin/SETUP.md:117-133 defines installations and activations with FOR ALL USING (TRUE) WITH CHECK (TRUE), despite the comment claiming narrower rights, and lets anon SELECT every reset code. This is deployment-dependent because the repository does not prove the live policies match the document.",
    "scenario": "If these policies are deployed, anyone using the shipped anon key can delete all activations. On the next online launch every CLOUD-VERIFIED paying restaurant is revoked. They can also enumerate unexpired reset codes across restaurants.",
    "fix": "Audit live pg_policies immediately. Remove anon UPDATE/DELETE on activations, scope legacy reads, and move activation/reset mutations into authenticated service-role endpoints or atomic SECURITY DEFINER RPCs."
  },
  {
    "file": "admin/app/api/remote-order/route.ts",
    "line": 4,
    "severity": "high",
    "category": "bug",
    "title": "A public remote-order link can flood a restaurant with committed and printed fake orders",
    "evidence": "remote-order/route.ts:4-18 validates only machineId and a nonempty item list, with no rate limit, item cap, session or staff approval. remote-order-listener.ts:113-137 immediately creates the local order, deducts stock, accrues loyalty and auto-prints it.",
    "scenario": "A visitor keeps the QR URL after leaving and posts 300 orders during dinner service. The POS creates and prints 300 kitchen tickets, deducts stock and contaminates revenue before staff can distinguish fake orders.",
    "fix": "Apply per-machine/IP throttles and strict order caps, and make remote rows 'submitted' until explicitly accepted by staff. Only acceptance should invoke the authoritative local order service."
  },
  {
    "file": "src/main/sync/owner-sync.ts",
    "line": 6,
    "severity": "high",
    "category": "bug",
    "title": "All owner-order sync channels permanently drop writes made offline or during one transient failure",
    "evidence": "syncOrderToCloud returns immediately when offline at owner-sync.ts:6-8, catches thrown failures at :37-39, and never inspects resolved PostgREST errors at :22-36. Callers such as orders.ipc.ts:23-24 fire it once and keep no durable pending state.",
    "scenario": "The internet is down for one lunchtime order. The local order, receipt, stock and loyalty all succeed, but that order never appears in the owner dashboard even after Wi-Fi returns because nothing retries it.",
    "fix": "Write an owner-order outbox row in the same SQLite transaction as the order/edit/status change. Retry idempotent upserts until Supabase confirms success, then mark the outbox event delivered."
  },
  {
    "file": "src/main/ipc/data.ipc.ts",
    "line": 19,
    "severity": "high",
    "category": "bug",
    "title": "Excel menu update deterministically deletes every recipe and worker-category routing rule",
    "evidence": "data:clearForImport deletes menu_item_ingredients and worker_categories at data.ipc.ts:19-20. The export contains only Categories, Menu Items, Stock Items and Workers at ExcelImportExport.tsx:95-126; worker Categories is always empty at :124. Import ends after Workers at :163-245 with no relationship restoration.",
    "scenario": "An owner exports the working menu, changes one Burger price and imports the same file. Every subsequent Burger deducts zero meat/bread and records no ingredient cost; cooks also lose category auto-assignment, so split kitchen tickets fall back or disappear.",
    "fix": "Disable this import path in the hotfix. Replace it with one validated main-process transaction whose versioned workbook includes stable IDs, recipes and worker-category assignments."
  },
  {
    "file": "src/main/ipc/data.ipc.ts",
    "line": 151,
    "severity": "high",
    "category": "bug",
    "title": "Import and version restore replace entity identities, stranding promotions and corrupting same-name relationships",
    "evidence": "Restore deactivates old menu/workers and deletes categories at data.ipc.ts:151-162, then inserts new rows at :165-229. Relationships are reconstructed through lower-cased name Maps at :185-219 and :232-246 even though names are not unique. promotion_items keeps the old menu_item_id from migration 011, and orderStore.ts:70-80 compares those IDs literally.",
    "scenario": "A 20% Burger promotion references item ID 5. After import the visible Burger is ID 28, so the still-active promotion silently charges full price. If two menu items are both named Sauce, version restore can map both recipes to the last Sauce and deduct the wrong ingredients.",
    "fix": "Snapshots and workbooks need snapshot-local stable IDs for every entity and relationship. Reconcile/reactivate existing rows instead of replacing them; reject ambiguous legacy name matches rather than guessing."
  },
  {
    "file": "src/main/tablet/server.ts",
    "line": 300,
    "severity": "high",
    "category": "bug",
    "title": "Tablet and cloud checkout retries have no durable idempotency key",
    "evidence": "Tablet commits at server.ts:300-308 before responding at :317, while tablet-ui.ts:679-698 re-enables Submit after an ambiguous network failure. RemoteOrder.tsx:138-164 similarly offers Try Again, and remote-order/route.ts:12-16 inserts a fresh row each time. Neither schema carries a client request ID.",
    "scenario": "The first POST commits and prints, but Wi-Fi drops before the response. The customer taps Try Again. Two orders, two tickets, two stock deductions and two loyalty accruals are created.",
    "fix": "Generate one UUID when checkout begins and reuse it for retries. Enforce unique (source, source_request_id) locally and unique (machine_id, client_request_id) in Supabase, returning the existing result on conflict."
  },
  {
    "file": "src/main/tablet/tablet-ui.ts",
    "line": 474,
    "severity": "high",
    "category": "bug",
    "title": "Tablet and remote customers can confirm one price and be charged another",
    "evidence": "The tablet fetches menu once at tablet-ui.ts:474-475 and displays cached cart prices at :569 and :637-640. RemoteOrder.tsx:64-75 and :365-385 does the same from menu_sync. Both server paths set forceMenuPrice, and orders.repo.ts:107-111 silently substitutes the current local price.",
    "scenario": "A kiosk loaded Burger at 500 DA. The owner changes it to 650 DA. The customer still sees and confirms 500 DA, but the stored and printed order is 650 DA.",
    "fix": "Do not trust client prices. Submit a server-issued menu/quote version, return 409 with changed lines when it is stale, refresh the cart and require explicit reconfirmation. Alternatively honor a cryptographically trusted quote for a bounded time."
  },
  {
    "file": "src/main/ipc/orders.ipc.ts",
    "line": 40,
    "severity": "high",
    "category": "bug",
    "title": "Order edits, cancellation and restoration never notify the kitchen",
    "evidence": "Only create triggers printing at orders.ipc.ts:10-24. updateStatus, cancel and updateItems at :40-82 mutate local/cloud state but print no kitchen instruction.",
    "scenario": "The kitchen has a ticket for one Burger. The cashier changes it to three Burgers or cancels it. The kitchen continues preparing the original quantity because it receives no update or cancellation ticket.",
    "fix": "Emit explicit UPDATED, CANCELLED and RESTORED durable print jobs after the transaction, routed to affected stations. Updated tickets need clear replacement/delta semantics; blindly reprinting the original template can double production."
  },
  {
    "file": "src/main/ipc/printer.ipc.ts",
    "line": 456,
    "severity": "high",
    "category": "bug",
    "title": "Production printing can fail or skip a station while every caller behaves as though it succeeded",
    "evidence": "doPrint resolves structured {success:false} at printer.ipc.ts:562-577. Auto-print callers use only .catch at orders.ipc.ts:21-22, and operational buttons discard results at OrderScreen.tsx:1618-1643 and :1736-1763. In split mode, a group with no printer executes continue at printer.ipc.ts:500-514 while allSuccess remains true.",
    "scenario": "The kitchen printer is disconnected or an unassigned group has no fallback printer. The order succeeds, no sticky warning appears, manual Print gives no feedback, and split printing may explicitly return success despite producing no ticket.",
    "fix": "Persist per-destination print jobs and results. Manual actions must await and display errors; automatic failures need a sticky audible retry alert. Never return success unless every nonempty destination was dispatched."
  },
  {
    "file": "src/main/database/repositories/menu.repo.ts",
    "line": 57,
    "severity": "high",
    "category": "bug",
    "title": "The authoritative order boundary accepts deactivated products and remote repeats the invalid-quantity hole",
    "evidence": "menuRepo.getById at menu.repo.ts:57-65 omits is_active=1. ordersRepo.create at orders.repo.ts:90-121 performs no integer/cap validation. The remote listener filters only quantity > 0 at remote-order-listener.ts:101-104, repeating F014 beyond the tablet.",
    "scenario": "A customer opened the remote page before Burger was marked unavailable, then submits it afterward; the POS sells and deducts the inactive product. A crafted remote payload with quantity 0.5 or 1000000000 also reaches revenue and stock calculations.",
    "fix": "Validate active item/category status, finite positive integer quantities and caps inside the single main order service for every channel. Reject the complete order rather than silently dropping bad lines."
  },
  {
    "file": "src/renderer/src/store/orderStore.ts",
    "line": 130,
    "severity": "high",
    "category": "bug",
    "title": "Worker assignment is a POS-renderer feature, so tablet and remote kitchen lines are unassigned",
    "evidence": "Only orderStore.addItem looks up category workers at orderStore.ts:130-145. Tablet and remote create items without worker_id at server.ts:288-307 and remote-order-listener.ts:101-120; ordersRepo merely stores item.worker_id or null at orders.repo.ts:114-121.",
    "scenario": "Grill products normally route to Ali's printer. The same product ordered from a tablet has worker_id NULL and goes to the kitchen-all printer or is skipped when no fallback exists, so Ali never sees it.",
    "fix": "Resolve category/station assignment in the authoritative main service, with an explicit deterministic routing policy. The renderer may preview it but must not own it."
  },
  {
    "file": "src/main/ipc/printer.ipc.ts",
    "line": 219,
    "severity": "high",
    "category": "bug",
    "title": "Customer and menu text is inserted into printable HTML without escaping",
    "evidence": "Kitchen HTML directly interpolates worker name, menu_item_name, item notes and order notes at printer.ipc.ts:217-227; receipt/template paths do the same at :68-82 and :263-283. Tablet and remote customers can supply notes.",
    "scenario": "A tablet customer enters `<style>body{display:none}</style>` as an order note. The order commits, but the generated kitchen document is blank, so staff never prepare it.",
    "fix": "HTML-escape every text node and strictly validate style/URL values before building templates. Prefer a small renderer that distinguishes trusted markup from plain data."
  },
  {
    "file": "src/renderer/src/pages/orders/OrderScreen.tsx",
    "line": 665,
    "severity": "high",
    "category": "bug",
    "title": "Editing an old order silently reprices it using today's active promotions",
    "evidence": "The edit path calls store.getDiscount at OrderScreen.tsx:665-681. orderStore.loadOrderForEdit at orderStore.ts:179-204 restores no applied promotion/rule snapshot; getDiscount reads the current activePromos.",
    "scenario": "A 1,000 DA order was placed before a 50% promotion existed. A cashier later changes only its note, and Save rewrites its stored total and loyalty value to 500 DA. Disabling an original promo before a note edit removes the customer's legitimate discount.",
    "fix": "Preserve the stored discount for ordinary edits and expose an explicit Reprice action. For quantity-aware repricing, persist the exact applied promotion/rule snapshot with the order."
  },
  {
    "file": "src/renderer/src/pages/promotions/PromotionsPage.tsx",
    "line": 90,
    "severity": "high",
    "category": "bug",
    "title": "Promotion values have no bounds, so one typo can make every eligible order free",
    "evidence": "savePromo converts with Number at PromotionsPage.tsx:90-104; the input at :396-402 has no minimum or maximum, and the repository accepts it. orderStore later clamps the aggregate discount only to the subtotal.",
    "scenario": "The owner types 1000 instead of 10 for a percentage promotion. Every eligible order becomes 0 DA until somebody notices.",
    "fix": "Validate at both renderer and main boundaries: percentage 0 through 100, fixed discounts finite and non-negative, plus an explicit confirmation for unusually large discounts."
  },
  {
    "file": "src/main/database/repositories/analytics.repo.ts",
    "line": 83,
    "severity": "medium",
    "category": "bug",
    "title": "Item, category and worker revenue ignores discounts and cannot reconcile with headline revenue",
    "evidence": "Headline revenue sums orders.total at analytics.repo.ts:7. Item/category/worker queries instead sum order_items.total_price at :83-99, :121-135 and :138-156.",
    "scenario": "A 1,000 DA Burger receives a 50% promotion. Day revenue reports 500 DA, while Top Item, Category Revenue and Worker Revenue each report 1,000 DA.",
    "fix": "Either label these metrics Gross Sales or allocate order discounts to lines. Use proportional allocation for historical rows and persist per-line net/discount snapshots for exact future attribution."
  },
  {
    "file": "src/main/database/repositories/stock.repo.ts",
    "line": 168,
    "severity": "medium",
    "category": "bug",
    "title": "Negative stock purchases are accepted as real purchases",
    "evidence": "StockManagement.tsx:172-183 passes Number(adjQuantity) and Number(adjPrice) with no validation; inputs at :327-348 have no min. stockRepo.addPurchase at stock.repo.ts:168-205 accepts the values and updates quantity/cost.",
    "scenario": "The owner mistypes -10 kg at 800 DA. Stock falls by 10 kg and a negative-cost purchase/adjustment is recorded, corrupting inventory and profit.",
    "fix": "Require finite quantity > 0 and price >= 0 in the main repository/service, then mirror the constraints in the UI."
  },
  {
    "file": "src/main/tablet/pairing.ts",
    "line": 16,
    "severity": "high",
    "category": "bug",
    "title": "Persistent global four-digit TV codes collide often enough to pair a TV with another restaurant",
    "evidence": "pairing.ts:16-21 persists a random 1000-9999 code indefinitely. Every profile publishes it at cloud-sync.ts:74-85, and pair/route.ts:30-39 resolves collisions by choosing the freshest row. With 50 restaurants, the birthday-collision probability is about 12.7%.",
    "scenario": "Two restaurants share code 4821. The second one syncs last; when the first restaurant replaces its TV and enters 4821, it receives the other restaurant's machine ID, menu and queue.",
    "fix": "Use server-issued, expiring, single-use pairing sessions with a uniqueness constraint and explicit collision response. Six digits helps but is not a substitute for enforced uniqueness and expiry."
  },
  {
    "file": "admin/app/api/trial/action/route.ts",
    "line": 107,
    "severity": "high",
    "category": "bug",
    "title": "License mode changes are multi-step and can leave a paying customer in a contradictory state",
    "evidence": "setMode performs activation upsert/delete at trial/action/route.ts:107-126, then separately updates the trial at :136-143. Delete results at :120 and :124 are ignored, and there is no transaction spanning the two tables.",
    "scenario": "Admin changes an expired full-license site to Trial. Activation deletion succeeds, then the trial update gets a transient error. The API returns 500 after revoking the paid license, while the trial remains expired, locking the restaurant out.",
    "fix": "Implement each mode transition as one database transaction/RPC that checks every result and returns the resulting entitlement row."
  },
  {
    "file": "src/main/index.ts",
    "line": 567,
    "severity": "medium",
    "category": "bug",
    "title": "Old cloud orders are reconciled only once; one Supabase failure leaves them Preparing forever",
    "evidence": "Startup cloud completion remains inside the local `completed > 0` branch at index.ts:567-580 and ignores the resolved update error.",
    "scenario": "Startup completes yesterday's orders locally, but Supabase returns 503. On every later startup local completion returns zero, so cloud reconciliation is skipped and yesterday's rows remain Preparing indefinitely.",
    "fix": "Run the idempotent cloud reconciliation independently on every startup and periodic sync, inspect `{error}`, and retain a retryable reconciliation marker."
  },
  {
    "file": "admin/app/api/owner/data/route.ts",
    "line": 14,
    "severity": "medium",
    "category": "bug",
    "title": "Owner APIs turn cloud query failures into plausible zero-sales dashboards",
    "evidence": "data/route.ts:14-30 and stats/route.ts:18-25 discard every Supabase error and replace missing data with empty arrays/default currency.",
    "scenario": "Supabase is temporarily unavailable during a 120,000 DA day. The owner portal returns HTTP 200 showing zero orders and zero revenue, leading the owner to believe the POS did no business rather than that reporting is unavailable.",
    "fix": "Check every query result and return a clear non-200 unavailable/partial response. The dashboard must preserve last successful data and visibly label it stale."
  },
  {
    "file": "src/renderer/src/pages/analytics/AnalyticsDashboard.tsx",
    "line": 43,
    "severity": "medium",
    "category": "bug",
    "title": "This Week is eight rolling days and This Month starts one month ago",
    "evidence": "AnalyticsDashboard.tsx:43-54 subtracts seven days for an inclusive BETWEEN and uses setMonth(currentMonth-1), while the labels at :81-85 say This Week and This Month.",
    "scenario": "On July 9, This Week includes July 2 through July 9—eight days—and This Month includes June 9 through July 9 instead of July 1 through July 9, materially overstating current-period sales.",
    "fix": "Use restaurant-local calendar boundaries: configured week start and the first day of the current month. If rolling ranges are intended, label them Last 7/30 Days and subtract six days for an inclusive seven-day range."
  },
  {
    "file": "src/main/ipc/backup.ipc.ts",
    "line": 202,
    "severity": "medium",
    "category": "bug",
    "title": "Scheduled backup marks the day complete even when every destination failed",
    "evidence": "backup.ipc.ts:202-204 sets lastScheduledBackupDate before performAutoBackup. performAutoBackup swallows all path errors at :15-35 and returns no result.",
    "scenario": "The USB drive is disconnected at 23:00. The copy fails but the date is latched complete. The owner reconnects it at 23:05 and takes no more orders, so that day's menu/settings changes never reach off-machine backup.",
    "fix": "Return per-destination outcomes, latch only after at least one configured off-machine destination succeeds, persist the last successful date and retry failures with backoff."
  },
  {
    "file": "src/main/database/repositories/orders.repo.ts",
    "line": 92,
    "severity": "low",
    "category": "bug",
    "title": "Order date and daily-counter date are captured separately across midnight",
    "evidence": "ordersRepo.create computes today at orders.repo.ts:92, then getNextDailyNumber independently calls localDate at :75-76; created_at is captured again at :145.",
    "scenario": "The first date call occurs at 23:59:59.999 and the counter call just after midnight. The order stores yesterday's date with today's counter value 1, potentially producing a second yesterday order #1 and overwriting its cloud row.",
    "fix": "Capture one Date at transaction start, derive order_date and created_at from it, and pass that date into getNextDailyNumber. Add a unique `(order_date, daily_number)` constraint."
  }
]
```

## C. Architecture and product opinions

### 6.1 Licensing

The signed-token design is sound, but the Cloudflare Worker/D1 rewrite is currently the wrong project.

A nonce is not the important missing protection. It proves that an online reply belongs to a particular request, but an offline-capable client must still reuse a cached token when the server is unavailable. An attacker can simply block the server and exercise the offline path. Clock rollback must instead be addressed with:

- Server-derived `iat` and `exp`; never the desktop’s `Date.now()` as in `src/main/activation/cloud.ts:78`.
- A signed entitlement revision/serial and `kid`.
- Persisted maximum server time and revision; reject tokens older than either.
- A short, explicit offline grace period.
- Tri-state cloud results so transport failure is never interpreted as revoke or valid verification.
- Key rotation and canonical payload serialization.

A determined customer who can patch Electron can remove the check entirely. Do not build a bank-grade anti-tamper system for that threat model.

The minimum correct system is an authenticated Vercel/Edge API backed by the existing Supabase database. Keep signing and service-role mutations server-side. Let the desktop hold only the public verification key. D1 creates a second entitlement source of truth, new migrations, new operations and the undeployable `license-server/` skeleton for no product benefit.

The current direct-anon Supabase design is **not** good enough as documented because of the RLS policies and client-written trial expiry. But fixing that does not require a platform rewrite. Fix F001/F006/F023/F064, audit live policies, and put entitlement mutations/signing behind the existing admin backend. Park D1.

### 6.2 Multi-channel orders

Use one service, backed by durable events. Do not use an in-memory event bus as the source of truth.

Concrete shape:

- Add `src/main/services/order-service.ts`.
- Every adapter—`ipc/orders.ipc.ts`, `tablet/server.ts`, `remote-order-listener.ts`, and edit/status handlers—submits a normalized command.
- In one SQLite transaction, the service:
  - validates canonical order type, active products and integer quantities;
  - verifies quote/menu version;
  - resolves worker/station assignment;
  - calculates authoritative promotions and stores the applied rule snapshot;
  - inserts order/items;
  - deducts stock and records cost snapshots;
  - links/accrues loyalty;
  - writes durable outbox and print-job records.
- Add `source` and `source_request_id`, with a unique constraint.
- Add `src/main/services/order-effects-worker.ts` to retry owner sync, Telegram, queue broadcasts, backup and print jobs idempotently after commit.
- Route edits/cancellation/restoration through the same service and create explicit kitchen UPDATED/CANCELLED/RESTORED jobs.

The invariant should be: if an order exists, its financial and inventory effects committed atomically, and every external effect is either delivered or visibly pending. The current remote-listener patch duplicates side effects yet still omits queue, promotions, worker routing, idempotency and error-aware printing. Do not expand that pattern.

### 6.3 Display renderers

Extract a small shared source package now. The drift has already produced F019, F033, F056, F079 and F082.

I would create:

```text
packages/display-ui/
  src/types.ts
  src/render.ts
  src/styles.ts
  src/index.ts
```

`renderDisplayHtml(data, transportOptions)` should be pure and browser-compatible. Electron supplies SSE endpoint construction; Next supplies polling/cloud URLs. Configure Next’s `transpilePackages` and the Electron build alias to consume the same source.

Code generation adds another build step and stale generated outputs. Permanent duplication plus a diff test is cheap only until the next behavioral change. A diff test is useful as a temporary bridge while extracting the package, not as the final architecture.

### 6.4 Product priorities

The largest commercially relevant omission is cash/shift reconciliation.

The order schema in `src/main/database/migrations/001_initial.ts:185-198` and `CreateOrderInput` in `orders.repo.ts:50-71` have no tender, amount received, change, cashier, drawer session, refund/void reason or approving manager. A restaurant can report 100,000 DA of sales and find 95,000 DA in the drawer, but the product cannot explain the 5,000 DA gap. Owners will pay for:

- shift open/close and expected-versus-counted cash;
- cash/card/other tender and change;
- cashier identity;
- manager-approved void/refund with immutable audit trail;
- a concise end-of-day discrepancy report.

Next is remote-order acceptance and availability. Public remote orders should be submitted for staff acceptance, with sold-out state and an explicit quoted price. Auto-committing anonymous cloud orders directly to stock and kitchen is not production-safe.

The product is over-built in promotions, packs, ambient profiles and receipt customization relative to the reliability of its core path. Packs cannot be sold at their configured price; specific discounts and edits lack durable rule snapshots; two 1,100-line display renderers drift; Excel “update” destroys recipes. Do not add more analytics panels or ambiance controls until order entry, kitchen delivery, cash close and recovery from printer/network failure are boringly reliable.

The owner’s instinct is correct: speed and certainty of taking an order sell this product. Analytics only sells it after the underlying numbers can be trusted.

## D. Fix ordering

Do **not** merge the dirty ambient branch wholesale as a customer hotfix.

### Ship to `main` first

1. **Licensing containment**
   - Backport the F001 tri-state full-license fix.
   - Before shipping, add one shared cloud-check in-flight guard.
   - Handle confirmed `not_found` explicitly.
   - Do not reset `lastCloudSuccessTime` merely because Windows resumed.
   - Derive new trial expiry server-side.
   - Audit/restrict live activation/reset RLS.

2. **Money and kitchen-ticket correctness**
   - Backport F009.
   - Escape all printable data.
   - Validate active items, integer quantities and promotion bounds in main.
   - Surface `{success:false}` printing and mark skipped split-printer groups as failures.
   - Add a prominent pending/retry state for failed kitchen printing.

3. **Disable the current Excel update/import**
   - This should be a kill switch or blocking warning in the hotfix. A valid export/import round trip currently deletes every recipe and worker-category relationship. That is worse than temporarily removing the feature.

4. **Backups**
   - Replace raw WAL-mode file copying before advertising external backups as safe.
   - Retry failed scheduled destinations and latch only real success.

5. **Password reset**
   - Replace the Telegram/cloud two-step consumption with atomic operations.
   - Do not trust renderer “already validated” state or name-based reset methods.

6. **Admin containment**
   - Add real owner API sessions.
   - Add remote-order caps/rate limiting and preferably staff acceptance.
   - Preserve backward-compatible SELECT access while old desktop builds exist, then remove unnecessary anon writes.

### Next branch-level refactor

1. Add nullable schema fields and indexes for `source`, `source_request_id`, applied-promotion snapshot, outbox events and print jobs.
2. Implement the transactional `order-service.ts`.
3. Move POS creation first, then tablet, remote and edits/status transitions onto it.
4. Start the durable effects worker only after every adapter writes outbox events.
5. Add idempotency and quote-version handling before enabling automatic remote acceptance.
6. Fix customer relinking, order-edit pricing policy and kitchen update/cancel tickets within that service.
7. Backfill/reconcile owner orders and analytics; do not rely on one-day latches.
8. Rebuild Excel import around stable IDs and transactions, then re-enable it.

### Before merging `feature/ambient-tv-overhaul`

- Extract the shared display package.
- Fix global pairing collisions and explicit default-profile selection.
- Fix Android attempt cancellation, one-shot initial success, delayed-runnable teardown, API 21/22 HTTP failures and atomic URL/transport persistence.
- Resolve text scaling, currency-symbol consistency and whether cart display is a real feature.
- Run the TV tests against LAN success, LAN failure, cloud fallback and manual re-pairing.

### Later

Keep the Ed25519 entitlement work, but implement it inside the existing Supabase/Vercel stack. The Cloudflare/D1 skeleton should wait until order, printer, backup and cash-close correctness are stable.

Several proposed/current fixes should not merge unchanged:

- F016: trusting renderer validation.
- F040: recomputing edits using today’s promotions.
- F070: resetting verification time on resume and starting concurrent checks.
- F074: remapping workers by non-unique name.
- F082: using `currency` instead of `currency_symbol`.
- F100: one generic done flag that also disables later WebView failure recovery.

## E. Regression guards

| scenario | status | regression it must prove |
|---|---|---|
| `license-offline-start` | new | Seed `CLOUD-VERIFIED`; simulate offline, PostgREST status 0, 500 and a confirmed empty row. Offline/500 must preserve full license; confirmed removal must revoke. Simulate resume and assert one cloud request, no false success timestamp and no instant trial lock. |
| `order-discount` | extend existing | Place 1,000 DA with 20% promo; assert DB total, receipt preview, printable HTML and owner row all say 800 DA. Cover 0%, 100%, fixed discount and invalid over-100 input. |
| `price-integrity` | extend existing | Submit tablet/remote fractional, huge and inactive lines; all must be rejected. Change a price after quote and assert 409/reconfirmation rather than silent over/undercharge. |
| `order-channel-parity` | new | Submit the same basket through POS, tablet and remote. Assert identical total/promotion, stock deductions, loyalty, worker routing, owner outbox, queue event, Telegram event and print jobs. |
| `remote-idempotency` | new | Commit a request while dropping the HTTP response, then retry the same UUID and restart the listener with its cloud row still pending. Assert one local order, one stock deduction and one set of side effects. |
| `order-edit` | extend existing | Change customer A to B, edit quantities after promotions change, reject an edit after concurrent completion, and assert explicit kitchen UPDATED/CANCELLED/RESTORED jobs. |
| `printer-failure-safety` | new | Test disconnected printer, no configured printer, split group with no destination and timeout. Assert no false success, a durable pending job and visible retry alert; reconnect and assert exactly one ticket. |
| `excel-roundtrip` | new | Seed recipes, same-name items, worker categories, printer assignments, promotions and historical sales. Export/import and version restore must preserve relationships and stable behavior; malformed/unrelated workbook must leave the database byte-for-byte logically unchanged. |
| `local-midnight` | new | Freeze time at 00:30 `Africa/Algiers`. Verify order date/counter, Day Recap, attendance, Telegram, owner sync, cloud queue, daily analytics and previous-day completion all use the same local date. Include the exact midnight transaction boundary. |
| `admin-sweep` | extend existing | Seed over 150 daily orders and verify full aggregates plus pagination. Force Supabase errors and require an unavailable/stale state rather than zero sales. Direct owner API calls without the session cookie must return 401. |
| `backup-wal` | new | Commit an order that remains in WAL, take an external backup, restore it into an isolated DB and assert the order/items/deductions exist. Simulate a failed 23:00 destination and verify catch-up after reconnection. |
| `tv-e2e` | extend existing | Exercise duplicate pairing codes, named/default profiles, LAN 500 after TCP reachability, cloud fallback, self-navigation, Android 21 HTTP failure and a manual new code while an old attempt is in flight. Assert no cross-restaurant pairing and atomic persistence of the verified target. |
