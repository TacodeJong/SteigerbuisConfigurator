import type { FittingType, MaterialId, PipeDiameter } from '../types'
import { PIPE_SLUG } from '../lib/suppliers/productMap'

const DIA = {
  26.9: '26-9',
  33.7: '33-7',
  42.4: '42-4',
  48.3: '48-3',
} as const satisfies Record<PipeDiameter, string>

/** Kern-koppelingen die in de BOM voorkomen — per materiaal eigen shop-slugs. */
const FITTING_SLUG_BY_MATERIAL: Partial<
  Record<MaterialId, Partial<Record<FittingType, string | Partial<Record<PipeDiameter, string>>>>>
> = {
  'groen-outdoor': {
    'kniestuk-90': { 33.7: 'kniestuk-outdoor-groen-33-7-mm' },
    't-kort': { 33.7: 'kort-t-stuk-outdoor-groen-33-7-mm-h' },
    't-lang': { 33.7: 'lang-t-stuk-outdoor-groen-33-7-mm' },
    kruisstuk: { 33.7: 'kruisstuk-outdoor-groen-33-7-mm' },
    'vierweg-kruisstuk': { 33.7: 'kruisstuk-90-grad-outdoor-groen-33-7-mm' },
    '3-weg-hoek': { 33.7: 'hoekstuk-doorl-st-outdoor-groen-33-7-mm' },
    'drieweg-kniestuk': { 33.7: '3-weg-kniestuk-outdoor-groen-33-7-mm' },
    'voetplaat-rond': { 33.7: 'voetplaat-rond-outdoor-groen-33-7-mm' },
    afdekdop: { 33.7: 'afdekdop-outdoor-groen-33-7-mm' },
    koppelstuk: { 33.7: 'koppelstuk-outdoor-groen-33-7-mm' },
  },
  'zwart-outdoor': {
    'kniestuk-90': { 33.7: 'kniestuk-outdoor-zwart' },
    't-kort': { 33.7: 'kort-t-stuk-outdoor-zwart' },
    't-lang': { 33.7: 'lang-t-stuk-outdoor-zwart' },
    kruisstuk: { 33.7: 'kruisstuk-outdoor-zwart' },
    'vierweg-kruisstuk': { 33.7: 'kruisstuk-90-grad-outdoor-zwart' },
    '3-weg-hoek': { 33.7: 'hoekstuk-doorl-st-outdoor-zwart' },
    'drieweg-kniestuk': { 33.7: '3-weg-kniestuk-outdoor-zwart' },
    'voetplaat-rond': { 33.7: 'voetplaat-rond-outdoor-zwart' },
    afdekdop: { 33.7: 'afdekdop-outdoor-zwart' },
    koppelstuk: { 33.7: 'koppelstuk-outdoor-zwart' },
  },
  staal: {
    'kniestuk-90': { 33.7: 'buiskoppeling-kniestuk-33-7-mm-zink' },
    't-kort': { 33.7: 'buiskoppeling-kort-t-stuk-33-7-mm-zink' },
    't-lang': { 33.7: 'buiskoppeling-lang-t-stuk-33-7-mm-zink' },
    kruisstuk: { 33.7: 'buiskoppeling-kruisstuk-33-7-mm-zink' },
    'vierweg-kruisstuk': { 33.7: 'buiskoppeling-kruisstuk-90-grad-33-7-mm-zink' },
    '3-weg-hoek': { 33.7: 'buiskoppeling-hoekstuk-doorlopend-33-7-mm-zink' },
    'drieweg-kniestuk': { 33.7: 'buiskoppeling-drieweg-kniestuk-33-7-mm-zink' },
    'voetplaat-rond': { 33.7: 'buiskoppeling-voetplaat-rond-33-7-mm-zink' },
    afdekdop: { 33.7: 'buiskoppeling-afdekdop-33-7-mm-zink' },
    koppelstuk: { 33.7: 'buiskoppeling-koppelstuk-33-7-mm-zink' },
  },
  zwart: {
    'kniestuk-90': { 33.7: 'buiskoppeling-kniestuk-33-7-mm-zwart-gelakt' },
    't-kort': { 33.7: 'buiskoppeling-kort-t-stuk-33-7-mm-zwart-gelakt' },
    't-lang': { 33.7: 'buiskoppeling-lang-t-stuk-33-7-mm-zwart-gelakt' },
    kruisstuk: { 33.7: 'buiskoppeling-kruisstuk-33-7-mm-zwart-gelakt' },
    '3-weg-hoek': { 33.7: 'buiskoppeling-hoekstuk-33-7-mm-zwart-gelakt' },
    'drieweg-kniestuk': { 33.7: 'buiskoppeling-kniestuk-3-weg-33-7-mm-zwart-gelakt' },
    'voetplaat-rond': { 33.7: 'buiskoppeling-voetplaat-rond-33-7-mm-zwart-gelakt' },
    afdekdop: { 33.7: 'buiskoppeling-afdekdop-33-7-mm-zwart-gelakt' },
    koppelstuk: { 33.7: 'buiskoppeling-koppelstuk-33-7-mm-zwart-gelakt' },
  },
  wit: {
    'kniestuk-90': { 33.7: 'buiskoppeling-kniestuk-33-7-mm-wit-gelakt-staal' },
    't-kort': { 33.7: 'buiskoppeling-kort-t-stuk-33-7-mm-wit-gelakt-staal' },
    't-lang': { 33.7: 'buiskoppeling-lang-t-stuk-33-7-mm-wit-gelakt-staal' },
    kruisstuk: { 33.7: 'buiskoppeling-kruisstuk-33-7-mm-wit-gelakt-staal' },
    '3-weg-hoek': { 33.7: 'buiskoppeling-hoekstuk-33-7-mm-wit-gelakt-staal' },
    'drieweg-kniestuk': { 33.7: 'buiskoppeling-kniestuk-3-weg-33-7-mm-wit-gelakt-staal' },
    'voetplaat-rond': { 33.7: 'buiskoppeling-voetplaat-rond-33-7-mm-wit-gelakt-staal' },
    afdekdop: { 33.7: 'buiskoppeling-afdekdop-33-7-mm-wit-gelakt-staal' },
    koppelstuk: { 33.7: 'buiskoppeling-koppelstuk-33-7-mm-wit-gelakt-staal' },
  },
  beige: {
    'kniestuk-90': { 33.7: 'buiskoppeling-kniestuk-33-7-mm-beige-gelakt-staal' },
    't-kort': { 33.7: 'buiskoppeling-kort-t-stuk-33-7-mm-beige-gelakt-staal' },
    't-lang': { 33.7: 'buiskoppeling-lang-t-stuk-33-7-mm-beige-gelakt-staal' },
    kruisstuk: { 33.7: 'buiskoppeling-kruisstuk-33-7-mm-beige-gelakt-staal' },
    'drieweg-kniestuk': { 33.7: 'buiskoppeling-kniestuk-3-weg-33-7-mm-beige-gelakt-staal' },
    'voetplaat-rond': { 33.7: 'buiskoppeling-voetplaat-rond-33-7-mm-beige-gelakt-staal' },
    afdekdop: { 33.7: 'buiskoppeling-afdekdop-33-7-mm-beige-gelakt-staal' },
    koppelstuk: { 33.7: 'buiskoppeling-koppelstuk-33-7-mm-beige-gelakt-staal' },
  },
  aluminium: {
    'kniestuk-90': { 33.7: 'buiskoppeling-kniestuk-aluminium-33-mm' },
    't-kort': { 33.7: 'buiskoppeling-kort-t-stuk-aluminium-33-mm' },
    't-lang': { 33.7: 'buiskoppeling-lang-t-stuk-aluminium-33-mm' },
    koppelstuk: { 33.7: 'buiskoppeling-koppelstuk-aluminium-33-mm' },
  },
}

