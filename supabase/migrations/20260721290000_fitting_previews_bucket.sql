-- Public catalog JPEGs for BOM / PDF fitting thumbs (standard views).
-- Objects: v1/{FittingType}--{MaterialId}.jpg

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fitting-previews',
  'fitting-previews',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fitting_previews_storage_select on storage.objects;
create policy fitting_previews_storage_select on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'fitting-previews');

-- Writes via service role (seed script) or admin (dashboard / future UI)
drop policy if exists fitting_previews_storage_insert on storage.objects;
create policy fitting_previews_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'fitting-previews'
    and public.is_current_user_admin()
  );

drop policy if exists fitting_previews_storage_update on storage.objects;
create policy fitting_previews_storage_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'fitting-previews'
    and public.is_current_user_admin()
  )
  with check (
    bucket_id = 'fitting-previews'
    and public.is_current_user_admin()
  );

drop policy if exists fitting_previews_storage_delete on storage.objects;
create policy fitting_previews_storage_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'fitting-previews'
    and public.is_current_user_admin()
  );
