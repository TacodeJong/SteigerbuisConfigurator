import { useMemo } from 'react'
import type { BomResult, KlimrekConfig, MaterialId } from '../types'
import { estimateProjectPrice } from '../lib/priceIndication'
import { formatEuro } from '../lib/suppliers/format'

interface PriceIndicationPanelProps {
  bom: BomResult
  config: KlimrekConfig
  materialId: MaterialId
}

export function PriceIndicationPanel({ bom, config, materialId }: PriceIndicationPanelProps) {
  const indication = useMemo(
    () => estimateProjectPrice(bom, materialId, config.diameter),
    [bom, materialId, config.diameter],
  )

  return (
    <div className="price-indication">
      <p className="price-indication-range">
        Circa {formatEuro(indication.lowInclVat, 0)}–{formatEuro(indication.highInclVat, 0)}
        <span className="price-indication-vat muted"> incl. btw</span>
      </p>
      <p className="price-indication-category muted">
        Prijsklasse: {indication.categoryLabel}
      </p>
      <p className="price-indication-disclaimer">
        Dit is een ruwe prijsindicatie op basis van interne richtprijzen — geen offerte.
        Werkelijke kosten variëren per leverancier, zaagsneden, verzending, materiaalkeuze en
        actuele webshopprijzen. Vergelijk altijd zelf bij een leverancier voordat je bestelt.
      </p>
    </div>
  )
}
