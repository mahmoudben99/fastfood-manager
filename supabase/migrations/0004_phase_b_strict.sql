-- ============================================================================
-- DO NOT APPLY UNTIL BOTH CUSTOMERS ARE CONFIRMED ON v3.2.0 OR LATER.
-- ============================================================================
-- Phase B removes all direct anon/authenticated table access. The v3.2.0 cloud
-- boundary uses SECURITY DEFINER RPCs from 0003 (or service-role server routes).

begin;

do $drop_client_policies$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'activations', 'daily_stats', 'daily_top_items', 'display_settings',
        'installations', 'menu_sync', 'menu_upload_requests', 'owner_orders',
        'owner_pins', 'remote_orders', 'reset_codes', 'short_codes', 'trials'
      ])
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$drop_client_policies$;

revoke all privileges on table
  public.activations,
  public.daily_stats,
  public.daily_top_items,
  public.display_settings,
  public.installations,
  public.menu_sync,
  public.menu_upload_requests,
  public.owner_orders,
  public.owner_pins,
  public.remote_orders,
  public.reset_codes,
  public.short_codes,
  public.trials
from anon, authenticated;

commit;
