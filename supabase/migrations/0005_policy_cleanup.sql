-- Two clean-ups the database linter is right about.
--
-- 1. The admin policies were written FOR ALL, which duplicated the read
--    policy on every SELECT: both had to be evaluated for each row. Reading
--    is already open to any signed-in user, so the admin policies only need
--    to cover the write actions.
-- 2. Foreign keys used for lookups and cascade checks get covering indexes.

do $do$
declare t text;
begin
  foreach t in array array[
    'departments','gas_items','suppliers','cost_codes','personnel',
    'settings','purchases','movements','postings'
  ]
  loop
    execute format('drop policy if exists %1$s_admin on %1$s', t);
    execute format(
      'create policy %1$s_admin_write on %1$s
         as permissive for insert to authenticated with check (is_admin())', t);
    execute format(
      'create policy %1$s_admin_update on %1$s
         as permissive for update to authenticated
         using (is_admin()) with check (is_admin())', t);
    execute format(
      'create policy %1$s_admin_delete on %1$s
         as permissive for delete to authenticated using (is_admin())', t);
  end loop;
end $do$;

-- settings is a single configured row: it is updated, never inserted or
-- deleted, so those two policies would only ever be a way to break it.
drop policy if exists settings_admin_write on settings;
drop policy if exists settings_admin_delete on settings;

-- profiles: keep one SELECT policy, and split the admin grant off UPDATE so
-- it does not double up with a user editing their own row.
drop policy if exists profiles_admin_write on profiles;
create policy profiles_admin_update on profiles
  for update to authenticated using (is_admin()) with check (is_admin());
create policy profiles_admin_delete on profiles
  for delete to authenticated using (is_admin());

create index if not exists purchases_vendor_no_idx      on purchases (vendor_no);
create index if not exists purchases_created_by_idx     on purchases (created_by);
create index if not exists movements_cost_code_idx      on movements (cost_code);
create index if not exists movements_created_by_idx     on movements (created_by);
create index if not exists postings_posted_by_idx       on postings (posted_by);

-- can_record() already admits administrators, so a separate admin insert
-- policy on the registers only doubles the work.
drop policy if exists purchases_admin_write on purchases;
drop policy if exists movements_admin_write on movements;
drop policy if exists postings_admin_write  on postings;

-- One update policy on profiles: an administrator edits anyone, everyone
-- else edits only their own row.
drop policy if exists profiles_admin_update on profiles;
drop policy if exists profiles_self_update  on profiles;
create policy profiles_update on profiles
  for update to authenticated
  using (is_admin() or id = (select auth.uid()))
  with check (is_admin() or id = (select auth.uid()));
