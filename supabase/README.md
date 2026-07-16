# Supabase cloud boundary

These files are authored rollout artifacts. No command in this package applies them to a live project.

## Provenance

`migrations/0001_baseline.sql` was transcribed from the live-project backup made on 2026-07-16 (78 columns, 25 constraints, 25 indexes, and 17 policies):

- `schema_columns.json`: all 13 tables, column types, nullability, and defaults.
- `schema_constraints.json`: all primary keys, unique constraints, foreign keys, and checks.
- `schema_indexes.json`: constraint-owned indexes plus the three standalone indexes.
- `schema_policies.json`: the live policy names, roles, commands, `USING`, and `WITH CHECK` expressions.

The JSON files in `D:\Fast Food Manager\Fastfood Manager\supabase-backup-2026-07-16` are the authority. `admin/SETUP.md` was consulted only to confirm historical RLS intent and was not used to invent columns or constraints. The backup query did not capture `pg_class.relrowsecurity`; the baseline enables RLS on every table because live policies exist for every table and the historical setup explicitly enabled RLS. The baseline is structural and intentionally contains no customer rows.

## Migration stages

| File | Purpose | Rollout rule |
| --- | --- | --- |
| `0001_baseline.sql` | Reproduce the live 13-table schema and live policies | Empty scratch project only; live already has this state |
| `0002_phase_a_containment.sql` | Replace broad policies with the shipped-client verb allow-list | Compatibility stage |
| `0003_rpcs.sql` | Add atomic reset and remote-order v2 tables/RPCs | Additive; install while Phase A remains active |
| `0004_phase_b_strict.sql` | Remove direct client table access | **DO NOT APPLY UNTIL BOTH CUSTOMERS ARE ON v3.2.0+** |
| `../rollback_0002.sql` | Restore the exact dumped policy set | Manual emergency rollback only |

The numeric order is also the safe dependency order: Phase A (`0002`), additive RPCs (`0003`), then strict lockdown (`0004`). The orchestrator must still defer `0004` in production until both customers have adopted v3.2.0 or later.

## Desktop endpoint configuration

`src/main/config/endpoints.ts` currently uses `https://fastfood-manager.vercel.app` only as a baked `licenseServerUrl` placeholder. **It MUST be replaced with the deployed Cloudflare Worker URL before WP-D integration.** The placeholder is not evidence that the license-server endpoints exist on the Vercel application.

## Phase-A policy ↔ verb cross-check

`I+U` is required for every PostgREST upsert. A dash means there is no anon policy for that verb.

| Table | v3.0.2 | v1.6.5 | v3.0.3+ addition | Phase-A policies (S/I/U/D) |
| --- | --- | --- | --- | --- |
| `activations` | select, upsert | upsert | — | S/I/U/— |
| `daily_stats` | upsert | — | — | S/I/U/— |
| `daily_top_items` | upsert | — | delete | S/I/U/D |
| `display_settings` | upsert | — | delete | S/I/U/D |
| `installations` | upsert | upsert | — | S/I/U/— |
| `menu_sync` | upsert | — | — | S/I/U/— |
| `menu_upload_requests` | select, update, upsert | select, update, upsert | — | S/I/U/— |
| `owner_orders` | update, upsert | — | — | S/I/U/— |
| `owner_pins` | upsert | — | — | S/I/U/— |
| `remote_orders` | select, update | — | — | S/—/U/— |
| `reset_codes` | select, update | select, update | — | S/—/U/— |
| `short_codes` | insert, select | — | delete | S/I/—/D |
| `trials` | insert, select | insert, select | — | S/I/—/— |

Thus anon DELETE has a policy only on `display_settings`, `short_codes`, and `daily_top_items`.

### RLS support for upsert conflict paths

PostgREST upsert conflict paths require SELECT visibility in addition to INSERT and UPDATE. Phase A therefore includes `S/I/U` on all seven previously implicit upsert targets: `daily_stats`, `daily_top_items`, `display_settings`, `installations`, `menu_sync`, `owner_orders`, and `owner_pins`. This remains narrower than the live baseline's `FOR ALL TO public` policies, and Phase B removes the temporary access.

## Scratch-project application

Use a disposable local Supabase project or a newly created hosted scratch project. Never substitute the production connection string.

For a local stack with PostgreSQL client tools installed:

```powershell
npx supabase start
$db = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
psql $db -v ON_ERROR_STOP=1 -f supabase/migrations/0001_baseline.sql
psql $db -v ON_ERROR_STOP=1 -f supabase/migrations/0002_phase_a_containment.sql
psql $db -v ON_ERROR_STOP=1 -f supabase/migrations/0003_rpcs.sql
```

That produces the intended compatibility state: Phase A plus additive v3.2 RPCs. Apply `0004_phase_b_strict.sql` only in a separate disposable validation pass when testing the final lockdown. `supabase db reset` is suitable for syntax-checking the complete numeric chain on a scratch stack, but not for an unreviewed production rollout.

## RPC boundary notes

- `consume_reset_code(code, machine_id)` performs one conditional update and returns an ID only when the row was unused and unexpired.
- `menu_sync.quote_revision` is added in `0003`; v3.2 catalog sync must increment it whenever customer-visible availability or pricing changes.
- Remote-order submit, capability lookup/lazy expiry, throttle, listener list, conditional decision, and stale-expiry functions are `SECURITY DEFINER`, pin `search_path` to the empty string, and are executable only by `service_role`.
- `consume_reset_code` is executable by `anon` for the v3.2 desktop path; direct table DML is removed in Phase B.
- The server route must generate the 32-byte status capability, store only its SHA-256 hex via `remote_order_submit`, and return the raw capability to the client. To make a lost-response retry recover the same capability while retaining only a hash, the route must deterministically regenerate or durably reuse the same token for a given `(machine_id, client_request_id)`.

See `tests/validate.md` for the orchestrator's exact checks.
