# Setup: Supabase + Mollie (productie)

De app draait als **statische Vite-site** (bijv. Strato). Accounts, cloud-modellen, maandabonnement / Betaal per keer en social zitten in **Supabase (EU)** + **Mollie** Edge Functions.

## A. Lokaal testen zonder backend (nu)

Geen Supabase nodig:

```bash
cp .env.example .env
# Laat VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY leeg
npm install
npm run dev
```

Dan: **Inloggen → Registreren** → opslaan, limiet, demo-toggles (Betaal per keer / maandabonnement / Admin) op de pagina **Abonnement & aankopen**, galerij, forken. Alles in `localStorage`.

---

## B. Supabase (EU) — echte accounts

### 1. Project aanmaken

1. Ga naar [supabase.com](https://supabase.com) → New project.
2. Kies regio **Europe** (bijv. Frankfurt / West EU).
3. Noteer:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`  
   (Settings → API)

### 2. Schema toepassen

**Optie CLI (aanbevolen):**

```bash
npx supabase login
npx supabase link --project-ref <jouw-project-ref>
npx supabase db push
```

Dat past toe o.a.:

- `supabase/migrations/20260717000000_accounts_paid_publish_social.sql`  
  (profiles, models, favourites, follows, RLS, `save_model` / `publish_model` / `fork_model`, …)
- `supabase/migrations/20260718000000_export_pack.sql`  
  (`profiles.export_pack` + protect-trigger)
- `supabase/migrations/20260720000000_admin_role_app_settings.sql`  
  (`profiles.is_admin`, `app_settings`, RPC `set_app_setting` / `is_current_user_admin`)
- `supabase/migrations/20260720120000_admin_pricing_discounts.sql`  
  (prijs-keys in `app_settings`, `discount_codes`, `profile_discounts`, admin/dashboard/korting-RPCs)
- `supabase/migrations/20260720140000_account_deletion.sql`  
  (`deleted_accounts` auditlog, RPC `delete_my_account` / `admin_list_deleted_accounts`)
- `supabase/migrations/20260720145000_subscription_manage.sql`  
  (`subscription_plan_slug` / `subscription_status` / `subscription_cancel_at`, RPC `cancel_my_subscription`)
- `supabase/migrations/20260720150000_subscription_plans.sql`  
  (`subscription_plans` + admin create/update RPCs; seed `paid_monthly` / `export_once`)
- `supabase/migrations/20260721100000_mollie_mode_setting.sql`  
  (`app_settings.mollie_mode` = `"test"` | `"live"`, default `"test"`)
- `supabase/migrations/20260721150000_tutorials.sql`  
  (tabel `tutorials`, Storage-bucket `tutorials`, RLS + storage policies)

**Optie SQL Editor:** plak de inhoud van die migraties in Supabase → SQL → Run (in chronologische volgorde).

### 3. Auth instellingen

- Authentication → Providers → **Email** aan.
- Site URL: `https://steigerbuisontwerpen.nl` (productie).
- Redirect URLs: productie-origin (+ eventueel een tunnel-URL voor lokale Mollie-tests).
- **Mollie:** `redirectUrl` / return URL mag **geen** `localhost` of private IP zijn — alleen publieke HTTPS.

### 4. Frontend `.env`

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_BILLING_RETURN_URL=https://steigerbuisontwerpen.nl/?billing=return
```

Herstart `npm run dev`. De lokale stub valt weg zodra URL + anon key gezet zijn.

> Mollie weigert lokale return-URL’s. Voor betalingstests: site live op `steigerbuisontwerpen.nl`, of een HTTPS-tunnel (Cloudflare Tunnel / ngrok) als return URL.

**Nooit** de **service_role** key in `.env` / Vite zetten — die is alleen voor Edge Functions.

### 5. Admin-rechten geven

Er is **geen** publieke admin-login of `?admin=1`. Admin is een server-side rol op `profiles.is_admin`. De knop **Beheer** (header + accountmenu) en route `?view=admin` zijn alleen zichtbaar/bruikbaar als het ingelogde account die flag heeft.

In Supabase → SQL Editor (of via service role):

```sql
-- Via user-id (Authentication → Users → kopieer UUID):
UPDATE public.profiles
SET is_admin = true
WHERE id = '00000000-0000-0000-0000-000000000000';

-- Of via e-mail:
UPDATE public.profiles
SET is_admin = true
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'jij@voorbeeld.nl'
);
```

Clients kunnen `is_admin` niet zelf zetten (trigger `protect_profile_paid_fields`). Intrekken: zelfde query met `is_admin = false`.

#### Beheerpagina (`?view=admin`)

Na `db push` van de pricing/korting-migratie:

| Sectie | Inhoud |
|--------|--------|
| Dashboard | Counts: accounts, actieve maandabonnees, gepubliceerde modellen + **Verwijderde accounts** (anonieme tombstones) |
| Abonnementen | Configureerbare plans (`subscription_plans`): naam, prijs, kind, features, **max_private_models**, actief |
| Kortingen | Codes (`discount_codes`) + persoonlijke % (`profile_discounts` via e-mail) |
| Betalingen | Mollie **test** / **live** modus (`app_settings.mollie_mode`) — keys blijven Edge secrets |
| Functies & stijl | Planken-flag + thema (dit apparaat) |
| Tutorials | Upload/beheer uitlegvideo’s (bucket `tutorials`); publiceren voor `?view=tutorials` |

#### Storage: tutorials-bucket

Migratie `20260721150000_tutorials.sql` maakt:

- Tabel `public.tutorials` (titel, beschrijving, `storage_path` / `public_url`, volgorde, `is_published`, …)
- Storage-bucket **`tutorials`** (public read, max ~100 MB, MIME `video/mp4` + `video/webm`)
- RLS: iedereen mag **published** rijen lezen; insert/update/delete alleen `is_admin`
- Storage-policies: download voor iedereen; upload/update/delete alleen admin

Na `npx supabase db push` zou de bucket automatisch bestaan. Controleer in Dashboard → Storage → `tutorials`. Als de bucket ontbreekt (handmatige SQL zonder storage-deel):

1. Storage → **New bucket** → naam `tutorials`, **Public** aan.
2. File size limit ≥ 100 MB; allowed MIME: `video/mp4`, `video/webm`.
3. Policies zoals in de migratie (select publiek; write via `is_current_user_admin()`).

Users: drawer **Ontdekken** → **Uitleg** (`?view=tutorials`). Admin: Beheer → tab **Tutorials**.

#### Abonnement beheren / annuleren

Users: Accountmenu → **Abonnement beheren** (of **Abonnement & aankopen**). Basis/Extra maandplannen gebruiken nu **Mollie recurring**: eerst mandate (`sequenceType=first`) en daarna echte `customer subscription`. Annuleren probeert de Mollie subscription direct te stoppen en synchroniseert daarna `subscription_status` lokaal (toegang tot einddatum, of meteen stoppen).

**Upgrade-pagina (tier-vergelijking):**
- Altijd een **Gratis account**-kaart (alleen gratis — geen nested betaal-CTA).
- Actieve `kind=one_time` (typisch **Betaal per keer** / `export_once`) als **aparte** kaart.
- Elke actieve `kind=subscription` uit `subscription_plans` als aparte kaart (`name` / features uit admin; admin-`sort_order` is vooral voor de adminlijst).
- Eerste subscription ≈ **Basis account** (`paid_monthly`); tweede (bijv. `extra_monthly`) ≈ **Extra account** — verschijnt pas als `is_active=true`.
- Migratie `20260721120000_tier_basis_extra_plans.sql` seeden een inactief Extra-voorbeeld; admin kan het aanzetten.
- **Privémodellen-limiet:** kolom `subscription_plans.max_private_models` (`NULL` = onbeperkt, getal = cap). Seed: Basis=3, Extra=`NULL`, export_once=0. Free users: `app_settings.free_private_model_limit` (default 3) via RPC `free_private_model_limit()` / `private_model_limit_for_user()`. Handhaving in `save_model` (SQL — geen Edge redeploy nodig).
- Bij actief abonnement met `full_print`: **Betaal per keer** is disabled (“Inbegrepen bij je abonnement”).
- Feature gate (plattegrond/print): gebruiker wordt naar upgrade gestuurd waar Betaal per keer als aparte optie staat.

RPC: `cancel_my_subscription(p_end_immediately)` (alleen eigen account).

#### Account verwijderen

Gebruikers: Accountmenu → **Account verwijderen** → typ e-mail of `VERWIJDER`.

- Edge Function `delete-account` (service role): schrijft anoniem auditrecord + wist `auth.users` (cascade naar profiel/modellen/social).
- Migratie `20260720140000_account_deletion.sql`: tabel `deleted_accounts` (geen plaintext e-mail).

```bash
npx supabase db push --yes --linked
npx supabase functions deploy delete-account
npx supabase functions deploy create-checkout
npx supabase functions deploy mollie-webhook
```

**Redeploy** na wijzigingen aan checkout: `npx supabase functions deploy create-checkout`.

---

## C. Mollie — betalingen → Paid

Checkout gebruikt nu twee paden:
- `kind=subscription`: customer resolven/aanmaken, mandate checken, daarna:
  - geen geldige mandate → first payment (`sequenceType=first`) met redirect
  - wel geldige mandate → direct `/v2/customers/{id}/subscriptions` aanmaken
- `kind=one_time` (`export_once`): bestaande one-shot payment.

Bedrag-prioriteit: **`subscription_plans`** (actief plan) → `app_settings` → Edge secret `MOLLIE_PAYMENT_AMOUNT` → `7.00`. Export: plan `export_once` → `price_export_once_cents` → `MOLLIE_EXPORT_AMOUNT` → `5.00`.

### 1. Mollie account

1. [mollie.com](https://www.mollie.com) → account (NL).
2. Developers → API keys → **Test** key (`test_…`) én later **Live** key (`live_…`).
3. Webhooks hoeven niet handmatig in Mollie: elke payment creeert `webhookUrl` naar dezelfde Edge Function (`…/functions/v1/mollie-webhook`). Test- en live-payments gebruiken diezelfde URL; de juiste API-key volgt uit `mollie_mode` (metadata + `app_settings`).
4. Activeer in Mollie per modus (test/live) methodes die `sequenceType=first` ondersteunen:
   - **Website profiles** → kies je live profile → **Payment methods**
   - Zet **Credit card** aan (werkt voor mandates zonder Direct Debit).
   - Voor **iDEAL** als eerste betaling: zet iDEAL **én** **SEPA Direct Debit** aan. iDEAL alleen voor one-off is niet genoeg — Mollie maakt bij iDEAL een Direct Debit-mandate aan.
   - **Wero**: (nog) geen first-payment/mandate voor abonnementen in Mollie; Wero kan wel one-off zijn maar verschijnt niet bij `sequenceType=first`.
   - Live toont alleen volledig goedgekeurde methodes (test kan “pending” tonen).
   - Zonder first-capable methodes: checkout faalt met “No suitable payment methods found”.
   - Controle: `GET /v2/methods?sequenceType=first&amount[value]=7.00&amount[currency]=EUR&locale=nl_NL` (live key) moet o.a. `ideal` en/of `creditcard` teruggeven. Vergelijk met `sequenceType=oneoff`.

### 2. Edge secrets (nooit in DB of frontend)

**Nooit** Mollie API-keys in `app_settings`, migraties of Vite `.env` zetten. Alleen Supabase Edge Function secrets:

```bash
npx supabase secrets set \
  MOLLIE_API_KEY_TEST=test_xxxx \
  MOLLIE_API_KEY_LIVE=live_xxxx \
  SITE_URL=https://steigerbuisontwerpen.nl
