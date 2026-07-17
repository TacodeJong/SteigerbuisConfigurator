/**
 * Gescrapete fitting-catalogi per leverancier.
 *
 * API-bronnen (geen auth):
 * - steigerbuisstunter: Shopify GET /collections/buiskoppelingen/products.json?limit=250&page=N
 * - buiskoppelen: WooCommerce Store API GET /wp-json/wc/store/v1/products?category={id}&per_page=100
 * - bouwbuis: sitemap + productpagina (geen JSON-API)
 * - steigerbuisgroothandel: slug-lijst uit supplierPriceSources (prijzen via HTML-scrape)
 *
 * Vernieuwen: npm run fetch-catalog
 */
import {
  materialFamilyForId,
  materialIdMatchesFamily,
  type SupplierMaterialFamily,
} from '../lib/suppliers/fittingProductMapper'
import type { FittingType, MaterialId, PipeDiameter } from '../types'
import bouwbuisCatalog from './catalogs/bouwbuis.json'
import buiskoppelenCatalog from './catalogs/buiskoppelen.json'
import groothandelCatalog from './catalogs/steigerbuisgroothandel.json'
import stunterCatalog from './catalogs/steigerbuisstunter.json'

export interface SupplierFittingProduct {
  slug: string
  name: string
  url: string
  fittingType: FittingType | null
  diameter: PipeDiameter | null
  materialFamily: SupplierMaterialFamily | null
  priceExVat: number | null
  sku: string | null
  editorCompatible: boolean
}

export interface SupplierFittingCatalogFile {
  supplierId: string
  source: string
  updatedAt: string
  products: SupplierFittingProduct[]
  stats: {
    total: number
    mapped: number
    editorCompatible: number
    byFittingType: Partial<Record<FittingType, number>>
  }
}

export type CatalogSupplierId =
  | 'steigerbuisstunter'
  | 'buiskoppelen'
  | 'bouwbuis'
  | 'steigerbuisgroothandel'

const catalogs: Record<CatalogSupplierId, SupplierFittingCatalogFile> = {
  steigerbuisstunter: stunterCatalog as SupplierFittingCatalogFile,
  buiskoppelen: buiskoppelenCatalog as SupplierFittingCatalogFile,
  bouwbuis: bouwbuisCatalog as SupplierFittingCatalogFile,
  steigerbuisgroothandel: groothandelCatalog as SupplierFittingCatalogFile,
}

export function getFittingCatalog(id: CatalogSupplierId): SupplierFittingCatalogFile {
  return catalogs[id]
}

export function listCatalogSuppliers(): CatalogSupplierId[] {
  return Object.keys(catalogs) as CatalogSupplierId[]
}

/** Zoek beste product-URL voor BOM/editor fitting uit gescrapete catalogus. */
export function lookupCatalogFitting(
  supplierId: CatalogSupplierId,
  type: FittingType,
  materialId: MaterialId,
  diameter: PipeDiameter,
): SupplierFittingProduct | null {
  const catalog = catalogs[supplierId]
  if (!catalog?.products?.length) return null

  const family = materialFamilyForId(materialId)
  const exact = catalog.products.filter(
    (p) =>
      p.fittingType === type &&
      p.diameter === diameter &&
      p.materialFamily &&
      materialIdMatchesFamily(materialId, p.materialFamily),
  )
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) {
    const zwartPref = exact.find((p) => p.materialFamily === family)
    return zwartPref ?? exact[0]
  }

  const sameTypeDia = catalog.products.filter((p) => p.fittingType === type && p.diameter === diameter)
  if (sameTypeDia.length > 0) return sameTypeDia[0]

  const sameType = catalog.products.filter((p) => p.fittingType === type)
  if (sameType.length === 0) return null

  sameType.sort((a, b) => {
    const da = a.diameter ? Math.abs(a.diameter - diameter) : 99
    const db = b.diameter ? Math.abs(b.diameter - diameter) : 99
    return da - db
  })
  return sameType[0]
}

export function lookupCatalogFittingUrl(
  supplierId: CatalogSupplierId,
  type: FittingType,
  materialId: MaterialId,
  diameter: PipeDiameter,
): string | null {
  return lookupCatalogFitting(supplierId, type, materialId, diameter)?.url ?? null
}

/** Unieke prijs-doelen voor fetch-prices (per slug, met type/materiaal/diameter). */
export function listCatalogPriceTargets(supplierId: CatalogSupplierId): {
  type: FittingType
  materialId: MaterialId
  diameter: PipeDiameter
  slug: string
  url: string
}[] {
  const catalog = catalogs[supplierId]
  if (!catalog?.products?.length) return []

  const materialIds: MaterialId[] = [
    'staal',
    'groen-outdoor',
    'zwart-outdoor',
    'zwart',
    'wit',
    'beige',
    'aluminium',
  ]
  const diameters: PipeDiameter[] = [26.9, 33.7, 42.4, 48.3]
  const types = Object.keys(catalog.stats.byFittingType ?? {}) as FittingType[]
  const out: {
    type: FittingType
    materialId: MaterialId
    diameter: PipeDiameter
    slug: string
    url: string
  }[] = []
  const seen = new Set<string>()

  for (const type of types) {
    for (const materialId of materialIds) {
      for (const diameter of diameters) {
        const product = lookupCatalogFitting(supplierId, type, materialId, diameter)
        if (!product) continue
        const key = `${type}:${materialId}:${diameter}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ type, materialId, diameter, slug: product.slug, url: product.url })
      }
    }
  }
  return out
}
