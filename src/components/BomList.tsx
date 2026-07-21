import type {
  AccessoryBomType,
  BomHighlight,
  BomResult,
  KlimrekConfig,
  MaterialId,
  SceneModel,
} from '../types'
import { useEffect, useState } from 'react'
import { FITTINGS, MATERIALS } from '../data/catalog'
import { FITTING_TYPE_LABELS } from '../lib/fittings'
import { isSameBomHighlight } from '../lib/bomHighlight'
import { formatMm, formatMeters } from '../lib/bom'
import { copyGroothandelOrderList, printBomWithGroothandelSkus } from '../lib/bomPrint'
import { printBuildInstructions, printFloorplan } from '../lib/buildPrint'
import { useAuth } from '../lib/auth/session'
import {
  canCopyOrderList,
  canPrintBomList,
  canPrintFullBuildInstructions,
  canPrintFullFootprint,
} from '../lib/billing/entitlements'
import {
  defaultPlanPrices,
  fetchPlanPrices,
  formatEuroFromCents,
  type PlanPrices,
} from '../lib/billing/appPricing'
import {
  defaultFeatureGates,
  fetchFeatureGates,
  type FeatureGates,
  type GatedFeatureId,
} from '../lib/billing/featureGates'
import {
  defaultFeaturePrices,
  fetchFeaturePrices,
  resolveFeaturePriceCents,
  type FeaturePrices,
} from '../lib/billing/featurePrices'
import {
  fetchModelFeatureGrants,
  hasModelFeatureGrant,
} from '../lib/billing/modelFeatureGrants'
import { startCheckout } from '../lib/billing/checkout'
import {
  defaultSubscriptionPlans,
  fetchActivePlans,
  type SubscriptionPlan,
} from '../lib/billing/plans'
import { navigate } from '../lib/routing'
import { fittingProductUrl } from '../lib/suppliers/productMap'
import { BomFittingThumb } from './BomFittingThumb'
import { CollapsibleSection } from './CollapsibleSection'
import { PaidLockIcon } from './PaidLockIcon'
import { PriceIndicationPanel } from './PriceIndicationPanel'

