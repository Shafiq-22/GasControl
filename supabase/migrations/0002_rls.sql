-- Row level security.
-- Every table is readable by any signed-in user; writes are gated on role.
-- Nothing is reachable anonymously.

create or replace function current_role_is(required app_role[]) returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = any(required)
  )
$$;

-- Writers: admin configures, custodian records day-to-day traffic.
create or replace function can_record() returns boolean
  language sql stable set search_path = public, pg_temp as
$$ select current_role_is(array['admin','custodian']::app_role[]) $$;

create or replace function is_admin() returns boolean
  language sql stable set search_path = public, pg_temp as
$$ select current_role_is(array['admin']::app_role[]) $$;

alter table profiles    enable row level security;
alter table settings    enable row level security;
alter table departments enable row level security;
alter table gas_items   enable row level security;
alter table suppliers   enable row level security;
alter table cost_codes  enable row level security;
alter table personnel   enable row level security;
alter table purchases   enable row level security;
alter table movements   enable row level security;
alter table postings    enable row level security;

-- profiles: everyone signed in sees the directory; only admins change roles,
-- and a user may edit their own display name.
create policy profiles_read on profiles
  for select to authenticated using (true);
create policy profiles_self_update on profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_admin_write on profiles
  for all to authenticated using (is_admin()) with check (is_admin());

-- settings and masters: read for all, write for admins.
create policy settings_read on settings for select to authenticated using (true);
create policy settings_admin on settings for all to authenticated
  using (is_admin()) with check (is_admin());

do $$
declare t text;
begin
  foreach t in array array['departments','gas_items','suppliers','cost_codes','personnel']
  loop
    execute format(
      'create policy %1$s_read on %1$s for select to authenticated using (true)', t);
    execute format(
      'create policy %1$s_admin on %1$s for all to authenticated
         using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- registers: read for all, insert for recorders. The registers are
-- append-only, so there is deliberately no update or delete policy for
-- custodians; corrections are entered as further rows.
create policy purchases_read on purchases for select to authenticated using (true);
create policy purchases_insert on purchases for insert to authenticated
  with check (can_record());
create policy purchases_admin on purchases for all to authenticated
  using (is_admin()) with check (is_admin());

create policy movements_read on movements for select to authenticated using (true);
create policy movements_insert on movements for insert to authenticated
  with check (can_record());
create policy movements_admin on movements for all to authenticated
  using (is_admin()) with check (is_admin());

create policy postings_read on postings for select to authenticated using (true);
create policy postings_insert on postings for insert to authenticated
  with check (can_record());
create policy postings_admin on postings for all to authenticated
  using (is_admin()) with check (is_admin());
