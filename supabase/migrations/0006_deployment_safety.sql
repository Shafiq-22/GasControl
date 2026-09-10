-- Large uploads go directly to private storage; Vercel receives only the path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gas-control-imports', 'gas-control-imports', false, 26214400,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy gas_import_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gas-control-imports' and public.is_admin()
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy gas_import_read on storage.objects for select to authenticated
  using (bucket_id = 'gas-control-imports' and public.is_admin()
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy gas_import_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gas-control-imports' and public.is_admin()
    and (storage.foldername(name))[1] = (select auth.uid())::text);

-- A self-update policy on the whole profile also allowed changing one's role.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- The workbook's value-weighted allocation, preserving existing PER_LINE data.
alter type public.delivery_alloc add value if not exists 'PER_VALUE';
