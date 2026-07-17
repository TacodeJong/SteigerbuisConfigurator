import type { BomResult, FittingType, MaterialId, PipeDiameter } from '../../types'

export type PricedSupplierId =
  | 'steigerbuisgroothandel'
  | 'buiskoppelen'
  | 'steigerbuisstunter'
  | 'bouwbuis'

export interface QuoteContext {
  diameter: PipeDiameter
  materialId: MaterialId
}

export type QuoteLineKind = 'pipe' | 'fitting' | 'plank' | 'hardware'

export interface QuoteLine {
  lineKey: string
  kind: QuoteLineKind
  /** Shopify variant ID or WooCommerce product ID for cart deeplinks */
  cartItemId?: number
  label: string
  quantity: number
  unitLabel: string
  unitPriceExVat: number
  lineTotalExVat: number
  productUrl?: string
  sku?: string
  estimated?: boolean
}

export type QuoteStatus = 'complete' | 'partial' | 'estimate'

export interface SupplierQuote {
  supplierId: string
  supplierName: string
  website: string
  status: QuoteStatus
  lines: QuoteLine[]
  subtotalExVat: number
  vatRate: number
  vatAmount: number
  totalInclVat: number
  fetchedAt: string | null
  notes: string[]
}

export interface SupplierAgent {
  id: string
  name: string
  website: string
  quote(bom: BomResult, context: QuoteContext): Promise<SupplierQuote>
}

export interface MatrixCell {
  unitPriceExVat: number
  lineTotalExVat: number
  productUrl?: string
  estimated?: boolean
}

export interface PriceMatrixRow {
  lineKey: string
  label: string
  quantity: number
  unitLabel: string
  cells: Partial<Record<string, MatrixCell>>
  cheapestSupplierId: string | null
}

export interface PriceMatrix {
  supplierIds: string[]
  supplierNames: Record<string, string>
  rows: PriceMatrixRow[]
  totalsExVat: Record<string, number>
  cheapestSupplierId: string | null
}

export interface PipePriceEntry {
  unitPricePerMmExVat: number
  productUrl: string
  sku?: string
  /** Shopify variant ID for cart fill */
  variantId?: number
}

export interface FittingPriceEntry {
  unitPriceExVat: number
  productUrl: string
  sku?: string
  /** Shopify variant ID or WooCommerce product ID */
  variantId?: number
}

export type FittingsPriceMap = Partial<
  Record<FittingType, Partial<Record<MaterialId, Partial<Record<PipeDiameter, FittingPriceEntry>>>>>
>

export interface SupplierPriceCatalog {
  updatedAt: string
  vatRate: number
  pipes: Partial<Record<MaterialId, Partial<Record<PipeDiameter, PipePriceEntry>>>>
  fittings: FittingsPriceMap
}
