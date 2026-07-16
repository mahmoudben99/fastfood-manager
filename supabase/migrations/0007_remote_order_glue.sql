-- Migration 0007 (WP-G glue): pieces the remote-order surface needs that are not
-- in WP-B 0001-0004. Applies AFTER 0003 (remote_orders_v2 + remote_order_take_throttle
-- must exist). Reconciliation notes for the orchestrator are inline.

begin;

-- ── Per-restaurant remote-ordering flag — DEFAULT OFF ──────────────────────────
-- A missing row means DISABLED. The public submit/catalog routes return an
-- identical 404 for "disabled" and "unknown machine".
create table if not exists public.remote_order_settings (
  machine_id text primary key,
  enabled boolean not null default false,
  updated_at timestamp with time zone not null default now()
);

alter table public.remote_order_settings enable row level security;
revoke all privileges on table public.remote_order_settings from anon, authenticated;
grant select, insert, update on table public.remote_order_settings to service_role;

-- ── ADDENDUM #2: accept attempt counter for claim-revert bookkeeping ───────────
alter table public.remote_orders_v2
  add column if not exists accept_attempts integer not null default 0;

-- ── `machines` view: the admin routes' single lookup for flag + catalog revision.
-- catalog_revision mirrors menu_sync.quote_revision (added by WP-B 0003).
-- NOTE for integration: the name `machines` is consumed by the frozen WP-G route
-- tests; if another package claims this name, reconcile there, not here.
create or replace view public.machines as
select
  i.machine_id,
  coalesce(s.enabled, false) as remote_ordering_enabled,
  coalesce(m.quote_revision, 0) as catalog_revision
from public.installations i
left join public.remote_order_settings s on s.machine_id = i.machine_id
left join public.menu_sync m on m.machine_id = i.machine_id;

revoke all privileges on table public.machines from anon, authenticated;
grant select on table public.machines to service_role;

