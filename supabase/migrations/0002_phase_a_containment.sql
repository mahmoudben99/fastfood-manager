-- Phase A compatibility containment.
-- AUTHOR ONLY: applying this file is an orchestrator action.
-- Missing verb policies are intentional denials. In particular, anon DELETE exists
-- only for display_settings, short_codes, and daily_top_items.

begin;

drop policy if exists anon_own_installation on public.installations;
drop policy if exists anon_select_trial on public.trials;
drop policy if exists anon_insert_trial on public.trials;
drop policy if exists anon_own_activation on public.activations;
drop policy if exists anon_select_reset_codes on public.reset_codes;
drop policy if exists service_all on public.menu_upload_requests;
drop policy if exists anon_update on public.menu_upload_requests;
drop policy if exists anon_select on public.menu_upload_requests;
drop policy if exists anon_insert on public.menu_upload_requests;
drop policy if exists allow_all_short_codes on public.short_codes;
drop policy if exists allow_all_display_settings on public.display_settings;
drop policy if exists allow_all_owner_orders on public.owner_orders;
drop policy if exists allow_all_owner_pins on public.owner_pins;
drop policy if exists allow_all_menu_sync on public.menu_sync;
drop policy if exists allow_all_remote_orders on public.remote_orders;
drop policy if exists allow_all_daily_stats on public.daily_stats;
drop policy if exists allow_all_daily_top_items on public.daily_top_items;

create policy phase_a_anon_select on public.activations
  for select to anon using (true);
create policy phase_a_anon_insert on public.activations
  for insert to anon with check (true);
create policy phase_a_anon_update on public.activations
  for update to anon using (true) with check (true);

create policy phase_a_anon_select on public.daily_stats
  for select to anon using (true);
create policy phase_a_anon_insert on public.daily_stats
  for insert to anon with check (true);
create policy phase_a_anon_update on public.daily_stats
  for update to anon using (true) with check (true);

create policy phase_a_anon_select on public.daily_top_items
  for select to anon using (true);
create policy phase_a_anon_insert on public.daily_top_items
  for insert to anon with check (true);
create policy phase_a_anon_update on public.daily_top_items
  for update to anon using (true) with check (true);
create policy phase_a_anon_delete on public.daily_top_items
  for delete to anon using (true);

create policy phase_a_anon_select on public.display_settings
  for select to anon using (true);
create policy phase_a_anon_insert on public.display_settings
  for insert to anon with check (true);
create policy phase_a_anon_update on public.display_settings
  for update to anon using (true) with check (true);
create policy phase_a_anon_delete on public.display_settings
  for delete to anon using (true);

create policy phase_a_anon_select on public.installations
  for select to anon using (true);
create policy phase_a_anon_insert on public.installations
  for insert to anon with check (true);
create policy phase_a_anon_update on public.installations
  for update to anon using (true) with check (true);

create policy phase_a_anon_select on public.menu_sync
  for select to anon using (true);
create policy phase_a_anon_insert on public.menu_sync
  for insert to anon with check (true);
create policy phase_a_anon_update on public.menu_sync
  for update to anon using (true) with check (true);

create policy phase_a_anon_select on public.menu_upload_requests
  for select to anon using (true);
create policy phase_a_anon_insert on public.menu_upload_requests
  for insert to anon with check (true);
create policy phase_a_anon_update on public.menu_upload_requests
  for update to anon using (true) with check (true);

create policy phase_a_anon_select on public.owner_orders
  for select to anon using (true);
create policy phase_a_anon_insert on public.owner_orders
  for insert to anon with check (true);
create policy phase_a_anon_update on public.owner_orders
  for update to anon using (true) with check (true);

create policy phase_a_anon_select on public.owner_pins
  for select to anon using (true);
create policy phase_a_anon_insert on public.owner_pins
  for insert to anon with check (true);
create policy phase_a_anon_update on public.owner_pins
  for update to anon using (true) with check (true);

create policy phase_a_anon_select on public.remote_orders
  for select to anon using (true);
create policy phase_a_anon_update on public.remote_orders
  for update to anon using (true) with check (true);

create policy phase_a_anon_select on public.reset_codes
  for select to anon using (true);
create policy phase_a_anon_update on public.reset_codes
  for update to anon using (true) with check (true);

create policy phase_a_anon_select on public.short_codes
  for select to anon using (true);
create policy phase_a_anon_insert on public.short_codes
  for insert to anon with check (true);
create policy phase_a_anon_delete on public.short_codes
  for delete to anon using (true);

create policy phase_a_anon_select on public.trials
  for select to anon using (true);
create policy phase_a_anon_insert on public.trials
  for insert to anon with check (true);

commit;