```

| Secret | Gebruik |
|--------|---------|
| `MOLLIE_API_KEY_TEST` | Wanneer `mollie_mode` = `"test"` (moet met `test_` beginnen) |
| `MOLLIE_API_KEY_LIVE` | Wanneer `mollie_mode` = `"live"` (moet met `live_` beginnen) — **verplicht** voor live |
| `MOLLIE_API_KEY` | Legacy: alleen gebruikt als mode-specifieke key ontbreekt **én** de prefix bij de modus past (`test_` / `live_`). Geen stille cross-mode fallback. |

`SITE_URL` moet publiek HTTPS zijn (zelfde reden als de return URL).

`SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` worden meestal automatisch geïnjecteerd; anders ook zetten.

### 3. Test / live modus (admin)

- Setting: `app_settings` key `mollie_mode`, value `"test"` | `"live"`.
- **Default bij nieuwe installs:** `"test"` (migratie `20260721100000_mollie_mode_setting.sql`).
- **Als de setting ontbreekt:** Edge Functions gebruiken alleen legacy `MOLLIE_API_KEY` (zoals voorheen).
- Wisselen: Beheer → tab **Betalingen** → Test / Live → **Modus opslaan** (RPC `set_app_setting`, alleen `is_admin`).
- Live toont een NL-waarschuwing: echte betalingen.
- Checkout schrijft `mollie_mode` in payment-metadata; de webhook gebruikt metadata (of settings) om dezelfde key te kiezen — belangrijk als je van modus wisselt terwijl een betaling nog open staat.

Zonder passende secret geeft checkout **501** (`billing_not_configured`) met een duidelijke NL-foutmelding.

### 4. Edge Functions deployen

```bash
npx supabase functions deploy create-checkout
npx supabase functions deploy mollie-webhook
npx supabase functions deploy cancel-subscription
npx supabase functions deploy delete-account
```

Shared helper: `supabase/functions/_shared/mollieApiKey.ts` (meegebundeld bij deploy).

### 5. Flow testen

1. Beheer → Betalingen → modus **Test** (en `MOLLIE_API_KEY_TEST` gezet).
2. Inloggen in de app.
3. Account → **Abonnement & aankopen** → **Naar betaling**.
4. Mollie test-betaalpagina afronden.
5. Terug naar `?billing=return` → profiel zou maandabonnement moeten tonen (refresh / opnieuw inloggen).
6. Plattegrond-print en publiceren werken.

### 6. Productie (live)

1. Zet secret `MOLLIE_API_KEY_LIVE=live_…`.
2. Beheer → Betalingen → **Live** opslaan.
3. `SITE_URL` / `VITE_BILLING_RETURN_URL` → `https://steigerbuisontwerpen.nl/?billing=return`
4. Build met productie-`VITE_*` en upload `dist/` naar Strato.
5. Auth Site URL in Supabase naar het productiedomein.
6. **Live recurring checklist (Mollie dashboard, English UI):**
   1. Switch the dashboard to **Live** (not Test).
   2. **Settings → Website profiles** → open the profile linked to your live API key.
   3. **Payment methods** → enable **Credit card** (and wait until status is fully active).
   4. To offer **iDEAL** for the first subscription payment: enable **iDEAL** **and** **SEPA Direct Debit** (iDEAL mandates require Direct Debit).
   5. **Wero** does not appear for subscription first payments (no Mollie mandate path yet).
   6. Confirm **Developers → API keys** that the live key matches this website profile.
   7. Optional check: `GET /v2/methods?sequenceType=first&amount[value]=7.00&amount[currency]=EUR` with the live key must return at least one method id (`ideal` and/or `creditcard`). If `oneoff` lists `ideal` but `first` does not, SEPA Direct Debit is still missing.

