-- 001-accounts-paid-publish-social
-- profiles, models, favourites, follows + RLS + RPCs

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  bio text,
  is_paid boolean not null default false,
  paid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Gebruiker')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent clients from changing Paid fields
create or replace function public.protect_profile_paid_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' and auth.uid() = old.id then
    if new.is_paid is distinct from old.is_paid
       or new.paid_until is distinct from old.paid_until then
      raise exception 'paid_fields_immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_paid on public.profiles;
create trigger profiles_protect_paid
  before update on public.profiles
  for each row execute function public.protect_profile_paid_fields();

-- ---------------------------------------------------------------------------
-- models
-- ---------------------------------------------------------------------------
create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  scene jsonb not null,
  config jsonb not null,
  visibility text not null default 'private' check (visibility in ('private', 'published')),
  forked_from_id uuid references public.models (id) on delete set null,
  attribution_name text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists models_owner_id_idx on public.models (owner_id);
create index if not exists models_published_idx on public.models (published_at desc)
  where visibility = 'published';

drop trigger if exists models_set_updated_at on public.models;
create trigger models_set_updated_at
  before update on public.models
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- favourites / follows
-- ---------------------------------------------------------------------------
create table if not exists public.favourites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  model_id uuid not null references public.models (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, model_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_entitled_paid(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.is_paid = true
      and (p.paid_until is null or p.paid_until > now())
  );
$$;

create or replace function public.free_private_model_limit()
returns int
language sql
immutable
as $$ select 3 $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.save_model(
  p_name text,
  p_scene jsonb,
  p_config jsonb,
  p_id uuid default null
)
returns public.models
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing public.models;
  private_count int;
  result public.models;
begin
  if uid is null then
    raise exception 'unauthorized';
  end if;

  if p_id is not null then
    select * into existing from public.models where id = p_id and owner_id = uid;
    if not found then
      raise exception 'not_found';
    end if;
    update public.models
    set name = coalesce(nullif(trim(p_name), ''), name),
        scene = p_scene,
        config = p_config
    where id = p_id
    returning * into result;
    return result;
  end if;

  if not public.is_entitled_paid(uid) then
    select count(*) into private_count
    from public.models
    where owner_id = uid and visibility = 'private';
    if private_count >= public.free_private_model_limit() then
      raise exception 'save_limit';
    end if;
  end if;

  insert into public.models (owner_id, name, scene, config, visibility)
  values (uid, coalesce(nullif(trim(p_name), ''), 'Naamloos model'), p_scene, p_config, 'private')
  returning * into result;
  return result;
end;
$$;

create or replace function public.publish_model(p_id uuid)
returns public.models
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result public.models;
  dn text;
begin
  if uid is null then raise exception 'unauthorized'; end if;
  if not public.is_entitled_paid(uid) then raise exception 'paid_required'; end if;

  select display_name into dn from public.profiles where id = uid;
  if dn is null or length(trim(dn)) = 0 then
    raise exception 'validation';
  end if;

  update public.models
  set visibility = 'published', published_at = coalesce(published_at, now())
  where id = p_id and owner_id = uid
  returning * into result;

  if not found then raise exception 'not_found'; end if;
  return result;
end;
$$;

create or replace function public.unpublish_model(p_id uuid)
returns public.models
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result public.models;
begin
  if uid is null then raise exception 'unauthorized'; end if;

  update public.models
  set visibility = 'private', published_at = null
  where id = p_id and owner_id = uid
  returning * into result;

  if not found then raise exception 'not_found'; end if;
  return result;
end;
$$;

create or replace function public.fork_model(p_id uuid)
returns public.models
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  src public.models;
  attr text;
  result public.models;
begin
  if uid is null then raise exception 'unauthorized'; end if;
  if not public.is_entitled_paid(uid) then raise exception 'paid_required'; end if;

  select * into src from public.models
  where id = p_id and visibility = 'published';
  if not found then raise exception 'not_found'; end if;

  select display_name into attr from public.profiles where id = src.owner_id;

  insert into public.models (
    owner_id, name, scene, config, visibility,
    forked_from_id, attribution_name
  ) values (
    uid,
    'Kopie van ' || src.name,
    src.scene,
    src.config,
    'private',
    src.id,
    coalesce(nullif(trim(attr), ''), 'Onbekende ontwerper')
  )
  returning * into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.models enable row level security;
alter table public.favourites enable row level security;
alter table public.follows enable row level security;

-- profiles
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- models
drop policy if exists models_select_own_or_published on public.models;
create policy models_select_own_or_published on public.models
  for select using (
    owner_id = auth.uid() or visibility = 'published'
  );

drop policy if exists models_insert_own on public.models;
create policy models_insert_own on public.models
  for insert with check (owner_id = auth.uid());

drop policy if exists models_update_own on public.models;
create policy models_update_own on public.models
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists models_delete_own on public.models;
create policy models_delete_own on public.models
  for delete using (owner_id = auth.uid());

-- favourites
drop policy if exists favourites_select_own on public.favourites;
create policy favourites_select_own on public.favourites
  for select using (user_id = auth.uid());

drop policy if exists favourites_insert_own on public.favourites;
create policy favourites_insert_own on public.favourites
  for insert with check (user_id = auth.uid());

drop policy if exists favourites_delete_own on public.favourites;
create policy favourites_delete_own on public.favourites
  for delete using (user_id = auth.uid());

-- follows
drop policy if exists follows_select_own on public.follows;
create policy follows_select_own on public.follows
  for select using (follower_id = auth.uid());

drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert with check (follower_id = auth.uid());

drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows
  for delete using (follower_id = auth.uid());

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update, delete on public.models to authenticated;
grant select on public.models to anon;
grant select, insert, delete on public.favourites to authenticated;
grant select, insert, delete on public.follows to authenticated;

grant execute on function public.save_model(text, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.publish_model(uuid) to authenticated;
grant execute on function public.unpublish_model(uuid) to authenticated;
grant execute on function public.fork_model(uuid) to authenticated;
grant execute on function public.is_entitled_paid(uuid) to authenticated, anon;
grant execute on function public.free_private_model_limit() to authenticated, anon;
