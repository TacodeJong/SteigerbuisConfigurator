import type { PriceMatrix, SupplierQuote } from './types'

export function buildPriceMatrix(quotes: SupplierQuote[]): PriceMatrix {
  const supplierIds = quotes.map((q) => q.supplierId)
  const supplierNames = Object.fromEntries(quotes.map((q) => [q.supplierId, q.supplierName]))
  const rowMap = new Map<
    string,
    {
      lineKey: string
      label: string
      quantity: number
      unitLabel: string
      cells: PriceMatrix['rows'][number]['cells']
    }
  >()

  for (const quote of quotes) {
    for (const line of quote.lines) {
      const existing = rowMap.get(line.lineKey)
      const cell = {
        unitPriceExVat: line.unitPriceExVat,
        lineTotalExVat: line.lineTotalExVat,
        productUrl: line.productUrl,
        estimated: line.estimated,
      }
      if (existing) {
        existing.cells[quote.supplierId] = cell
      } else {
        rowMap.set(line.lineKey, {
          lineKey: line.lineKey,
          label: line.label,
          quantity: line.quantity,
          unitLabel: line.unitLabel,
          cells: { [quote.supplierId]: cell },
        })
      }
    }
  }

  const rows = [...rowMap.values()].map((row) => {
    let cheapestSupplierId: string | null = null
    let cheapestTotal = Infinity
    for (const [supplierId, cell] of Object.entries(row.cells)) {
      if (cell && cell.lineTotalExVat > 0 && cell.lineTotalExVat < cheapestTotal) {
        cheapestTotal = cell.lineTotalExVat
        cheapestSupplierId = supplierId
      }
    }
    return { ...row, cheapestSupplierId }
  })

  const totalsExVat: Record<string, number> = {}
  for (const quote of quotes) {
    totalsExVat[quote.supplierId] = quote.subtotalExVat
  }

  let cheapestSupplierId: string | null = null
  let cheapestGrand = Infinity
  for (const [supplierId, total] of Object.entries(totalsExVat)) {
    if (total > 0 && total < cheapestGrand) {
      cheapestGrand = total
      cheapestSupplierId = supplierId
    }
  }

  return { supplierIds, supplierNames, rows, totalsExVat, cheapestSupplierId }
}
