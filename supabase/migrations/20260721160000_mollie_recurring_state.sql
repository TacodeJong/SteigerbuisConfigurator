-- Mollie recurring state: customer, mandate/subscription sync + webhook events ledger.
-- Backward compatible with existing one-shot monthly flow.

alter table public.profiles
  add column if not exists mollie_customer_id text,
  add column if not exists mollie_subscription_id text,
  add column if not exists mollie_subscription_status text,
  add column if not exists mollie_subscription_next_payment_at date;

alter table public.profiles
  drop constraint if exists profiles_subscription_status_check;

alter table public.profiles
  add constraint profiles_subscription_status_check
  check (
    subscription_status is null
    or subscription_status in ('active', 'pending', 'canceled', 'expired', 'suspended', 'failed')
  );

alter table public.profiles
  drop constraint if exists profiles_mollie_subscription_status_check;

alter table public.profiles
  add constraint profiles_mollie_subscription_status_check
  check (
    mollie_subscription_status is null
    or mollie_subscription_status in ('active', 'pending', 'canceled', 'expired', 'suspended', 'failed')
  );

create unique index if not exists profiles_mollie_customer_id_key
  on public.profiles (mollie_customer_id)
  where mollie_customer_id is not null;

create unique index if not exists profiles_mollie_subscription_id_key
  on public.profiles (mollie_subscription_id)
  where mollie_subscription_id is not null;

comment on column public.profiles.mollie_customer_id is
  'Mollie customer id used for recurring direct debit mandates.';
comment on column public.profiles.mollie_subscription_id is
  'Mollie subscription id for active recurring monthly plan.';
comment on column public.profiles.mollie_subscription_status is
  'Last known Mollie subscription status: active|pending|canceled|expired|suspended|failed.';
comment on column public.profiles.mollie_subscription_next_payment_at is
  'Next expected recurring collection date from Mollie subscription.';

alter table public.processed_mollie_payments
  add column if not exists mollie_customer_id text,
  add column if not exists mollie_subscription_id text;

create index if not exists processed_mollie_payments_subscription_id_idx
  on public.processed_mollie_payments (mollie_subscription_id);

create table if not exists public.mollie_subscription_events (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mollie_customer_id text,
  mollie_subscription_id text,
  mollie_payment_id text,
  event_type text not null,
  status text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mollie_subscription_events_user_id_idx
  on public.mollie_subscription_events (user_id);

create index if not exists mollie_subscription_events_subscription_id_idx
  on public.mollie_subscription_events (mollie_subscription_id);

alter table public.mollie_subscription_events enable row level security;
-- Service role and security definer only; no client policies.

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
