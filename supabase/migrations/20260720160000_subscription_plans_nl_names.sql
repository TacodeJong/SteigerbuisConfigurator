-- Align display names/descriptions after NL rename.
-- Technical slugs (paid_monthly, export_once) stay unchanged.
-- Idempotent: safe if rows already match.

update public.subscription_plans
set
  name = 'Maandabonnement',
  description =
    'Maandelijks abonnement: onbeperkt privé opslaan, publiceren, forken en volledige plattegrond/stuklijst-print.'
where slug = 'paid_monthly'
  and (
    name is distinct from 'Maandabonnement'
    or description is distinct from
      'Maandelijks abonnement: onbeperkt privé opslaan, publiceren, forken en volledige plattegrond/stuklijst-print.'
  );

update public.subscription_plans
set
  name = 'Betaal per keer',
  description =
    'Je betaalt per aankoop; daarna blijf je toegang houden tot plattegrond en bouwdocumenten (stuklijst/bouwinstructie). Geen cloud-opslag, publiceren of forken. Geen abonnement.'
where slug = 'export_once'
  and (
    name is distinct from 'Betaal per keer'
    or description is distinct from
      'Je betaalt per aankoop; daarna blijf je toegang houden tot plattegrond en bouwdocumenten (stuklijst/bouwinstructie). Geen cloud-opslag, publiceren of forken. Geen abonnement.'
  );
