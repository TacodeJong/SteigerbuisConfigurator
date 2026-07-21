-- P1: Mollie webhook idempotency + discount redemption tracking
-- Voorkomt dubbele paid_until-verlenging bij herhaalde webhooks.
-- redemption_count ophogen gebeurt in de webhook (service role) na succesvolle betaling.

create table if not exists public.processed_mollie_payments (
  payment_id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan text,
  amount_cents integer,
  status text not null default 'paid',
  discount_code text,
  processed_at timestamptz not null default now(),
  metadata jsonb
);

create index if not exists processed_mollie_payments_user_id_idx
  on public.processed_mollie_payments (user_id);

alter table public.processed_mollie_payments enable row level security;
-- Geen client-policies: alleen service role / security definer.

comment on table public.processed_mollie_payments is
  'Idempotency ledger for Mollie webhooks. Insert once per payment_id; duplicates must no-op.';

-- Helper: bump redemption_count for a code (service role / webhook)
create or replace function public.increment_discount_redemption(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(p_code));
  v_updated int;
begin
  if v_code is null or length(v_code) = 0 then
    return false;
  end if;

  update public.discount_codes
  set redemption_count = redemption_count + 1
  where upper(trim(code)) = v_code
    and active = true
    and (max_redemptions is null or redemption_count < max_redemptions);

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.increment_discount_redemption(text) from public;
-- Edge webhook uses service role (bypasses grant); no client execute needed.
