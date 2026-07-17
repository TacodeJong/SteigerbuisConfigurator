import type { PricedSupplierId } from '../lib/suppliers/types'

export interface SupplierMeta {
  id: PricedSupplierId
  name: string
  website: string
  /** JSON-bestand in src/data/prices/ */
  cacheFile: string
}

export const PRICED_SUPPLIERS: SupplierMeta[] = [
  {
    id: 'steigerbuisgroothandel',
    name: 'Steigerbuisgroothandel',
    website: 'https://www.steigerbuisgroothandel.nl',
    cacheFile: 'steigerbuisgroothandel.json',
  },
  {
    id: 'buiskoppelen',
    name: 'Buiskoppelen.nl',
    website: 'https://buiskoppelen.nl',
    cacheFile: 'buiskoppelen.json',
  },
  {
    id: 'steigerbuisstunter',
    name: 'Steigerbuisstunter',
    website: 'https://www.steigerbuisstunter.nl',
    cacheFile: 'steigerbuisstunter.json',
  },
  {
    id: 'bouwbuis',
    name: 'Bouwbuis.nl',
    website: 'https://bouwbuis.nl',
    cacheFile: 'bouwbuis.json',
  },
]

export const PRICED_SUPPLIER_BY_ID = Object.fromEntries(
  PRICED_SUPPLIERS.map((s) => [s.id, s]),
) as Record<PricedSupplierId, SupplierMeta>
