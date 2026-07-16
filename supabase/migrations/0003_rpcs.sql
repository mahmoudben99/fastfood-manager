-- Migration 0003: atomic v3.2.0 cloud-boundary operations.
-- Remote-order functions are callable only by service_role-backed server routes.
-- consume_reset_code is the sole anon reset-code path after Phase B.

begin;

-- The live menu_sync baseline has no catalog revision. v3.2 writers increment this
-- value whenever the customer-visible catalog/pricing payload changes.
alter table public.menu_sync
  add column quote_revision integer not null default 0
  check (quote_revision >= 0);

create table public.remote_orders_v2 (
  id uuid primary key default gen_random_uuid(),
  machine_id text not null,
  client_request_id uuid not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'accepted', 'rejected', 'expired')),
  order_type text not null check (order_type in ('local', 'takeout', 'delivery')),
  table_number text,
  customer_name text not null,
  customer_phone text,
  note text check (char_length(note) <= 300),
  items jsonb not null,
  quote_revision integer not null,
  quoted_total numeric not null,
  status_token_hash text not null,
  daily_number integer,
  rejected_reason text,
  created_at timestamp with time zone not null default now(),
  decided_at timestamp with time zone,
  expires_at timestamp with time zone not null,
  constraint remote_orders_v2_machine_id_client_request_id_key
    unique (machine_id, client_request_id)
);

create table public.remote_order_throttle (
  key text primary key,
  window_start timestamp with time zone not null,
  count integer not null
);

create unique index remote_orders_v2_status_token_hash_key
  on public.remote_orders_v2 (status_token_hash);
create index idx_remote_orders_v2_listener
  on public.remote_orders_v2 (machine_id, created_at)
  where status = 'submitted';
create index idx_remote_orders_v2_expiry
  on public.remote_orders_v2 (expires_at)
  where status = 'submitted';

alter table public.remote_orders_v2 enable row level security;
alter table public.remote_order_throttle enable row level security;

revoke all privileges on table public.remote_orders_v2 from anon, authenticated;
revoke all privileges on table public.remote_order_throttle from anon, authenticated;
grant select, insert, update on table public.remote_orders_v2 to service_role;
grant select, insert, update, delete on table public.remote_order_throttle to service_role;

create or replace function public.consume_reset_code(code text, machine_id text)
returns table (id uuid)
language sql
security definer
set search_path = ''
as $function$
  update public.reset_codes as reset_code
  set used = true
  where reset_code.code = $1
    and reset_code.machine_id = $2
    and reset_code.used = false
    and reset_code.expires_at > now()
  returning reset_code.id;
$function$;

create or replace function public.remote_order_take_throttle(
  throttle_key text,
  max_count integer,
  window_seconds integer
)
returns table (allowed boolean, current_count integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  throttle_row public.remote_order_throttle%rowtype;
  checked_at timestamp with time zone := clock_timestamp();
begin
  if throttle_key is null or throttle_key = ''
    or max_count is null or max_count < 1 or max_count > 1000
    or window_seconds is null or window_seconds < 1 or window_seconds > 86400 then
    raise exception 'bad_input' using errcode = '22023';
  end if;

  insert into public.remote_order_throttle as throttle (key, window_start, count)
  values (throttle_key, checked_at, 1)
  on conflict (key) do update
  set window_start = case
        when throttle.window_start + make_interval(secs => window_seconds) <= checked_at
          then checked_at
        else throttle.window_start
      end,
      count = case
        when throttle.window_start + make_interval(secs => window_seconds) <= checked_at
          then 1
        else throttle.count + 1
      end
  returning * into throttle_row;

  allowed := throttle_row.count <= max_count;
  current_count := throttle_row.count;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (
        throttle_row.window_start + make_interval(secs => window_seconds) - checked_at
      )))::integer
    )
  end;
  return next;
end;
$function$;

