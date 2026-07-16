-- Owner/admin remote-credential auth: the remote owner dashboard used to gate on a bare 4-digit
-- tablet PIN (`owner_pins`) that was never durably throttled. This introduces a separate,
-- longer, admin-resettable credential plus durable per-machine AND per-IP brute-force throttling
-- with exponential backoff (see admin/lib/rate-limit.ts and admin/lib/owner-auth.ts). Semantic
-- contract for both tables is frozen by admin/tests/auth/owner-admin-auth.test.mjs and
-- admin/tests/auth/auth.contract.d.ts (CONTRACT_ADDENDUM.md item 8). Service-role only — no anon
-- policies; the Vercel admin app is the sole writer/reader via the SUPABASE_SERVICE_ROLE_KEY
-- client.

begin;

create table public.owner_credentials (
  machine_id text primary key,
  credential_hash text not null,
  updated_at timestamp with time zone not null default now()
);

-- One row per (scope, key) — 'machine' scoped by machine_id, 'ip' scoped by the caller's
-- client IP. Both are checked on every verify attempt; a lock in either scope blocks the
-- request, and a failed attempt increments both.
create table public.auth_throttle (
  scope text not null check (scope in ('machine', 'ip')),
  key text not null check (char_length(key) between 1 and 255),
  failure_count integer not null default 0 check (failure_count >= 0),
  locked_until timestamp with time zone,
  updated_at timestamp with time zone not null default now(),
  primary key (scope, key)
);

create index idx_auth_throttle_locked_until
  on public.auth_throttle (locked_until)
  where locked_until is not null;

alter table public.owner_credentials enable row level security;
alter table public.auth_throttle enable row level security;

-- No anon/authenticated policies are created: these tables are never read by a browser or the
-- POS client directly, only by the admin Next.js server routes using the service_role key, which
-- bypasses RLS. Explicitly revoking keeps that true even if a future policy is added carelessly.
revoke all privileges on table public.owner_credentials from anon, authenticated;
revoke all privileges on table public.auth_throttle from anon, authenticated;
grant select, insert, update on table public.owner_credentials to service_role;
grant select, insert, update, delete on table public.auth_throttle to service_role;

-- Cross-vendor security review finding (BLOCKER-2): a read-then-write throttle check (read
-- failure_count, decide in the app, write failure_count+1 back) is not atomic across concurrent
-- requests. N requests arriving together for the same machine_id/IP would all read the same
-- pre-burst count, all conclude "not locked yet", and all fall through to bcrypt — the lock never
-- actually engages under a real burst, AND every one of those N requests pays the bcrypt CPU cost
-- first (a hashing-cost DoS surface). This function reserves the attempt for BOTH scopes
-- (machine_id and caller IP) in one statement, gating BEFORE the caller ever runs bcrypt. The
-- `select ... for update` row lock is what makes concurrent callers serialize correctly; the
-- upsert-then-lock pattern guarantees the row exists first without a separate round trip.
create or replace function public.owner_auth_throttle_take(
  p_machine_key text,
  p_ip_key text,
  p_now timestamp with time zone
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  machine_failure_count integer,
  machine_locked_until timestamp with time zone,
  ip_failure_count integer,
  ip_locked_until timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  machine_row public.auth_throttle%rowtype;
  ip_row public.auth_throttle%rowtype;
  machine_locked boolean;
  ip_locked boolean;
  retry integer;
  new_count integer;
  new_lock timestamp with time zone;
begin
  if p_machine_key is null or p_machine_key = ''
    or p_ip_key is null or p_ip_key = ''
    or p_now is null then
    raise exception 'bad_input' using errcode = '22023';
  end if;

  -- Ensure both rows exist, then take a row-level lock on each. Concurrent callers for the same
  -- key serialize here (standard Postgres row-lock behavior for a single UPDATE/SELECT ... FOR
  -- UPDATE) — that serialization is the entire fix.
  insert into public.auth_throttle as t (scope, key, failure_count, locked_until)
    values ('machine', p_machine_key, 0, null)
    on conflict (scope, key) do nothing;
  insert into public.auth_throttle as t (scope, key, failure_count, locked_until)
    values ('ip', p_ip_key, 0, null)
    on conflict (scope, key) do nothing;

  select * into machine_row from public.auth_throttle where scope = 'machine' and key = p_machine_key for update;
  select * into ip_row from public.auth_throttle where scope = 'ip' and key = p_ip_key for update;

  machine_locked := machine_row.locked_until is not null and machine_row.locked_until > p_now;
  ip_locked := ip_row.locked_until is not null and ip_row.locked_until > p_now;

  if machine_locked or ip_locked then
    -- Locked: reject WITHOUT incrementing anything further — hammering a locked scope must not
    -- keep extending its own lock, and a correct credential must not be compared at all.
    retry := greatest(
      1,
      case when machine_locked
        then ceil(extract(epoch from (machine_row.locked_until - p_now)))::integer
        else 0
      end,
      case when ip_locked
        then ceil(extract(epoch from (ip_row.locked_until - p_now)))::integer
        else 0
      end
    );
    return query select
      false, retry,
      machine_row.failure_count, machine_row.locked_until,
      ip_row.failure_count, ip_row.locked_until;
    return;
  end if;

  -- Not locked: reserve this attempt now, before the caller runs bcrypt. Schedule matches
  -- admin/lib/rate-limit.ts exactly: failures 1-2 no lock; failure 3 locks 60s; each later
  -- failure doubles the remaining duration, capped at 3600s. A correct credential clears both
  -- rows afterward (see the app's clearThrottle calls) — undoing this speculative increment is
  -- exactly what a successful login is supposed to do.
  new_count := machine_row.failure_count + 1;
  new_lock := case
    when new_count < 3 then null
    else p_now + make_interval(secs => least(3600, (60 * power(2, least(6, new_count - 3)))::integer))
  end;
  update public.auth_throttle
    set failure_count = new_count, locked_until = new_lock, updated_at = clock_timestamp()
    where scope = 'machine' and key = p_machine_key
    returning * into machine_row;

  new_count := ip_row.failure_count + 1;
  new_lock := case
    when new_count < 3 then null
    else p_now + make_interval(secs => least(3600, (60 * power(2, least(6, new_count - 3)))::integer))
  end;
  update public.auth_throttle
    set failure_count = new_count, locked_until = new_lock, updated_at = clock_timestamp()
    where scope = 'ip' and key = p_ip_key
    returning * into ip_row;

  return query select
    true, 0,
    machine_row.failure_count, machine_row.locked_until,
    ip_row.failure_count, ip_row.locked_until;
end;
$function$;

-- SECURITY DEFINER functions are EXECUTE-granted to PUBLIC by default; without this revoke,
-- anon/authenticated could invoke the reservation directly via PostgREST regardless of the table
-- grants above (the function runs with the owning role's privileges, bypassing RLS by design).
revoke all privileges on function public.owner_auth_throttle_take(text, text, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.owner_auth_throttle_take(text, text, timestamp with time zone) to service_role;

commit;
