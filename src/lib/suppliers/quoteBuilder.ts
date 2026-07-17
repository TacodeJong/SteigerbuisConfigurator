import type { BomResult, FittingType, MaterialId, PipeDiameter } from '../../types'
import { FITTINGS, MATERIALS, PLANK_CATALOG } from '../../data/catalog'
import { FITTING_TYPE_LABELS } from '../fittings'
import { formatMm } from '../bom'
import type {
  FittingPriceEntry,
  PipePriceEntry,
  QuoteContext,
  QuoteLine,
  SupplierPriceCatalog,
  SupplierQuote,
} from './types'

export function pipeLineKey(lengthMm: number): string {
  return `pipe:${lengthMm}`
}

export function fittingLineKey(type: FittingType, label?: string): string {
  return `fitting:${type}:${label ?? ''}`
}

/** Per-mm excl. btw wanneer geen cache-entry voor dit materiaal. */
const FALLBACK_PIPE_RATE_PER_MM: Partial<Record<MaterialId, number>> = {
  staal: 0.0069,
  'groen-outdoor': 0.01193,
  'zwart-outdoor': 0.01193,
  zwart: 0.011,
  wit: 0.013,
  beige: 0.013,
  aluminium: 0.025,
}

const FALLBACK_FITTING_EX_VAT: Partial<Record<MaterialId, number>> = {
  staal: 3.5,
  'groen-outdoor': 6.5,
  'zwart-outdoor': 6.5,
  zwart: 5,
  wit: 6,
  beige: 6,
  aluminium: 8,
}

/** Rubberen/kunststof voetdop (binnenopstelling) — geen materiaalvariant, vast richtbedrag. */
const FALLBACK_VOETDOP_EX_VAT = 2.5

export interface QuoteBuilderConfig {
  supplierId: string
  supplierName: string
  website: string
  catalog: SupplierPriceCatalog
  pipeProductUrl: (materialId: MaterialId, diameter: PipeDiameter) => string | null
  fittingProductUrl: (type: FittingType, materialId: MaterialId, diameter: PipeDiameter) => string | null
  extraNotes?: string[]
}

function pickPipeEntry(
  catalog: SupplierPriceCatalog,
  materialId: MaterialId,
  diameter: PipeDiameter,
): { entry: PipePriceEntry | null; estimated: boolean } {
  const direct = catalog.pipes[materialId]?.[diameter]
  if (direct) return { entry: direct, estimated: false }

  const sameMaterial = catalog.pipes[materialId]
  if (sameMaterial) {
    const fallback = nearestDiameter(sameMaterial, diameter)
    if (fallback) {
      return {
        entry: scalePipeEntry(fallback.entry, fallback.from, diameter),
        estimated: true,
      }
    }
  }

  return { entry: null, estimated: true }
}

function pickFittingEntry(
  catalog: SupplierPriceCatalog,
  type: FittingType,
  materialId: MaterialId,
  diameter: PipeDiameter,
): { entry: FittingPriceEntry | null; estimated: boolean } {
  const direct = catalog.fittings[type]?.[materialId]?.[diameter]
  if (direct) return { entry: direct, estimated: false }

  const sameTypeMat = catalog.fittings[type]?.[materialId]
  if (sameTypeMat) {
    const fallback = nearestDiameter(sameTypeMat, diameter)
    if (fallback) {
      return {
        entry: {
          ...fallback.entry,
          unitPriceExVat: scaleByDiameterRatio(fallback.entry.unitPriceExVat ?? 7.5, fallback.from, diameter),
        },
        estimated: true,
      }
    }
  }

  return { entry: null, estimated: true }
}

function nearestDiameter<T extends { unitPriceExVat?: number; unitPricePerMmExVat?: number }>(
  byDia: Partial<Record<PipeDiameter, T>>,
  target: PipeDiameter,
): { entry: T; from: PipeDiameter } | null {
  const entries = Object.entries(byDia) as [string, T][]
  if (entries.length === 0) return null
  const sorted = entries
    .map(([d, entry]) => ({ d: Number(d) as PipeDiameter, entry }))
    .sort((a, b) => Math.abs(a.d - target) - Math.abs(b.d - target))
  return { entry: sorted[0].entry, from: sorted[0].d }
}

function scaleByDiameterRatio(price: number, from: PipeDiameter, to: PipeDiameter): number {
  const ratio = to / from
  return price * (0.85 + 0.15 * ratio)
}

function scalePipeEntry(entry: PipePriceEntry, from: PipeDiameter, to: PipeDiameter): PipePriceEntry {
  return {
    ...entry,
    unitPricePerMmExVat: entry.unitPricePerMmExVat * scaleByDiameterRatio(1, from, to),
  }
}

function fittingLabel(type: FittingType): string {
  return FITTING_TYPE_LABELS[type] ?? FITTINGS.find((f) => f.type === type)?.name ?? type
}

