# Research: Accounts, Paid, Publish & Social

**Feature**: `001-accounts-paid-publish-social`  
**Date**: 2026-07-17

## Decision 1: Auth + database

**Choice**: Supabase (EU region) — Auth (email/password + magic link) + Postgres + RLS.

**Rationale**: Fits static SPA; row-level security maps cleanly to private models; EU region supports constitution III.

**Alternatives considered**:
- Clerk + separate DB — more moving parts for MVP.
- Custom auth on Strato PHP — high effort, weak fit for SPA JSON models.
- Firebase — US-centric by default; weaker EU story.

## Decision 2: Payments

**Choice**: Mollie with iDEAL. **Single Paid plan: €7 / maand** (MVP). Checkout creates a one-shot payment; webhook sets `is_paid` and extends `paid_until` by 1 month (renewals stack). True Mollie Subscriptions can replace this later without changing entitlements.

**Rationale**: Spec assumes monthly and/or yearly; planning range was €5–9/month. €7 is the locked go-live amount. Dutch users expect iDEAL; Mollie is NL/EU-native.

**Entitlement model**: `profiles.is_paid` + `paid_until` updated only by verified webhook; client reads via authenticated API.

**Config**: Edge default / secret `MOLLIE_PAYMENT_AMOUNT=7.00`; UI `VITE_PAID_PLAN_PRICE_HINT` must match.

## Decision 3: Cloud save vs file + browser-recent

**Choice**: Cloud library is canonical for logged-in users. Guest Save/Import prompts login. **Baseline behavior to preserve as secondary**: Opslaan downloads `.steigerbuis.json` and upserts localStorage recent (`modelStorage.saveModel`). After gate: logged-in users may still export file / keep browser-recent; guests cannot use those entry points to skip login. Optional one-time migration: offer to upload existing localStorage models after first login.

**Rationale**: Spec FR-018; matches current UX value (portable file) without dual *authoritative* sources of truth.

## Decision 4: Publish & fork

**Choice**: `visibility` on `models` (`private`|`published`). Fork = INSERT new row with `forked_from_id` + attribution snapshot fields.

**Rationale**: Constitution II; simple queries for gallery.

## Decision 5: Social

**Choice**: `favourites(user_id, model_id)` and `follows(follower_id, followee_id)` with unique constraints.

**Rationale**: Minimal edges; free for all logged-in users per spec.

## Decision 6: Footprint gate + bouwinstructie (anti-leak)

**Choice**: Keep existing `printFloorplan` / `printBuildInstructions`; wrap UI with entitlement checks. Standalone plattegrond = Paid (preview/locked for others). **Bouwinstructie embeds the same floorplan SVG** (and hole tables for grondanker) today — that is a Paid footprint leak if left ungated. Policy (preferred): for non-Paid, strip embedded plattegrond + hole/uitzet tables from bouwinstructie (keep build steps + parts), **or** lock the whole bouwinstructie behind Paid. Paid users keep today’s full bouwinstructie. Never ship a client-only bypass flag.

**Rationale**: Constitution tier table + SC-002; Paid is access control, not a new renderer.

## Decision 7: Pricing UI

**Choice**: Product path remains **price indication** (`PriceIndicationPanel` / `priceIndication.ts`). Legacy `ProjectQuotePanel` + supplier quote matrix is **out of scope / UI-removed** — do not reintroduce under 001.

**Rationale**: Aligns with baseline `000`; avoids secrets/fragile scrapers in the guest path; constitution “no cart-fill automation”.

## Open items (non-blocking for tasks)

- Yearly plan (€29–49 range) — deferred; monthly €7 is live.
- Display-name rules and abuse reporting workflow — minimal MVP admin flag sufficient.
- Whether free publish is ever allowed — constitution says Paid-only; stick to that.
- Exact non-Paid bouwinstructie UX: steps-only vs fully locked — pick one in implementation; both satisfy FR-007b.
