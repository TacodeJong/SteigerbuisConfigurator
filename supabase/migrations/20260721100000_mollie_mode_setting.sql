-- Mollie API mode (test | live) — keys stay in Edge Function secrets, never in DB.
-- Default "test" for nieuwe installs (veilig). Bestaande setups zonder deze rij:
-- Edge Functions vallen terug op legacy secret MOLLIE_API_KEY (zoals voorheen).
-- Na seed: productie die live wil, zet in Beheer → Betalingen op Live (+ MOLLIE_API_KEY_LIVE).

insert into public.app_settings (key, value)
values ('mollie_mode', '"test"'::jsonb)
on conflict (key) do nothing;

comment on table public.app_settings is
  'Site-wide JSON settings. mollie_mode: "test"|"live" — selects Edge secret MOLLIE_API_KEY_TEST / _LIVE (never store API keys here).';
