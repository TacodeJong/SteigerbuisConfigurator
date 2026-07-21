# Data Model: Accounts, Paid, Publish & Social

*As-built 2026-07-21 — see migrations under `supabase/migrations/`.*

## profiles

Extends auth user.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | = auth.users.id |
| display_name | text | required for publish |
| bio | text nullable | |
| is_paid | boolean | webhook-maintained |
| paid_until | timestamptz nullable | |
| export_pack | boolean | one-time `export_once` unlock |
| subscription_plan_slug | text nullable | e.g. `free`, `paid_monthly`, `export_once` |
| subscription_status | text nullable | `active` \| `pending` \| `canceled` \| `expired` \| `suspended` \| `failed` |
| subscription_cancel_at | timestamptz nullable | scheduled end |
| mollie_customer_id | text nullable unique | recurring customer |
| mollie_subscription_id | text nullable unique | recurring subscription |
| mollie_subscription_status | text nullable | last Mollie status |
| mollie_subscription_next_payment_at | date nullable | next auto-incasso date |
| is_admin | boolean | default false; **never** client-writable |
| created_at / updated_at | timestamptz | |

**RLS**: own row readable/updatable (paid/admin columns protected by trigger). Others: use **`public_profiles`** view only (`id`, `display_name`, `bio`).

## public_profiles (view)

Limited columns for gallery/attribution; no `is_admin` / paid / subscription leak.

## subscription_plans

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| slug | text unique | `free`, `paid_monthly`, `export_once`, `extra_monthly`, … |
| name / description | text | NL labels (Gratis / Basis / Extra; `export_once` kept for fallback pricing, hidden from plan cards) |
| kind | text | `free` \| `subscription` \| `one_time` |
| price_cents | int | ≥0; free must be 0 |
| currency | text | `eur` |
| interval | text nullable | `month` for subscriptions; null otherwise |
| features | jsonb array | `cloud_save`, `open_from_disk`, `publish`, `fork`, `full_print`, `copy_order_list`, `download_model`, `unlimited_saves` |
| max_private_models | int nullable | null = unlimited; 0 = no cloud quota; n = cap |
| is_active | boolean | inactive plans hidden from upgrade cards |
| is_default | boolean | **exactly one** true (signup/fallback) |
| sort_order | int | UI card order |

**RLS**: anon/auth select active (or via list RPCs); mutate only via `admin_*` RPCs (`is_admin`).

## models

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| owner_id | uuid FK → profiles | |
| name | text | |
| scene / config | jsonb | |
| visibility | text | `private` \| `published` |
| forked_from_id | uuid nullable | |
| attribution_name | text nullable | snapshot at fork |
| published_at / created_at / updated_at | timestamptz | |

**Rules**:
- SELECT: owner or `published`; DELETE: owner.
- INSERT/UPDATE: **revoked** for clients — only via `save_model` / `publish_model` / `unpublish_model` / `fork_model` (security definer).
- Save limit: RPC reads plan `max_private_models` (default/free plan if unassigned).
- Publish/fork: require `user_has_plan_feature(uid, 'publish'|'fork')` (paid + plan features). Not pay-per-use.
- **Gallery soft-hide**: `visibility='published'` stays set on downgrade; discovery uses view `gallery_models` (`published` ∧ `is_entitled_paid(owner_id)`). Reactivation restores listing without republish. Forks (`forked_from_id`) are owned by the forker and are unaffected. Direct open-by-id / `fork_model` still read `models` (published), so forks are not orphaned.

## favourites / follows

Unchanged: user-managed edges; favourites hide unpublished in UI.

## app_settings

Key/value JSON (e.g. `mollie_mode`: `"test"` \| `"live"`; free-limit sync helpers). Admin via `set_app_setting` / related RPCs. API keys never stored here.

| Key | Value shape | Notes |
|-----|-------------|-------|
| `feature_gates` | `{ full_print, copy_order_list, bom_print, download_model: boolean }` | Pay-per-use only. `true` = requires subscription covering feature **or** durable grant **or** `export_pack` (print/copy). Defaults: plattegrond + bestellijst on; stuklijst + download off. **Not** for `open_from_disk` / `publish` / `fork` (those are plan features). Public read; admin write via Betaalde functies tab. |
| `feature_prices` | `{ full_print?, copy_order_list?, bom_print?, download_model?: number\|null }` | Optional one-shot price in **cents** per gated feature. `null`/missing → checkout falls back to `export_once` / `price_export_once_cents`. |

## model_feature_grants

Durable pay-per-feature unlocks scoped to one cloud model. Independent of subscription state.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → profiles | buyer |
| model_id | uuid FK → models | cloud model |
| feature_key | text | `full_print` \| `copy_order_list` \| `bom_print` \| `download_model` |
| payment_id | text nullable | Mollie payment id |
| amount_cents | int nullable | charged amount |
| created_at | timestamptz | |

