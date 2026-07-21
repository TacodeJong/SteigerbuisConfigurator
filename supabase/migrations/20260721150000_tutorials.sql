-- Tutorials (instructional videos): metadata table + public Storage bucket
-- Public SELECT for published rows; writes + storage upload only for is_admin.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.tutorials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  storage_path text not null,
  public_url text,
  mime_type text,
  duration_seconds numeric,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists tutorials_published_sort_idx
  on public.tutorials (is_published, sort_order, created_at desc);

create or replace function public.set_tutorials_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tutorials_set_updated_at on public.tutorials;
create trigger tutorials_set_updated_at
  before update on public.tutorials
  for each row
  execute function public.set_tutorials_updated_at();

alter table public.tutorials enable row level security;

drop policy if exists tutorials_select_published on public.tutorials;
create policy tutorials_select_published on public.tutorials
  for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists tutorials_select_admin on public.tutorials;
create policy tutorials_select_admin on public.tutorials
  for select
  to authenticated
  using (public.is_current_user_admin());

drop policy if exists tutorials_insert_admin on public.tutorials;
create policy tutorials_insert_admin on public.tutorials
  for insert
  to authenticated
  with check (public.is_current_user_admin());

drop policy if exists tutorials_update_admin on public.tutorials;
create policy tutorials_update_admin on public.tutorials
  for update
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists tutorials_delete_admin on public.tutorials;
create policy tutorials_delete_admin on public.tutorials
  for delete
  to authenticated
  using (public.is_current_user_admin());

grant select on public.tutorials to anon, authenticated;
grant insert, update, delete on public.tutorials to authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket `tutorials` (public read; admin write)
-- Max ~100 MB; mp4 / webm only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tutorials',
  'tutorials',
  true,
  104857600,
  array['video/mp4', 'video/webm']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tutorials_storage_select on storage.objects;
create policy tutorials_storage_select on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'tutorials');

drop policy if exists tutorials_storage_insert on storage.objects;
create policy tutorials_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tutorials'
    and public.is_current_user_admin()
  );

drop policy if exists tutorials_storage_update on storage.objects;
create policy tutorials_storage_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'tutorials'
    and public.is_current_user_admin()
  )
  with check (
    bucket_id = 'tutorials'
    and public.is_current_user_admin()
  );

drop policy if exists tutorials_storage_delete on storage.objects;
create policy tutorials_storage_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'tutorials'
    and public.is_current_user_admin()
  );
