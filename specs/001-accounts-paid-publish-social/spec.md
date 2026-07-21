# Feature Specification: Accounts, Paid Features, Publish & Social

**Feature Branch**: `001-accounts-paid-publish-social`  
**Created**: 2026-07-17  
**Updated**: 2026-07-21  
**Status**: Implemented (as-built sync)  
**Input**: User description: "Accounts; save/import only when logged in; paid footprint; publish models; paid users can fork/edit published models for themselves; follow users; favourites list. No PDF/build pack. Domain: steigerbuisontwerpen.nl."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create account and cloud-save models (Priority: P1)

A visitor designs freely as a guest. **Baseline today** (`000`): Save downloads `.steigerbuis.json` and keeps a “recent” list in localStorage (ungated). **After this feature**: Save/Import require login; the cloud library is canonical. File download and browser-recent MAY remain as secondary helpers for logged-in users, but MUST NOT bypass the login gate for guests.

**Why this priority**: Without accounts and cloud persistence, no paid or social features can attach to a user. This is the foundation and the first conversion step.

**Independent Test**: Register → save a model → log out → log in on another browser → model appears. Guest Save shows login gate and does not write to cloud.

**Acceptance Scenarios**:

1. **Given** a guest with an unsaved design, **When** they click Save, **Then** they see a login/register prompt and the design is not discarded until they cancel or succeed.
2. **Given** a logged-in free user under the save limit, **When** they save with a name, **Then** the model appears in their private cloud library with timestamp (optional: also file download / local recent).
3. **Given** a logged-in free user at the save limit, **When** they try to save another model, **Then** they are blocked with a clear upgrade message.
4. **Given** a logged-in user, **When** they import a valid `.steigerbuis.json`, **Then** it is added to their cloud library (respecting limits).
5. **Given** a guest, **When** they open Import, **Then** they are prompted to log in first.

---

### User Story 2 - Plans unlock footprint and cloud library (Priority: P1)

A free user can design and print a **simple BOM**. Standalone **plattegrond/footprint** print is locked with a preview tease. **Bouwinstructie** MUST NOT leak footprint to Guest/Free. Full print unlocks via a **subscription with `full_print`**, a **per-model feature unlock** (Betaalde functies / pay-per-use), or a legacy account-wide **`export_pack`**.

**Subscription plan features** (`subscription_plans.features`, Beheer → Abonnementen): `cloud_save`, `open_from_disk`, `publish`, `fork`, `full_print`, `copy_order_list`, `download_model`, `unlimited_saves`, plus `max_private_models` (null = unlimited). These are **not** toggled on Betaalde functies.

**Pay-per-use gates** (`app_settings.feature_gates`, Beheer → Betaalde functies): `full_print`, `copy_order_list`, `bom_print`, `download_model`. Gate on → subscription covering the feature **or** durable grant **or** (print/copy) `export_pack`.

Default plan is **Gratis** (`kind=free`, `is_default`).

**Why this priority**: Footprint is the paid value tied to real-world building; plan-aware cloud limits reinforce conversion.

**Independent Test**: Free user sees locked footprint CTA; after feature unlock / entitled subscription / `export_pack`, full print works; private saves respect plan `max_private_models`; Openen van schijf / publiceren require plan features (abonnement CTA, not pay-per-use).

**Acceptance Scenarios**:

1. **Given** a free (or guest) user viewing BOM actions, **When** they choose Plattegrond/footprint, **Then** they see a locked/preview state (slotje) and an upgrade/pay-per-use path.
2. **Given** a user with `full_print` (Paid monthly or export pack), **When** they print/export footprint, **Then** the full floorplan SVG is produced.
3. **Given** a non-entitled user, **When** they open Bouwinstructie, **Then** they do **not** receive embedded plattegrond SVG or hole/uitzet tables; entitled users get full output.
4. **Given** a user under their plan’s `max_private_models`, **When** they save, **Then** it succeeds; at/over the cap, save is blocked with upgrade CTA.
5. **Given** entitlement expires or is cancelled (after grace/`paid_until`), **When** they try footprint or full bouwinstructie again, **Then** it is locked/stripped; existing private models remain readable.
6. **Given** a free logged-in user, **When** they open Openen van schijf or Publiceren, **Then** controls are greyed with a lock icon and an **abonnement** CTA (not a pay-per-use unlock).

