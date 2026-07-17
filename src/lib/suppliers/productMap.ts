import type { FittingType, MaterialId, PipeDiameter } from '../../types'
import { SHOP_BASE } from '../../data/catalog'
import { fittingSlug } from '../../data/supplierPriceSources'

/** Materiaal-variant in URL-slugs op steigerbuisgroothandel.nl */
const MATERIAL_SLUG: Record<MaterialId, string> = {
  'groen-outdoor': 'outdoor-groen',
  'zwart-outdoor': 'outdoor-zwart',
  zwart: 'zwart',
  staal: 'staal',
  wit: 'wit',
  beige: 'beige',
  aluminium: 'aluminium',
}

const DIAMETER_SLUG: Record<PipeDiameter, string> = {
  26.9: '26-9',
  33.7: '33-7',
  42.4: '42-4',
  48.3: '48-3',
}

/** Vaste product-slugs voor buizen (per materiaal × diameter). */
export const PIPE_SLUG: Partial<Record<MaterialId, Partial<Record<PipeDiameter, string>>>> = {
  'groen-outdoor': {
    26.9: 'steigerbuis-outdoor-groen-o-26-9-mm',
    33.7: 'stalen-buis-outdoor-zwart-33-7-x-3-25-mm-1',
    42.4: 'steigerbuis-outdoor-groen-o-42-4-mm',
    48.3: 'steigerbuis-outdoor-groen-o-48-3-mm-mat',
  },
  'zwart-outdoor': {
    33.7: 'stalen-buis-outdoor-zwart-33-7-x-3-25-mm',
    42.4: 'stalen-buis-outdoor-zwart-42-4-x-3-25-mm',
    48.3: 'stalen-buis-outdoor-zwart-48-3-x-3-25-mm',
  },
  staal: {
    26.9: 'steigerbuis-staal-o-26-9-mm-zinkkleurig-zijdeglans-max-6-meter',
    33.7: 'steigerbuis-staal-o-33-7-mm-zinkkleurig-zijdeglans-max-6-meter',
    42.4: 'steigerbuis-staal-o-42-4-mm-zinkkleurig-zijdeglans-max-6-meter',
    48.3: 'steigerbuis-staal-o-48-3-mm-zinkkleurig-zijdeglans-max-6-meter',
  },
  zwart: {
    33.7: 'steigerbuis-zwart-o-33-7-mm-mat-max-3-meter',
    42.4: 'steigerbuis-zwart-o-42-4-mm-mat-max-3-meter',
    48.3: 'steigerbuis-zwart-o-48-3-mm-mat-max-3-meter',
  },
  wit: {
    33.7: 'steigerbuis-wit-o-33-7-mm-mat-max-3-meter',
    42.4: 'steigerbuis-wit-o-42-4-mm-mat-max-3-meter',
  },
  beige: {
    33.7: 'steigerbuis-wit-o-33-7-mm-mat-max-3-meter-1',
    42.4: 'steigerbuis-beige-o-42-4-mm-mat-max-3-meter',
  },
  aluminium: {
    33.7: 'alum-buis-outdoor-zwart-33-x-3-mm',
    42.4: 'alum-buis-outdoor-zwart-42-x-3-mm',
  },
}

/** Fitting-slug-sjabloon per type (met {mat} en {dia}). */
const FITTING_SLUG: Partial<Record<FittingType, string>> = {
  't-kort': 'kort-t-stuk-{mat}-{dia}-mm',
  't-lang': 'lang-t-stuk-{mat}-{dia}-mm',
  'kniestuk-90': 'kniestuk-{mat}-{dia}-mm',
  '3-weg-hoek': 'hoekstuk-{mat}-{dia}-mm',
  'drieweg-kniestuk': 'drieweg-kniestuk-{mat}-{dia}-mm',
  'vierweg-kruisstuk': 'kruisstuk-90-grad-{mat}-{dia}-mm',
  kruisstuk: 'kruisstuk-{mat}-{dia}-mm',
  koppelstuk: 'koppelstuk-{mat}-{dia}-mm',
  'voetplaat-rond': 'voetplaat-rond-{mat}-{dia}-mm',
  'voetplaat-vierkant': 'voetplaat-vierkant-{mat}-{dia}-mm',
  afdekdop: 'afdekdop-{mat}-{dia}-mm',
  scharnieroog: 'scharnieroog-{mat}-{dia}-mm',
  scharnierhuls: 'scharnierhuls-{mat}-{dia}-mm',
  'dubbelscharnier-90': 'dubbelscharnier-90-grad-{mat}-{dia}-mm',
  'dubbelscharnier-recht': 'dubbelscharnier-recht-{mat}-{dia}-mm',
}

export function pipeProductUrl(materialId: MaterialId, diameter: PipeDiameter): string | null {
  const slug = PIPE_SLUG[materialId]?.[diameter]
  return slug ? `${SHOP_BASE}/${slug}` : null
}

export function fittingProductUrl(
  type: FittingType,
  materialId: MaterialId,
  diameter: PipeDiameter,
): string | null {
  const known = fittingSlug(type, materialId, diameter)
  if (known) return `${SHOP_BASE}/${known}`
  const template = FITTING_SLUG[type]
  if (!template) return null
  const mat = MATERIAL_SLUG[materialId]
  const dia = DIAMETER_SLUG[diameter]
  if (!mat || !dia) return null
  const slug = template.replace('{mat}', mat).replace('{dia}', dia)
  return `${SHOP_BASE}/${slug}`
}

export function listPipeProductUrls(): { materialId: MaterialId; diameter: PipeDiameter; url: string }[] {
  const out: { materialId: MaterialId; diameter: PipeDiameter; url: string }[] = []
  for (const [materialId, byDia] of Object.entries(PIPE_SLUG) as [MaterialId, Partial<Record<PipeDiameter, string>>][]) {
    if (!byDia) continue
    for (const [diameter, slug] of Object.entries(byDia)) {
      if (!slug) continue
      out.push({ materialId, diameter: Number(diameter) as PipeDiameter, url: `${SHOP_BASE}/${slug}` })
    }
  }
  return out
}

export function listFittingProductUrls(): {
  type: FittingType
  materialId: MaterialId
  diameter: PipeDiameter
  url: string
}[] {
  const materials = Object.keys(MATERIAL_SLUG) as MaterialId[]
  const diameters = Object.keys(DIAMETER_SLUG).map(Number) as PipeDiameter[]
  const types = Object.keys(FITTING_SLUG) as FittingType[]
  const out: { type: FittingType; materialId: MaterialId; diameter: PipeDiameter; url: string }[] = []
  for (const type of types) {
    for (const materialId of materials) {
      for (const diameter of diameters) {
        const url = fittingProductUrl(type, materialId, diameter)
        if (url) out.push({ type, materialId, diameter, url })
      }
    }
  }
  return out
}
