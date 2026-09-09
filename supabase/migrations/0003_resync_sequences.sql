-- After a bulk import brings its own transaction ids in, the generators must
-- be moved past them or the next recorded row collides with an imported one.

create or replace function resync_transaction_sequences() returns void
  language plpgsql security definer set search_path = public, pg_temp as
$fn$
declare
  max_purchase bigint;
  max_movement bigint;
begin
  select coalesce(max(nullif(regexp_replace(transaction_id, '\D', '', 'g'), '')::bigint), 0)
    into max_purchase from purchases;
  select coalesce(max(nullif(regexp_replace(transaction_id, '\D', '', 'g'), '')::bigint), 0)
    into max_movement from movements;

  perform setval('purchase_seq', greatest(max_purchase, 1), max_purchase > 0);
  perform setval('movement_seq', greatest(max_movement, 1), max_movement > 0);
end;
$fn$;

revoke all on function resync_transaction_sequences() from public;
grant execute on function resync_transaction_sequences() to authenticated;