---

### User Story 3 - Publish models to a public gallery (Priority: P2)

A Paid user can publish a saved model so others can discover and open it (view-only). They can unpublish later. Published models show attribution (display name / profile).

**Why this priority**: Publishing creates the content pool that social and remix features need; requires Paid so spam and value align.

**Independent Test**: Paid user publishes → guest opens public URL/gallery entry and views 3D + BOM; owner unpublishes → new discovery stops.

**Acceptance Scenarios**:

1. **Given** a Paid user with a private saved model, **When** they publish it, **Then** it appears in the public gallery/share link with their attribution.
2. **Given** a guest, **When** they open a published model, **Then** they can view design, prices, and simple BOM without editing the original.
3. **Given** the publisher, **When** they unpublish, **Then** the model leaves public discovery; prior forks (if any) remain with their owners.
4. **Given** a free user, **When** they try to publish, **Then** they are offered Paid upgrade.

---

### User Story 4 - Fork a published model into your own Paid library (Priority: P2)

Anyone can view a published model. Choosing “Bewerken voor jezelf” creates a private copy in the user’s library. That action requires a Paid account. The fork stores a reference to the source and shows “Gebaseerd op …” attribution. The publisher’s original is never mutated.

**Why this priority**: Core monetization moment after inspiration; enforces Own-Your-Copy principle.

**Independent Test**: Guest/free see upgrade on “Bewerken voor jezelf”; Paid user gets an editable private copy; editing the copy does not change the published original.

**Acceptance Scenarios**:

1. **Given** a guest viewing a published model, **When** they choose “Bewerken voor jezelf”, **Then** they are prompted to log in and upgrade to Paid.
2. **Given** a free logged-in user, **When** they choose “Bewerken voor jezelf”, **Then** they are prompted to upgrade to Paid (no fork created yet).
3. **Given** a Paid user, **When** they fork, **Then** a new private model appears in their library linked to the source, and they can edit it.
4. **Given** a fork, **When** the original is unpublished or deleted by the publisher, **Then** the fork remains usable for the fork owner.

---

### User Story 5 - Favourites and follow users (Priority: P3)

Logged-in users (free or Paid) can favourite published models and follow other users. They can open a favourites list and a simple feed/list of new publishes from people they follow.

**Why this priority**: Drives retention and gives publishers an audience; intentionally free so social graph grows before Paid conversion.

**Independent Test**: Free user favourites a model and follows a publisher; favourites list and follow feed show expected items; unfollow/unfavourite works.

**Acceptance Scenarios**:

1. **Given** a logged-in user viewing a published model, **When** they favourite it, **Then** it appears in their favourites list.
2. **Given** a logged-in user on a public profile, **When** they follow that user, **Then** that user’s new publishes appear in the follower’s follow feed.
3. **Given** a guest, **When** they try to favourite or follow, **Then** they are prompted to create an account.
4. **Given** a user, **When** they unfavourite or unfollow, **Then** the item is removed from the respective list/feed.

---

### Edge Cases

