-- Tier-vergelijking UI: Basis/Extra labels + optioneel Extra-voorbeeldplan.
-- Technical slugs unchanged. Extra staat uit (is_active=false) tot admin hem aanzet.
-- Idempotent.

-- Rename display: paid_monthly → "Basis account"
update public.subscription_plans
set
  name = 'Basis account',
  description =
    'Maandelijks: alles van Betaal per keer + onbeperkt opslaan, publiceren en ontwerpen overnemen.',
  sort_order = 10
where slug = 'paid_monthly'
  and (
    name is distinct from 'Basis account'
    or sort_order is distinct from 10
  );

-- Example second subscription tier (inactive until admin enables).
insert into public.subscription_plans (
  slug, name, description, kind, price_cents, currency, "interval", features, is_active, sort_order
)
values (
  'extra_monthly',
  'Extra account',
  'Uitgebreider abonnement (voorbeeld). Zet is_active aan in Admin → Abonnementen om deze kaart in de upgrade-pagina te tonen.',
  'subscription',
  1200,
  'eur',
  'month',
  '["cloud_save","publish","fork","full_print","unlimited_saves"]'::jsonb,
  false,
  15
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  -- Keep admin-chosen price / is_active if row already exists
  sort_order = excluded.sort_order;

comment on column public.subscription_plans.sort_order is
  'UI order for upgrade comparison cards. First active subscription ≈ Basis, second ≈ Extra (or use name).';