export function buildQuoteFromCatalog(bom: BomResult, context: QuoteContext, config: QuoteBuilderConfig): SupplierQuote {
  const { catalog, supplierId, supplierName, website, pipeProductUrl, fittingProductUrl } = config
  const materialName = MATERIALS.find((m) => m.id === context.materialId)?.name ?? context.materialId
  const lines: QuoteLine[] = []
  const notes: string[] = [`Prijzen voor ${materialName} · Ø ${context.diameter} mm.`]
  let hasEstimate = false
  let hasMissing = false

  const { entry: pipeEntry, estimated: pipeEstimated } = pickPipeEntry(
    catalog,
    context.materialId,
    context.diameter,
  )
  if (pipeEstimated) hasEstimate = true
  if (!pipeEntry) hasMissing = true

  for (const pipe of bom.pipes) {
    const rate = pipeEntry?.unitPricePerMmExVat ?? FALLBACK_PIPE_RATE_PER_MM[context.materialId] ?? 0.008
    const lineTotal = pipe.lengthMm * pipe.quantity * rate
    lines.push({
      lineKey: pipeLineKey(pipe.lengthMm),
      kind: 'pipe',
      label: `Buis · ${formatMm(pipe.lengthMm)}`,
      quantity: pipe.quantity,
      unitLabel: 'per stuk',
      unitPriceExVat: pipe.lengthMm * rate,
      lineTotalExVat: lineTotal,
      productUrl: pipeEntry?.productUrl ?? pipeProductUrl(context.materialId, context.diameter) ?? undefined,
      sku: pipeEntry?.sku,
      cartItemId: pipeEntry?.variantId,
      estimated: pipeEstimated || !pipeEntry,
    })
  }

  for (const fitting of bom.fittings) {
    const { entry, estimated } = pickFittingEntry(catalog, fitting.type, context.materialId, context.diameter)
    if (estimated) hasEstimate = true
    if (!entry) hasMissing = true
    const fallbackUnit =
      fitting.type === 'voetdop'
        ? FALLBACK_VOETDOP_EX_VAT
        : (FALLBACK_FITTING_EX_VAT[context.materialId] ?? 7.5)
    const unit = entry?.unitPriceExVat ?? fallbackUnit
    lines.push({
      lineKey: fittingLineKey(fitting.type, fitting.label),
      kind: 'fitting',
      label: fittingLabel(fitting.type),
      quantity: fitting.quantity,
      unitLabel: 'per stuk',
      unitPriceExVat: unit,
      lineTotalExVat: unit * fitting.quantity,
      productUrl:
        entry?.productUrl ??
        fittingProductUrl(fitting.type, context.materialId, context.diameter) ??
        undefined,
      sku: entry?.sku,
      cartItemId: entry?.variantId,
      estimated: estimated || !entry,
    })
  }

  // Steigerplanken / platen + schapsteunen: catalogusprijs (hout — geen leverancierscache).
  for (const plank of bom.planks ?? []) {
    const isPlate = plank.label.includes('plaat') || plank.label.includes('multiplex')
    const areaM2 = (plank.lengthMm / 1000) * (plank.widthMm / 1000)
    const unit = isPlate
      ? areaM2 * PLANK_CATALOG.plate.pricePerSqmExVat
      : (plank.lengthMm / 1000) * PLANK_CATALOG.plank.pricePerMeterExVat
    lines.push({
      lineKey: `plank:${plank.label}:${plank.lengthMm}x${plank.widthMm}x${plank.thicknessMm}`,
      kind: 'plank',
      label: `${plank.label} · ${formatMm(plank.lengthMm)} × ${formatMm(plank.widthMm)} × ${plank.thicknessMm} mm`,
      quantity: plank.quantity,
      unitLabel: 'per stuk',
      unitPriceExVat: unit,
      lineTotalExVat: unit * plank.quantity,
      estimated: true,
    })
  }

  for (const item of bom.hardware ?? []) {
    lines.push({
      lineKey: `hardware:${item.label}`,
      kind: 'hardware',
      label: item.label,
      quantity: item.quantity,
      unitLabel: 'per stuk',
      unitPriceExVat: PLANK_CATALOG.mount.unitPriceExVat,
      lineTotalExVat: PLANK_CATALOG.mount.unitPriceExVat * item.quantity,
      estimated: true,
    })
  }

  if ((bom.planks?.length ?? 0) > 0) {
    notes.push('Hout (plank/plaat) en schapsteunen: richtprijs uit de eigen catalogus (geen leverancierscache).')
  }

  const subtotalExVat = lines.reduce((s, l) => s + l.lineTotalExVat, 0)
  const vatRate = catalog.vatRate
  const vatAmount = subtotalExVat * vatRate
  const totalInclVat = subtotalExVat + vatAmount

  if (hasMissing) {
    notes.push('Niet alle producten staan in de prijscache — schatting gebruikt waar nodig.')
  }
  if (hasEstimate) {
    notes.push('Gedeeltelijk geschat op basis van een andere diameter binnen hetzelfde materiaal.')
  }
  if (config.extraNotes) notes.push(...config.extraNotes)
  if (catalog.updatedAt) {
    notes.push(`Prijscache bijgewerkt: ${new Date(catalog.updatedAt).toLocaleString('nl-NL')}.`)
  }

  const status = hasMissing ? 'estimate' : hasEstimate ? 'partial' : 'complete'

  return {
    supplierId,
    supplierName,
    website,
    status,
    lines,
    subtotalExVat,
    vatRate,
    vatAmount,
    totalInclVat,
    fetchedAt: catalog.updatedAt,
    notes,
  }
}
