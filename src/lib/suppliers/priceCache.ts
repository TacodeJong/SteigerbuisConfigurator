import type { PricedSupplierId, SupplierPriceCatalog } from './types'
import groothandelJson from '../../data/prices/steigerbuisgroothandel.json'
import buiskoppelenJson from '../../data/prices/buiskoppelen.json'
import stunterJson from '../../data/prices/steigerbuisstunter.json'
import bouwbuisJson from '../../data/prices/bouwbuis.json'

const EMPTY_CATALOG: SupplierPriceCatalog = {
  updatedAt: '',
  vatRate: 0.21,
  pipes: {},
  fittings: {},
}

const catalogs: Record<PricedSupplierId, SupplierPriceCatalog> = {
  steigerbuisgroothandel: groothandelJson as SupplierPriceCatalog,
  buiskoppelen: (buiskoppelenJson as SupplierPriceCatalog).updatedAt
    ? (buiskoppelenJson as SupplierPriceCatalog)
    : EMPTY_CATALOG,
  steigerbuisstunter: (stunterJson as SupplierPriceCatalog).updatedAt
    ? (stunterJson as SupplierPriceCatalog)
    : EMPTY_CATALOG,
  bouwbuis: (bouwbuisJson as SupplierPriceCatalog).updatedAt
    ? (bouwbuisJson as SupplierPriceCatalog)
    : EMPTY_CATALOG,
}

export function getSupplierCatalog(id: PricedSupplierId): SupplierPriceCatalog {
  return catalogs[id]
}

/** @deprecated Gebruik getSupplierCatalog('steigerbuisgroothandel') */
export function getSteigerbuisGroothandelCatalog(): SupplierPriceCatalog {
  return getSupplierCatalog('steigerbuisgroothandel')
}

export function catalogAgeLabel(catalog: SupplierPriceCatalog): string {
  if (!catalog.updatedAt) return 'nog niet opgehaald'
  const d = new Date(catalog.updatedAt)
  if (Number.isNaN(d.getTime())) return 'onbekend'
  return d.toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })
}