-- ── ADDENDUM #7: ONE atomic throttle verdict per submission ────────────────────
-- 5 per 10 minutes per (IP + machine) AND 30 per hour per machine, evaluated in a
-- single RPC call so a 50-burst yields exactly 5 accepted / 45 denied.
-- Composes WP-B 0003's remote_order_take_throttle (fixed-window counters).
create or replace function public.remote_order_check_throttle(
  p_ip text,
  p_machine_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  ip_machine record;
  machine_hour record;
begin
  if p_ip is null or p_ip = '' or p_machine_id is null or p_machine_id = '' then
    raise exception 'bad_input' using errcode = '22023';
  end if;

  select * into ip_machine
  from public.remote_order_take_throttle('rord:ipm:' || p_ip || ':' || p_machine_id, 5, 600);
  select * into machine_hour
  from public.remote_order_take_throttle('rord:mid:' || p_machine_id, 30, 3600);

  return jsonb_build_object(
    'allowed', (ip_machine.allowed and machine_hour.allowed),
    'retryAfter', greatest(
      case when ip_machine.allowed then 0 else coalesce(ip_machine.retry_after_seconds, 600) end,
      case when machine_hour.allowed then 0 else coalesce(machine_hour.retry_after_seconds, 600) end
    )
  );
end;
$function$;

revoke execute on function public.remote_order_check_throttle(text, text) from public;
grant execute on function public.remote_order_check_throttle(text, text) to service_role;

-- ── POS-facing enable/disable toggle ───────────────────────────────────────────
-- SECURITY (red-team finding #5): machine_ids are PUBLIC (QR/owner/TV URLs), so
-- these RPCs are service_role-ONLY. The desktop reaches them exclusively through
-- the admin server endpoint /api/remote-order/settings, which verifies the WP-D
-- device access token and FAILS CLOSED until that integration lands. Anon must
-- NEVER be granted execute here — that would let anyone toggle any restaurant.
create or replace function public.remote_order_get_enabled(p_machine_id text)
returns boolean
language sql
security definer
set search_path = ''
as $function$
  select coalesce(
    (select s.enabled from public.remote_order_settings s where s.machine_id = p_machine_id),
    false
  );
$function$;

create or replace function public.remote_order_set_enabled(
  p_machine_id text,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_machine_id is null or p_machine_id = '' or p_enabled is null then
    raise exception 'bad_input' using errcode = '22023';
  end if;
  -- Only machines that actually exist (installed POS) can be toggled.
  if not exists (select 1 from public.installations i where i.machine_id = p_machine_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.remote_order_settings (machine_id, enabled, updated_at)
  values (p_machine_id, p_enabled, now())
  on conflict (machine_id) do update
    set enabled = excluded.enabled, updated_at = now();
  return p_enabled;
end;
$function$;

revoke execute on function public.remote_order_get_enabled(text) from public, anon, authenticated;
revoke execute on function public.remote_order_set_enabled(text, boolean) from public, anon, authenticated;
grant execute on function public.remote_order_get_enabled(text) to service_role;
grant execute on function public.remote_order_set_enabled(text, boolean) to service_role;

-- ── Atomic DB-side accept claim (red-team findings #2/#4) ──────────────────────
-- ONE statement-atomic function verifies machine ownership + status='submitted'
-- + DB-clock TTL + catalog-revision match, then claims. The claim sets
-- status='accepted' WITHOUT a daily_number; the status capability endpoint
-- reports such rows as still 'submitted' to customers, so nothing is publicly
-- confirmed before the local POS order commits and writes the daily number.
-- service_role-only today; TODO(WP-D integration): expose to the desktop through
-- a device-access-token-verified wrapper (listener falls back to the equivalent
-- conditional table update until then).
create or replace function public.remote_order_claim(
  p_order_id uuid,
  p_machine_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  claimed public.remote_orders_v2%rowtype;
  target public.remote_orders_v2%rowtype;
  current_revision integer;
begin
  if p_order_id is null or p_machine_id is null or p_machine_id = '' then
    raise exception 'bad_input' using errcode = '22023';
  end if;

  select r.* into target
  from public.remote_orders_v2 r
  where r.id = p_order_id and r.machine_id = p_machine_id;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select coalesce(m.quote_revision, 0) into current_revision
  from public.menu_sync m where m.machine_id = p_machine_id;
  current_revision := coalesce(current_revision, 0);

  -- Accept-time revision check (ADDENDUM #3): expired with zero POS effects.
  if target.status = 'submitted' and current_revision <> target.quote_revision then
    update public.remote_orders_v2 r
    set status = 'expired', rejected_reason = 'revision_changed', decided_at = now()
    where r.id = p_order_id and r.status = 'submitted';
    return jsonb_build_object('outcome', 'revision_changed');
  end if;

  -- DB-clock TTL: stale requests expire, never claim.
  if target.status = 'submitted' and target.expires_at <= now() then
    update public.remote_orders_v2 r
    set status = 'expired', decided_at = now()
    where r.id = p_order_id and r.status = 'submitted';
    return jsonb_build_object('outcome', 'expired');
  end if;

  update public.remote_orders_v2 r
  set status = 'accepted', decided_at = now()
  where r.id = p_order_id
    and r.machine_id = p_machine_id
    and r.status = 'submitted'
    and r.expires_at > now()
  returning r.* into claimed;
  if not found then
    return jsonb_build_object('outcome', 'lost_race');
  end if;

  return jsonb_build_object('outcome', 'claimed', 'row', to_jsonb(claimed));
end;
$function$;

revoke execute on function public.remote_order_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.remote_order_claim(uuid, text) to service_role;

-- ── Catalog push with atomic revision bump (red-team finding #1) ───────────────
-- The POS menu sync MUST bump quote_revision whenever the customer-visible
-- payload changes, or the stale-quote check is blind to price changes. The
-- fingerprint is computed by the desktop over customer-visible fields.
-- Grants mirror the CURRENT Phase-A posture in WP-B 0002 (anon may already write
-- menu_sync directly for its own push path); this RPC adds no new exposure.
-- TODO(WP-D integration): revoke anon and require the device access token.
alter table public.menu_sync
  add column if not exists catalog_fingerprint text;

create or replace function public.menu_sync_push(
  p_machine_id text,
  p_categories jsonb,
  p_items jsonb,
  p_fingerprint text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_revision integer;
begin
  if p_machine_id is null or p_machine_id = '' or p_fingerprint is null or p_fingerprint = '' then
    raise exception 'bad_input' using errcode = '22023';
  end if;

  insert into public.menu_sync (machine_id, categories, items, updated_at, quote_revision, catalog_fingerprint)
  values (p_machine_id, coalesce(p_categories, '[]'::jsonb), coalesce(p_items, '[]'::jsonb), now(), 1, p_fingerprint)
  on conflict (machine_id) do update
  set categories = excluded.categories,
      items = excluded.items,
      updated_at = now(),
      quote_revision = case
        when public.menu_sync.catalog_fingerprint is distinct from excluded.catalog_fingerprint
          then public.menu_sync.quote_revision + 1
        else public.menu_sync.quote_revision
      end,
      catalog_fingerprint = excluded.catalog_fingerprint
  returning quote_revision into new_revision;

  return new_revision;
end;
$function$;

revoke execute on function public.menu_sync_push(text, jsonb, jsonb, text) from public;
grant execute on function public.menu_sync_push(text, jsonb, jsonb, text) to anon, service_role;

commit;
