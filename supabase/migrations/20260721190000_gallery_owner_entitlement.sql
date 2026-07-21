-- Soft-hide published models from gallery discovery when the owner is not
-- currently entitled (paid). Keeps visibility='published' / published_at intact
-- so reactivation restores gallery listing without republish.
-- Direct SELECT by id and fork_model still use models (published), so forks
-- and open-by-id keep working independently of the original owner's plan.

-- ---------------------------------------------------------------------------
-- gallery_models: discovery surface (gallery, feed, favourites)
-- ---------------------------------------------------------------------------
create or replace view public.gallery_models as
select
  m.id,
  m.owner_id,
  m.name,
  m.scene,
  m.config,
  m.visibility,
  m.forked_from_id,
  m.attribution_name,
  m.published_at,
  m.created_at,
  m.updated_at
from public.models m
where m.visibility = 'published'
  and public.is_entitled_paid(m.owner_id);

-- Invoker: RLS on models still applies (own or published). Entitlement filter
-- is the soft-hide gate for listing/discovery.
alter view public.gallery_models set (security_invoker = true);

revoke all on public.gallery_models from public;
grant select on public.gallery_models to anon, authenticated;

comment on view public.gallery_models is
  'Published models whose owner is currently paid-entitled. Soft-hide for gallery/feed; does not change models.visibility.';

-- Admin gallery count = soft-visible only (same gate as gallery_models)
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profiles integer;
  v_paid integer;
  v_published integer;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;

  select count(*)::integer into v_profiles from public.profiles;
  select count(*)::integer into v_paid
    from public.profiles
    where is_paid = true
      and (paid_until is null or paid_until > now());
  select count(*)::integer into v_published from public.gallery_models;

  return jsonb_build_object(
    'profiles', v_profiles,
    'paid_users', v_paid,
    'published_models', v_published
  );
end;
$$;
