# Scratch validation procedure

Run these steps only against a disposable Supabase project.

## 1. Syntax and lint

```powershell
npx supabase start
npx supabase db reset
npx supabase db lint --level warning
```

`db reset` applies the numeric dependency order: baseline (`0001`), Phase A (`0002`), additive RPCs (`0003`), and strict Phase B (`0004`). For a compatibility-state test, reset the scratch database and apply only `0001`, `0002`, and `0003` manually with `psql -v ON_ERROR_STOP=1`.

## 2. Baseline inventory

After applying only `0001_baseline.sql`, assert:

```sql
select count(*) from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'activations','daily_stats','daily_top_items','display_settings','installations',
    'menu_sync','menu_upload_requests','owner_orders','owner_pins','remote_orders',
    'reset_codes','short_codes','trials'
  ); -- 13

select count(*) from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'activations','daily_stats','daily_top_items','display_settings','installations',
    'menu_sync','menu_upload_requests','owner_orders','owner_pins','remote_orders',
    'reset_codes','short_codes','trials'
  ); -- 78

select count(*) from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid::regclass::text in (
    'activations','daily_stats','daily_top_items','display_settings','installations',
    'menu_sync','menu_upload_requests','owner_orders','owner_pins','remote_orders',
    'reset_codes','short_codes','trials'
  ); -- 25
```

Diff normalized results from `information_schema.columns`, `pg_get_constraintdef`, `pg_indexes`, and `pg_policies` against the four `schema_*.json` backup files.

## 3. Phase-A policy matrix

After applying `0002_phase_a_containment.sql`:

```sql
select tablename, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

select tablename
from pg_policies
where schemaname = 'public' and cmd = 'DELETE'
order by tablename;
-- daily_top_items, display_settings, short_codes
```

With an anon JWT, exercise every allowed operation in the README matrix. For each upsert, test both the insert path and the conflict/update path. Also assert SQLSTATE `42501` for at least one denied verb on every table and for DELETE on the ten non-delete tables.

Apply `supabase/rollback_0002.sql`, then diff `pg_policies` against `schema_policies.json` to prove rollback fidelity.

## 4. RPC atomicity and authorization

- Race two calls to `consume_reset_code` for the same valid row; exactly one returns the row ID and the other returns zero rows.
- Test used, expired, wrong-code, and wrong-machine cases; all return zero rows.
- Race duplicate `remote_order_submit` calls; exactly one reports `inserted=true`, both return the same row ID, and only one row exists.
- Race two `remote_order_decide` calls; at most one returns a row.
- Confirm capability lookup works only with the SHA-256 hex and lazily changes an overdue submitted row to `expired`.
- Confirm throttle increments atomically, resets after its window, and returns a positive retry delay once limited.
- As `anon` and `authenticated`, assert direct DML on both v2 tables and execution of every remote-order RPC are denied.
- As `anon`, assert `consume_reset_code` executes; after Phase B, assert direct DML on all 13 legacy tables is denied.

Record the Supabase CLI version, PostgreSQL version, commands, outputs, and UTC timestamp with the rollout evidence.
