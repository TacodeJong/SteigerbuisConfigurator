-- Gratis als echt subscription_plans-plan (slug `free`, kind `free`).
-- is_default: exact één standaardplan voor signup / fallback.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- Schema: kind free, price >= 0, is_default
-- ---------------------------------------------------------------------------
alter table public.subscription_plans
  drop constraint if exists subscription_plans_kind_check;

alter table public.subscription_plans
  add constraint subscription_plans_kind_check
  check (kind in ('subscription', 'one_time', 'free'));

alter table public.subscription_plans
  drop constraint if exists subscription_plans_kind_interval_check;

alter table public.subscription_plans
  add constraint subscription_plans_kind_interval_check
  check (
    (kind = 'subscription' and "interval" = 'month')
    or (kind = 'one_time' and "interval" is null)
    or (kind = 'free' and "interval" is null)
  );

alter table public.subscription_plans
  drop constraint if exists subscription_plans_price_positive;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_price_nonnegative;

alter table public.subscription_plans
  add constraint subscription_plans_price_nonnegative
  check (price_cents >= 0);

alter table public.subscription_plans
  drop constraint if exists subscription_plans_free_price_check;

alter table public.subscription_plans
  add constraint subscription_plans_free_price_check
  check (
    (kind = 'free' and price_cents = 0)
    or (kind <> 'free' and price_cents > 0)
  );

alter table public.subscription_plans
  add column if not exists is_default boolean not null default false;

comment on column public.subscription_plans.is_default is
  'Exact één standaardplan (signup / users zonder betaald abonnement).';

create unique index if not exists subscription_plans_one_default_idx
  on public.subscription_plans ((true))
  where is_default;

-- ---------------------------------------------------------------------------
-- Seed free plan (max from free_private_model_limit / 3)
-- ---------------------------------------------------------------------------
-- Clear defaults first so unique index stays happy on re-runs
update public.subscription_plans
set is_default = false, updated_at = now()
where is_default;

