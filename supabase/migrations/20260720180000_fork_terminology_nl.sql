-- Vervang user-facing "forken" door NL-terminologie ("ontwerpen overnemen" / eigen kopie).
-- Technische slugs, feature-flags (fork) en fork_model() blijven ongewijzigd.
-- Idempotent: safe if rows already match.

update public.subscription_plans
set
  description =
    'Maandelijks abonnement: onbeperkt privé opslaan, publiceren, ontwerpen overnemen (eigen kopie) en volledige plattegrond/stuklijst-print.'
where slug = 'paid_monthly'
  and description is distinct from
    'Maandelijks abonnement: onbeperkt privé opslaan, publiceren, ontwerpen overnemen (eigen kopie) en volledige plattegrond/stuklijst-print.';

update public.subscription_plans
set
  description =
    'Je betaalt per aankoop; daarna blijf je toegang houden tot plattegrond en bouwdocumenten (stuklijst/bouwinstructie). Geen cloud-opslag, publiceren of ontwerpen overnemen. Geen abonnement.'
where slug = 'export_once'
  and description is distinct from
    'Je betaalt per aankoop; daarna blijf je toegang houden tot plattegrond en bouwdocumenten (stuklijst/bouwinstructie). Geen cloud-opslag, publiceren of ontwerpen overnemen. Geen abonnement.';
