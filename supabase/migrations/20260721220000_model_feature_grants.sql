-- Permanent pay-per-feature unlocks scoped to (user, model, feature).
-- Admin-configurable per-feature prices in app_settings.feature_prices (cents).
-- Missing / null price → checkout falls back to export_once / price_export_once_cents.

create table if not exists public.model_feature_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  model_id uuid not null references public.models (id) on delete cascade,
  feature_key text not null
    check (feature_key in ('full_print', 'copy_order_list', 'bom_print')),
  payment_id text null,
  amount_cents integer null check (amount_cents is null or amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, model_id, feature_key)
);

create index if not exists model_feature_grants_user_model_idx
  on public.model_feature_grants (user_id, model_id);

create index if not exists model_feature_grants_user_feature_idx
  on public.model_feature_grants (user_id, feature_key);

comment on table public.model_feature_grants is
  'Permanent unlock: user paid for a gated feature on a specific model. Survives subscription upgrade/downgrade. Active subscription covering the feature also unlocks without a grant; export_pack is account-wide.';

alter table public.model_feature_grants enable row level security;

drop policy if exists model_feature_grants_select_own on public.model_feature_grants;
create policy model_feature_grants_select_own on public.model_feature_grants
  for select to authenticated
  using (auth.uid() = user_id);

-- No client insert/update/delete — webhook / service role only
revoke insert, update, delete on public.model_feature_grants from anon, authenticated;
grant select on public.model_feature_grants to authenticated;

-- Optional per-feature prices (cents). null / missing key = use export_once fallback.
insert into public.app_settings (key, value)
values (
  'feature_prices',
  jsonb_build_object(
    'full_print', null,
    'copy_order_list', null,
    'bom_print', null
  )
)
on conflict (key) do nothing;

comment on table public.app_settings is
  'Site-wide JSON settings (public read). Keys include planks_enabled, mollie_mode, prices, feature_gates, feature_prices.';

-- Helper: does current user have a permanent grant for this model+feature?
create or replace function public.has_model_feature_grant(
  p_model_id uuid,
  p_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.model_feature_grants g
    where g.user_id = auth.uid()
      and g.model_id = p_model_id
      and g.feature_key = p_feature_key
  );
$$;

revoke all on function public.has_model_feature_grant(uuid, text) from public;
grant execute on function public.has_model_feature_grant(uuid, text) to authenticated, anon;
