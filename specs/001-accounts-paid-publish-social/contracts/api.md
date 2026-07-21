# API Contracts (logical)

Client talks to Supabase Auth + Postgres (RLS) and RPCs / Edge Functions.

## Auth

- Signup / login / logout / session (Supabase Auth)
- Session profile includes entitlement + `subscription_plan_slug`, `is_admin` (own row only)

## Models (RPCs — no direct INSERT/UPDATE)

- `save_model` — create/update; enforces `max_private_models`
- `publish_model` / `unpublish_model` — `publish_model` gated by `user_has_plan_feature(uid,'publish')`
- `fork_model` — gated by `user_has_plan_feature(uid,'fork')`; returns new private id
- SELECT gallery — view `gallery_models` (published ∧ owner `is_entitled_paid`); soft-hide on downgrade
- SELECT mine / by id — RLS (own or published); by-id still works after owner soft-hide (forks OK)
- DELETE own model — table policy

## Social

- favourites + follows CRUD; following feed / favourites list use `gallery_models` (same soft-hide)

## Billing

- Edge `create-checkout` — authenticated; one_time = payment checkout, subscription = customer/mandate + subscription create (optional checkout URL on first mandate step). Optional body `feature` (+ `model_id`) → pay-per-use unlock for `full_print` \| `copy_order_list` \| `bom_print` \| `download_model` \| `full_pdf` (`plan=feature_unlock`; amount from `feature_prices` or `export_once` fallback). With `model_id` → `model_feature_grants`; `download_model` without `model_id` → `account_feature_grants`. Never sells `open_from_disk` / `publish` / `fork` as one-shots.
- Edge `mollie-webhook` — idempotent entitlement apply + recurring status sync (`test`/`live` key via `mollie_mode`). For pay-per-use: upsert `model_feature_grants` or `account_feature_grants` (download without model). Account-wide legacy `export_once` still sets `export_pack`.
- Edge `cancel-subscription` — cancels Mollie subscription (if present) and syncs profile; fallback RPC `cancel_my_subscription`
- Plan switch helpers (client + checkout for target subscription slug)
- Active `subscription_plans` list for Upgrade / PlanCards
- Client gates: pay-per-use via `canAccessGatedFeature`; subscription-only via `canOpenFromDisk` / `canPublishModel` / `canForkModel`
## Account

- Edge `delete-account` — delete user + anonymized `deleted_accounts` audit

## Admin (`is_admin`)

- `admin_list/create/update_subscription_plan` (incl. `max_private_models`, `is_default`)
- `admin_lookup_user_subscription` / `admin_list_users_for_assign` — e-mail/lijst voor Beheer
- `admin_assign_subscription_plan` — handmatige plan-toewijzing (entitlements; geen Mollie-IDs)
- `admin_list_plan_assignment_events` — audit van handmatige grants
- Discount CRUD + increment (service role on webhook)
- `set_app_setting` / Mollie mode
- `admin_list_deleted_accounts` (+ count)
- Feature flags via `app_settings`
- Tutorials CRUD + Storage upload (admin); public list published

## Public / legal (SPA routes)

- `?view=admin` — beheerpagina
- `?view=privacy` / `?view=terms` — legal pages
- Tutorials / Uitleg route (published list)
- SEO: `index.html` meta + `public/robots.txt` / `sitemap.xml`

## Error shapes

```json
{ "error": "paid_required" | "save_limit" | "not_found" | "unauthorized" | "validation" | "admin_required", "message": "…" }
```
