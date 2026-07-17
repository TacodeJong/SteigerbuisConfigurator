import type { BomResult } from '../../../types'
import {
  buiskoppelenFittingUrl,
  buiskoppelenPipeUrl,
} from '../../../data/altSupplierPriceSources'
import { getSupplierCatalog } from '../priceCache'
import { buildQuoteFromCatalog } from '../quoteBuilder'
import type { QuoteContext, SupplierAgent } from '../types'

const SUPPLIER_ID = 'buiskoppelen'
const SUPPLIER_NAME = 'Buiskoppelen.nl'
const WEBSITE = 'https://buiskoppelen.nl'

export const buiskoppelenAgent: SupplierAgent = {
  id: SUPPLIER_ID,
  name: SUPPLIER_NAME,
  website: WEBSITE,
  async quote(bom: BomResult, context: QuoteContext) {
    return buildQuoteFromCatalog(bom, context, {
      supplierId: SUPPLIER_ID,
      supplierName: SUPPLIER_NAME,
      website: WEBSITE,
      catalog: getSupplierCatalog('buiskoppelen'),
      pipeProductUrl: buiskoppelenPipeUrl,
      fittingProductUrl: buiskoppelenFittingUrl,
      extraNotes: ['Gratis bezorging vanaf € 500 (NL).'],
    })
  },
}