const FITTING_TYPES = Object.keys(FITTING_SLUG_BY_MATERIAL['groen-outdoor'] ?? {}) as FittingType[]
const MATERIAL_IDS = Object.keys(FITTING_SLUG_BY_MATERIAL) as MaterialId[]
const PIPE_DIAMETERS = Object.keys(DIA).map(Number) as PipeDiameter[]

export function fittingSlug(
  type: FittingType,
  materialId: MaterialId,
  diameter: PipeDiameter,
): string | null {
  const byMat = FITTING_SLUG_BY_MATERIAL[materialId]?.[type]
  if (!byMat) return null
  if (typeof byMat === 'string') return byMat
  return byMat[diameter] ?? byMat[33.7] ?? null
}

export function listPipePriceSources(): { materialId: MaterialId; diameter: PipeDiameter; slug: string }[] {
  const out: { materialId: MaterialId; diameter: PipeDiameter; slug: string }[] = []
  for (const [materialId, byDia] of Object.entries(PIPE_SLUG) as [MaterialId, Partial<Record<PipeDiameter, string>>][]) {
    if (!byDia) continue
    for (const [diameter, slug] of Object.entries(byDia)) {
      if (slug) out.push({ materialId, diameter: Number(diameter) as PipeDiameter, slug })
    }
  }
  return out
}

export function listFittingPriceSources(): {
  type: FittingType
  materialId: MaterialId
  diameter: PipeDiameter
  slug: string
}[] {
  const out: {
    type: FittingType
    materialId: MaterialId
    diameter: PipeDiameter
    slug: string
  }[] = []
  for (const materialId of MATERIAL_IDS) {
    for (const type of FITTING_TYPES) {
      for (const diameter of PIPE_DIAMETERS) {
        const slug = fittingSlug(type, materialId, diameter)
        if (slug) out.push({ type, materialId, diameter, slug })
      }
    }
  }
  return out
}
