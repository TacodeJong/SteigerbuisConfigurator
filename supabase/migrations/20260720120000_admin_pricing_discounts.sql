-- Admin pricing settings + discount codes / per-profile discounts
-- Requires: 20260720000000_admin_role_app_settings.sql (is_admin, set_app_setting)

-- ---------------------------------------------------------------------------
-- Default plan prices in app_settings (cents; UI + Edge can read)
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value)
values
  ('price_paid_monthly_cents', '700'::jsonb),
  ('price_export_once_cents', '500'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- discount_codes: no public SELECT; admin via RPC; public validate only
-- ---------------------------------------------------------------------------
create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  percent_off numeric(5, 2),
  amount_off_cents integer,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  max_redemptions integer,
  redemption_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint discount_codes_code_nonempty check (length(trim(code)) > 0),
  constraint discount_codes_discount_xor check (
    (percent_off is not null and amount_off_cents is null)
    or (percent_off is null and amount_off_cents is not null)
  ),
  constraint discount_codes_percent_range check (
    percent_off is null or (percent_off > 0 and percent_off <= 100)
  ),
  constraint discount_codes_amount_positive check (
    amount_off_cents is null or amount_off_cents > 0
  ),
  constraint discount_codes_max_redemptions_positive check (
    max_redemptions is null or max_redemptions > 0
  )
);

create unique index if not exists discount_codes_code_upper_uidx
  on public.discount_codes (upper(trim(code)));

alter table public.discount_codes enable row level security;

-- No policies = no direct client access; use security definer RPCs only.

-- ---------------------------------------------------------------------------
-- profile_discounts: manual per-user discount
-- ---------------------------------------------------------------------------
create table if not exists public.profile_discounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  percent_off numeric(5, 2) not null,
  valid_until timestamptz,
  note text,
  created_at timestamptz not null default now(),
  constraint profile_discounts_percent_range check (percent_off > 0 and percent_off <= 100),
  constraint profile_discounts_profile_unique unique (profile_id)
);

alter table public.profile_discounts enable row level security;

-- ---------------------------------------------------------------------------
-- Dashboard stats (admin only)
-- ---------------------------------------------------------------------------
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
  select count(*)::integer into v_published
    from public.models
    where visibility = 'published';

  return jsonb_build_object(
    'profiles', v_profiles,
    'paid_users', v_paid,
    'published_models', v_published
  );
end;
$$;

revoke all on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Discount codes: admin CRUD
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_discount_codes()
returns setof public.discount_codes
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  return query
    select * from public.discount_codes
    order by created_at desc;
end;
$$;

revoke all on function public.admin_list_discount_codes() from public;
grant execute on function public.admin_list_discount_codes() to authenticated;

