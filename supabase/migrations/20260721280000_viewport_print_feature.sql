-- viewport_print: print current 3D viewport with environment (pay-per-use gate)
-- Separate from bom_print so Beheer → Betaalde functies can toggle it independently.

alter table public.model_feature_grants
  drop constraint if exists model_feature_grants_feature_key_check;

alter table public.model_feature_grants
  add constraint model_feature_grants_feature_key_check
  check (feature_key in (
    'full_print',
    'copy_order_list',
    'bom_print',
    'viewport_print',
    'download_model',
    'full_pdf'
  ));

-- Merge viewport_print into feature_gates / feature_prices (preserve admin overrides).
-- Default: free (false), same as bom_print.
update public.app_settings
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'viewport_print', coalesce((value->>'viewport_print')::boolean, false)
)
where key = 'feature_gates';

update public.app_settings
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'viewport_print', coalesce(value->'viewport_print', 'null'::jsonb)
)
where key = 'feature_prices';

-- Keep SQL helper defaults in sync (gate missing → free for viewport_print).
create or replace function public.feature_gate_requires_payment(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (value ->> p_feature)::boolean
      from public.app_settings
      where key = 'feature_gates'
    ),
    case p_feature
      when 'bom_print' then false
      when 'viewport_print' then false
      when 'download_model' then false
      else true
    end
  );
$$;
