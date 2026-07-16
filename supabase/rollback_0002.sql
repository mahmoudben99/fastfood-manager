-- Manual rollback for migrations/0002_phase_a_containment.sql.
-- Kept outside migrations/ so it can never be applied as a forward migration.

begin;

do $drop_phase_a$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like 'phase\_a\_%' escape '\'
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$drop_phase_a$;

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
