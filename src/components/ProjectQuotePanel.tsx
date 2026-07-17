import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BomResult, KlimrekConfig, MaterialId } from '../types'
import { MATERIALS } from '../data/catalog'
import { quoteFromAllSuppliers, cheapestQuote } from '../lib/suppliers/orchestrator'
import { formatEuro } from '../lib/suppliers/format'
import { catalogAgeLabel, getSteigerbuisGroothandelCatalog } from '../lib/suppliers/priceCache'
import { buildPriceMatrix } from '../lib/suppliers/priceMatrix'
import type { SupplierQuote } from '../lib/suppliers/types'
import { PriceMatrixTable } from './PriceMatrixTable'
import { canFillSteigerbuisstunterCart, shopifyCartableLines, submitSteigerbuisstunterCart } from '../lib/suppliers/cartUrl'
import { canFillGroothandelCart, groothandelCartableLines, submitGroothandelCart } from '../lib/suppliers/groothandelCart'

interface ProjectQuotePanelProps {
  bom: BomResult
  config: KlimrekConfig
  materialId?: MaterialId
  /** Verberg titel wanneer ingebed in een CollapsibleSection. */
  embedded?: boolean
}

const STATUS_LABEL = {
  complete: 'Actuele prijzen',
  partial: 'Deels geschat',
  estimate: 'Indicatie',
} as const

