import type { BomResult } from '../../../types'
import { stunterFittingUrl, stunterPipeUrl } from '../../../data/altSupplierPriceSources'
import { getSupplierCatalog } from '../priceCache'
import { buildQuoteFromCatalog } from '../quoteBuilder'
import type { QuoteContext, SupplierAgent } from '../types'

const SUPPLIER_ID = 'steigerbuisstunter'
const SUPPLIER_NAME = 'Steigerbuisstunter'
const WEBSITE = 'https://www.steigerbuisstunter.nl'

export const steigerbuisstunterAgent: SupplierAgent = {
  id: SUPPLIER_ID,
  name: SUPPLIER_NAME,
  website: WEBSITE,
  async quote(bom: BomResult, context: QuoteContext) {
    return buildQuoteFromCatalog(bom, context, {
      supplierId: SUPPLIER_ID,
      supplierName: SUPPLIER_NAME,
      website: WEBSITE,
      catalog: getSupplierCatalog('steigerbuisstunter'),
      pipeProductUrl: stunterPipeUrl,
      fittingProductUrl: stunterFittingUrl,
    })
  },
}
