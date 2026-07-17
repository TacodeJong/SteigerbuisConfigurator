import { steigerbuisGroothandelAgent } from './agents/steigerbuisGroothandelAgent'
import { steigerbuisKoppelingenAgent } from './agents/steigerbuisKoppelingenAgent'
import { buiskoppelenAgent } from './agents/buiskoppelenAgent'
import { steigerbuisstunterAgent } from './agents/steigerbuisstunterAgent'
import { bouwbuisAgent } from './agents/bouwbuisAgent'
import type { BomResult } from '../../types'
import type { QuoteContext, SupplierAgent, SupplierQuote } from './types'

export const SUPPLIER_AGENTS: SupplierAgent[] = [
  steigerbuisGroothandelAgent,
  buiskoppelenAgent,
  steigerbuisstunterAgent,
  bouwbuisAgent,
  steigerbuisKoppelingenAgent,
]

export async function quoteFromAllSuppliers(
  bom: BomResult,
  context: QuoteContext,
): Promise<SupplierQuote[]> {
  const results = await Promise.all(
    SUPPLIER_AGENTS.map(async (agent) => {
      try {
        return await agent.quote(bom, context)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Onbekende fout'
        return {
          supplierId: agent.id,
          supplierName: agent.name,
          website: agent.website,
          status: 'estimate' as const,
          lines: [],
          subtotalExVat: 0,
          vatRate: 0.21,
          vatAmount: 0,
          totalInclVat: 0,
          fetchedAt: null,
          notes: [`Kon geen offerte berekenen: ${message}`],
        }
      }
    }),
  )
  return results.sort((a, b) => a.totalInclVat - b.totalInclVat)
}

export function cheapestQuote(quotes: SupplierQuote[]): SupplierQuote | null {
  const withTotal = quotes.filter((q) => q.totalInclVat > 0)
  if (withTotal.length === 0) return null
  return withTotal[0]
}