export function ProjectQuotePanel({ bom, config, materialId, embedded = false }: ProjectQuotePanelProps) {
  const effectiveMaterialId = materialId ?? config.materialId
  const materialName = MATERIALS.find((m) => m.id === effectiveMaterialId)?.name ?? effectiveMaterialId
  const [quotes, setQuotes] = useState<SupplierQuote[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cartBusy, setCartBusy] = useState<string | null>(null)
  const [cartMessage, setCartMessage] = useState<string | null>(null)

  const runAgents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await quoteFromAllSuppliers(bom, {
        diameter: config.diameter,
        materialId: effectiveMaterialId,
      })
      setQuotes(result)
      const cheapest = cheapestQuote(result)
      setExpandedId(cheapest?.supplierId ?? result[0]?.supplierId ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Offerte mislukt')
    } finally {
      setLoading(false)
    }
  }, [bom, config.diameter, effectiveMaterialId])

  useEffect(() => {
    void runAgents()
  }, [runAgents])

  const cacheLabel = catalogAgeLabel(getSteigerbuisGroothandelCatalog())
  const cheapest = quotes ? cheapestQuote(quotes) : null
  const matrix = useMemo(() => (quotes ? buildPriceMatrix(quotes) : null), [quotes])

  const handleGroothandelCart = async (quote: SupplierQuote) => {
    setCartBusy(quote.supplierId)
    setCartMessage(null)
    try {
      const result = await submitGroothandelCart(quote)
      if (result.ok && result.cartUrl) {
        const errDetail = result.errors?.length ? ` (${result.errors.join('; ')})` : ''
        setCartMessage(
          `${result.added ?? 0} regels toegevoegd.${errDetail} De winkelwagen opent in dit browsertabblad.`,
        )
        window.open(result.cartUrl, '_blank', 'noopener,noreferrer')
      } else {
        const detail = result.errors?.length ? `: ${result.errors.join('; ')}` : ''
        setCartMessage(result.error ?? `Mislukt (${result.skipped ?? 0} overgeslagen${detail}).`)
      }
    } catch (err) {
      setCartMessage(err instanceof Error ? err.message : 'Winkelwagen vullen mislukt')
    } finally {
      setCartBusy(null)
    }
  }

  return (
    <div className={`quote-panel${embedded ? ' quote-panel-embedded' : ''}`}>
      {!embedded && (
        <div className="quote-header">
          <h2>Projectprijs</h2>
          <button type="button" className="quote-refresh" onClick={() => void runAgents()} disabled={loading}>
            {loading ? 'Bezig…' : 'Opnieuw berekenen'}
          </button>
        </div>
      )}
      {embedded && (
        <div className="quote-header quote-header-embedded">
          <button type="button" className="quote-refresh" onClick={() => void runAgents()} disabled={loading}>
            {loading ? 'Bezig…' : 'Opnieuw berekenen'}
          </button>
        </div>
      )}
      <p className="quote-intro">
        Offerte voor <strong>{materialName}</strong> (Ø {config.diameter} mm) op basis van je stuklijst.
        Prijscache: {cacheLabel}.
      </p>

      {cartMessage && <p className="quote-cart-message">{cartMessage}</p>}

      {error && <p className="quote-error">{error}</p>}

      {quotes && quotes.length > 0 && (
        <>
          {cheapest && (
            <p className="quote-cheapest">
              Laagste indicatie: <strong>{formatEuro(cheapest.totalInclVat)}</strong> incl. btw bij{' '}
              <a href={cheapest.website} target="_blank" rel="noopener noreferrer">
                {cheapest.supplierName}
              </a>
            </p>
          )}

          {matrix && <PriceMatrixTable matrix={matrix} />}

          <div className="quote-cards">
            {quotes.map((quote) => {
              const expanded = expandedId === quote.supplierId
              return (
                <article key={quote.supplierId} className={`quote-card${expanded ? ' quote-card-open' : ''}`}>
                  <button
                    type="button"
                    className="quote-card-head"
                    onClick={() => setExpandedId(expanded ? null : quote.supplierId)}
                    aria-expanded={expanded}
                  >
                    <div>
                      <strong>{quote.supplierName}</strong>
                      <span className={`quote-status quote-status-${quote.status}`}>
                        {STATUS_LABEL[quote.status]}
                      </span>
                    </div>
                    <div className="quote-total">
                      <span className="quote-total-incl">{formatEuro(quote.totalInclVat)}</span>
                      <span className="quote-total-excl muted">{formatEuro(quote.subtotalExVat)} excl.</span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="quote-card-body">
                      <table>
                        <thead>
                          <tr>
                            <th>Onderdeel</th>
                            <th>Aantal</th>
                            <th>Stuk</th>
                            <th>Totaal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quote.lines.map((line) => (
                            <tr key={line.lineKey}>
                              <td>
                                {line.productUrl ? (
                                  <a href={line.productUrl} target="_blank" rel="noopener noreferrer">
                                    {line.label}
                                  </a>
                                ) : (
                                  line.label
                                )}
                                {line.estimated && <span className="quote-est"> ≈</span>}
                              </td>
                              <td>
                                {line.quantity}× {line.unitLabel}
                              </td>
                              <td>{formatEuro(line.unitPriceExVat)}</td>
                              <td>{formatEuro(line.lineTotalExVat)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {quote.notes.length > 0 && (
                        <ul className="quote-notes">
                          {quote.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      )}
                      <div className="quote-card-actions">
                        {canFillGroothandelCart(quote) && (
                          <button
                            type="button"
                            className="quote-cart-fill"
                            disabled={cartBusy === quote.supplierId}
                            onClick={() => void handleGroothandelCart(quote)}
                          >
                            {cartBusy === quote.supplierId
                              ? 'Winkelwagen vullen…'
                              : `Vul winkelwagen (${groothandelCartableLines(quote).length} regels)`}
                          </button>
                        )}
                        {canFillSteigerbuisstunterCart(quote) && (
                          <button
                            type="button"
                            className="quote-cart-fill"
                            onClick={() => submitSteigerbuisstunterCart(quote)}
                          >
                            Vul winkelwagen ({shopifyCartableLines(quote).length} regels)
                          </button>
                        )}
                        <a className="quote-shop-link" href={quote.website} target="_blank" rel="noopener noreferrer">
                          Naar {quote.supplierName} →
                        </a>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      {!loading && !quotes && !error && <p className="muted">Nog geen offerte beschikbaar.</p>}
    </div>
  )
}