- What happens when a free user hits the save limit mid-session? Block save with upgrade CTA; do not silently overwrite.
- How does the system handle invalid or old `.steigerbuis.json` imports? Reject with a clear error; do not create a corrupt library entry.
- What if payment succeeds but entitlement sync is delayed? Show a short “activating…” state; server remains source of truth.
- What if two users favourite the same model? Independent edges; no conflict.
- What if a publisher deletes their account? Unpublished/orphan public models are removed from gallery; forks keep attribution as “onbekende ontwerper” or retained display name snapshot.
- Concurrent publish/unpublish: last write wins; gallery reflects server state on refresh.
- Paid → free (expired `paid_until`, cancel at period end, immediate cancel, admin-forced plan): published models leave gallery via entitlement gate; DB publish metadata stays; upgrade restores gallery. Existing “Bewerken voor jezelf” copies are unaffected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow guests to use configurator, price indication, and simple BOM (view + print) without authentication.
- **FR-002**: System MUST require authentication for cloud save, cloud import, favourites, and follows.
- **FR-003**: System MUST support account registration and login (email-based at minimum).
- **FR-004**: System MUST store private models in a cloud library owned by the authenticated user.
- **FR-005**: Private cloud save limits MUST come from `subscription_plans.max_private_models` (null = unlimited; default Gratis = 3). Enforced in `save_model` RPC.
- **FR-006**: Plans with unlimited cloud (`max_private_models` null + cloud features) MUST allow unlimited private saves; other plans MAY cap.
- **FR-007**: System MUST gate full footprint/floorplan print/export to `full_print` entitlement (active subscription covering the feature **or** account-wide `export_once` / export pack **or** durable `model_feature_grants` for that user+model+feature); free/guest MAY see locked/preview. Admin MAY disable the gate via `app_settings.feature_gates.full_print`.
- **FR-007b**: Bouwinstructie MUST NOT leak footprint: non-entitled MUST NOT receive embedded plattegrond SVG or hole/uitzet tables.
- **FR-007c**: System MUST gate **Bestellijst kopiëren naar klembord** to `copy_order_list` when `feature_gates.copy_order_list` is on (default on). Access = active subscription covering the feature **OR** durable model grant **OR** account-wide export pack. Stuklijst print MAY be gated via `feature_gates.bom_print` (default off).
- **FR-007d**: Admins MUST configure pay-per-use print/copy/download gates via Beheer → **Betaalde functies** (`app_settings.feature_gates` + `feature_prices`; null price → `export_once` fallback). Subscription capabilities (`cloud_save`, `open_from_disk`, `publish`, `fork`, …) MUST be configured on Beheer → **Abonnementen** (`subscription_plans.features`) — NOT as Betaalde-functies account unlocks.
- **FR-007e**: Paying for a gated pay-per-use feature on a specific cloud model MUST create a permanent `model_feature_grants` row (user + model + feature). `download_model` without a model id MAY create an `account_feature_grants` row. Grants MUST remain usable after subscription upgrade **and** later downgrade; subscription-only access MUST end on downgrade. Gallery soft-hide and other subscription gates remain unchanged.
- **FR-007f**: Locked UI for gated actions MUST use a lock icon + greyed control (not a “Betaalde functie” text badge). Subscription-only locks MUST CTA to abonnementen; pay-per-use locks MAY offer one-shot unlock **or** abonnement.
- **FR-007g**: Pay-per-use unlocks and subscription checkout MUST require a logged-in account. Guests MUST see login/register (`AuthModal`) before Mollie/`startCheckout`; `create-checkout` MUST reject unauthenticated requests (401). Applies to all Betaalde-functies gates (`full_print`, `copy_order_list`, `bom_print`, `download_model`, `full_pdf`, …).
- **FR-007h**: System MUST offer **Volledige PDF** from Stuklijst: one print document with (1) live 3D viewport at current camera pose with environment, (2) stuklijst without art.nr. (fitting visuals when available), (3) plattegrond. Gated by `feature_gates.full_pdf` (default on). Access = subscription with `full_pdf` **or** durable model grant. `export_pack` does **not** cover `full_pdf`.
- **FR-008**: System MUST allow only users with plan feature `publish` (via `user_has_plan_feature`) to publish models to a public gallery or share link.
- **FR-009**: System MUST allow anyone to view published models (3D + BOM + prices) without editing the original.
- **FR-010**: System MUST allow users with plan feature `fork` to fork a published model (“Bewerken voor jezelf” / eigen kopie).
- **FR-011**: Forks MUST preserve attribution to the original publisher and MUST NOT mutate the original.
- **FR-012**: Publishers MUST be able to unpublish; discovery MUST stop; existing forks MUST remain.
- **FR-012b**: When a publisher loses paid/publish entitlement (cancel at period end, expiry, immediate cancel, or admin plan change), their models MUST soft-hide from gallery/feed discovery without clearing `visibility`/`published_at`. On re-entitlement they MUST reappear without republishing. Forks owned by others MUST keep working; `forked_from_id` MUST NOT be cascaded or corrupted.
- **FR-013**: Logged-in users MUST be able to favourite published models and manage a favourites list.
- **FR-014**: Logged-in users MUST be able to follow/unfollow other users and see new publishes from followed users.
- **FR-015**: Payment/entitlement status MUST be enforced server-side (RPCs/RLS); client UI mirrors fail-closed.
- **FR-016**: System MUST NOT include a PDF/build-pack product in this feature.
- **FR-017**: UI for gates and social actions SHOULD be Dutch-first.
- **FR-018**: Save/Import entry points MUST require login for cloud persistence. Guests MUST NOT bypass via file download / localStorage-recent alone. **Openen van schijf** additionally requires plan feature `open_from_disk` (or legacy `cloud_save`) while Paid.
- **FR-019**: Legacy **ProjectQuote** / per-leverancier prijsmatrix UI MUST remain unused; price indication is the guest-visible pricing path.
- **FR-020**: System MUST store configurable plans in `subscription_plans` (`kind`: `free` | `subscription` | `one_time`), with exactly one `is_default` (signup/fallback; typically Gratis / slug `free`).
- **FR-021**: Signup and upgrade UI MUST show plan cards (**Gratis + active subscriptions only**). **`export_once` / “Betaal per keer” MUST NOT appear as a selectable plan card** — pay-per-use is per feature/model via Betaalde functies + `feature_prices` (fallback: `export_once` / `price_export_once_cents`). Legacy `profiles.export_pack` MUST still unlock gated print/copy features. Admins MAY keep the `export_once` row for fallback pricing / assignment, but it is hidden from Upgrade/Auth plan pickers.
- **FR-022**: Users MUST be able to cancel subscription (end of period / immediate) with Mollie subscription cancel + local status sync, and switch between switchable subscription plans when entitled.
- **FR-023**: Users MUST be able to delete their account; system MUST write an anonymized row to `deleted_accounts` (audit; no plaintext email).
- **FR-024**: Admins (`profiles.is_admin`) MUST access a beheerpagina for plans, prices, discounts, **manual user plan assignment**, Mollie test/live mode (`app_settings.mollie_mode`), **Betaalde functies** tab, tutorials upload, and deleted-accounts audit. `is_admin` is never client-writable.
- **FR-024b**: Admins MUST be able to assign any `subscription_plans.slug` to a user (by email or profile id) via security-definer RPC. Assignment MUST update entitlements consistently (`subscription_plan_slug`, `is_paid`/`paid_until` for subscriptions, `export_pack` for one_time, clear paid flags for free) without inventing Mollie customer/subscription IDs. UI MUST warn when `mollie_subscription_id` exists that handmatige toewijzing overschrijft lokale entitlements; local Mollie status MAY be marked canceled. Assignments MUST be audited (`admin_plan_assignment_events`).
- **FR-025**: Model writes (save/publish/unpublish/fork) MUST go through security-definer RPCs; direct INSERT/UPDATE on `models` revoked for clients.
- **FR-026**: Non-self profile reads MUST use `public_profiles` (id, display_name, bio only) — no leak of `is_admin` / paid / subscription fields.
- **FR-027**: Mollie webhook MUST be idempotent (processed payment ids / discount redemption tracking).
- **FR-028**: Product MUST expose privacy + terms pages and basic SEO meta (title, description, canonical, Open Graph) for steigerbuisontwerpen.nl.
- **FR-029**: System MUST support instructional **tutorials** (video metadata + Storage bucket `tutorials`): public page lists published items; only admins upload/publish/unpublish/delete. Upload MUST store a **thumbnail** (`thumbnail_path` / `thumbnail_url`): auto-generated from a video frame (~1s) unless the admin supplies JPEG/PNG/WebP. Public and admin UIs MUST show the thumb; delete removes video + thumb.
- **FR-030**: Admin dashboard MUST show visitor analytics (total visits, unique visitors, and timeline chart with 7/30/90 day range filters) from privacy-friendly event tracking without PII. Breakdowns MUST include browser, OS, referrer host (or Direct), optional UTM source/medium/campaign, and coarse location via browser timezone and/or inferred country code — never raw IP.

