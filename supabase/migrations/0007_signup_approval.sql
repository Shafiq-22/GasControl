-- Signup approval gate.
--
-- The publishable key is public by design, so anyone who has it can reach the
-- auth endpoints and create an account. That is fine — as long as creating an
-- account grants nothing. Previously it granted read access to the whole
-- store, and the very first account created became the administrator.
--
-- Now a new account lands in 'pending', which can read nothing, and an
-- administrator promotes it. Bootstrapping runs off an allowlist rather than
-- off whoever signs up first.

-- 'pending' is added to app_role in the preceding migration: a new enum value
-- cannot be used in the transaction that adds it.

create table if not exists auth_allowlist (
  email      text primary key,
  role       app_role not null default 'viewer' check (role <> 'pending'),
  note       text,
  created_at timestamptz not null default now()
);

comment on table auth_allowlist is
  'Emails that skip the approval queue. Anyone else who signs up lands in pending until an administrator promotes them.';

alter table auth_allowlist enable row level security;
create policy auth_allowlist_admin on auth_allowlist
  for all to authenticated using (is_admin()) with check (is_admin());

-- Roles that may read the store.
create or replace function can_read() returns boolean
  language sql stable set search_path = public, pg_temp as
$fn$ select current_role_is(array['admin','custodian','viewer']::app_role[]) $fn$;

revoke all on function can_read() from public, anon;
grant execute on function can_read() to authenticated;

-- New accounts: allowlisted role, or pending. The first allowlisted account is
-- how the store gets its first administrator.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as
$fn$
declare
  granted app_role;
begin
  select a.role into granted
    from public.auth_allowlist a
   where lower(a.email) = lower(new.email);

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(granted, 'pending'::app_role)
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

revoke all on function handle_new_user() from public, anon, authenticated;

-- Reading the store now requires an approved role.
do $do$
declare t text;
begin
  foreach t in array array[
    'departments','gas_items','suppliers','cost_codes','personnel',
    'settings','purchases','movements','postings'
  ]
  loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format(
      'create policy %1$s_read on %1$s for select to authenticated using (can_read())', t);
  end loop;
end $do$;

-- A pending user must still be able to see their own row, so the app can tell
-- them they are waiting rather than failing with an unexplained error.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select to authenticated
  using (can_read() or id = (select auth.uid()));
