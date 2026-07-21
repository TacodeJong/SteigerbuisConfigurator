# Standaardweergaven koppelingen (BOM / PDF)

Stuklijst en volledige PDF tonen JPEG-thumbs van koppelingen. Die komen bij voorkeur uit een **vaste catalogus** (geen live WebGL per rij), met fallback naar R3F-capture als een bestand ontbreekt.

## Opslag

| Locatie | Pad | Rol |
|--------|-----|-----|
| App (`public/`) | `/fittings/v1/{FittingType}--{MaterialId}.jpg` | Primair — meegeladen in de build, snel en offline |
| Supabase Storage | bucket `fitting-previews`, zelfde objectpaden | Backend-spiegel (public read); admin/service-role write |

Bestandsnaamvoorbeeld: `t-kort--staal.jpg`, `kniestuk-90--groen-outdoor.jpg`.

- **Versie:** `v1` (zie `FITTING_PREVIEW_ASSET_VERSION` in `src/lib/fittingPreviewAssets.ts`). Verhoog bij camera- of mesh-wijzigingen en regenereer.
- **Diameter:** catalogus gebruikt vaste Ø **33,7 mm** (`FITTING_PREVIEW_STANDARD_DIAMETER`). Vorm herkenning; diameter-varianten delen dezelfde thumb.
- **Lookup-volgorde:** `/fittings/…` → Storage public URL (als Supabase geconfigureerd) → live R3F capture.

## Regenereren

```bash
# Eenmalig: Playwright Chromium
npx playwright install chromium

# Schrijft public/fittings/v1/*.jpg + manifest.json
npm run generate-fitting-previews

# Optioneel: sync naar Storage (service role — niet committen)
# SUPABASE_SERVICE_ROLE_KEY=… in .env of omgeving
npm run generate-fitting-previews -- --upload
```

Het script start zonodig Vite, opent `/?view=fitting-preview-gen`, vangt alle FittingType × MaterialId-combinaties af, en schrijft JPEG’s.

Na camera/mesh-wijzigingen: regenereren, committen van `public/fittings/v1/`, en bij gebruik van Storage opnieuw `--upload`. Bucket aanmaken: `npx supabase db push` (migratie `fitting_previews_bucket`).

## Runtime

- `BomFittingThumb` — Stuklijst-UI
- `captureFittingThumbsForPrint` — Stuklijst-print en Volledige PDF

Popover (tik op thumb) blijft live 3D met orbit.
