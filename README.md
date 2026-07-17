# Steigerbuis configurator

Webapp om een tuin-klimrek samen te stellen met steigerbuizen en buiskoppelingen. Configureer afmetingen, bekijk het resultaat in 3D en exporteer stuklijst, plattegrond en bouwinstructie.

## Vereisten

- [Node.js](https://nodejs.org/) (LTS aanbevolen)
- npm (meestal meegeleverd met Node.js)

## Installatie

```bash
npm install
```

Kopieer optioneel `.env.example` naar `.env` als je de winkelwagen van Steigerbuisgroothandel wilt vullen (alleen tijdens lokale ontwikkeling):

```bash
cp .env.example .env
```

Vul daarna `STEIGERBUISGROOTHANDEL_EMAIL` en `STEIGERBUISGROOTHANDEL_PASSWORD` in.

## Development server starten

Start de app met:

```bash
npm run dev
```

Open daarna in je browser:

**http://localhost:5173**

De dev server draait met hot reload. API-routes en de shop-proxy voor Steigerbuisgroothandel werken alleen via `npm run dev` (niet in een statische productie-build).

Server stoppen: `Ctrl+C` in de terminal.

## Overige commando's

| Commando | Beschrijving |
|----------|--------------|
| `npm run build` | Productie-build naar `dist/` |
| `npm run preview` | Lokaal preview van de productie-build |
| `npm run lint` | Linting |
| `npm run fetch-prices` | Leveranciersprijzen ophalen |
| `npm run fetch-catalog` | Productcatalogus ophalen |