create or replace function public.remote_order_submit(
  machine_id text,
  client_request_id uuid,
  order_type text,
  table_number text,
  customer_name text,
  customer_phone text,
  note text,
  items jsonb,
  quote_revision integer,
  quoted_total numeric,
  status_token_hash text
)
returns table (
  id uuid,
  status text,
  result_expires_at timestamp with time zone,
  result_quoted_total numeric,
  inserted boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  inserted_row public.remote_orders_v2%rowtype;
  existing_row public.remote_orders_v2%rowtype;
  submitted_at timestamp with time zone := clock_timestamp();
begin
  insert into public.remote_orders_v2 (
    machine_id, client_request_id, order_type, table_number, customer_name,
    customer_phone, note, items, quote_revision, quoted_total,
    status_token_hash, created_at, expires_at
  ) values (
    remote_order_submit.machine_id,
    remote_order_submit.client_request_id,
    remote_order_submit.order_type,
    remote_order_submit.table_number,
    remote_order_submit.customer_name,
    remote_order_submit.customer_phone,
    remote_order_submit.note,
    remote_order_submit.items,
    remote_order_submit.quote_revision,
    remote_order_submit.quoted_total,
    remote_order_submit.status_token_hash,
    submitted_at,
    submitted_at + interval '15 minutes'
  )
  on conflict on constraint remote_orders_v2_machine_id_client_request_id_key do nothing
  returning * into inserted_row;

  if inserted_row.id is not null then
    id := inserted_row.id;
    status := inserted_row.status;
    result_expires_at := inserted_row.expires_at;
    result_quoted_total := inserted_row.quoted_total;
    inserted := true;
    return next;
    return;
  end if;

  select remote_order.* into strict existing_row
  from public.remote_orders_v2 as remote_order
  where remote_order.machine_id = remote_order_submit.machine_id
    and remote_order.client_request_id = remote_order_submit.client_request_id;

  id := existing_row.id;
  status := existing_row.status;
  result_expires_at := existing_row.expires_at;
  result_quoted_total := existing_row.quoted_total;
  inserted := false;
  return next;
end;
$function$;

create or replace function public.remote_order_status_by_capability(
  status_token_hash text
)
returns table (
  status text,
  daily_number integer,
  rejected_reason text,
  expires_at timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.remote_orders_v2 as remote_order
  set status = 'expired', decided_at = now()
  where remote_order.status_token_hash = remote_order_status_by_capability.status_token_hash
    and remote_order.status = 'submitted'
    and remote_order.expires_at < now();

  return query
  select remote_order.status,
         remote_order.daily_number,
         remote_order.rejected_reason,
         remote_order.expires_at
  from public.remote_orders_v2 as remote_order
  where remote_order.status_token_hash = remote_order_status_by_capability.status_token_hash;
end;
$function$;

create or replace function public.remote_order_list_submitted(
  machine_id text,
  result_limit integer default 10
)
returns setof public.remote_orders_v2
language sql
security definer
set search_path = ''
as $function$
  select remote_order.*
  from public.remote_orders_v2 as remote_order
  where remote_order.machine_id = $1
    and remote_order.status = 'submitted'
    and remote_order.expires_at > now()
  order by remote_order.created_at asc
  limit least(greatest(coalesce($2, 10), 1), 10);
$function$;

create or replace function public.remote_order_decide(
  order_id uuid,
  machine_id text,
  decision text,
  daily_number integer default null,
  rejected_reason text default null
)
returns table (id uuid, status text, decided_at timestamp with time zone)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if remote_order_decide.decision not in ('accepted', 'rejected')
    or (remote_order_decide.decision = 'accepted'
      and remote_order_decide.daily_number is null) then
    raise exception 'bad_input' using errcode = '22023';
  end if;

  return query
  update public.remote_orders_v2 as remote_order
  set status = remote_order_decide.decision,
      daily_number = case
        when remote_order_decide.decision = 'accepted'
          then remote_order_decide.daily_number
        else null
      end,
      rejected_reason = case
        when remote_order_decide.decision = 'rejected'
          then remote_order_decide.rejected_reason
        else null
      end,
      decided_at = now()
  where remote_order.id = remote_order_decide.order_id
    and remote_order.machine_id = remote_order_decide.machine_id
    and remote_order.status = 'submitted'
    and remote_order.expires_at > now()
  returning remote_order.id, remote_order.status, remote_order.decided_at;
end;
$function$;

create or replace function public.remote_order_expire_stale(machine_id text)
returns integer
language sql
security definer
set search_path = ''
as $function$
  with expired as (
    update public.remote_orders_v2 as remote_order
    set status = 'expired', decided_at = now()
    where remote_order.machine_id = $1
      and remote_order.status = 'submitted'
      and remote_order.expires_at <= now()
    returning 1
  )
  select count(*)::integer from expired;
$function$;

revoke execute on function public.consume_reset_code(text, text) from public;
revoke execute on function public.remote_order_take_throttle(text, integer, integer) from public;
revoke execute on function public.remote_order_submit(
  text, uuid, text, text, text, text, text, jsonb, integer, numeric, text
) from public;
revoke execute on function public.remote_order_status_by_capability(text) from public;
revoke execute on function public.remote_order_list_submitted(text, integer) from public;
revoke execute on function public.remote_order_decide(uuid, text, text, integer, text) from public;
revoke execute on function public.remote_order_expire_stale(text) from public;

grant execute on function public.consume_reset_code(text, text) to anon, service_role;
grant execute on function public.remote_order_take_throttle(text, integer, integer) to service_role;
grant execute on function public.remote_order_submit(
  text, uuid, text, text, text, text, text, jsonb, integer, numeric, text
) to service_role;
grant execute on function public.remote_order_status_by_capability(text) to service_role;
grant execute on function public.remote_order_list_submitted(text, integer) to service_role;
grant execute on function public.remote_order_decide(uuid, text, text, integer, text) to service_role;
grant execute on function public.remote_order_expire_stale(text) to service_role;

commit;
