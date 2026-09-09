-- Tighten what is reachable over the REST API.
--
-- The role helpers are SECURITY DEFINER because the profiles policies would
-- otherwise recurse: checking a caller's role means reading the very table
-- the policy guards. Postgres evaluates a policy expression with the caller's
-- privileges, so `authenticated` must keep EXECUTE on them — but nothing
-- needs to be callable before signing in, and a trigger function never needs
-- to be callable over RPC at all.

revoke all on function handle_new_user() from public, anon, authenticated;
revoke all on function current_role_is(app_role[]) from public, anon;
revoke all on function can_record() from public, anon;
revoke all on function is_admin() from public, anon;
revoke all on function resync_transaction_sequences() from public, anon;

grant execute on function current_role_is(app_role[]) to authenticated;
grant execute on function can_record() to authenticated;
grant execute on function is_admin() to authenticated;

-- Only an administrator may move the id generators, and only ever forward.
create or replace function resync_transaction_sequences() returns void
  language plpgsql security definer set search_path = public, pg_temp as
$fn$
declare
  max_purchase bigint;
  max_movement bigint;
begin
  if not is_admin() then
    raise exception 'Only an administrator can resynchronise transaction ids'
      using errcode = '42501';
  end if;

  select coalesce(max(nullif(regexp_replace(transaction_id, '\D', '', 'g'), '')::bigint), 0)
    into max_purchase from purchases;
  select coalesce(max(nullif(regexp_replace(transaction_id, '\D', '', 'g'), '')::bigint), 0)
    into max_movement from movements;

  perform setval('purchase_seq', greatest(max_purchase, 1), max_purchase > 0);
  perform setval('movement_seq', greatest(max_movement, 1), max_movement > 0);
end;
$fn$;

revoke all on function resync_transaction_sequences() from public, anon;
grant execute on function resync_transaction_sequences() to authenticated;