**Unique** `(user_id, model_id, feature_key)`. **RLS**: owner SELECT; INSERT via service role / webhook only.

**Entitlement** (client mirror): `has_active_subscription_covering(feature) OR has_feature_grant(user, model, feature)` (plus account-wide `export_pack` for print/copy). On downgrade, subscription covering ends; grants remain.

## account_feature_grants

Durable account-wide unlock for **`download_model` only** (checkout without a cloud model id).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → profiles | buyer |
| feature_key | text | `download_model` only |
| payment_id | text nullable | |
| amount_cents | int nullable | |
| created_at | timestamptz | |

**Unique** `(user_id, feature_key)`. **RLS**: owner SELECT; INSERT via webhook/service role only.

`open_from_disk` / `publish` / `fork` MUST NOT be sold as account grants — they live on `subscription_plans.features` and are enforced by `user_has_plan_feature` in RPCs.

## discount_codes (+ redemptions)

Admin-managed codes; webhook increments usage idempotently.

## deleted_accounts

Anonymized audit after account delete (hashed/redacted identity, `deleted_at`). Admin select via `admin_list_deleted_accounts`.

## admin_plan_assignment_events

Append-only audit when an admin manually assigns a plan.

| Column | Type | Notes |
|--------|------|-------|
| id | bigserial PK | |
| admin_id | uuid FK → profiles nullable | who granted |
| target_user_id | uuid FK → profiles | recipient |
| from_plan_slug / to_plan_slug | text | before/after |
| paid_until | timestamptz nullable | applied period end |
| note | text nullable | optional admin note |
| had_mollie_subscription | boolean | warning context |
| patch | jsonb | entitlement snapshot |
| created_at | timestamptz | |

RPCs: `admin_assign_subscription_plan`, `admin_lookup_user_subscription`, `admin_list_users_for_assign`, `admin_list_plan_assignment_events` (all `is_current_user_admin()`).

## page_visits

Anonymous tracking events for dashboard analytics.

| Column | Type | Notes |
|--------|------|-------|
| id | bigint identity PK | append-only |
| visitor_key | text | random UUID stored in localStorage (no PII) |
| route / path | text | app route label + URL path/query |
| visited_at | timestamptz | event timestamp |
| user_agent | text nullable | optional troubleshooting context |
| browser / os | text nullable | normalized (Chrome/Safari/…, iOS/Android/…) |
| referrer_host | text nullable | external referrer host; null = Direct / same-origin |
| utm_source / utm_medium / utm_campaign | text nullable | capped ≤64 chars from query string |
| timezone | text nullable | `Intl` timezone (e.g. Europe/Amsterdam) |
| country_code | char(2) nullable | coarse hint from timezone map or Accept-Language region — **never IP** |

**Privacy**: no raw IP storage. Location is approximate; missing/ambiguous → “Onbekend”. Rows before dimension columns show as Onbekend in breakdowns.

**RLS**: anon/authenticated insert allowed; direct SELECT blocked. Admin reads aggregates via `admin_visit_analytics(p_days)` (totals, series, browsers, oses, referrers, utm, locations, top_routes, top_paths — each top list ≤20 by visits).

## tutorials

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| title / description | text | |
| storage_path | text | path in Storage bucket `tutorials` |
| public_url | text nullable | |
| thumbnail_path | text nullable | image object in same bucket (`{id}.jpg`/`.png`/`.webp`) |
| thumbnail_url | text nullable | cached public thumb URL |
| mime_type / duration_seconds | | mp4/webm |
| sort_order | int | |
| is_published | boolean | anon sees only published |
| created_by | uuid nullable | admin uploader |

**RLS**: public SELECT published; admin full CRUD. Storage: public read; admin write (~100 MB). Bucket MIME: `video/mp4`, `video/webm`, `image/jpeg`, `image/png`, `image/webp`.

## mollie webhook idempotency

Processed Mollie payment ids (and discount redemption) so retries do not double-apply entitlements.

## mollie_subscription_events

Append-only service-role table with webhook/payment/subscription audit (`mollie_payment_id`, `mollie_subscription_id`, payload jsonb) for troubleshooting recurring lifecycle.

## State transitions

```text
private --(entitled publish)--> published
published --(owner unpublish)--> private
published --(entitled fork)--> new private (forked_from_id set)
published --(owner loses paid entitlement)--> still published in DB; hidden from gallery_models
published + owner re-entitled --> reappears in gallery_models (no republish)
subscription --(cancel)--> canceled (access until paid_until / cancel_at)
account --(delete)--> auth gone + deleted_accounts row
```
