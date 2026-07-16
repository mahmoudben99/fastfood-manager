-- Structural baseline captured from the live Supabase project on 2026-07-16.
-- Source: supabase-backup-2026-07-16/schema_{columns,constraints,indexes,policies}.json.
-- This migration contains schema and RLS definitions only; it does not contain live data.

begin;

create table public.installations (
  machine_id text not null,
  restaurant_name text,
  phone text,
  app_version text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint installations_pkey primary key (machine_id)
);

create table public.trials (
  id uuid not null default gen_random_uuid(),
  machine_id text not null,
  started_at timestamp with time zone default now(),
  expires_at timestamp with time zone not null,
  status text default 'active'::text,
  paused_remaining_ms bigint,
  updated_at timestamp with time zone default now(),
  constraint trials_pkey primary key (id),
  constraint trials_machine_id_key unique (machine_id),
  constraint trials_machine_id_fkey foreign key (machine_id)
    references public.installations(machine_id)
);

create table public.activations (
  machine_id text not null,
  activated_at timestamp with time zone default now(),
  constraint activations_pkey primary key (machine_id),
  constraint activations_machine_id_fkey foreign key (machine_id)
    references public.installations(machine_id)
);

create table public.reset_codes (
  id uuid not null default gen_random_uuid(),
  machine_id text not null,
  code text not null,
  used boolean default false,
  expires_at timestamp with time zone default (now() + '24:00:00'::interval),
  created_at timestamp with time zone default now(),
  constraint reset_codes_pkey primary key (id)
);

create table public.menu_upload_requests (
  id uuid not null default gen_random_uuid(),
  machine_id text not null,
  restaurant_name text,
  image_count integer default 0,
  status text default 'pending'::text,
  excel_path text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint menu_upload_requests_pkey primary key (id),
  constraint menu_upload_requests_machine_id_key unique (machine_id)
);

create table public.short_codes (
  id uuid not null default gen_random_uuid(),
  code text not null,
  machine_id text not null,
  type text not null,
  profile_name text default 'default'::text,
  created_at timestamp with time zone default now(),
  constraint short_codes_pkey primary key (id),
  constraint short_codes_code_key unique (code),
  constraint short_codes_machine_id_type_profile_name_key
    unique (machine_id, type, profile_name),
  constraint short_codes_type_check
    check (type = any (array['tv'::text, 'owner'::text, 'order'::text]))
);

create table public.display_settings (
  id uuid not null default gen_random_uuid(),
  machine_id text not null,
  profile_name text not null default 'default'::text,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default now(),
  constraint display_settings_pkey primary key (id),
  constraint display_settings_machine_id_profile_name_key
    unique (machine_id, profile_name)
);

create table public.owner_orders (
  id uuid not null default gen_random_uuid(),
  machine_id text not null,
  order_number integer not null,
  order_type text not null,
  total numeric not null,
  item_count integer not null,
  items_summary text,
  status text not null default 'preparing'::text,
  discount_amount numeric default 0,
  order_date date not null default current_date,
  created_at timestamp with time zone not null default now(),
  constraint owner_orders_pkey primary key (id),
  constraint owner_orders_machine_id_order_number_order_date_key
    unique (machine_id, order_number, order_date)
);

create table public.owner_pins (
  machine_id text not null,
  pin_hash text not null,
  updated_at timestamp with time zone default now(),
  constraint owner_pins_pkey primary key (machine_id)
);

create table public.menu_sync (
  id uuid not null default gen_random_uuid(),
  machine_id text not null,
  categories jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamp with time zone default now(),
  constraint menu_sync_pkey primary key (id),
  constraint menu_sync_machine_id_key unique (machine_id)
);

create table public.remote_orders (
  id uuid not null default gen_random_uuid(),
  machine_id text not null,
  order_data jsonb not null,
  status text not null default 'pending'::text,
  created_at timestamp with time zone default now(),
  constraint remote_orders_pkey primary key (id)
);

create table public.daily_stats (
  id uuid not null default gen_random_uuid(),
  machine_id text not null,
  date date not null,
  order_count integer not null default 0,
  total_revenue numeric not null default 0,
  avg_order_value numeric not null default 0,
  synced_at timestamp with time zone not null default now(),
  constraint daily_stats_pkey primary key (id),
  constraint daily_stats_machine_id_date_key unique (machine_id, date)
);

create table public.daily_top_items (
  id uuid not null default gen_random_uuid(),
  machine_id text not null,
  date date not null,
  menu_item_name text not null,
  quantity_sold integer not null default 0,
  revenue numeric not null default 0,
  rank integer not null,
  constraint daily_top_items_pkey primary key (id),
  constraint daily_top_items_machine_id_date_rank_key unique (machine_id, date, rank)
);

-- Only these three indexes are not already created by a primary/unique constraint.
create index idx_short_codes_code on public.short_codes using btree (code);
create index idx_owner_orders_machine
  on public.owner_orders using btree (machine_id, created_at desc);
create index idx_remote_orders_machine
  on public.remote_orders using btree (machine_id, status);

alter table public.installations enable row level security;
alter table public.trials enable row level security;
alter table public.activations enable row level security;
alter table public.reset_codes enable row level security;
alter table public.menu_upload_requests enable row level security;
alter table public.short_codes enable row level security;
alter table public.display_settings enable row level security;
alter table public.owner_orders enable row level security;
alter table public.owner_pins enable row level security;
alter table public.menu_sync enable row level security;
alter table public.remote_orders enable row level security;
alter table public.daily_stats enable row level security;
alter table public.daily_top_items enable row level security;

-- Live policies are reproduced verbatim in intent. Migration 0002 replaces them.
create policy anon_own_installation on public.installations
  as permissive for all to public using (true) with check (true);
create policy anon_select_trial on public.trials
  as permissive for select to public using (true);
create policy anon_insert_trial on public.trials
  as permissive for insert to public with check (true);
create policy anon_own_activation on public.activations
  as permissive for all to public using (true) with check (true);
create policy anon_select_reset_codes on public.reset_codes
  as permissive for select to public using (true);
create policy service_all on public.menu_upload_requests
  as permissive for all to service_role using (true);
create policy anon_update on public.menu_upload_requests
  as permissive for update to anon using (true);
create policy anon_select on public.menu_upload_requests
  as permissive for select to anon using (true);
create policy anon_insert on public.menu_upload_requests
  as permissive for insert to anon with check (true);
create policy allow_all_short_codes on public.short_codes
  as permissive for all to public using (true);
create policy allow_all_display_settings on public.display_settings
  as permissive for all to public using (true);
create policy allow_all_owner_orders on public.owner_orders
  as permissive for all to public using (true);
create policy allow_all_owner_pins on public.owner_pins
  as permissive for all to public using (true);
create policy allow_all_menu_sync on public.menu_sync
  as permissive for all to public using (true);
create policy allow_all_remote_orders on public.remote_orders
  as permissive for all to public using (true);
create policy allow_all_daily_stats on public.daily_stats
  as permissive for all to public using (true);
create policy allow_all_daily_top_items on public.daily_top_items
  as permissive for all to public using (true);

commit;
