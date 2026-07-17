import type {
  AccessoryBomType,
  BomHighlight,
  BomResult,
  KlimrekConfig,
  MaterialId,
  SceneModel,
} from '../types'
import { useState } from 'react'
import { FITTINGS, MATERIALS } from '../data/catalog'
import { FITTING_TYPE_LABELS } from '../lib/fittings'
import { isSameBomHighlight } from '../lib/bomHighlight'
import { formatMm, formatMeters } from '../lib/bom'
import { copyGroothandelOrderList, printBomWithGroothandelSkus } from '../lib/bomPrint'
import { printBuildInstructions, printFloorplan } from '../lib/buildPrint'
import { CollapsibleSection } from './CollapsibleSection'
import { ProjectQuotePanel } from './ProjectQuotePanel'
import { SuppliersMenu } from './SuppliersMenu'

interface BomListProps {
  bom: BomResult
  config: KlimrekConfig
  scene?: SceneModel
  /** In de editor: scene.materialId; anders config.materialId. */
  materialId?: MaterialId
  highlight?: BomHighlight | null
  onHighlightChange?: (highlight: BomHighlight | null) => void
}

const ACCESSORY_TYPES = new Set<AccessoryBomType>([
  'scharnieroog',
  'scharnierhuls',
  'dubbelscharnier-90',
  'dubbelscharnier-recht',
])

function toggleHighlight(
  current: BomHighlight | null | undefined,
  next: BomHighlight,
  onHighlightChange?: (highlight: BomHighlight | null) => void,
) {
  if (!onHighlightChange) return
  onHighlightChange(isSameBomHighlight(current ?? null, next) ? null : next)
}