Webhook-URL blijft hetzelfde; Mollie test- vs live-dashboard tonen hun eigen payments.

---

## D. Stripe (fallback)

Als Mollie later subscriptions lastig is: zet op de Edge Function:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID` (recurring price)

`create-checkout` gebruikt Stripe Checkout als Mollie-key ontbreekt maar Stripe wél gezet is. Mollie heeft voorrang.

---

## E. Wat zit waar

| Stuk | Locatie |
|------|---------|
| Migratie / RLS / RPC | `supabase/migrations/20260717000000_*.sql` |
| Export pack | `supabase/migrations/20260718000000_export_pack.sql` |
| Admin + app_settings | `supabase/migrations/20260720000000_admin_role_app_settings.sql` |
| Prijzen + kortingen | `supabase/migrations/20260720120000_admin_pricing_discounts.sql` |
| Account wissen + audit | `supabase/migrations/20260720140000_account_deletion.sql` |
| Abonnement annuleren | `supabase/migrations/20260720145000_subscription_manage.sql` |
| Configureerbare plans | `supabase/migrations/20260720150000_subscription_plans.sql` |
| Max. privémodellen per plan | `supabase/migrations/20260721130000_max_private_models.sql` |
| Mollie test/live modus | `supabase/migrations/20260721100000_mollie_mode_setting.sql` |
| Tutorials (video’s) | `supabase/migrations/20260721150000_tutorials.sql` |
| Beheer-UI | `src/components/admin/AdminPage.tsx` (`?view=admin`) |
| Tutorials admin | `src/components/admin/AdminTutorialsPanel.tsx` |
| Tutorials client | `src/lib/tutorials/tutorials.ts` |
| Uitleg-pagina | `src/components/tutorials/TutorialsPage.tsx` (`?view=tutorials`) |
| Verwijderde accounts (admin) | `src/components/admin/AdminDeletedAccountsPanel.tsx` |
| Delete Edge Function | `supabase/functions/delete-account/` |
| Checkout | `supabase/functions/create-checkout/` |
| Webhook Paid | `supabase/functions/mollie-webhook/` |
| Mollie key helper | `supabase/functions/_shared/mollieApiKey.ts` |
| Mollie mode client | `src/lib/billing/mollieMode.ts` |
| Plans client | `src/lib/billing/plans.ts` |
| Cancel / switch UI | `src/components/auth/SubscriptionManageSection.tsx` |
| Delete account UI | `src/components/auth/DeleteAccountDialog.tsx` |
| Frontend client | `src/lib/auth/supabaseClient.ts` |
| Entitlements | `src/lib/billing/entitlements.ts` |
| Cloud models | `src/lib/models/cloudModels.ts` |

## F. Strato

Alleen `dist/` uploaden. In de build zitten alleen publieke `VITE_*` keys. Mollie + service role blijven in Supabase secrets.

`public/.htaccess` komt mee in `dist/` (SPA-fallback naar `index.html`, basis security-headers, cache voor CSS/JS/fonts). Op Strato Apache: controleer of `mod_rewrite` / `mod_headers` / `mod_expires` aan staan; anders headers overslaan en alleen de bestanden uploaden.
