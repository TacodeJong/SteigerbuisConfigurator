import type { BomResult } from '../../../types'
import { bouwbuisFittingUrl, bouwbuisPipeUrl } from '../../../data/altSupplierPriceSources'
import { getSupplierCatalog } from '../priceCache'
import { buildQuoteFromCatalog } from '../quoteBuilder'
import type { QuoteContext, SupplierAgent } from '../types'

const SUPPLIER_ID = 'bouwbuis'
const SUPPLIER_NAME = 'Bouwbuis.nl'
const WEBSITE = 'https://bouwbuis.nl'

export const bouwbuisAgent: SupplierAgent = {
  id: SUPPLIER_ID,
  name: SUPPLIER_NAME,
  website: WEBSITE,
  async quote(bom: BomResult, context: QuoteContext) {
    return buildQuoteFromCatalog(bom, context, {
      supplierId: SUPPLIER_ID,
      supplierName: SUPPLIER_NAME,
      website: WEBSITE,
      catalog: getSupplierCatalog('bouwbuis'),
      pipeProductUrl: bouwbuisPipeUrl,
      fittingProductUrl: bouwbuisFittingUrl,
      extraNotes: ['Buizen gratis op maat gezaagd.'],
    })
  },
}
