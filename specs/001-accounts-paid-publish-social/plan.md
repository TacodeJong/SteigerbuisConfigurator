# Implementation Plan: Accounts, Paid Features, Publish & Social

**Branch**: `001-accounts-paid-publish-social` | **Date**: 2026-07-17 | **Updated**: 2026-07-21 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/001-accounts-paid-publish-social/spec.md`

## Summary

Auth + cloud libraries + **configurable** entitlements via `subscription_plans` (Gratis default, Basis/Extra subscriptions; one-time feature unlocks via Betaalde functies gates/prices, not a plan card), footprint anti-leak, publish/fork, social (favourites/follow), admin beheer (plans/prices/discounts/Mollie mode/**user plan assign**/Betaalde functies tab), account delete + cancel/switch, SEO/legal pages. SPA static on Strato; Supabase EU + Mollie webhooks. Baseline: `specs/000-configurator-baseline/`.

### As-built highlights (2026-07-21)

- Model mutations only via RPCs; `public_profiles`; webhook idempotency.
- Plan cards on signup/upgrade (**no** `export_once` / Betaal-per-keer card); `max_private_models` drives save caps.
- **Split**: Abonnementen = plan features (`open_from_disk`, `publish`, `fork`, …); Betaalde functies = pay-per-use (`full_print`, `copy_order_list`, `bom_print`, `viewport_print`, `download_model`, `full_pdf`) + optional prices; lock icon + greyed UI.
- Grants: `model_feature_grants` per cloud model; `account_feature_grants` only for `download_model` without model id.
- Gallery soft-hide via `gallery_models` when owner loses paid entitlement.
- Admin: `AdminPage` tabs (dashboard, plans, Betaalde functies, discounts, payments/Mollie, features, tutorials).
- Tutorials: `tutorials` table + Storage bucket; public Uitleg page + `AdminTutorialsPanel`; auto or custom thumbnail (`thumbnail_path` / `thumbnail_url`).

## Technical Context

**Language/Version**: TypeScript (existing Vite 8 + React 19 app)  
**Primary Dependencies**: React, Three.js / R3F (existing); Supabase JS client (auth + Postgres + RLS); Mollie (preferred) or Stripe for subscriptions  
**Storage**: Supabase Postgres (EU region); model scene/config as JSONB; cloud library canonical after login; file download + localStorage-recent secondary (not a guest bypass)  
**Testing**: Existing oxlint + Vitest-style unit tests where present; add integration tests around entitlement gates (incl. bouwinstructie footprint strip)  
**Target Platform**: Modern browsers; static hosting on Strato PowerWeb; backend SaaS EU  
**Project Type**: Web SPA + managed BaaS  
**Performance Goals**: Library/gallery lists usable under 2s on typical NL broadband; 3D editor performance unchanged  
**Constraints**: No secrets in frontend; Paid checks server-enforced; GDPR/EU residency preference; no PDF/build-pack; no ProjectQuote UI revival  
**Scale/Scope**: Early audience (hundreds–low thousands of users); single Paid plan; chronological gallery

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status |
|------|--------|
| I. Design Before Paywall — guests keep design/BOM | PASS (spec FR-001, SC-006) |
| II. Own Your Copy — forks only | PASS (FR-010/011) |
| III. EU-First data & payments | PASS (Supabase EU + Mollie/Stripe NL in plan) |
| IV. Static site + managed backend | PASS (Strato static + Supabase) |
| V. Simplicity & Dutch clarity | PASS (DB plans + Dutch UI; Extra optional/inactive) |
| No PDF/build-pack | PASS (FR-016) |

## Project Structure

### Documentation (this feature)

```text
specs/001-accounts-paid-publish-social/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api.md
│   └── entitlements.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── components/          # existing UI + new Auth, Gallery, Paywall, Social
├── lib/
│   ├── modelStorage.ts  # gate + migrate toward cloud API
│   ├── auth/            # session helpers
│   ├── models/          # cloud CRUD, publish, fork
│   ├── social/          # favourites, follows
│   └── billing/         # checkout + entitlement client
├── hooks/
└── ...

supabase/
  migrations/            # plans, admin, RLS RPCs, delete, Mollie idempotency, …
  functions/
    create-checkout/
    mollie-webhook/
    cancel-subscription/
    delete-account/
    _shared/mollieApiKey.ts
```

**Structure Decision**: Extend the existing single SPA; `supabase/` for schema + edge functions. No separate Node server on Strato.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Managed BaaS + payment provider | Accounts, RLS, entitlements, webhooks | Pure localStorage cannot sync devices, publish, or enforce Paid |
| Edge function for payment webhooks | Authoritative Paid status | Client-only “Paid” flag is forgeable |
