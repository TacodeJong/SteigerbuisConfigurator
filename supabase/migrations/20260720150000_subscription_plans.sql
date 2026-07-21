-- Subscription / one-time plans (admin-composable)
-- Requires: 20260720000000_admin_role_app_settings.sql (is_current_user_admin)
--
-- Contract for agents B/C (checkout / cancel / account):
--   slugs: paid_monthly | export_once
--   features (jsonb array of flags):
--     paid_monthly: cloud_save, publish, fork, full_print, unlimited_saves
--     export_once:  full_print
-- Plan table is the source of truth for composition; price updates also sync
-- app_settings keys price_paid_monthly_cents / price_export_once_cents for checkout.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text not null default '',
  kind text not null,
  price_cents integer not null,
  currency text not null default 'eur',
  "interval" text,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_slug_nonempty check (length(trim(slug)) > 0),
  constraint subscription_plans_name_nonempty check (length(trim(name)) > 0),
  constraint subscription_plans_kind_check check (kind in ('subscription', 'one_time')),
  constraint subscription_plans_interval_check check (
    "interval" is null or "interval" in ('month')
  ),
  constraint subscription_plans_kind_interval_check check (
    (kind = 'subscription' and "interval" is not null)
    or (kind = 'one_time' and "interval" is null)
  ),
  constraint subscription_plans_price_positive check (price_cents > 0),
  constraint subscription_plans_currency_nonempty check (length(trim(currency)) > 0),
  constraint subscription_plans_features_array check (jsonb_typeof(features) = 'array'),
  constraint subscription_plans_slug_unique unique (slug)
);

create index if not exists subscription_plans_active_sort_idx
  on public.subscription_plans (is_active, sort_order);

create or replace function public.set_subscription_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subscription_plans_set_updated_at on public.subscription_plans;
create trigger subscription_plans_set_updated_at
  before update on public.subscription_plans
  for each row
  execute function public.set_subscription_plans_updated_at();

alter table public.subscription_plans enable row level security;

-- Public: read active plans only. Writes go through admin RPCs (security definer).
drop policy if exists subscription_plans_select_active on public.subscription_plans;
create policy subscription_plans_select_active on public.subscription_plans
  for select
  using (is_active = true);

grant select on public.subscription_plans to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed current product lineup
-- ---------------------------------------------------------------------------
insert into public.subscription_plans (
  slug, name, description, kind, price_cents, currency, "interval", features, is_active, sort_order
)
values
  (
    'paid_monthly',
    'Maandabonnement',
    'Maandelijks abonnement: onbeperkt privé opslaan, publiceren, forken en volledige plattegrond/stuklijst-print.',
    'subscription',
    700,
    'eur',
    'month',
    '["cloud_save","publish","fork","full_print","unlimited_saves"]'::jsonb,
    true,
    10
  ),
  (
    'export_once',
    'Betaal per keer',
    'Je betaalt per aankoop; daarna blijf je toegang houden tot plattegrond en bouwdocumenten (stuklijst/bouwinstructie). Geen cloud-opslag, publiceren of forken. Geen abonnement.',
    'one_time',
    500,
    'eur',
    null,
    '["full_print"]'::jsonb,
    true,
    20
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description;

-- Keep legacy app_settings price keys in sync with seed defaults (checkout fallback).
insert into public.app_settings (key, value)
values
  ('price_paid_monthly_cents', '700'::jsonb),
  ('price_export_once_cents', '500'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Sync known slugs → app_settings (checkout compatibility)
-- ---------------------------------------------------------------------------
create or replace function public.sync_plan_price_to_app_settings(
  p_slug text,
  p_price_cents integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_slug = 'paid_monthly' then
    insert into public.app_settings (key, value, updated_at)
    values ('price_paid_monthly_cents', to_jsonb(p_price_cents), now())
    on conflict (key) do update
      set value = excluded.value, updated_at = now();
  elsif p_slug = 'export_once' then
    insert into public.app_settings (key, value, updated_at)
    values ('price_export_once_cents', to_jsonb(p_price_cents), now())
    on conflict (key) do update
      set value = excluded.value, updated_at = now();
  end if;
end;
$$;

revoke all on function public.sync_plan_price_to_app_settings(text, integer) from public;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_subscription_plans()
returns setof public.subscription_plans
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  return query
    select * from public.subscription_plans
    order by sort_order asc, created_at asc;
end;
$$;

revoke all on function public.admin_list_subscription_plans() from public;
grant execute on function public.admin_list_subscription_plans() to authenticated;

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
  p_sort_order integer default 100
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
    features, is_active, sort_order
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
    coalesce(p_sort_order, 100)
  )
  returning * into v_row;

  perform public.sync_plan_price_to_app_settings(v_row.slug, v_row.price_cents);
  return v_row;
end;
$$;

revoke all on function public.admin_create_subscription_plan(
  text, text, text, text, integer, text, text, jsonb, boolean, integer
) from public;
grant execute on function public.admin_create_subscription_plan(
  text, text, text, text, integer, text, text, jsonb, boolean, integer
) to authenticated;

create or replace function public.admin_update_subscription_plan(
  p_id uuid,
  p_name text default null,
  p_description text default null,
  p_price_cents integer default null,
  p_currency text default null,
  p_features jsonb default null,
  p_is_active boolean default null,
  p_sort_order integer default null,
  p_interval text default null
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
  uuid, text, text, integer, text, jsonb, boolean, integer, text
) from public;
grant execute on function public.admin_update_subscription_plan(
  uuid, text, text, integer, text, jsonb, boolean, integer, text
) to authenticated;

comment on table public.subscription_plans is
  'Composable checkout plans. Public SELECT of is_active=true; writes via admin_* RPCs. Soft-disable with is_active=false.';
comment on column public.subscription_plans.slug is
  'Stable id for checkout/Edge: paid_monthly, export_once, …';
comment on column public.subscription_plans.features is
  'JSON array of entitlement flags, e.g. cloud_save, publish, fork, full_print, unlimited_saves.';