### Key Entities

- **User (Profile)**: Account identity, display name, optional bio, `is_paid` / `paid_until`, `export_pack`, `subscription_plan_slug`, subscription status/cancel fields, `is_admin`.
- **SubscriptionPlan**: Configurable plan row (slug, kind, price, features, `max_private_models`, `is_default`, `is_active`).
- **Model**: Named design payload, owner, visibility, fork attribution; mutations via RPCs.
- **ModelFeatureGrant**: Durable `(user, model, feature)` unlock after pay-per-use; survives subscription downgrade.
- **AccountFeatureGrant**: Durable account-wide unlock for `download_model` only (when paid without a cloud model id).
- **Favourite** / **Follow**: Social edges.
- **Discount** / **app_settings**: Admin-managed pricing helpers + `mollie_mode` + `feature_gates` / `feature_prices`.
- **DeletedAccount**: Anonymized deletion audit.
- **PageVisit**: Anonymous visit event (`visitor_key`, route/path, timestamp, browser/OS, referrer/UTM, timezone/country_code) used for admin-only analytics.
- **Gallery listing**: Derived view of published models.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can register and save their first model in under 3 minutes.
- **SC-002**: 100% of full footprint exports by non-entitled users are blocked or preview-only — including via bouwinstructie (no footprint-lek).
- **SC-003**: Forking a published model always leaves the original unchanged (verified by reload of public model after fork edits).
- **SC-004**: Free users can complete favourite + follow flows without payment.
- **SC-005**: Feature-gated actions (publish, fork, footprint, full bouwinstructie, cloud saves) succeed for entitled users and fail closed for others; limits follow `max_private_models`.
- **SC-006**: Guests can complete a full design + simple BOM print path with zero account prompts until they hit a gated action.
- **SC-007**: New accounts land on the default (Gratis) plan; signup/upgrade shows plan cards without requiring payment for Gratis.
- **SC-008**: Account delete removes auth user data path and leaves only anonymized `deleted_accounts` audit for admins.

