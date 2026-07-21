-- Subscription manage: plan slug + cancel status on profiles
-- Cancel via RPC (auth.uid only). Webhook / service role sets active on payment.
-- Note: Paid is currently one-time month access (paid_until), not Mollie recurring.

alter table public.profiles
  add column if not exists subscription_plan_slug text,
  add column if not exists subscription_status text,
  add column if not exists subscription_cancel_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_subscription_status_check;

alter table public.profiles
  add constraint profiles_subscription_status_check
  check (
    subscription_status is null
    or subscription_status in ('active', 'canceled', 'expired')
  );

comment on column public.profiles.subscription_plan_slug is
  'Checkout plan slug: paid_monthly | export_once (or future subscription_plans.slug).';
comment on column public.profiles.subscription_status is
  'active | canceled | expired | null. Canceled keeps entitlement until paid_until unless ended early.';
comment on column public.profiles.subscription_cancel_at is
  'When cancel was recorded (or period end). Access may continue until paid_until.';

-- Clients must not set subscription / paid fields themselves
create or replace function public.protect_profile_paid_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'admin_field_immutable';
    end if;
    if auth.uid() = old.id then
      if new.is_paid is distinct from old.is_paid
         or new.paid_until is distinct from old.paid_until
         or new.export_pack is distinct from old.export_pack
         or new.subscription_plan_slug is distinct from old.subscription_plan_slug
         or new.subscription_status is distinct from old.subscription_status
         or new.subscription_cancel_at is distinct from old.subscription_cancel_at then
        raise exception 'paid_fields_immutable';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_my_subscription: mark canceled; optionally end Paid immediately
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

  -- Only Paid monthly has a period to cancel; export_once is a one-time unlock
  if not coalesce(row.is_paid, false) then
    raise exception 'no_active_subscription'
      using hint = 'Geen actief maandabonnement om te annuleren.';
  end if;

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

revoke all on function public.cancel_my_subscription(boolean) from public;
grant execute on function public.cancel_my_subscription(boolean) to authenticated;

comment on function public.cancel_my_subscription(boolean) is
  'Marks Paid as canceled. Default: access until paid_until. p_end_immediately clears is_paid now.';
