-- Rename export_once display: pay-per-purchase with permanent access (not "printrechten").
-- Technical slug export_once / profiles.export_pack unchanged.
-- Idempotent: safe if rows already match.

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
