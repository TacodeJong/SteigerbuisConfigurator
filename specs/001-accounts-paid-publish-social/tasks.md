# Tasks: Accounts, Paid Features, Publish & Social

**Input**: Design documents from `/specs/001-accounts-paid-publish-social/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Optional gate tests recommended for entitlements; not mandatory unit suite for every UI widget.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Spec Kit already initialized; wire project scaffolding for backend.

- [x] T001 Create `supabase/migrations/` and initial project config files
- [x] T002 [P] Add Supabase client dependency and `src/lib/auth/supabaseClient.ts`
- [x] T003 [P] Extend `.env.example` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, billing placeholders (no secrets committed)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, RLS, auth session, entitlement helper — blocks all stories

- [x] T004 Create migration for `profiles`, `models`, `favourites`, `follows` per `data-model.md`
- [x] T005 [P] RLS policies: owner CRUD, public read for published models, social self-manage
- [x] T006 [P] Trigger/RPC: auto-create `profiles` row on signup
- [x] T007 Implement `src/lib/auth/session.ts` (subscribe to auth state, expose user + profile)
- [x] T008 Implement `src/lib/billing/entitlements.ts` reading `is_paid` / `paid_until` (client mirror only)
- [x] T009 Add Auth UI shell: login/register/logout modal components under `src/components/auth/`
- [x] T010 Wire auth entry in `App.tsx` (account button / gate host)

**Checkpoint**: Can register/login against Supabase; empty library queries work with RLS. *(Local stub works without Supabase.)*

---

## Phase 3: User Story 1 - Account + cloud save/import (Priority: P1) 🎯 MVP

**Goal**: Login required for save/import; cloud library with free limit

**Independent Test**: Register → save → reopen after re-login; guest Save gated

- [x] T011 [US1] Implement `src/lib/models/cloudModels.ts` (list/save/update/delete + free limit error)
- [x] T012 [US1] RPC or server check enforcing free private model limit (default 3)
- [x] T013 [US1] Gate Save/Import in model UI (`ModelStorePanel` / storage callers) to require session
- [x] T014 [US1] Cloud library list UI for logged-in users
- [x] T015 [US1] Import `.steigerbuis.json` into cloud library when authenticated
- [x] T016 [US1] Optional: one-time migrate localStorage models after first login
- [x] T017 [US1] Dutch copy for login gate and save-limit upgrade tease

**Checkpoint**: US1 independently demoable

---

## Phase 4: User Story 2 - Paid + footprint gate (Priority: P1)

**Goal**: Checkout → entitlement; footprint locked unless Paid; unlimited saves when Paid

**Independent Test**: Free blocked on footprint; Paid succeeds; >3 saves when Paid

- [x] T018 [US2] Edge function `supabase/functions/mollie-webhook` (or stripe) updating `profiles.is_paid` / `paid_until`
- [x] T019 [US2] `POST` checkout helper `src/lib/billing/checkout.ts` returning payment URL
- [x] T020 [US2] Upgrade / pricing UI (Dutch) for Paid plan
- [x] T021 [US2] Wrap footprint/floorplan actions in `BomList` (and any other entry) with Paid gate + preview
- [x] T021b [US2] Gate bouwinstructie against footprint-leak: strip embedded plattegrond/hole tables for non-Paid **or** lock full bouwinstructie to Paid (FR-007b)
- [x] T022 [US2] Ensure save-limit bypass when `is_paid`
- [x] T023 [US2] Fail-closed behavior when Paid expires

**Checkpoint**: US2 independently demoable with test payments *(local stub: demo Paid-toggle)*

---

## Phase 5: User Story 3 - Publish gallery (Priority: P2)

**Goal**: Paid publish/unpublish; public view of published models

**Independent Test**: Publish → guest views → unpublish hides from gallery

- [x] T024 [US3] RPC `publish_model` / `unpublish_model` requiring Paid + ownership
- [x] T025 [US3] Gallery list page/section `src/components/gallery/`
- [x] T026 [US3] Public model view route/state (load by id, read-only editor/preview)
- [x] T027 [US3] Attribution display (`display_name`)
- [x] T028 [US3] Share link support (URL with model id)

**Checkpoint**: US3 independently demoable

---

## Phase 6: User Story 4 - Fork for yourself (Priority: P2)

**Goal**: Paid-only fork into private library with attribution

**Independent Test**: Fork editable; original unchanged

- [x] T029 [US4] RPC `fork_model` requiring Paid; sets `forked_from_id` + `attribution_name`
- [x] T030 [US4] “Bewerken voor jezelf” CTA on published view with guest/free upgrade paths
- [x] T031 [US4] Open fork in editor as owned private model
- [x] T032 [US4] Show “Gebaseerd op …” in library/detail UI

**Checkpoint**: US4 independently demoable

---

## Phase 7: User Story 5 - Favourites & follow (Priority: P3)

**Goal**: Favourite models; follow users; lists/feed

**Independent Test**: Free user favourites + follows; lists update; guest gated

- [x] T033 [US5] Favourites API helpers + UI toggle on published models
- [x] T034 [US5] Favourites list view
- [x] T035 [US5] Follow/unfollow on public profile + following list
- [x] T036 [US5] Following feed (new publishes from followees)
- [x] T037 [US5] Guest prompts to register on favourite/follow

**Checkpoint**: US5 independently demoable

---

## Phase 8: Polish & Cross-Cutting

- [x] T038 [P] Document env + Strato deploy notes in `README.md` (accounts section)
- [x] T039 Entitlement fail-closed audit against `contracts/entitlements.md`
- [ ] T040 Run `quickstart.md` smoke checklist *(requires live Supabase + Mollie for full path; local stub covers UI)*
- [x] T041 Hide/remove any production cart-fill affordances already gated in DEV if still confusing
- [x] T042 Admin handmatige plan-toewijzing: RPC + audit + Beheer-tab Gebruikers

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 (blocks all stories) → US1 → US2 → US3 → US4 → US5 → Polish
- US3 before US4 (fork needs publish/view)
- US5 can start after US3 (needs published models) in parallel with US4 if needed

## Implementation Strategy

1. Deliver **US1** as first production slice (accounts + cloud save).
2. Deliver **US2** next (monetization + footprint).
3. Then gallery (**US3**), fork (**US4**), social (**US5**).

## Notes

- Free limit default 3 — keep as named constant.
- No PDF/build-pack tasks.
- Dutch UI for gates and social.
- Local stub (`localStubStore`) when `VITE_SUPABASE_*` empty — for UI/QA without backend.
