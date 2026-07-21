# Quickstart: Local verification

## Prerequisites

1. Supabase project in **EU**; `.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
2. Apply all migrations under `supabase/migrations` (incl. free plan, RLS RPCs, Mollie mode).
3. Deploy edge functions: `create-checkout`, `mollie-webhook`, `cancel-subscription`, `delete-account`; set Mollie test/live secrets.
4. Optional: `UPDATE profiles SET is_admin = true WHERE id = …` for beheerpagina.
5. `npm install && npm run dev`

## Smoke checklist

1. Guest: design + BOM; Save → login; footprint locked.
2. Register: lands on **Gratis**; plan cards visible (**Gratis** + subscriptions — no “Betaal per keer” card); save up to Gratis `max_private_models` (default 3); favourite/follow OK; publish/fork blocked.
3. Hit footprint / bestellijst gate → feature unlock checkout (or upgrade to subscription) → unlocked for that model (or account for download without model); Openen van schijf / publiceren / fork remain **abonnement**-only.
4. **Basis** checkout → first mandate payment once, daarna automatische maand-incasso; publish + fork + open_from_disk; cancel/switch from account UI; webhook idempotent on retry.
5. Delete account → login fails; admin sees anonymized `deleted_accounts` row.
6. Admin: edit plan features/`max_private_models` on **Abonnementen**; toggle pay-per-use gates/prices on **Betaalde functies**; Mollie test/live; discounts; **Gebruikers → plan toewijzen**; upload/publish a tutorial video.
7. `/` has meta description + canonical; privacy/terms + published tutorials page render.

## Deploy note

Static `dist/` to Strato; only public Supabase keys in frontend build. Service role + Mollie keys only in Edge secrets.
