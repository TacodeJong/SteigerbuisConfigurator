/** Pay-per-use: download_model grants + plan feature flags for subscriptions.
 *
 * Split (as-built):
 * - subscription_plans.features: cloud_save, open_from_disk, publish, fork, …
 * - app_settings.feature_gates: full_print, copy_order_list, bom_print, download_model
 * - model_feature_grants: durable per-model unlocks for gated pay-per-use features
 * - account_feature_grants: only download_model when unlocked without a cloud model id
 */

-- Extend model_feature_grants for download_model (per cloud model)
alter table public.model_feature_grants
  drop constraint if exists model_feature_grants_feature_key_check;

alter table public.model_feature_grants
  add constraint model_feature_grants_feature_key_check
  check (feature_key in (
    'full_print',
    'copy_order_list',
    'bom_print',
    'download_model'
  ));

-- Account-wide grants: download_model only (no model id at checkout)
create table if not exists public.account_feature_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  feature_key text not null,
  payment_id text null,
  amount_cents integer null check (amount_cents is null or amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, feature_key)
);

-- Enforce pay-per-use-only keys (strip mistaken subscription unlocks if re-run)
delete from public.account_feature_grants
where feature_key not in ('download_model');

alter table public.account_feature_grants
  drop constraint if exists account_feature_grants_feature_key_check;

alter table public.account_feature_grants
  add constraint account_feature_grants_feature_key_check
  check (feature_key in ('download_model'));

create index if not exists account_feature_grants_user_idx
  on public.account_feature_grants (user_id);

comment on table public.account_feature_grants is
  'Permanent account-wide unlock for download_model (when paid without a cloud model). Survives subscription downgrade. open_from_disk/publish/fork are plan features, not account grants.';

alter table public.account_feature_grants enable row level security;

drop policy if exists account_feature_grants_select_own on public.account_feature_grants;
create policy account_feature_grants_select_own on public.account_feature_grants
  for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.account_feature_grants from anon, authenticated;
grant select on public.account_feature_grants to authenticated;

create or replace function public.has_account_feature_grant(p_feature_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_feature_grants g
    where g.user_id = auth.uid()
      and g.feature_key = p_feature_key
  );
$$;

revoke all on function public.has_account_feature_grant(text) from public;
grant execute on function public.has_account_feature_grant(text) to authenticated, anon;

-- Merge download_model into feature_gates / feature_prices (preserve admin overrides).
-- Do NOT put open_from_disk / publish / fork here — those live on subscription_plans.
update public.app_settings
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'download_model', coalesce((value->>'download_model')::boolean, false)
)
where key = 'feature_gates';

update public.app_settings
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'download_model', coalesce(value->'download_model', 'null'::jsonb)
)
where key = 'feature_prices';

-- Strip mistaken subscription keys from feature_gates / feature_prices if present
update public.app_settings
set value = (value - 'open_from_disk' - 'publish' - 'fork' - 'disk_import')
where key in ('feature_gates', 'feature_prices')
  and value ?| array['open_from_disk', 'publish', 'fork', 'disk_import'];

-- Seed plan feature flags on active subscription plans that already have cloud_save
update public.subscription_plans
set
  features = features || '["open_from_disk"]'::jsonb,
  updated_at = now()
where kind = 'subscription'
  and features @> '["cloud_save"]'::jsonb
  and not (features @> '["open_from_disk"]'::jsonb);

update public.subscription_plans
set
  features = features || '["download_model"]'::jsonb,
  updated_at = now()
where kind = 'subscription'
  and features @> '["cloud_save"]'::jsonb
  and not (features @> '["download_model"]'::jsonb);

comment on column public.subscription_plans.features is
  'JSON array of plan entitlement flags: cloud_save, open_from_disk, publish, fork, full_print, copy_order_list, download_model, unlimited_saves. Pay-per-use toggles live in app_settings.feature_gates.';

-- Helper: does the user's assigned subscription plan include this feature flag?
create or replace function public.user_has_plan_feature(uid uuid, p_feature text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_features jsonb;
begin
  if uid is null or p_feature is null or length(trim(p_feature)) = 0 then
    return false;
  end if;

  if not public.is_entitled_paid(uid) then
    return false;
  end if;

  select nullif(trim(p.subscription_plan_slug), '')
  into v_slug
  from public.profiles p
  where p.id = uid;

  v_slug := coalesce(v_slug, 'paid_monthly');

  select sp.features
  into v_features
  from public.subscription_plans sp
  where sp.slug = v_slug;

  if v_features is null then
    -- Fallback: entitled paid without plan row → treat as classic paid_monthly set
    return p_feature in (
      'cloud_save',
      'open_from_disk',
      'publish',
      'fork',
      'full_print',
      'copy_order_list',
      'download_model',
      'unlimited_saves'
    );
  end if;

  return (v_features ? p_feature)
    or (p_feature = 'open_from_disk' and v_features ? 'cloud_save')
    or (p_feature = 'download_model' and v_features ? 'cloud_save');
end;
$$;

revoke all on function public.user_has_plan_feature(uuid, text) from public;
grant execute on function public.user_has_plan_feature(uuid, text) to authenticated, anon;

comment on function public.user_has_plan_feature(uuid, text) is
  'True when user is paid-entitled and their subscription_plans.features includes the flag (open_from_disk/download_model also covered by cloud_save).';

-- Helper: does feature_gates require payment for a pay-per-use key?
create or replace function public.feature_gate_requires_payment(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (value ->> p_feature)::boolean
      from public.app_settings
      where key = 'feature_gates'
    ),
    case p_feature
      when 'bom_print' then false
      when 'download_model' then false
      else true
    end
  );
$$;

revoke all on function public.feature_gate_requires_payment(text) from public;
grant execute on function public.feature_gate_requires_payment(text) to authenticated, anon;

-- publish_model: subscription plan feature `publish` (not pay-per-use)
create or replace function public.publish_model(p_id uuid)
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

  if not public.user_has_plan_feature(uid, 'publish') then
    raise exception 'paid_required';
  end if;

  if length(trim(coalesce((select display_name from public.profiles where id = uid), ''))) < 1 then
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

-- fork_model: subscription plan feature `fork` (not pay-per-use)
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

  if not public.user_has_plan_feature(uid, 'fork') then
    raise exception 'paid_required';
  end if;

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
