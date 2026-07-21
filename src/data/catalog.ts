import type { FittingCatalogItem, Material, PipeDiameter } from '../types'

export const SHOP_BASE = 'https://www.steigerbuisgroothandel.nl'

export const PIPE_DIAMETERS: { value: PipeDiameter; label: string }[] = [
  { value: 26.9, label: '26,9 mm' },
  { value: 33.7, label: '33,7 mm' },
  { value: 42.4, label: '42,4 mm' },
  { value: 48.3, label: '48,3 mm' },
]

export const MATERIALS: Material[] = [
  {
    id: 'groen-outdoor',
    name: 'Groen outdoor',
    description: 'Poedercoating, geschikt voor tuin en buiten',
    outdoor: true,
    color: '#3d6b4f',
    shopUrl: `${SHOP_BASE}/steigerbuizen/steigerbuizen-groen-outdoor`,
  },
  {
    id: 'zwart-outdoor',
    name: 'Zwart outdoor',
    description: 'Weerbestendig zwart, ideaal voor buiten',
    outdoor: true,
    color: '#1a1a1a',
    shopUrl: `${SHOP_BASE}/steigerbuizen/steigerbuizen-zwart-outdoor`,
  },
  {
    id: 'zwart',
    name: 'Zwart',
    description: 'Mat zwart, voor binnen of beschut buiten',
    outdoor: false,
    color: '#2d2d2d',
    shopUrl: `${SHOP_BASE}/steigerbuizen/steigerbuis-zwart`,
  },
  {
    id: 'staal',
    name: 'Staal gegalvaniseerd',
    description: 'Zinkkleurig, robuust en betaalbaar',
    outdoor: true,
    color: '#a8b4c0',
    shopUrl: `${SHOP_BASE}/steigerbuizen/steigerbuis-staal`,
  },
  {
    id: 'wit',
    name: 'Wit mat',
    description: 'Strakke uitstraling voor binnen',
    outdoor: false,
    color: '#f0f0f0',
    shopUrl: `${SHOP_BASE}/steigerbuizen/steigerbuis-wit`,
  },
  {
    id: 'beige',
    name: 'Beige',
    description: 'Warme kleur, populair voor meubels',
    outdoor: false,
    color: '#c9b89a',
    shopUrl: `${SHOP_BASE}/steigerbuizen/beige`,
  },
  {
    id: 'aluminium',
    name: 'Aluminium',
    description: 'Lichtgewicht en roestvrij',
    outdoor: true,
    color: '#b8c4ce',
    shopUrl: `${SHOP_BASE}/steigerbuizen/aluminium`,
  },
]

export const FITTINGS: FittingCatalogItem[] = [
  {
    type: 't-kort',
    name: 'Kort T-stuk 90°',
    description: 'Haakse T-verbinding; één buis loopt door',
    shopCategory: 'T-stukken',
  },
  {
    type: 't-lang',
    name: 'Lang T-stuk 90°',
    description: 'T-verbinding waar twee buizen in lijn samenkomen',
    shopCategory: 'T-stukken',
  },
  {
    type: 'kniestuk-90',
    name: 'Kniestuk 90°',
    description: 'Hoekverbinding tussen twee buizen',
    shopCategory: 'Kniestukken',
  },
  {
    type: '3-weg-hoek',
    name: 'Hoekstuk (3-weg)',
    description: 'Drie buiseinden in een hoek — staander + 2 liggers (T-128D)',
    shopCategory: 'Kniestukken',
  },
  {
    type: 'drieweg-kniestuk',
    name: 'Drieweg kniestuk',
    description: 'Doorlopende staander + 2 haakse zij-uitgangen (type 20)',
    shopCategory: 'Kniestukken',
  },
  {
    type: 'vierweg-kruisstuk',
    name: 'Vierweg kruisstuk',
    description: 'Doorlopende staander + 4 zij-uitgangen — 6 pijprichtingen (type 40)',
    shopCategory: 'Kruisstukken',
  },
  {
    type: 'vijfweg-kruisstuk',
    name: 'Vijfweg kruisstuk',
    description: 'Doorlopende staander + 3 zij-uitgangen — 5 pijprichtingen',
    shopCategory: 'Kruisstukken',
  },
  {
    type: 'kruisstuk',
    name: 'Kruisstuk / 4-weg',
    description: 'Buizen kruisend in één vlak of 4 richtingen',
    shopCategory: 'Kruisstukken',
  },
  {
    type: 'koppelstuk',
    name: 'Koppelstuk',
    description: 'Verlengt twee buizen in lijn',
    shopCategory: 'Koppelstukken',
  },
  {
    type: 'voetplaat-rond',
    name: 'Voetplaat rond',
    description: 'Bevestigt een staander aan de grond',
    shopCategory: 'Voetplaten',
  },
  {
    type: 'voetplaat-vierkant',
    name: 'Voetplaat vierkant',
    description: 'Stabiele grondbevestiging voor zware constructies',
    shopCategory: 'Voetplaten',
  },
  {
    type: 'afdekdop',
    name: 'Afdekdop',
    description: 'Sluit het uiteinde van een buis af',
    shopCategory: 'Afdekdoppen',
  },
  {
    type: 'voetdop',
    name: 'Voetdop rubber (anti-slip)',
    description: 'Kunststof/rubberen dop op het buiseinde — rek staat binnen los op de vloer',
    shopCategory: 'Afdekdoppen',
  },
  {
    type: 'scharnieroog',
    name: 'Scharnieroog',
    description: 'Oog op frame-buis — vrouwelijk deel van scharnier',
    shopCategory: 'Scharnieren',
  },
  {
    type: 'scharnierhuls',
    name: 'Scharnierhuls',
    description: 'Huls met vork op verbindingsbuis — koppelt met scharnieroog',
    shopCategory: 'Scharnieren',
  },
  {
    type: 'dubbelscharnier-90',
    name: 'Dubbelscharnier 90°',
    description: 'Doorloopklem met twee ogen haaks op elkaar',
    shopCategory: 'Scharnieren',
  },
  {
    type: 'dubbelscharnier-recht',
    name: 'Dubbelscharnier recht',
    description: 'Doorloopklem met twee ogen in elkaars verlengde',
    shopCategory: 'Scharnieren',
  },
]

export const STANDARD_PIPE_LENGTHS_MM = [500, 1000, 1500, 2000, 2500, 3000, 6000]

/** Steigerplank / plaat + bevestiging (houten delen — geen buiskoppelingen). Prijzen excl. btw. */
export const PLANK_CATALOG = {
  plank: {
    name: 'Steigerplank 30 × 195 mm',
    description: 'Geschaafde vuren steigerplank, op maat te zagen',
    pricePerMeterExVat: 5.5,
    shopUrl: `${SHOP_BASE}/steigerplanken`,
  },
  plate: {
    name: 'Houten plaat (multiplex)',
    description: 'Multiplex of vergelijkbare constructieplaat, op maat (typisch 18 mm)',
    /** Richtprijs per m² excl. btw. */
    pricePerSqmExVat: 28,
    shopUrl: `${SHOP_BASE}/steigerplanken`,
  },
  mount: {
    // Catalogus-key `mount` blijft (was "plankdrager"); label is schapsteun.
    name: 'Schapsteun / planksteun',
    description:
      'Kee Klamp-achtige schapsteun: klemhuls op de staander met twee vleugels waarop de plank rust',
    unitPriceExVat: 3.95,
    shopUrl: `${SHOP_BASE}/buiskoppelingen`,
  },
} as const