## Assumptions

- Payments via Mollie (iDEAL); mode from `app_settings.mollie_mode` (`test`|`live`) selecting Edge secrets (never store API keys in DB).
- Seed / fallback plan labels (admin can change prices/features):
  - **Gratis** (`free`, default): cloud save capped (default 3), no publish/fork/full_print/open_from_disk.
  - **`export_once`** (one_time, hidden from plan cards): fallback price for feature-gate one-shots; legacy account-wide purchases set `export_pack` (still honored for print/copy).
  - **Basis account** (`paid_monthly`, subscription ~€7/mo): cloud_save + open_from_disk + publish + fork + full_print + copy_order_list + download_model + full_pdf (cap or unlimited per plan row).
  - **Extra account** (`extra_monthly`): optional higher tier; may ship inactive until admin enables.
- Checkout uses Mollie recurring for subscription plans (customer + mandate + subscription); webhook extends entitlement (`is_paid` / `paid_until`) per successful recurring charge and keeps status in sync.
- Pay-per-use checkout (`feature` + optional `model_id`) never unlocks `open_from_disk` / `publish` / `fork` as account grants — those remain subscription plan features.
- Auth/data: Supabase EU; SPA static on Strato (`steigerbuisontwerpen.nl`).
- Moderation minimal; gallery chronological + share links.
- Product baseline: `specs/000-configurator-baseline/`.
