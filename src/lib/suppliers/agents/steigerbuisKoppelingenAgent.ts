import type { BomResult } from '../../../types'
import { steigerbuisGroothandelAgent } from './steigerbuisGroothandelAgent'
import type { QuoteContext, SupplierAgent, SupplierQuote } from '../types'

const MARKUP = 1.06

/** Vergelijkingsleverancier: schatting op basis van groothandel + kleine marge. */
export const steigerbuisKoppelingenAgent: SupplierAgent = {
  id: 'steigerbuis-koppelingen',
  name: 'Steigerbuis-koppelingen.nl',
  website: 'https://steigerbuis-koppelingen.nl',
  async quote(bom: BomResult, context: QuoteContext): Promise<SupplierQuote> {
    const base = await steigerbuisGroothandelAgent.quote(bom, context)
    const lines = base.lines.map((line) => ({
      ...line,
      unitPriceExVat: line.unitPriceExVat * MARKUP,
      lineTotalExVat: line.lineTotalExVat * MARKUP,
      estimated: true,
      productUrl: `${this.website}/?s=${encodeURIComponent(line.label)}`,
    }))
    const subtotalExVat = lines.reduce((s, l) => s + l.lineTotalExVat, 0)
    const vatAmount = subtotalExVat * base.vatRate
    return {
      supplierId: this.id,
      supplierName: this.name,
      website: this.website,
      status: 'estimate',
      lines,
      subtotalExVat,
      vatRate: base.vatRate,
      vatAmount,
      totalInclVat: subtotalExVat + vatAmount,
      fetchedAt: null,
      notes: [
        'Indicatieve prijs (+6% t.o.v. groothandel) — controleer actuele prijzen op de webshop.',
        'Zoek op de site naar vergelijkbare artikelen voor een exacte offerte.',
      ],
    }
  },
}
