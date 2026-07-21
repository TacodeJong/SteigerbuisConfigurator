-- Fix: admin_assign_subscription_plan (and cancel_my_subscription) update
-- profiles while auth.role() is still 'authenticated' and auth.uid() is the
-- caller. protect_profile_paid_fields then raises paid_fields_immutable when
-- an admin assigns a plan to themselves (or a user cancels).
--
-- Allow trusted security-definer RPCs via a transaction-local GUC bypass.
-- Also allow is_current_user_admin() to change paid entitlements (column
-- grants still block direct client writes of those columns).

create or replace function public.protect_profile_paid_fields()
returns trigger
language plpgsql
as $$
begin
  -- Trusted SECURITY DEFINER RPCs set this for the transaction.
  if nullif(current_setting('app.bypass_profile_protect', true), '') = 'on' then
    return new;
  end if;

  if auth.role() = 'authenticated' then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'admin_field_immutable';
    end if;

    -- Admins may change entitlements (via RPCs); clients only have grants on
    -- display_name/bio so direct table updates of paid columns still fail.
    if auth.uid() = old.id and not public.is_current_user_admin() then
      if new.is_paid is distinct from old.is_paid
         or new.paid_until is distinct from old.paid_until
         or new.export_pack is distinct from old.export_pack
         or new.subscription_plan_slug is distinct from old.subscription_plan_slug
         or new.subscription_status is distinct from old.subscription_status
         or new.subscription_cancel_at is distinct from old.subscription_cancel_at
         or new.mollie_customer_id is distinct from old.mollie_customer_id
         or new.mollie_subscription_id is distinct from old.mollie_subscription_id
         or new.mollie_subscription_status is distinct from old.mollie_subscription_status
         or new.mollie_subscription_next_payment_at is distinct from old.mollie_subscription_next_payment_at then
        raise exception 'paid_fields_immutable';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_my_subscription: set bypass before updating own paid fields
-- ---------------------------------------------------------------------------
create or replace function public.cancel_my_subscription(
  p_end_immediately boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.profiles;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into row from public.profiles where id = uid for update;
  if not found then
    raise exception 'profile_not_found';
  end if;

  if not coalesce(row.is_paid, false) then
    raise exception 'no_active_subscription'
      using hint = 'Geen actief maandabonnement om te annuleren.';
  end if;

  perform set_config('app.bypass_profile_protect', 'on', true);

  if p_end_immediately then
    update public.profiles
    set
      is_paid = false,
      paid_until = null,
      subscription_status = 'canceled',
      subscription_cancel_at = now(),
      subscription_plan_slug = coalesce(subscription_plan_slug, 'paid_monthly'),
      updated_at = now()
    where id = uid
    returning * into row;
  else
    update public.profiles
    set
      subscription_status = 'canceled',
      subscription_cancel_at = coalesce(paid_until, now()),
      subscription_plan_slug = coalesce(subscription_plan_slug, 'paid_monthly'),
      updated_at = now()
    where id = uid
    returning * into row;
  end if;

  return row;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_assign_subscription_plan: set bypass (covers self-assign)
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

  perform set_config('app.bypass_profile_protect', 'on', true);

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
      updated_at = now()
    where id = v_id
    returning * into v_after;

  else
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

comment on function public.admin_assign_subscription_plan(
  text, text, uuid, timestamptz, text, boolean
) is
  'Admin: wijst subscription_plans.slug toe. Zet entitlements lokaal; bypass protect_profile. Geen Mollie-IDs.';
