-- Admin: handmatig abonnement/plan toewijzen + audit.
-- Security-definer RPCs; requires is_current_user_admin().
-- Overschrijft lokale entitlements; inventeert geen Mollie-IDs.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- Audit table
-- ---------------------------------------------------------------------------
create table if not exists public.admin_plan_assignment_events (
  id bigserial primary key,
  admin_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  from_plan_slug text,
  to_plan_slug text not null,
  paid_until timestamptz,
  note text,
  had_mollie_subscription boolean not null default false,
  patch jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_plan_assignment_events_target_idx
  on public.admin_plan_assignment_events (target_user_id, created_at desc);

create index if not exists admin_plan_assignment_events_admin_idx
  on public.admin_plan_assignment_events (admin_id, created_at desc);

alter table public.admin_plan_assignment_events enable row level security;
-- Geen client-policies: alleen via security-definer RPCs.

comment on table public.admin_plan_assignment_events is
  'Audit: wie heeft welk plan handmatig toegewezen (admin grant).';

-- ---------------------------------------------------------------------------
-- Lookup user by email (for Beheer form + Mollie-waarschuwing)
-- ---------------------------------------------------------------------------
create or replace function public.admin_lookup_user_subscription(
  p_email text default null,
  p_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
  v_row public.profiles;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;

  if p_profile_id is not null then
    v_id := p_profile_id;
  elsif p_email is not null and length(trim(p_email)) > 0 then
    select u.id, u.email into v_id, v_email
    from auth.users u
    where lower(u.email) = lower(trim(p_email))
    limit 1;
  end if;

  if v_id is null then
    return jsonb_build_object('found', false);
  end if;

  select * into v_row from public.profiles where id = v_id;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  if v_email is null then
    select email into v_email from auth.users where id = v_id;
  end if;

  return jsonb_build_object(
    'found', true,
    'profile_id', v_row.id,
    'email', v_email,
    'display_name', v_row.display_name,
    'subscription_plan_slug', v_row.subscription_plan_slug,
    'is_paid', coalesce(v_row.is_paid, false),
    'paid_until', v_row.paid_until,
    'export_pack', coalesce(v_row.export_pack, false),
    'subscription_status', v_row.subscription_status,
    'mollie_subscription_id', v_row.mollie_subscription_id,
    'mollie_subscription_status', v_row.mollie_subscription_status,
    'mollie_customer_id', v_row.mollie_customer_id
  );
end;
$$;

revoke all on function public.admin_lookup_user_subscription(text, uuid) from public;
grant execute on function public.admin_lookup_user_subscription(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Recent users list (e-mail + plan) for selectie in Beheer
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users_for_assign(
  p_query text default null,
  p_limit int default 40
)
returns table (
  profile_id uuid,
  email text,
  display_name text,
  subscription_plan_slug text,
  is_paid boolean,
  paid_until timestamptz,
  export_pack boolean,
  subscription_status text,
  mollie_subscription_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 40), 100));
  v_q text := nullif(trim(coalesce(p_query, '')), '');
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;

  return query
  select
    p.id as profile_id,
    u.email::text,
    p.display_name,
    p.subscription_plan_slug,
    coalesce(p.is_paid, false),
    p.paid_until,
    coalesce(p.export_pack, false),
    p.subscription_status,
    p.mollie_subscription_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where
    v_q is null
    or u.email ilike '%' || v_q || '%'
    or p.display_name ilike '%' || v_q || '%'
    or coalesce(p.subscription_plan_slug, '') ilike '%' || v_q || '%'
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit v_limit;
end;
$$;

revoke all on function public.admin_list_users_for_assign(text, int) from public;
grant execute on function public.admin_list_users_for_assign(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Assign plan (core)
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_subscription_plan(
  p_plan_slug text,
  p_email text default null,
  p_profile_id uuid default null,
  p_paid_until timestamptz default null,
  p_note text default null,
  p_clear_mollie_local boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
  v_email text;
  v_plan public.subscription_plans;
  v_before public.profiles;
  v_after public.profiles;
  v_had_mollie boolean := false;
  v_paid_until timestamptz;
  v_patch jsonb;
begin
  if v_admin is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;

  if p_plan_slug is null or length(trim(p_plan_slug)) = 0 then
    raise exception 'invalid_plan';
  end if;

  select * into v_plan
  from public.subscription_plans
  where slug = trim(p_plan_slug)
  limit 1;

  if not found then
    raise exception 'plan_not_found';
  end if;

  if p_profile_id is not null then
    v_id := p_profile_id;
  elsif p_email is not null and length(trim(p_email)) > 0 then
    select u.id, u.email into v_id, v_email
    from auth.users u
    where lower(u.email) = lower(trim(p_email))
    limit 1;
  end if;

  if v_id is null then
    raise exception 'user_not_found';
  end if;

  select * into v_before from public.profiles where id = v_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;

  if v_email is null then
    select email into v_email from auth.users where id = v_id;
  end if;

  v_had_mollie := v_before.mollie_subscription_id is not null
    and length(trim(v_before.mollie_subscription_id)) > 0;

  -- Entitlements per plan kind (zelfde model als webhook / signup)
  if v_plan.kind = 'free' then
    v_paid_until := null;
    update public.profiles
    set
      subscription_plan_slug = v_plan.slug,
      is_paid = false,
      paid_until = null,
      export_pack = false,
      subscription_status = 'active',
      subscription_cancel_at = null,
      mollie_subscription_status = case
        when p_clear_mollie_local and v_had_mollie then 'canceled'
        else mollie_subscription_status
      end,
      mollie_subscription_next_payment_at = case
        when p_clear_mollie_local and v_had_mollie then null
        else mollie_subscription_next_payment_at
      end,
      updated_at = now()
    where id = v_id
    returning * into v_after;

  elsif v_plan.kind = 'one_time' then
    v_paid_until := v_before.paid_until;
    update public.profiles
    set
      subscription_plan_slug = v_plan.slug,
      export_pack = true,
      subscription_status = 'active',
      subscription_cancel_at = null,
      -- one_time laat is_paid/paid_until staan (zoals Mollie webhook)
      updated_at = now()
    where id = v_id
    returning * into v_after;

  else
    -- subscription (of onbekend → behandel als paid subscription)
    v_paid_until := coalesce(
      p_paid_until,
      case
        when v_before.paid_until is not null and v_before.paid_until > now()
          then v_before.paid_until
        else now() + interval '1 month'
      end
    );
    update public.profiles
    set
      subscription_plan_slug = v_plan.slug,
      is_paid = true,
      paid_until = v_paid_until,
      subscription_status = 'active',
      subscription_cancel_at = null,
      mollie_subscription_status = case
        when p_clear_mollie_local and v_had_mollie then 'canceled'
        else mollie_subscription_status
      end,
      mollie_subscription_next_payment_at = case
        when p_clear_mollie_local and v_had_mollie then null
        else mollie_subscription_next_payment_at
      end,
      updated_at = now()
    where id = v_id
    returning * into v_after;
  end if;

  v_patch := jsonb_build_object(
    'kind', v_plan.kind,
    'is_paid', v_after.is_paid,
    'paid_until', v_after.paid_until,
    'export_pack', v_after.export_pack,
    'subscription_status', v_after.subscription_status,
    'subscription_plan_slug', v_after.subscription_plan_slug,
    'mollie_subscription_status', v_after.mollie_subscription_status,
    'clear_mollie_local', coalesce(p_clear_mollie_local, true)
  );

  insert into public.admin_plan_assignment_events (
    admin_id,
    target_user_id,
    from_plan_slug,
    to_plan_slug,
    paid_until,
    note,
    had_mollie_subscription,
    patch
  ) values (
    v_admin,
    v_id,
    v_before.subscription_plan_slug,
    v_plan.slug,
    v_after.paid_until,
    nullif(trim(coalesce(p_note, '')), ''),
    v_had_mollie,
    v_patch
  );

  return jsonb_build_object(
    'ok', true,
    'profile_id', v_id,
    'email', v_email,
    'from_plan_slug', v_before.subscription_plan_slug,
    'to_plan_slug', v_plan.slug,
    'plan_kind', v_plan.kind,
    'is_paid', v_after.is_paid,
    'paid_until', v_after.paid_until,
    'export_pack', v_after.export_pack,
    'subscription_status', v_after.subscription_status,
    'had_mollie_subscription', v_had_mollie,
    'mollie_local_cleared', coalesce(p_clear_mollie_local, true) and v_had_mollie
  );
end;
$$;

revoke all on function public.admin_assign_subscription_plan(
  text, text, uuid, timestamptz, text, boolean
) from public;
grant execute on function public.admin_assign_subscription_plan(
  text, text, uuid, timestamptz, text, boolean
) to authenticated;

comment on function public.admin_assign_subscription_plan(
  text, text, uuid, timestamptz, text, boolean
) is
  'Admin: wijst subscription_plans.slug toe. Zet entitlements lokaal; geen Mollie-IDs. Optioneel lokale Mollie-status canceled.';

-- ---------------------------------------------------------------------------
-- Audit list
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_plan_assignment_events(
  p_limit int default 50
)
returns table (
  id bigint,
  created_at timestamptz,
  admin_id uuid,
  admin_email text,
  target_user_id uuid,
  target_email text,
  from_plan_slug text,
  to_plan_slug text,
  paid_until timestamptz,
  note text,
  had_mollie_subscription boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;

  return query
  select
    e.id,
    e.created_at,
    e.admin_id,
    au.email::text as admin_email,
    e.target_user_id,
    tu.email::text as target_email,
    e.from_plan_slug,
    e.to_plan_slug,
    e.paid_until,
    e.note,
    e.had_mollie_subscription
  from public.admin_plan_assignment_events e
  left join auth.users au on au.id = e.admin_id
  left join auth.users tu on tu.id = e.target_user_id
  order by e.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.admin_list_plan_assignment_events(int) from public;
grant execute on function public.admin_list_plan_assignment_events(int) to authenticated;
