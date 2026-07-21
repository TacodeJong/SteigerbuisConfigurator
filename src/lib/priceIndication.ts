import { PLANK_CATALOG } from '../data/catalog'
import type { BomResult, MaterialId, PipeDiameter } from '../types'

/** Per-mm excl. btw — interne richtprijzen (geen leveranciersclaim). */
const PIPE_RATE_PER_MM: Partial<Record<MaterialId, number>> = {
  staal: 0.0069,
  'groen-outdoor': 0.01193,
  'zwart-outdoor': 0.01193,
  zwart: 0.011,
  wit: 0.013,
  beige: 0.013,
  aluminium: 0.025,
}

const FITTING_EX_VAT: Partial<Record<MaterialId, number>> = {
  staal: 3.5,
  'groen-outdoor': 6.5,
  'zwart-outdoor': 6.5,
  zwart: 5,
  wit: 6,
  beige: 6,
  aluminium: 8,
}

const VOETDOP_EX_VAT = 2.5
const VAT_RATE = 0.21

/** Band rond midpunt: lager −20%, hoger +30%. */
const RANGE_LOW_FACTOR = 0.8
const RANGE_HIGH_FACTOR = 1.3

export type PriceCategoryId = 'budget' | 'midden' | 'hoger' | 'premium'

export interface PriceIndication {
  /** Midpunt excl. btw (interne som). */
  midExVat: number
  /** Midpunt incl. btw. */
  midInclVat: number
  /** Ondergrens band incl. btw (afgerond). */
  lowInclVat: number
  /** Bovengrens band incl. btw (afgerond). */
  highInclVat: number
  categoryId: PriceCategoryId
  categoryLabel: string
  vatRate: number
}

const CATEGORY_LABELS: Record<PriceCategoryId, string> = {
  budget: 'budget',
  midden: 'middenklasse',
  hoger: 'hoger segment',
  premium: 'premium',
}

function diameterFactor(diameter: PipeDiameter): number {
  const baseline = 33.7
  const ratio = diameter / baseline
  return 0.85 + 0.15 * ratio
}

function roundDownNice(n: number): number {
  if (n < 50) return Math.max(0, Math.floor(n / 5) * 5)
  if (n < 200) return Math.floor(n / 10) * 10
  return Math.floor(n / 25) * 25
}

function roundUpNice(n: number): number {
  if (n < 50) return Math.ceil(n / 5) * 5
  if (n < 200) return Math.ceil(n / 10) * 10
  return Math.ceil(n / 25) * 25
}

function categoryForMidIncl(midIncl: number): PriceCategoryId {
  if (midIncl < 150) return 'budget'
  if (midIncl < 450) return 'midden'
  if (midIncl < 900) return 'hoger'
  return 'premium'
}

/**
 * Ruwe prijsindicatie voor het hele ontwerp op basis van interne
 * richtprijzen × BOM-aantallen. Geen leveranciersvergelijking.
 */
export function estimateProjectPrice(
  bom: BomResult,
  materialId: MaterialId,
  diameter: PipeDiameter,
): PriceIndication {
  const dia = diameterFactor(diameter)
  const pipeRate = (PIPE_RATE_PER_MM[materialId] ?? 0.008) * dia
  const fittingUnit = (FITTING_EX_VAT[materialId] ?? 7.5) * dia

  let midExVat = 0

  for (const pipe of bom.pipes) {
    midExVat += pipe.lengthMm * pipe.quantity * pipeRate
  }

  for (const fitting of bom.fittings) {
    const unit = fitting.type === 'voetdop' ? VOETDOP_EX_VAT : fittingUnit
    midExVat += unit * fitting.quantity
  }

  for (const plank of bom.planks ?? []) {
    const isPlate = plank.label.includes('plaat') || plank.label.includes('multiplex')
    const areaM2 = (plank.lengthMm / 1000) * (plank.widthMm / 1000)
    const unit = isPlate
      ? areaM2 * PLANK_CATALOG.plate.pricePerSqmExVat
      : (plank.lengthMm / 1000) * PLANK_CATALOG.plank.pricePerMeterExVat
    midExVat += unit * plank.quantity
  }

  for (const item of bom.hardware ?? []) {
    midExVat += PLANK_CATALOG.mount.unitPriceExVat * item.quantity
  }

  const midInclVat = midExVat * (1 + VAT_RATE)
  const lowInclVat = roundDownNice(midInclVat * RANGE_LOW_FACTOR)
  const highInclVat = roundUpNice(midInclVat * RANGE_HIGH_FACTOR)
  const categoryId = categoryForMidIncl(midInclVat)

  return {
    midExVat,
    midInclVat,
    lowInclVat,
    highInclVat: Math.max(highInclVat, lowInclVat + (lowInclVat < 50 ? 5 : 10)),
    categoryId,
    categoryLabel: CATEGORY_LABELS[categoryId],
    vatRate: VAT_RATE,
  }
}
