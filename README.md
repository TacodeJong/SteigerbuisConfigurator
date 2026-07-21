# Steigerbuisontwerpen

Webapp om steigerbuisconstructies te ontwerpen (frames, rekken, meubels en meer). Stel afmetingen in, bekijk het resultaat in 3D, en exporteer stuklijst, plattegrond en bouwinstructie. Optioneel: account, cloud-bibliotheek, galerij en betaalde exports.

Live: **https://steigerbuisontwerpen.nl**

## Vereisten

- [Node.js](https://nodejs.org/) (LTS)
- npm

## Lokaal draaien

```bash
npm install
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**

Zonder Supabase-keys in `.env` werkt de app in lokale demo-modus. Voor echte accounts en betalingen: zie [docs/SETUP-SUPABASE-MOLLIE.md](docs/SETUP-SUPABASE-MOLLIE.md).

## Productie-build

```bash
npm run build
```

Upload de inhoud van `dist/` naar je static host (bijv. Strato). Bouw met de gewenste `VITE_*` waarden in `.env`.
