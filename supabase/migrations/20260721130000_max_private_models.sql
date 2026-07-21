-- max_private_models on subscription_plans + plan-aware save_model limit.
-- NULL = onbeperkt. Free users: app_settings.free_private_model_limit (fallback 3).
-- Idempotent.

-- ---------------------------------------------------------------------------
-- Column + seed
-- ---------------------------------------------------------------------------
alter table public.subscription_plans
  add column if not exists max_private_models integer;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_max_private_models_check;

alter table public.subscription_plans
  add constraint subscription_plans_max_private_models_check
  check (max_private_models is null or max_private_models >= 0);

comment on column public.subscription_plans.max_private_models is
  'Max private cloud models for this plan. NULL = unlimited. 0 = no cloud storage quota.';

comment on column public.subscription_plans.sort_order is
  'Admin list order (lower = higher in admin list). Upgrade comparison cards primarily sort by features/tier.';

-- Basis: limited cloud (same default as free). Drop unlimited_saves flag.
update public.subscription_plans
set
  max_private_models = 3,
  features = coalesce(features, '[]'::jsonb) - 'unlimited_saves',
  description =
    'Maandelijks: alles van Betaal per keer + cloud-opslag (tot 3 privémodellen), publiceren en ontwerpen overnemen.',
  updated_at = now()
where slug = 'paid_monthly';

-- Extra: unlimited
update public.subscription_plans
set
  max_private_models = null,
  features = case
    when coalesce(features, '[]'::jsonb) ? 'unlimited_saves' then features
    when coalesce(features, '[]'::jsonb) ? 'cloud_save' then features || '["unlimited_saves"]'::jsonb
    else features
  end,
  updated_at = now()
where slug = 'extra_monthly';

-- Betaal per keer: geen cloud-quota
update public.subscription_plans
set
  max_private_models = 0,
  updated_at = now()
where slug = 'export_once';

-- Free default limit (RPC + optional admin tweak via app_settings)
insert into public.app_settings (key, value)
values ('free_private_model_limit', '3')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- free_private_model_limit: app_settings → fallback 3
-- ---------------------------------------------------------------------------
create or replace function public.free_private_model_limit()
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
  n int;
begin
  select s.value into v
  from public.app_settings s
  where s.key = 'free_private_model_limit';

  if v is not null and length(trim(v)) > 0 then
    begin
      n := trim(v)::int;
      if n >= 0 then
        return n;
      end if;
    exception
      when others then
        null;
    end;
  end if;

  return 3;
end;
$$;

