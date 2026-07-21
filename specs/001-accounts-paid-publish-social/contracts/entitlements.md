# Entitlements Matrix

Server MUST enforce gated cloud actions via RPCs/RLS; print/download gates are client-mirrored fail-closed. Effective rights come from **plan features** + profile flags (`is_paid`/`paid_until`, `export_pack`) + durable grants.

## Split

| Layer | Where configured | What |
|-------|------------------|------|
| Subscription | Beheer → **Abonnementen** (`subscription_plans.features`) | `cloud_save`, `open_from_disk`, `publish`, `fork`, (+ print/copy/download flags while subscribed), `unlimited_saves`, `max_private_models` |
| Pay-per-use | Beheer → **Betaalde functies** (`feature_gates` + `feature_prices`) | `full_print`, `copy_order_list`, `bom_print`, `viewport_print`, `download_model`, `full_pdf` |

`export_once` is **not** a plan card; it is fallback pricing + legacy `export_pack`.

| Action | Guest | Gratis (default) | export_pack | Subscription w/ features |
|--------|-------|------------------|-------------|---------------------------|
| Design / 3D / price indication | allow | allow | allow | allow |
| Simple BOM view | allow | allow | allow | allow |
| Stuklijst printen | allow³ | allow³ | allow | allow |
| 3D-weergave printen | allow³ | allow³ | allow | allow |
| Bestellijst kopiëren naar klembord | deny / unlock³ | deny / unlock³ · of model-grant | allow (`copy_order_list`) | if `copy_order_list` |
| Cloud save | deny → login | if count &lt; `max_private_models` | typically no (`max=0`) | per plan max (null = ∞) |
| Openen van schijf | deny → login | deny → **abonnement** | deny | if `open_from_disk` (or `cloud_save`) |
| Download model (.json) | deny → login¹ | deny / unlock³ · of grant | deny | if `download_model` (or `cloud_save`) / grant |
| Plattegrond full print | deny / preview³ | deny / preview³ | allow (`full_print`) | if `full_print` |
| Bouwinstructie full (embedded footprint) | deny / strip² | deny / strip² | allow | if `full_print` |
| Volledige PDF (3D + stuklijst + plattegrond) | deny / unlock³ | deny / unlock³ · of model-grant | deny | if `full_pdf` |
| Publish | deny | deny → **abonnement** | deny | if `publish` (`user_has_plan_feature`) |
| Appear in gallery / feed | — | only while owner paid-entitled (`gallery_models`) | — | soft-hide when entitlement ends; metadata kept |
| View published (by id) | allow | allow | allow | allow (even if owner soft-hidden from gallery) |
| Fork (“eigen kopie”) | deny → login+plan | deny → **abonnement** | deny | if `fork` |
| Favourite / follow | deny → login | allow | allow | allow |

¹ Save/Import entry points require login (FR-018).  
² Anti-leak: non-entitled MUST NOT get floorplan SVG / hole tables via bouwinstructie.  
³ Admin-configurable via `app_settings.feature_gates` (`full_print`, `copy_order_list`, `bom_print`, `viewport_print`, `download_model`, `full_pdf`). Default: plattegrond + bestellijst + volledige PDF paid; stuklijst + 3D-weergave + download free. Gate off → allow everyone; gate on → Paid subscription **or** durable grant **or** `export_pack` (print/copy only — not `full_pdf`).

**`max_private_models`**: from assigned plan, else default (`is_default` / Gratis). Client: `resolvePrivateModelLimit`.

**Paid monthly signal**: `profiles.is_paid` AND (`paid_until` null OR `paid_until > now()`), sourced by Mollie recurring payments/webhooks **or admin grant** (`admin_assign_subscription_plan`).

**Export pack signal**: `profiles.export_pack` (legacy account-wide unlock from old `export_once` purchases); also settable via admin grant for `kind=one_time`. Account-wide; permanent. Covers print/copy only. Not shown as a plan card.

**Model feature grants**: table `model_feature_grants` `(user_id, model_id, feature_key)`. Created by Mollie webhook when checkout metadata includes `feature` + `model_id` (plan `feature_unlock`). **Durable across subscription upgrade and later downgrade**.

**Account feature grants**: table `account_feature_grants` `(user_id, feature_key)` — **`download_model` only** when checkout has no `model_id`. Never for `open_from_disk` / `publish` / `fork`.

**Pay-per-use gate check** (when `feature_gates[feature]=true`):

```text
allow if NOT gated
     OR has_active_subscription_covering(feature)   -- ends on downgrade
     OR has_export_pack covering feature            -- print/copy account-wide
     OR has_model_feature_grant(user, model, feature)
     OR has_account_feature_grant(feature)          -- download_model only
```

**Subscription-only check** (open_from_disk / publish / fork):

```text
allow if user_has_plan_feature(uid, flag)
  -- requires is_entitled_paid + subscription_plans.features
  -- open_from_disk / download_model also covered by cloud_save on plan
```

**Admin grant**: does not create Mollie IDs. Feature rights still come from the assigned plan’s `features` (+ flags above). If the user had a Mollie subscription id, Beheer warns that handmatige toewijzing overschrijft lokale entitlements; RPC may mark local `mollie_subscription_status=canceled` without calling Mollie.

**UI**: locked controls use lock icon + greyed style (no “Betaalde functie” badge text). Subscription locks → abonnement CTA; pay-per-use → one-shot **or** abonnement. **Guests** hitting a paid gate MUST get login/register first (`PAID_FEATURE_AUTH_REASON`); checkout never starts while logged out.

**Out of scope**: `ProjectQuote` UI.

**Tutorials**: anyone may view published videos; upload/publish only `is_admin`.
