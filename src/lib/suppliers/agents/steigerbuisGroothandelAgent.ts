import type { BomResult } from '../../../types'
import { fittingProductUrl, pipeProductUrl } from '../productMap'
import { getSupplierCatalog } from '../priceCache'
import { buildQuoteFromCatalog } from '../quoteBuilder'
import type { QuoteContext, SupplierAgent } from '../types'

const SUPPLIER_ID = 'steigerbuisgroothandel'
const SUPPLIER_NAME = 'Steigerbuisgroothandel'
const WEBSITE = 'https://www.steigerbuisgroothandel.nl'

export const steigerbuisGroothandelAgent: SupplierAgent = {
  id: SUPPLIER_ID,
  name: SUPPLIER_NAME,
  website: WEBSITE,
  async quote(bom: BomResult, context: QuoteContext) {
    return buildQuoteFromCatalog(bom, context, {
      supplierId: SUPPLIER_ID,
      supplierName: SUPPLIER_NAME,
      website: WEBSITE,
      catalog: getSupplierCatalog('steigerbuisgroothandel'),
      pipeProductUrl,
      fittingProductUrl,
      extraNotes: ['Buizen: gratis zaagservice bij deze leverancier.'],
    })
  },
}
