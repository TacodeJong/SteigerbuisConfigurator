# Plan / README: Configurator Baseline

**Branch**: `000-configurator-baseline` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

## Summary

Documentatie-only baseline van de **huidige** Steigerbuis-configurator/editor. Geen implementatietaken. Actieve feature voor accounts/Paid blijft `001-accounts-paid-publish-social` (zie `.specify/feature.json`).

## Relationship to 001

| Onderwerp | Baseline (nu) | Na 001 (gepland) |
|-----------|---------------|------------------|
| Save | Bestand + localStorage-recent, ungated | Cloud library gated; file/recent mag secundair blijven |
| Plattegrond | Ungated full SVG print | Paid full; Guest/Free preview/locked |
| Bouwinstructie | Ungated; **embedt** plattegrond (+ gatentabellen bij grondanker) | Mag Paid-footprint niet lekken — zie `001` research/entitlements |
| Prijs | Prijsindicatie (range) | Ongewijzigd productpad; ProjectQuote blijft out-of-scope |
| Design/BOM | Volledig voor iedereen | Blijft (Design Before Paywall) |

## Technical context (as-built)

**Language/Version**: TypeScript, Vite + React  
**Key modules**: `App.tsx`, `ConfiguratorForm`, `SceneEditor`, `BomList`, `lib/bom.ts`, `lib/bomFromScene.ts`, `lib/buildPrint.ts`, `lib/priceIndication.ts`, `lib/modelStorage.ts`, `lib/environment.ts`, `lib/dimensions.ts`, `lib/planks.ts`, `hooks/useEditorHistory.ts`, `SuppliersMenu`  
**Storage**: localStorage (`steigerbuis.savedModels.v1`) + `.steigerbuis.json` download  
**Testing**: Bestaande unit tests waar aanwezig; geen aparte baseline-testsuite vereist

## Constitution check

Baseline volgt principe I voor design/BOM/prijsindicatie. Print footprint + embedded footprint in bouwinstructie zijn **nog niet** Paid-gated — bewust ungated tot 001; zie constitution-footnote.