interface BomListProps {
  bom: BomResult
  config: KlimrekConfig
  scene?: SceneModel
  /** In de editor: scene.materialId; anders config.materialId. */
  materialId?: MaterialId
  highlight?: BomHighlight | null
  onHighlightChange?: (highlight: BomHighlight | null) => void
  /** When true, hide mutation-oriented actions (public view). */
  readOnly?: boolean
  /** Cloud model id — needed for durable per-model feature grants. */
  cloudModelId?: string | null
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
  cloudModelId = null,
}: BomListProps) {
  const { profile, user } = useAuth()
  const effectiveMaterialId = materialId ?? config.materialId
  const material = MATERIALS.find((m) => m.id === effectiveMaterialId)!
  const interactive = !!onHighlightChange
  const [printBusy, setPrintBusy] = useState(false)
  const [copyOk, setCopyOk] = useState(false)
  const [payBusy, setPayBusy] = useState<GatedFeatureId | null>(null)
  const [gateMsg, setGateMsg] = useState<string | null>(null)
  const [prices, setPrices] = useState<PlanPrices>(defaultPlanPrices())
  const [featurePrices, setFeaturePrices] = useState<FeaturePrices>(defaultFeaturePrices())
  const [gates, setGates] = useState<FeatureGates>(defaultFeatureGates())
  const [plans, setPlans] = useState<SubscriptionPlan[]>(() => defaultSubscriptionPlans())
  const [modelGrants, setModelGrants] = useState<Set<GatedFeatureId>>(() => new Set())

  useEffect(() => {
    void fetchPlanPrices().then(setPrices)
    void fetchFeaturePrices().then(setFeaturePrices)
    void fetchFeatureGates().then(setGates)
    void fetchActivePlans().then((rows) => {
      setPlans(rows.length > 0 ? rows : defaultSubscriptionPlans())
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchModelFeatureGrants(cloudModelId).then((grants) => {
      if (!cancelled) setModelGrants(grants)
    })
    return () => {
      cancelled = true
    }
  }, [cloudModelId, profile?.id, user?.id])

  const accessOpts = (feature: GatedFeatureId) => ({
    hasModelGrant: hasModelFeatureGrant(modelGrants, feature),
    plans,
  })

  const footprintOk = canPrintFullFootprint(profile, gates, accessOpts('full_print'))
  const buildFullOk = canPrintFullBuildInstructions(profile, gates, accessOpts('full_print'))
  const copyOkEntitled = canCopyOrderList(profile, gates, accessOpts('copy_order_list'))
  const bomPrintOk = canPrintBomList(profile, gates, accessOpts('bom_print'))

  const featurePriceLabel = (feature: GatedFeatureId) =>
    formatEuroFromCents(resolveFeaturePriceCents(feature, featurePrices, prices.exportOnceCents))

  const paywallHint = (feature: GatedFeatureId) =>
    `eenmalig ${featurePriceLabel(feature)} voor dit model (blijvend) of een abonnement (${formatEuroFromCents(prices.paidMonthlyCents)}/maand)`

  const refreshGrants = async () => {
    const grants = await fetchModelFeatureGrants(cloudModelId)
    setModelGrants(grants)
  }

  const handlePayForFeature = async (feature: GatedFeatureId) => {
    setGateMsg(null)
    if (!user) {
      setGateMsg('Log in om deze functie te ontgrendelen.')
      navigate({ name: 'upgrade' })
      return
    }
    if (!cloudModelId) {
      setGateMsg(
        'Sla dit model eerst op in de cloud (Mijn modellen). Daarna kun je deze functie eenmalig voor dit model ontgrendelen — blijft beschikbaar na een eventuele downgrade.',
      )
      return
    }
    setPayBusy(feature)
    try {
      const result = await startCheckout('export_once', {
        feature,
        modelId: cloudModelId,
      })
      if (result.stubActivated) {
        await refreshGrants()
        setGateMsg('Functie ontgrendeld voor dit model (blijvend).')
        return
      }
      const url = result.checkoutUrl || result.url
      if (url) {
        window.location.href = url
        return
      }
      setGateMsg(result.message || 'Checkout gestart.')
    } catch (e) {
      setGateMsg(e instanceof Error ? e.message : 'Betaling starten mislukt.')
    } finally {
      setPayBusy(null)
    }
  }

  const handlePrint = async () => {
    setGateMsg(null)
    if (!bomPrintOk) {
      setGateMsg(`Stuklijst printen vereist ${paywallHint('bom_print')}.`)
      return
    }
    setPrintBusy(true)
    setCopyOk(false)
    try {
      await printBomWithGroothandelSkus(bom, config, effectiveMaterialId)
    } finally {
      setPrintBusy(false)
    }
  }

  const handleCopyOrderList = async () => {
    setGateMsg(null)
    if (!copyOkEntitled) {
      setGateMsg(`Bestellijst kopiëren vereist ${paywallHint('copy_order_list')}.`)
      return
    }
    setCopyOk(false)
    const ok = await copyGroothandelOrderList(bom, config, effectiveMaterialId)
    setCopyOk(ok)
    if (ok) window.setTimeout(() => setCopyOk(false), 2500)
  }

  const handlePrintFloorplan = () => {
    if (!scene) return
    setGateMsg(null)
    if (!footprintOk) {
      setGateMsg(`Volledige plattegrond vereist ${paywallHint('full_print')}.`)
      return
    }
    printFloorplan({ scene, config, materialId: effectiveMaterialId })
  }

  const handlePrintBuildInstructions = () => {
    if (!scene) return
    setGateMsg(null)
    printBuildInstructions({
      scene,
      config,
      materialId: effectiveMaterialId,
      bom,
      includeFootprint: buildFullOk,
    })
    if (!buildFullOk) {
      setGateMsg(
        'Bouwinstructie zonder plattegrond geprint. Betaal voor deze functie of neem een abonnement.',
      )
    }
  }

  const showUpgradeLink = !footprintOk || !copyOkEntitled || !bomPrintOk
  const lockedFeatureForCta: GatedFeatureId | null = !copyOkEntitled
    ? 'copy_order_list'
    : !footprintOk
      ? 'full_print'
      : !bomPrintOk
        ? 'bom_print'
        : null

  return (
    <div className="sidebar-panels bom-panel">
      <CollapsibleSection title="Stuklijst" className="bom-panel-section">
        <p className="bom-summary">
          Totaal buislengte: <strong>{formatMeters(bom.totalPipeLengthMm)}</strong>
          {' · '}
          Ø {config.diameter} mm · {material.name}
        </p>
        <div className="bom-actions no-print">
          <button
            type="button"
            className={`bom-action-btn${bomPrintOk ? '' : ' bom-action-locked'}`}
            onClick={() => void handlePrint()}
            disabled={printBusy}
            title={
              bomPrintOk
                ? 'Stuklijst printen'
                : `${paywallHint('bom_print')}: stuklijst printen`
            }
          >
            {printBusy ? (
              'Bezig…'
            ) : bomPrintOk ? (
              'Stuklijst printen'
            ) : (
              <>
                Stuklijst printen
                <PaidLockIcon />
              </>
            )}
          </button>
          <button
            type="button"
            className={`bom-action-btn secondary${copyOkEntitled ? '' : ' bom-action-locked'}`}
            onClick={() => void handleCopyOrderList()}
            title={
              copyOkEntitled
                ? 'Bestellijst kopiëren'
                : `${paywallHint('copy_order_list')}: bestellijst kopiëren`
            }
          >
            {copyOk ? (
              'Gekopieerd!'
            ) : copyOkEntitled ? (
              'Bestellijst kopiëren'
            ) : (
              <>
                Bestellijst kopiëren
                <PaidLockIcon />
              </>
            )}
          </button>
          {scene && (
            <>
              <button
                type="button"
                className={`bom-action-btn secondary${footprintOk ? '' : ' bom-action-locked'}`}
                onClick={handlePrintFloorplan}
                title={
                  footprintOk
                    ? 'Plattegrond printen'
                    : `${paywallHint('full_print')}: volledige plattegrond`
                }
              >
                {footprintOk ? (
                  'Plattegrond'
                ) : (
                  <>
                    Plattegrond
                    <PaidLockIcon />
                  </>
                )}
              </button>
              <button
                type="button"
                className="bom-action-btn secondary"
                onClick={handlePrintBuildInstructions}
                title={
                  buildFullOk
                    ? 'Volledige bouwinstructie'
                    : 'Bouwstappen zonder plattegrond (upgrade voor footprint)'
                }
              >
                {buildFullOk ? 'Bouwinstructie' : 'Bouwstappen'}
              </button>
            </>
          )}
        </div>
        {gateMsg && (
          <p className="bom-gate-msg no-print">
            {gateMsg}{' '}
            {showUpgradeLink && lockedFeatureForCta && (
              <>
                {payBusy === lockedFeatureForCta ? (
                  <span>Bezig…</span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="linkish"
                      disabled={payBusy != null}
                      onClick={() => void handlePayForFeature(lockedFeatureForCta)}
                    >
                      {`Betaal ${featurePriceLabel(lockedFeatureForCta)} voor deze functie`}
                    </button>
                    {' of neem een '}
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => navigate({ name: 'upgrade' })}
                    >
                      abonnement
                    </button>
                  </>
                )}
              </>
            )}
            {showUpgradeLink && !lockedFeatureForCta && (
              <button type="button" className="linkish" onClick={() => navigate({ name: 'upgrade' })}>
                Bekijk opties
              </button>
            )}
          </p>
        )}
        {interactive && (
          <p className="bom-hint">Klik een regel om te markeren in 3D.</p>
        )}
        {bom.fittings.length > 0 && (
          <p className="bom-hint">Tik op een koppeling-voorbeeld voor een grotere 3D-weergave.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Steigerbuizen" className="bom-panel-section">
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
        <CollapsibleSection title="Buiskoppelingen" className="bom-panel-section">
          <table className="bom-fittings-table">
            <thead>
              <tr>
                <th className="bom-fitting-thumb-col">Vorm</th>
                <th>Onderdeel</th>
                <th>Type</th>
                <th>Aantal</th>
              </tr>
            </thead>
            <tbody>
              {bom.fittings.map((fitting) => {
                const catalog = FITTINGS.find((f) => f.type === fitting.type)
                const label = FITTING_TYPE_LABELS[fitting.type] ?? catalog?.name ?? fitting.type
                const shopUrl = fittingProductUrl(fitting.type, effectiveMaterialId, config.diameter)
                const rowHighlight: BomHighlight =
                  ACCESSORY_TYPES.has(fitting.type as AccessoryBomType)
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
                    <td className="bom-fitting-thumb-col" onClick={(e) => e.stopPropagation()}>
                      <BomFittingThumb
                        type={fitting.type}
                        materialId={effectiveMaterialId}
                        diameter={config.diameter}
                      />
                    </td>
                    <td>
                      <span className="bom-fitting-name">{label}</span>
                      <span className="bom-fitting-type-code muted">
                        <code>{fitting.type}</code>
                      </span>
                      {shopUrl && (
                        <a
                          className="bom-fitting-inline-shop"
                          href={shopUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Webshop
                        </a>
                      )}
                    </td>
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
        <CollapsibleSection title="Hout (planken / platen)" className="bom-panel-section">
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
        <CollapsibleSection title="Opmerkingen" className="bom-panel-section">
          <ul className="bom-notes">
            {bom.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Prijsindicatie" className="bom-panel-section">
        <PriceIndicationPanel bom={bom} config={config} materialId={effectiveMaterialId} />
      </CollapsibleSection>
    </div>
  )
}
