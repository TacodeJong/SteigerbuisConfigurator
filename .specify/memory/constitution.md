# Steigerbuisontwerpen Constitution

## Core Principles

### I. Design Before Paywall
Guests MUST be able to use the full 3D configurator, price indication, and simple BOM (including simple BOM print) without an account.
Login and payment gates apply only at clear value moments: cloud save/import, footprint/floorplan (and any print that would leak the same), publish, and editing a published model for yourself.

### II. Own Your Copy
Published models are never edited in place by others. Remixing ALWAYS creates a fork owned by the remixed-into account. Attribution to the original publisher MUST be preserved on forks.

### III. EU-First Data & Payments
Prefer European (or EU-region) services for auth, storage, and payments. Personal data and payment processing MUST stay GDPR-aligned. Secrets and shop credentials MUST NOT ship in the frontend bundle.

### IV. Static Site + Managed Backend
The public site remains a static Vite build (e.g. Strato). Backend capabilities (auth, models, billing, social) use a managed BaaS/API — no custom long-running app server on shared hosting unless clearly justified.

### V. Simplicity & Dutch Clarity
Ship the smallest feature that delivers the agreed tier value. UI copy for account, gallery, and paywalls SHOULD be Dutch-first and unambiguous. Prefer one clear CTA over nested upsell flows.

## Product Tiers (binding)

| Capability | Guest | Free account | Paid |
|------------|-------|--------------|------|
| Design + 3D | ✓ | ✓ | ✓ |
| Price indication | ✓ | ✓ | ✓ |
| Simple BOM (view + print) | ✓ | ✓ | ✓ |
| Bouwinstructie zonder footprint-lek¹ | ✓ / limited | ✓ / limited | ✓ full |
| Save / import / private library | — | ✓ (limited, e.g. 3) | Unlimited |
| Favourites | — | ✓ | ✓ |
| Follow users + follow feed | — | ✓ | ✓ |
| Browse / open published models (view) | ✓ | ✓ | ✓ |
| Publish models | — | — | ✓ |
| Edit published model for yourself (fork) | — | — | ✓ |
| Plattegrond / footprint (full print/export) | — | Preview / locked | ✓ |

¹ **Bouwinstructie vs footprint**: Full bouwinstructie that embeds the plattegrond SVG and/or hole/uitzet tables is **Paid** (same value as footprint). Non-Paid MAY receive build steps + parts lists **without** that embedded footprint payload, or the whole bouwinstructie entry is locked — see `specs/001-accounts-paid-publish-social/contracts/entitlements.md`. Never ship a path where Guest/Free gets the same floorplan data via “Bouwinstructie” that Paid gets via “Plattegrond”.

There is **no** PDF/build-pack product in scope unless a future spec adds it. Per-supplier live quote matrices (`ProjectQuote`) are **not** a product tier capability.

### Footnote: current SPA (pre-001)

Until `001-accounts-paid-publish-social` ships, the live app is **ungated**: file download + localStorage recent save, and full plattegrond / bouwinstructie print, are available without login or Paid. Product behavior of that baseline is documented in `specs/000-configurator-baseline/`. The tier table above is the **target** after 001; do not treat ungated print/save as a permanent constitution exception.

## Security & Privacy

- Authentication required for any write to cloud libraries, favourites, follows, or publishes.
- Row-level ownership: users may only mutate their own private models and social edges.
- Published content is readable by anyone with the link/gallery; unpublish MUST stop new discovery; existing forks remain.
- Payment state is authoritative on the server; client UI is advisory only.

## Development Workflow

- Spec Kit artifacts under `specs/` are the source of truth for this feature set before implementation.
- Baseline product truth: `specs/000-configurator-baseline/`. Active implementation feature: `specs/001-accounts-paid-publish-social/` (tracked in `.specify/feature.json`).
- Prefer incremental delivery by user-story priority (P1 → …).
- Do not expand scope into cart-fill/supplier login automation for production.

## Governance

This constitution supersedes ad-hoc feature ideas that conflict with the tier table or Design-Before-Paywall.
Amendments require updating this file and the active feature `spec.md`.

**Version**: 1.1.0 | **Ratified**: 2026-07-17 | **Last Amended**: 2026-07-17
