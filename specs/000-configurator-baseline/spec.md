# Product Specification: Configurator Baseline

**Feature Branch**: `000-configurator-baseline` (documentatie; geen implementatie-branch vereist)  
**Created**: 2026-07-17  
**Status**: Current (baseline van de gebouwde SPA)  
**Input**: Audit van de bestaande Vite/React-app vóór accounts/Paid (`001-accounts-paid-publish-social`)

Dit document beschrijft **wat de app vandaag doet**. Entitlements, cloud-save en paywalls horen in `001` — zie ook de footnote in `.specify/memory/constitution.md`.

## Scope

In scope: configurator, 3D-editor, BOM, prijsindicatie, printflows, lokale opslag, leveranciersmenu, presets.

Out of scope (legacy / niet in UI):

- **ProjectQuote / per-leverancier prijsmatrix** (`ProjectQuotePanel`, quote-agents, `PriceMatrixTable`) — code kan nog bestaan, maar is **niet** aan de product-UI gekoppeld. Productpad = ruwe prijsindicatie + handmatig bestellen via leverancierslinks.
- Accounts, cloud library, Paid footprint-gate, publish/social → `001-accounts-paid-publish-social`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurator ontwerp + 3D-voorbeeld (Priority: P1)

Een bezoeker stelt afmetingen, materiaal, omgeving en onderstel in via de configurator. Het 3D-voorbeeld en de stuklijst (BOM) volgen de config. Presets bieden snelle startpunten.

**Why this priority**: Kernproduct zonder account.

**Independent Test**: Kies preset → wijzig breedte/hoogte → preview en BOM updaten.

**Acceptance Scenarios**:

1. **Given** de app, **When** de gebruiker een preset kiest, **Then** config, preview en BOM tonen dat frame.
2. **Given** een config, **When** diameter/materiaal wijzigt, **Then** preview en BOM volgen mee.
3. **Given** configurator-modus, **When** “Openen in 3D-editor”, **Then** de scene uit de config in de editor wordt geladen (met bevestiging als er al een editor-scene is).

---

### User Story 2 - Dimensiemodus en indoor/outdoor (Priority: P1)

Breedte/diepte betekenen óf **buitenmaat** óf **bestelbare buislengte**. Omgeving **buiten** vs **binnen** stuurt het onderstel: voetplaat, grondanker, of voetdoppen (vloerdop).

**Independent Test**: Wissel dimensiemodus → constructie blijft gelijk (velden worden omgerekend). Wissel naar binnen → alleen voetdoppen.

**Acceptance Scenarios**:

1. **Given** buitenmaat-modus, **When** gebruiker naar buislengte schakelt, **Then** width/depth worden omgerekend zodat de constructie gelijk blijft.
2. **Given** omgeving buiten, **When** voetplaat of grondanker gekozen, **Then** preview/BOM/print reflecteren dat onderstel (grondanker: diepte onder maaiveld).
3. **Given** omgeving binnen, **When** config actief is, **Then** `baseType` is `vloerdop` (rubberen voetdoppen; geen gaten in plattegrond).

---

### User Story 3 - 3D-editor: scene bewerken, planken, undo (Priority: P1)

In de editor past de gebruiker buizen/koppelingen aan, plaatst planken/platen op vlakken xz/xy/yz, en zet **schapsteunen handmatig** (toggle per kandidaat-buis). Undo/redo herstelt scene+config-snapshots (max. 50 stappen). BOM komt uit de scene.

**Independent Test**: Teken/verplaats buis → undo → vorige staat. Plaats plank + schapsteun → BOM toont hout + hardware.

**Acceptance Scenarios**:

1. **Given** editor, **When** een betekenisvolle mutatie, **Then** undo herstelt de vorige snapshot; redo herstelt vooruit.
2. **Given** een plank, **When** gebruiker schapsteunen togglet, **Then** mounts persistent op de scene en zichtbaar in BOM/instructie.
3. **Given** editor, **When** BOM-regel aangeklikt, **Then** bijbehorende onderdelen in 3D gemarkeerd (highlight).

---

### User Story 4 - Stuklijst, prijsindicatie, print (Priority: P1)

De sidebar toont stuklijst + ruwe prijsindicatie (bereik + disclaimer). Print: stuklijst, plattegrond (SVG only), bouwinstructie. Bestellen via header-menu Leveranciers (externe webshops).

**Independent Test**: Print stuklijst opent printvenster; plattegrond heeft SVG zonder maattabellen; bouwinstructie bevat stappen (+ bij grondanker gatentabel) en **embedt** de plattegrond-SVG.

**Acceptance Scenarios**:

1. **Given** BOM, **When** prijsindicatie zichtbaar, **Then** circa low–high incl. btw + prijsklasse + disclaimer (geen offerte; geen leveranciers-prijslijst in UI).
2. **Given** scene beschikbaar, **When** “Plattegrond printen”, **Then** alleen tekening + korte meta/legenda (geen uitzet-/gatentabellen).
3. **Given** scene + BOM, **When** “Bouwinstructie printen”, **Then** bouwstappen + onderdelentabellen per stap; plattegrond-SVG is embedded; bij grondanker ook gat-/maattabellen.
4. **Given** header, **When** Leveranciers-menu, **Then** links naar geregistreerde webshops (bestellen doet de gebruiker zelf).

---

### User Story 5 - Opslaan als bestand + recent in browser (Priority: P2)

Opslaan downloadt `.steigerbuis.json` en houdt een recente-lijst in **localStorage** (zelfde browser). Openen van schijf importeert een bestand. Geen accountgate in de huidige app.

**Independent Test**: Opslaan → bestand download + item onder “Recent”; herladen browser → recent nog aanwezig; openen van bestand laadt scene.

**Acceptance Scenarios**:

1. **Given** editor met scene, **When** Opslaan met naam, **Then** download start én recent-lijst wordt bijgewerkt.
2. **Given** een `.steigerbuis.json`, **When** Openen van schijf, **Then** model laadt in de editor en verschijnt in recent.
3. **Given** recent-item, **When** verwijderen, **Then** alleen localStorage-entry verdwijnt (bestand op schijf blijft).

---

### Edge Cases

- Oude configs zonder `environment` / `dimensionMode` → genormaliseerd naar buiten + buitenmaat (of binnen als `baseType` al `vloerdop`).
- Oude scenes zonder `planks` / `plankMounts` → lege planken; mounts eenmalig gesynchroniseerd waar nodig.
- Editor-scene overschrijven vanuit configurator vraagt bevestiging als er al een editor-scene is.
- Ongeldig importbestand → foutmelding; geen corrupte recent-entry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: App MUST bieden tabs **Configurator** en **3D Editor** met full-width layout (preview/editor vullen de beschikbare breedte).
- **FR-002**: Configurator MUST ondersteunen: presets, diameter, materiaal, sporten, optioneel dakvlak, dimensiemodus buitenmaat|buislengte, omgeving binnen|buiten, baseType voetplaat|grondanker|vloerdop, ankerdiepte bij grondanker.
- **FR-003**: Configurator-BOM MUST uit `calculateKlimrekBom(config)` komen; editor-BOM MUST uit scene (`calculateBomFromScene`) inclusief planken/hardware/schapsteunen.
- **FR-004**: Editor MUST undo/redo van scene+config ondersteunen (limiet 50).
- **FR-005**: Editor MUST planken/platen op vlakken `xz` | `xy` | `yz` ondersteunen; schapsteunen zijn handmatig (persistent `plankMounts`).
- **FR-006**: UI MUST een prijsindicatie tonen (range + categorie + disclaimer) op interne richtprijzen — géén live leveranciers-prijsmatrix in de product-UI.
- **FR-007**: Print MUST beschikbaar zijn: stuklijst; plattegrond (SVG + legenda, geen uitzettabellen); bouwinstructie (stappen; embedded plattegrond; gatentabellen alleen bij grondanker / in bouwinstructie).
- **FR-008**: Header MUST één **Leveranciers**-menu tonen met externe shop-links.
- **FR-009**: Save MUST bestand downloaden (`.steigerbuis.json`) én recent in localStorage bijhouden; Import MUST bestanden van schijf kunnen laden.
- **FR-010**: Tot `001` landt zijn Save/Import/print footprint/bouwinstructie **niet** entitlement-gated (ungated baseline).

### Key Entities

- **KlimrekConfig**: Afmetingen, diameter, materiaal, environment, dimensionMode, baseType, anchorDepthMm, includeRoof, rungCount.
- **SceneModel**: pipes, fittings, accessories, hingeConnections, planks, plankMounts, materialId.
- **BomResult**: pipes, fittings, planks?, hardware?, totalPipeLengthMm, notes.
- **SavedModel**: id, name, savedAt, scene, config — localStorage + file payload.
- **PriceIndication**: low/high incl. btw, categoryLabel, disclaimer (geen offerte).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nieuwe bezoeker kan in één sessie preset → aanpassen → BOM/prijsindicatie zien zonder account.
- **SC-002**: Dimensiemodus-wisseling houdt de constructie geometrisch gelijk (omgerekende velden).
- **SC-003**: Plattegrond-print bevat geen gaten-/uitzettabellen; die informatie zit (waar relevant) in de bouwinstructie.
- **SC-004**: Opgeslagen `.steigerbuis.json` is heropenbaar in een andere browser via Openen van schijf.
- **SC-005**: Undo in de editor herstelt de vorige scene na een mutatie.

## Assumptions

- Domein/productnaam: Steigerbuis ontwerpen / steigerbuisontwerpen.nl.
- Static Vite SPA; geen backend in deze baseline.
- Na `001`: cloud-save en Paid-gates wijzigen FR-009/FR-010; dit document blijft de **pre-gate** productwaarheid tenzij expliciet geamendeerd.