insert into public.subscription_plans (
  slug, name, description, kind, price_cents, currency, "interval",
  features, is_active, sort_order, max_private_models, is_default
)
values (
  'free',
  'Gratis account',
  'Ontwerpen en een eenvoudige stuklijst zonder abonnement. Optioneel: Betaal per keer voor volledige print.',
  'free',
  0,
  'eur',
  null,
  '[]'::jsonb,
  true,
  0,
  coalesce(public.free_private_model_limit(), 3),
  false
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  kind = 'free',
  price_cents = 0,
  "interval" = null,
  is_active = true,
  sort_order = least(public.subscription_plans.sort_order, 0),
  max_private_models = coalesce(
    public.subscription_plans.max_private_models,
    excluded.max_private_models
  ),
  updated_at = now();

update public.subscription_plans
set is_default = true, updated_at = now()
where slug = 'free';

-- Backfill profiles without a plan slug (non-paid, no export pack)
update public.profiles
set
  subscription_plan_slug = 'free',
  updated_at = now()
where nullif(trim(subscription_plan_slug), '') is null
  and not coalesce(is_paid, false)
  and not coalesce(export_pack, false);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.default_plan_slug()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
begin
  select sp.slug into v
  from public.subscription_plans sp
  where sp.is_default and sp.is_active
  order by sp.sort_order
  limit 1;

  if v is not null then
    return v;
  end if;

  select sp.slug into v
  from public.subscription_plans sp
  where sp.kind = 'free' and sp.is_active
  order by sp.sort_order
  limit 1;

  return coalesce(v, 'free');
end;
$$;

revoke all on function public.default_plan_slug() from public;
grant execute on function public.default_plan_slug() to authenticated, anon;

comment on function public.default_plan_slug() is
  'Slug of the default (usually free) plan for new profiles / fallback entitlements.';

create or replace function public.sync_free_plan_limit_to_app_settings(p_max integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_max is null or p_max < 0 then
    return;
  end if;
  insert into public.app_settings (key, value, updated_at)
  values ('free_private_model_limit', to_jsonb(p_max), now())
  on conflict (key) do update
    set value = excluded.value, updated_at = now();
end;
$$;

revoke all on function public.sync_free_plan_limit_to_app_settings(integer) from public;

-- Sync seeded free plan limit → app_settings
do $$
declare
  v_max integer;
begin
  select max_private_models into v_max
  from public.subscription_plans
  where slug = 'free';
  if v_max is not null then
    perform public.sync_free_plan_limit_to_app_settings(v_max);
  end if;
end;
$$;

-- Prefer free-plan row for free_private_model_limit()
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
  plan_max int;
begin
  select sp.max_private_models into plan_max
  from public.subscription_plans sp
  where sp.is_default and sp.is_active
  order by sp.sort_order
  limit 1;

  if plan_max is null then
    select sp.max_private_models into plan_max
    from public.subscription_plans sp
    where sp.kind = 'free' and sp.is_active
    order by sp.sort_order
    limit 1;
  end if;

  if plan_max is not null and plan_max >= 0 then
    return plan_max;
  end if;

  select s.value #>> '{}' into v
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

-- ---------------------------------------------------------------------------
-- Signup: assign default plan slug
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, subscription_plan_slug)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Gebruiker'),
    public.default_plan_slug()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entitlements: free users use free-plan max_private_models
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
      return v_limit;
    end if;

    return null;
  end if;

  -- Non-paid: profile slug → default/free plan → app_settings fallback
  select nullif(trim(p.subscription_plan_slug), '')
  into v_slug
  from public.profiles p
  where p.id = uid;

  v_slug := coalesce(v_slug, public.default_plan_slug());

  select sp.max_private_models, true
  into v_limit, v_found
  from public.subscription_plans sp
  where sp.slug = v_slug;

  if v_found then
    return coalesce(v_limit, public.free_private_model_limit());
  end if;

  return public.free_private_model_limit();
end;
$$;

comment on function public.private_model_limit_for_user(uuid) is
  'Private cloud model cap. NULL = unlimited. Non-paid users use free/default plan row.';

-- ---------------------------------------------------------------------------
-- Admin RPCs: price 0 for free, is_default toggle
-- ---------------------------------------------------------------------------
drop function if exists public.admin_create_subscription_plan(
  text, text, text, text, integer, text, text, jsonb, boolean, integer, integer
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
  p_max_private_models integer default null,
  p_is_default boolean default false
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
  v_price integer;
  v_default boolean := coalesce(p_is_default, false);
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
  if p_kind not in ('subscription', 'one_time', 'free') then
    raise exception 'invalid_kind';
  end if;
  if jsonb_typeof(coalesce(p_features, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_features';
  end if;
  if p_max_private_models is not null and p_max_private_models < 0 then
    raise exception 'invalid_max_private_models';
  end if;

  if p_kind = 'free' then
    v_price := 0;
    v_interval := null;
  elsif p_kind = 'one_time' then
    v_interval := null;
    v_price := coalesce(p_price_cents, 100);
    if v_price < 1 then
      raise exception 'invalid_price';
    end if;
  else
    v_interval := coalesce(nullif(trim(p_interval), ''), 'month');
    if v_interval <> 'month' then
      raise exception 'invalid_interval';
    end if;
    v_price := coalesce(p_price_cents, 100);
    if v_price < 1 then
      raise exception 'invalid_price';
    end if;
  end if;

  if v_default then
    update public.subscription_plans
    set is_default = false, updated_at = now()
    where is_default;
  end if;

  insert into public.subscription_plans (
    slug, name, description, kind, price_cents, currency, "interval",
    features, is_active, sort_order, max_private_models, is_default
  )
  values (
    v_slug,
    trim(p_name),
    coalesce(p_description, ''),
    p_kind,
    v_price,
    lower(coalesce(nullif(trim(p_currency), ''), 'eur')),
    v_interval,
    coalesce(p_features, '[]'::jsonb),
    coalesce(p_is_active, true),
    coalesce(p_sort_order, 100),
    p_max_private_models,
    v_default
  )
  returning * into v_row;

  perform public.sync_plan_price_to_app_settings(v_row.slug, v_row.price_cents);
  if v_row.kind = 'free' or v_row.is_default then
    perform public.sync_free_plan_limit_to_app_settings(v_row.max_private_models);
  end if;
  return v_row;
end;
$$;

revoke all on function public.admin_create_subscription_plan(
  text, text, text, text, integer, text, text, jsonb, boolean, integer, integer, boolean
) from public;
grant execute on function public.admin_create_subscription_plan(
  text, text, text, text, integer, text, text, jsonb, boolean, integer, integer, boolean
) to authenticated;

drop function if exists public.admin_update_subscription_plan(
  uuid, text, text, integer, text, jsonb, boolean, integer, text, integer, boolean
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
  p_set_max_private_models boolean default false,
  p_is_default boolean default null
)
returns public.subscription_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.subscription_plans;
  v_kind text;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  if p_id is null then
    raise exception 'invalid_id';
  end if;

  select kind into v_kind from public.subscription_plans where id = p_id;
  if v_kind is null then
    raise exception 'not_found';
  end if;

  if p_price_cents is not null then
    if v_kind = 'free' then
      if p_price_cents <> 0 then
        raise exception 'invalid_price';
      end if;
    elsif p_price_cents < 1 then
      raise exception 'invalid_price';
    end if;
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

  if p_is_default is true then
    update public.subscription_plans
    set is_default = false, updated_at = now()
    where is_default and id is distinct from p_id;
  end if;

  update public.subscription_plans
  set
    name = case
      when p_name is null then name
      else trim(p_name)
    end,
    description = coalesce(p_description, description),
    price_cents = case
      when v_kind = 'free' then 0
      else coalesce(p_price_cents, price_cents)
    end,
    currency = coalesce(nullif(lower(trim(p_currency)), ''), currency),
    features = coalesce(p_features, features),
    is_active = coalesce(p_is_active, is_active),
    sort_order = coalesce(p_sort_order, sort_order),
    "interval" = case
      when kind in ('one_time', 'free') then null
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
    end,
    is_default = coalesce(p_is_default, is_default)
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_found';
  end if;

  -- Keep at least one default when unsetting
  if p_is_default is false and not exists (
    select 1 from public.subscription_plans where is_default
  ) then
    update public.subscription_plans
    set is_default = true, updated_at = now()
    where id = p_id
    returning * into v_row;
  end if;

  perform public.sync_plan_price_to_app_settings(v_row.slug, v_row.price_cents);
  if v_row.kind = 'free' or v_row.is_default then
    perform public.sync_free_plan_limit_to_app_settings(v_row.max_private_models);
  end if;
  return v_row;
end;
$$;

revoke all on function public.admin_update_subscription_plan(
  uuid, text, text, integer, text, jsonb, boolean, integer, text, integer, boolean, boolean
) from public;
grant execute on function public.admin_update_subscription_plan(
  uuid, text, text, integer, text, jsonb, boolean, integer, text, integer, boolean, boolean
) to authenticated;