create or replace function public.admin_upsert_discount_code(
  p_code text,
  p_percent_off numeric default null,
  p_amount_off_cents integer default null,
  p_valid_until timestamptz default null,
  p_max_redemptions integer default null,
  p_active boolean default true,
  p_id uuid default null
)
returns public.discount_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.discount_codes;
  v_code text := upper(trim(p_code));
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  if v_code is null or length(v_code) = 0 then
    raise exception 'invalid_code';
  end if;
  if (p_percent_off is null and p_amount_off_cents is null)
     or (p_percent_off is not null and p_amount_off_cents is not null) then
    raise exception 'discount_xor_required';
  end if;

  if p_id is not null then
    update public.discount_codes
    set
      code = v_code,
      percent_off = p_percent_off,
      amount_off_cents = p_amount_off_cents,
      valid_until = p_valid_until,
      max_redemptions = p_max_redemptions,
      active = coalesce(p_active, true)
    where id = p_id
    returning * into v_row;
    if v_row.id is null then
      raise exception 'not_found';
    end if;
    return v_row;
  end if;

  insert into public.discount_codes (
    code, percent_off, amount_off_cents, valid_until, max_redemptions, active
  )
  values (
    v_code, p_percent_off, p_amount_off_cents, p_valid_until, p_max_redemptions,
    coalesce(p_active, true)
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.admin_upsert_discount_code(
  text, numeric, integer, timestamptz, integer, boolean, uuid
) from public;
grant execute on function public.admin_upsert_discount_code(
  text, numeric, integer, timestamptz, integer, boolean, uuid
) to authenticated;

create or replace function public.admin_delete_discount_code(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  delete from public.discount_codes where id = p_id;
end;
$$;

revoke all on function public.admin_delete_discount_code(uuid) from public;
grant execute on function public.admin_delete_discount_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public: validate a single code (no listing)
-- ---------------------------------------------------------------------------
create or replace function public.validate_discount_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.discount_codes;
  v_code text := upper(trim(p_code));
begin
  if v_code is null or length(v_code) = 0 then
    return jsonb_build_object('valid', false, 'reason', 'empty');
  end if;

  select * into v_row
  from public.discount_codes
  where upper(trim(code)) = v_code
  limit 1;

  if v_row.id is null then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if not v_row.active then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;
  if v_row.valid_from is not null and v_row.valid_from > now() then
    return jsonb_build_object('valid', false, 'reason', 'not_yet_valid');
  end if;
  if v_row.valid_until is not null and v_row.valid_until < now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if v_row.max_redemptions is not null
     and v_row.redemption_count >= v_row.max_redemptions then
    return jsonb_build_object('valid', false, 'reason', 'max_redemptions');
  end if;

  return jsonb_build_object(
    'valid', true,
    'code', v_row.code,
    'percent_off', v_row.percent_off,
    'amount_off_cents', v_row.amount_off_cents,
    'valid_until', v_row.valid_until
  );
end;
$$;

revoke all on function public.validate_discount_code(text) from public;
grant execute on function public.validate_discount_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profile discounts: admin list / set / clear
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_profile_discounts()
returns table (
  id uuid,
  profile_id uuid,
  percent_off numeric,
  valid_until timestamptz,
  note text,
  created_at timestamptz,
  email text,
  display_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  return query
    select
      d.id,
      d.profile_id,
      d.percent_off,
      d.valid_until,
      d.note,
      d.created_at,
      u.email::text,
      p.display_name
    from public.profile_discounts d
    join public.profiles p on p.id = d.profile_id
    left join auth.users u on u.id = d.profile_id
    order by d.created_at desc;
end;
$$;

revoke all on function public.admin_list_profile_discounts() from public;
grant execute on function public.admin_list_profile_discounts() to authenticated;

create or replace function public.admin_set_profile_discount(
  p_email text default null,
  p_profile_id uuid default null,
  p_percent_off numeric default null,
  p_valid_until timestamptz default null,
  p_note text default null
)
returns public.profile_discounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_row public.profile_discounts;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  if p_percent_off is null or p_percent_off <= 0 or p_percent_off > 100 then
    raise exception 'invalid_percent';
  end if;

  if p_profile_id is not null then
    v_id := p_profile_id;
  elsif p_email is not null and length(trim(p_email)) > 0 then
    select id into v_id
    from auth.users
    where lower(email) = lower(trim(p_email))
    limit 1;
  end if;

  if v_id is null then
    raise exception 'user_not_found';
  end if;
  if not exists (select 1 from public.profiles where id = v_id) then
    raise exception 'user_not_found';
  end if;

  insert into public.profile_discounts (profile_id, percent_off, valid_until, note)
  values (v_id, p_percent_off, p_valid_until, nullif(trim(p_note), ''))
  on conflict (profile_id) do update
    set percent_off = excluded.percent_off,
        valid_until = excluded.valid_until,
        note = excluded.note
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.admin_set_profile_discount(
  text, uuid, numeric, timestamptz, text
) from public;
grant execute on function public.admin_set_profile_discount(
  text, uuid, numeric, timestamptz, text
) to authenticated;

create or replace function public.admin_clear_profile_discount(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  delete from public.profile_discounts where profile_id = p_profile_id;
end;
$$;

revoke all on function public.admin_clear_profile_discount(uuid) from public;
grant execute on function public.admin_clear_profile_discount(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Effective discount for checkout (authenticated user + optional code)
-- Used by Edge Function via user JWT or service role after auth.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_checkout_discount(p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code_json jsonb;
  v_profile public.profile_discounts;
  v_percent numeric := null;
  v_amount integer := null;
  v_source text := null;
  v_code_label text := null;
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  -- Prefer explicit code when valid
  if p_code is not null and length(trim(p_code)) > 0 then
    v_code_json := public.validate_discount_code(p_code);
    if (v_code_json->>'valid')::boolean then
      v_percent := (v_code_json->>'percent_off')::numeric;
      v_amount := (v_code_json->>'amount_off_cents')::integer;
      v_source := 'code';
      v_code_label := v_code_json->>'code';
    end if;
  end if;

  -- Else personal discount
  if v_source is null then
    select * into v_profile
    from public.profile_discounts
    where profile_id = v_uid
    limit 1;
    if v_profile.id is not null
       and (v_profile.valid_until is null or v_profile.valid_until > now()) then
      v_percent := v_profile.percent_off;
      v_source := 'profile';
    end if;
  end if;

  if v_source is null then
    return jsonb_build_object('applied', false);
  end if;

  return jsonb_build_object(
    'applied', true,
    'source', v_source,
    'code', v_code_label,
    'percent_off', v_percent,
    'amount_off_cents', v_amount
  );
end;
$$;

revoke all on function public.resolve_checkout_discount(text) from public;
grant execute on function public.resolve_checkout_discount(text) to authenticated;

comment on table public.discount_codes is
  'Promo codes. No public SELECT; use validate_discount_code / admin_* RPCs.';
comment on table public.profile_discounts is
  'Manual percent discount per profile. Admin-managed via RPCs.';
