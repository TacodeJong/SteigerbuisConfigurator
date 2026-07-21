-- P1: profiles — geen lek van is_admin / is_paid / paid_until / export_pack / subscription
-- Eigen rij: volledige SELECT via RLS (auth.uid = id).
-- Anderen: alleen via view public_profiles (id, display_name, bio).

-- ---------------------------------------------------------------------------
-- public_profiles view (security definer / owner privileges; limited columns)
-- ---------------------------------------------------------------------------
create or replace view public.public_profiles as
  select
    id,
    display_name,
    bio
  from public.profiles;

-- PG15+: run as view owner so others' rows are readable despite RLS on profiles
alter view public.public_profiles set (security_invoker = false);

revoke all on public.public_profiles from public;
grant select on public.public_profiles to anon, authenticated;

comment on view public.public_profiles is
  'Safe public profile fields only (id, display_name, bio). Use for gallery / foreign profiles.';

-- ---------------------------------------------------------------------------
-- profiles RLS: own row only for base table SELECT
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_public on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

-- Admins may list profiles for ops (stats fallback / tooling)
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select using (public.is_current_user_admin());

-- Update own remains; column grant limits mutable fields
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Column-level grants: anon has no table SELECT; authenticated full own via RLS
-- ---------------------------------------------------------------------------
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, bio) on table public.profiles to authenticated;