export function BomList({
  bom,
  config,
  scene,
  materialId,
  highlight = null,
  onHighlightChange,
}: BomListProps) {
  const effectiveMaterialId = materialId ?? config.materialId
  const material = MATERIALS.find((m) => m.id === effectiveMaterialId)!
  const interactive = !!onHighlightChange
  const [printBusy, setPrintBusy] = useState(false)
  const [copyOk, setCopyOk] = useState(false)

  const handlePrint = async () => {
    setPrintBusy(true)
    setCopyOk(false)
    try {
      await printBomWithGroothandelSkus(bom, config, effectiveMaterialId)
    } finally {
      setPrintBusy(false)
    }
  }

  const handleCopyOrderList = async () => {
    setCopyOk(false)
    const ok = await copyGroothandelOrderList(bom, config, effectiveMaterialId)
    setCopyOk(ok)
    if (ok) window.setTimeout(() => setCopyOk(false), 2500)
  }

  const handlePrintFloorplan = () => {
    if (!scene) return
    printFloorplan({ scene, config, materialId: effectiveMaterialId })
  }

  const handlePrintBuildInstructions = () => {
    if (!scene) return
    printBuildInstructions({ scene, config, materialId: effectiveMaterialId, bom })
  }

  return (
    <div className="sidebar-panels bom-panel">
      <CollapsibleSection title="Stuklijst" defaultOpen className="bom-panel-section">
        <p className="bom-summary">
          Totaal buislengte: <strong>{formatMeters(bom.totalPipeLengthMm)}</strong>
          {' · '}
          Ø {config.diameter} mm · {material.name}
        </p>
        <div className="bom-actions no-print">
          <button type="button" className="bom-action-btn" onClick={() => void handlePrint()} disabled={printBusy}>
            {printBusy ? 'Bezig…' : 'Stuklijst printen'}
          </button>
          <button type="button" className="bom-action-btn secondary" onClick={() => void handleCopyOrderList()}>
            {copyOk ? 'Gekopieerd!' : 'Bestellijst kopiëren'}
          </button>
          {scene && (
            <>
              <button type="button" className="bom-action-btn secondary" onClick={handlePrintFloorplan}>
                Plattegrond printen
              </button>
              <button type="button" className="bom-action-btn secondary" onClick={handlePrintBuildInstructions}>
                Bouwinstructie printen
              </button>
            </>
          )}
        </div>
        <p className="bom-print-hint no-print">
          Winkelwagen vullen kan via Projectprijs per leverancier (Groothandel: .env + npm run dev;
          Stunter: Shopify-cart in de browser).
        </p>
        {interactive && (
          <p className="bom-hint">Klik op een regel om onderdelen in de 3D-weergave te markeren.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Steigerbuizen" defaultOpen className="bom-panel-section">
        <table>
          <thead>
            <tr>
              <th>Lengte</th>
              <th>Aantal</th>
            </tr>
          </thead>
          <tbody>
            {bom.pipes.map((pipe) => {
              const rowHighlight: BomHighlight = { kind: 'pipe', lengthMm: pipe.lengthMm }
              const active = isSameBomHighlight(highlight, rowHighlight)
              return (
                <tr
                  key={pipe.lengthMm}
                  className={interactive ? `bom-row${active ? ' bom-row-active' : ''}` : undefined}
                  onClick={
                    interactive
                      ? () => toggleHighlight(highlight, rowHighlight, onHighlightChange)
                      : undefined
                  }
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggleHighlight(highlight, rowHighlight, onHighlightChange)
                          }
                        }
                      : undefined
                  }
                >
                  <td>Buis · {formatMm(pipe.lengthMm)}</td>
                  <td>{pipe.quantity}×</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CollapsibleSection>

      {bom.fittings.length > 0 && (
        <CollapsibleSection title="Buiskoppelingen" defaultOpen className="bom-panel-section">
          <table>
            <thead>
              <tr>
                <th>Onderdeel</th>
                <th>Type</th>
                <th>Aantal</th>
              </tr>
            </thead>
            <tbody>
              {bom.fittings.map((fitting) => {
                const catalog = FITTINGS.find((f) => f.type === fitting.type)
                const label = FITTING_TYPE_LABELS[fitting.type] ?? catalog?.name ?? fitting.type
                const rowHighlight: BomHighlight = ACCESSORY_TYPES.has(fitting.type as AccessoryBomType)
                  ? { kind: 'accessory', type: fitting.type as AccessoryBomType }
                  : { kind: 'fitting', type: fitting.type, label: fitting.label }
                const active = isSameBomHighlight(highlight, rowHighlight)
                return (
                  <tr
                    key={`${fitting.type}-${fitting.label}`}
                    className={interactive ? `bom-row${active ? ' bom-row-active' : ''}` : undefined}
                    onClick={
                      interactive
                        ? () => toggleHighlight(highlight, rowHighlight, onHighlightChange)
                        : undefined
                    }
                    role={interactive ? 'button' : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    onKeyDown={
                      interactive
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleHighlight(highlight, rowHighlight, onHighlightChange)
                            }
                          }
                        : undefined
                    }
                  >
                    <td>{label}</td>
                    <td className="muted">{fitting.label}</td>
                    <td>{fitting.quantity}×</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CollapsibleSection>
      )}

      {(bom.planks?.length ?? 0) > 0 && (
        <CollapsibleSection title="Hout (planken / platen)" defaultOpen className="bom-panel-section">
          <table>
            <thead>
              <tr>
                <th>Onderdeel</th>
                <th>Aantal</th>
              </tr>
            </thead>
            <tbody>
              {bom.planks!.map((plank) => {
                const rowHighlight: BomHighlight = {
                  kind: 'plank',
                  lengthMm: plank.lengthMm,
                  widthMm: plank.widthMm,
                }
                const active = isSameBomHighlight(highlight, rowHighlight)
                return (
                  <tr
                    key={`${plank.label}-${plank.lengthMm}-${plank.widthMm}-${plank.thicknessMm}`}
                    className={interactive ? `bom-row${active ? ' bom-row-active' : ''}` : undefined}
                    onClick={
                      interactive
                        ? () => toggleHighlight(highlight, rowHighlight, onHighlightChange)
                        : undefined
                    }
                    role={interactive ? 'button' : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    onKeyDown={
                      interactive
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleHighlight(highlight, rowHighlight, onHighlightChange)
                            }
                          }
                        : undefined
                    }
                  >
                    <td>
                      {plank.label} · {formatMm(plank.lengthMm)} × {formatMm(plank.widthMm)} ×{' '}
                      {plank.thicknessMm} mm
                    </td>
                    <td>{plank.quantity}×</td>
                  </tr>
                )
              })}
              {(bom.hardware ?? []).map((item) => (
                <tr key={item.label}>
                  <td>{item.label}</td>
                  <td>{item.quantity}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CollapsibleSection>
      )}

      {bom.notes.length > 0 && (
        <CollapsibleSection title="Opmerkingen" defaultOpen={false} className="bom-panel-section">
          <ul className="bom-notes">
            {bom.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Leveranciers" defaultOpen={false} className="bom-panel-section">
        <SuppliersMenu
          variant="list"
          hint="Bestel bij een steigerbuisleverancier. Vergelijk ook prijzen onder Projectprijs."
        />
      </CollapsibleSection>

      <CollapsibleSection title="Projectprijs" defaultOpen className="bom-panel-section quote-collapsible">
        <ProjectQuotePanel bom={bom} config={config} materialId={effectiveMaterialId} embedded />
      </CollapsibleSection>
    </div>
  )
}
