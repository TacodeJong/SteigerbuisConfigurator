import { formatEuro } from '../lib/suppliers/format'
import type { PriceMatrix } from '../lib/suppliers/types'

interface PriceMatrixTableProps {
  matrix: PriceMatrix
}

export function PriceMatrixTable({ matrix }: PriceMatrixTableProps) {
  if (matrix.rows.length === 0) return null

  return (
    <div className="quote-matrix-wrap">
      <h3 className="quote-matrix-title">Prijzen per onderdeel</h3>
      <p className="quote-matrix-hint muted">
        Regeltotalen excl. btw per leverancier. Laagste prijs per regel is gemarkeerd.
      </p>
      <div className="quote-matrix-scroll">
        <table className="quote-matrix">
          <thead>
            <tr>
              <th className="quote-matrix-sticky">Onderdeel</th>
              <th>Aantal</th>
              {matrix.supplierIds.map((id) => (
                <th key={id}>{matrix.supplierNames[id] ?? id}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.lineKey}>
                <td className="quote-matrix-sticky">{row.label}</td>
                <td>
                  {row.quantity}× {row.unitLabel}
                </td>
                {matrix.supplierIds.map((supplierId) => {
                  const cell = row.cells[supplierId]
                  const isCheapest = row.cheapestSupplierId === supplierId && cell
                  return (
                    <td key={supplierId} className={isCheapest ? 'quote-matrix-best' : undefined}>
                      {cell ? (
                        cell.productUrl ? (
                          <a href={cell.productUrl} target="_blank" rel="noopener noreferrer">
                            {formatEuro(cell.lineTotalExVat)}
                            {cell.estimated && <span className="quote-est"> ≈</span>}
                          </a>
                        ) : (
                          <>
                            {formatEuro(cell.lineTotalExVat)}
                            {cell.estimated && <span className="quote-est"> ≈</span>}
                          </>
                        )
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="quote-matrix-sticky">
                <strong>Totaal excl. btw</strong>
              </td>
              <td />
              {matrix.supplierIds.map((supplierId) => {
                const isCheapest = matrix.cheapestSupplierId === supplierId
                const total = matrix.totalsExVat[supplierId]
                return (
                  <td key={supplierId} className={isCheapest ? 'quote-matrix-best' : undefined}>
                    <strong>{total > 0 ? formatEuro(total) : '—'}</strong>
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