revoke all on function public.free_private_model_limit() from public;
grant execute on function public.free_private_model_limit() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Resolve per-user private model cap (NULL = unlimited)
-- ---------------------------------------------------------------------------
create or replace function public.private_model_limit_for_user(uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_limit integer;
  v_found boolean := false;
begin
  if uid is null then
    return public.free_private_model_limit();
  end if;

  if public.is_entitled_paid(uid) then
    select nullif(trim(p.subscription_plan_slug), '')
    into v_slug
    from public.profiles p
    where p.id = uid;

    v_slug := coalesce(v_slug, 'paid_monthly');

    select sp.max_private_models, true
    into v_limit, v_found
    from public.subscription_plans sp
    where sp.slug = v_slug;

    if v_found then
      return v_limit; -- may be NULL (unlimited)
    end if;

    -- Unknown paid plan slug: legacy unlimited
    return null;
  end if;

  return public.free_private_model_limit();
end;
$$;

revoke all on function public.private_model_limit_for_user(uuid) from public;
grant execute on function public.private_model_limit_for_user(uuid) to authenticated, anon;

comment on function public.private_model_limit_for_user(uuid) is
  'Private cloud model cap for user. NULL = unlimited. Free users use free_private_model_limit().';

-- ---------------------------------------------------------------------------
-- save_model: enforce plan / free limit
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
  v_limit int;
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

  v_limit := public.private_model_limit_for_user(uid);
  if v_limit is not null then
    select count(*) into private_count
    from public.models
    where owner_id = uid and visibility = 'private';
    if private_count >= v_limit then
      raise exception 'save_limit:%', v_limit;
    end if;
  end if;

  insert into public.models (owner_id, name, scene, config, visibility)
  values (uid, coalesce(nullif(trim(p_name), ''), 'Naamloos model'), p_scene, p_config, 'private')
  returning * into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs: include max_private_models
-- ---------------------------------------------------------------------------
drop function if exists public.admin_create_subscription_plan(
  text, text, text, text, integer, text, text, jsonb, boolean, integer
);

create or replace function public.admin_create_subscription_plan(
  p_slug text,
  p_name text,
  p_description text default '',
  p_kind text default 'subscription',
  p_price_cents integer default 100,
  p_currency text default 'eur',
  p_interval text default 'month',
  p_features jsonb default '[]'::jsonb,
  p_is_active boolean default true,
  p_sort_order integer default 100,
  p_max_private_models integer default null
)
returns public.subscription_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.subscription_plans;
  v_slug text := lower(trim(p_slug));
  v_interval text;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  if v_slug is null or length(v_slug) = 0 then
    raise exception 'invalid_slug';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;
  if p_kind not in ('subscription', 'one_time') then
    raise exception 'invalid_kind';
  end if;
  if p_price_cents is null or p_price_cents < 1 then
    raise exception 'invalid_price';
  end if;
  if jsonb_typeof(coalesce(p_features, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_features';
  end if;
  if p_max_private_models is not null and p_max_private_models < 0 then
    raise exception 'invalid_max_private_models';
  end if;

  if p_kind = 'one_time' then
    v_interval := null;
  else
    v_interval := coalesce(nullif(trim(p_interval), ''), 'month');
    if v_interval <> 'month' then
      raise exception 'invalid_interval';
    end if;
  end if;

  insert into public.subscription_plans (
    slug, name, description, kind, price_cents, currency, "interval",
    features, is_active, sort_order, max_private_models
  )
  values (
    v_slug,
    trim(p_name),
    coalesce(p_description, ''),
    p_kind,
    p_price_cents,
    lower(coalesce(nullif(trim(p_currency), ''), 'eur')),
    v_interval,
    coalesce(p_features, '[]'::jsonb),
    coalesce(p_is_active, true),
    coalesce(p_sort_order, 100),
    p_max_private_models
  )
  returning * into v_row;

  perform public.sync_plan_price_to_app_settings(v_row.slug, v_row.price_cents);
  return v_row;
end;
$$;

revoke all on function public.admin_create_subscription_plan(
  text, text, text, text, integer, text, text, jsonb, boolean, integer, integer
) from public;
grant execute on function public.admin_create_subscription_plan(
  text, text, text, text, integer, text, text, jsonb, boolean, integer, integer
) to authenticated;

drop function if exists public.admin_update_subscription_plan(
  uuid, text, text, integer, text, jsonb, boolean, integer, text
);

create or replace function public.admin_update_subscription_plan(
  p_id uuid,
  p_name text default null,
  p_description text default null,
  p_price_cents integer default null,
  p_currency text default null,
  p_features jsonb default null,
  p_is_active boolean default null,
  p_sort_order integer default null,
  p_interval text default null,
  p_max_private_models integer default null,
  p_set_max_private_models boolean default false
)
returns public.subscription_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.subscription_plans;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  if p_id is null then
    raise exception 'invalid_id';
  end if;
  if p_price_cents is not null and p_price_cents < 1 then
    raise exception 'invalid_price';
  end if;
  if p_features is not null and jsonb_typeof(p_features) <> 'array' then
    raise exception 'invalid_features';
  end if;
  if p_name is not null and length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;
  if p_set_max_private_models and p_max_private_models is not null and p_max_private_models < 0 then
    raise exception 'invalid_max_private_models';
  end if;

  update public.subscription_plans
  set
    name = case
      when p_name is null then name
      else trim(p_name)
    end,
    description = coalesce(p_description, description),
    price_cents = coalesce(p_price_cents, price_cents),
    currency = coalesce(nullif(lower(trim(p_currency)), ''), currency),
    features = coalesce(p_features, features),
    is_active = coalesce(p_is_active, is_active),
    sort_order = coalesce(p_sort_order, sort_order),
    "interval" = case
      when kind = 'one_time' then null
      when p_interval is not null then
        case
          when trim(p_interval) = 'month' then 'month'
          else "interval"
        end
      else "interval"
    end,
    max_private_models = case
      when coalesce(p_set_max_private_models, false) then p_max_private_models
      else max_private_models
    end
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_found';
  end if;

  perform public.sync_plan_price_to_app_settings(v_row.slug, v_row.price_cents);
  return v_row;
end;
$$;

revoke all on function public.admin_update_subscription_plan(
  uuid, text, text, integer, text, jsonb, boolean, integer, text, integer, boolean
) from public;
grant execute on function public.admin_update_subscription_plan(
  uuid, text, text, integer, text, jsonb, boolean, integer, text, integer, boolean
) to authenticated;
