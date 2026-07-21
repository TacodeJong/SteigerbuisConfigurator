-- full_pdf: combined 3D + stuklijst + plattegrond print (pay-per-use gate)

-- Extend model_feature_grants CHECK for full_pdf
alter table public.model_feature_grants
  drop constraint if exists model_feature_grants_feature_key_check;

alter table public.model_feature_grants
  add constraint model_feature_grants_feature_key_check
  check (feature_key in (
    'full_print',
    'copy_order_list',
    'bom_print',
    'download_model',
    'full_pdf'
  ));

-- Merge full_pdf into feature_gates / feature_prices (preserve admin overrides).
-- Default: paid (true).
update public.app_settings
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'full_pdf', coalesce((value->>'full_pdf')::boolean, true)
)
where key = 'feature_gates';

update public.app_settings
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'full_pdf', coalesce(value->'full_pdf', 'null'::jsonb)
)
where key = 'feature_prices';

-- Add full_pdf to subscription plans that already expose full_print
update public.subscription_plans
set
  features = features || '["full_pdf"]'::jsonb,
  updated_at = now()
where features @> '["full_print"]'::jsonb
  and not (features @> '["full_pdf"]'::jsonb);

comment on column public.subscription_plans.features is
  'JSON array of entitlement flags: cloud_save, open_from_disk, publish, fork, full_print, copy_order_list, download_model, full_pdf, unlimited_saves.';
