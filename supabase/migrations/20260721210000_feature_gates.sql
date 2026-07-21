-- Admin-configurable payment gates + copy_order_list plan feature
-- app_settings.feature_gates: JSON map of gated actions → requires payment (bool)
-- Defaults match current product + Bestellijst kopiëren paid.

insert into public.app_settings (key, value)
values (
  'feature_gates',
  jsonb_build_object(
    'full_print', true,
    'copy_order_list', true,
    'bom_print', false
  )
)
on conflict (key) do nothing;

-- Add copy_order_list to plans that already expose full_print
update public.subscription_plans
set
  features = features || '["copy_order_list"]'::jsonb,
  updated_at = now()
where features @> '["full_print"]'::jsonb
  and not (features @> '["copy_order_list"]'::jsonb);

comment on column public.subscription_plans.features is
  'JSON array of entitlement flags, e.g. cloud_save, publish, fork, full_print, copy_order_list, unlimited_saves.';
