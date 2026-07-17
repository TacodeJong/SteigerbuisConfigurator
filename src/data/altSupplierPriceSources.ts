import type { FittingType, MaterialId, PipeDiameter } from '../types'
import { lookupCatalogFittingUrl } from './supplierFittingCatalog'

export interface PipeSource {
  materialId: MaterialId
  diameter: PipeDiameter
  slug: string
}

export interface FittingSource {
  type: FittingType
  materialId: MaterialId
  diameter: PipeDiameter
  slug: string
}

const DIA_SLUG: Record<PipeDiameter, string> = {
  26.9: '269',
  33.7: '337',
  42.4: '424',
  48.3: '483',
}

function stunterDia(diameter: PipeDiameter): string {
  return DIA_SLUG[diameter]
}

function pipeVariant(materialId: MaterialId): 'staal' | 'zwart' | 'aluminium' {
  if (materialId === 'zwart' || materialId === 'zwart-outdoor') return 'zwart'
  if (materialId === 'aluminium') return 'aluminium'
  return 'staal'
}

const BUISKOPPELEN_PIPES: Partial<Record<MaterialId, Partial<Record<PipeDiameter, string>>>> = {
  staal: {
    26.9: 'steigerbuizen/staal/steigerbuis-staal-26-9-mm',
    33.7: 'steigerbuizen/staal/steigerbuis-staal-33-7-mm',
    42.4: 'steigerbuizen/staal/steigerbuis-staal-42-4-mm',
    48.3: 'steigerbuizen/staal/steigerbuis-staal-48-3-mm',
  },
  'groen-outdoor': {
    33.7: 'steigerbuizen/staal/steigerbuis-staal-33-7-mm',
    42.4: 'steigerbuizen/staal/steigerbuis-staal-42-4-mm',
    48.3: 'steigerbuizen/staal/steigerbuis-staal-48-3-mm',
  },
  'zwart-outdoor': {
    33.7: 'steigerbuizen/staal/steigerbuis-staal-33-7-mm',
    42.4: 'steigerbuizen/staal/steigerbuis-staal-42-4-mm',
    48.3: 'steigerbuizen/staal/steigerbuis-staal-48-3-mm',
  },
  zwart: {
    33.7: 'steigerbuizen/zwart/steigerbuis-zwart-33-7-mm',
    42.4: 'steigerbuizen/zwart/steigerbuis-zwart-42-4-mm',
    48.3: 'steigerbuizen/zwart/steigerbuis-zwart-48-3-mm',
  },
  wit: { 33.7: 'steigerbuizen/staal/steigerbuis-staal-33-7-mm', 42.4: 'steigerbuizen/staal/steigerbuis-staal-42-4-mm' },
  beige: { 33.7: 'steigerbuizen/staal/steigerbuis-staal-33-7-mm', 42.4: 'steigerbuizen/staal/steigerbuis-staal-42-4-mm' },
  aluminium: {
    33.7: 'steigerbuizen/aluminium/aluminium-steigerbuis-33-7-mm',
    42.4: 'steigerbuizen/aluminium/aluminium-steigerbuis-42-4-mm',
  },
}

const BUISKOPPELEN_FITTINGS_STAAL: Partial<Record<FittingType, string>> = {
  'kniestuk-90': 'buiskoppeling-kniestuk-90-graden-33-7-mm',
  't-kort': 'buiskoppeling-t-stuk-kort-33-7-mm',
  't-lang': 'buiskoppeling-lang-t-stuk-33-7-mm',
  kruisstuk: 'buiskoppeling-kruisstuk-in-1-vlak-33-7-mm',
  'vierweg-kruisstuk': 'buiskoppeling-4-weg-kruisstuk-337-mm',
  '3-weg-hoek': 'buiskoppeling-hoekstuk-doorlopende-staander-33-7-mm',
  'drieweg-kniestuk': 'buiskoppeling-drieweg-kniestuk-33-7-mm',
  'voetplaat-rond': 'buiskoppeling-ronde-voetplaat-33-7-mm',
  koppelstuk: 'buiskoppeling-koppelstuk-33-7-mm',
}

const BUISKOPPELEN_FITTINGS_ZWART: Partial<Record<FittingType, string>> = {
  'kniestuk-90': 'buiskoppeling-kniestuk-90-gr-zwart-337-mm',
  't-kort': 'buiskoppeling-kort-t-stuk-33-7-mm-zwart',
  't-lang': 'buiskoppeling-lang-t-stuk-zwart-337-mm',
  kruisstuk: 'buiskoppeling-kruisstuk-in-1-vlak-zwart-337-mm',
  'vierweg-kruisstuk': 'buiskoppeling-4-weg-kruisstuk-337-mm',
  '3-weg-hoek': 'buiskoppeling-hoekstuk-doorlopend-zwart-90-gr-337-mm',
  'drieweg-kniestuk': 'buiskoppeling-drieweg-kniestuk-90-gr-zwart-337-mm',
  'voetplaat-rond': 'buiskoppeling-ronde-voetplaat-zwart-33-7-mm',
  koppelstuk: 'buiskoppeling-koppelstuk-zwart-33-7-mm',
}

const STUNTER_PIPES: Partial<Record<'staal' | 'zwart' | 'aluminium', Partial<Record<PipeDiameter, string>>>> = {
  staal: {
    26.9: 'buis-staal-269-mm',
    33.7: 'buis-staal-337-mm',
    42.4: 'buis-staal-424-mm',
    48.3: 'buis-staal-483-mm',
  },
  zwart: {
    26.9: 'buis-zwart-269-mm',
    33.7: 'buis-zwart-337-mm',
    42.4: 'buis-zwart-424-mm',
    48.3: 'buis-zwart-483-mm',
  },
  aluminium: {
    26.9: 'buis-aluminium-269-mm',
    33.7: 'buis-aluminium-337-mm',
    42.4: 'buis-aluminium-42-mm',
    48.3: 'buis-aluminium-48-mm',
  },
}

const STUNTER_FITTINGS: Partial<Record<'staal' | 'zwart', Partial<Record<FittingType, string>>>> = {
  staal: {
    'kniestuk-90': 'kniestuk-2-weg-90-337-mm',
    't-kort': 't-stuk-kort-337-mm',
    't-lang': 't-stuk-lang-337-mm',
    kruisstuk: 'kruisstuk-90-337-mm',
    'vierweg-kruisstuk': 'kruisstuk-4-weg-337-mm',
    '3-weg-hoek': 'hoekstuk-90-337-mm',
    'drieweg-kniestuk': 'kniestuk-3-weg-90-337-mm',
    'voetplaat-rond': 'voetplaat-rond-337-mm',
    afdekdop: 'afdekdop-metaal-337-mm',
    koppelstuk: 'koppelstuk-337-mm',
  },
  zwart: {
    'kniestuk-90': 'kniestuk-2-weg-90-zwart-337-mm',
    't-kort': 't-stuk-kort-zwart-337-mm',
    't-lang': 't-stuk-lang-zwart-337-mm',
    kruisstuk: 'kruisstuk-90-zwart-337-mm',
    'vierweg-kruisstuk': 'kruisstuk-4-weg-337-mm',
    '3-weg-hoek': 'hoekstuk-90-zwart-337-mm',
    'drieweg-kniestuk': 'kniestuk-3-weg-90-zwart-337-mm',
    'voetplaat-rond': 'voetplaat-rond-zwart-337-mm',
    afdekdop: 'afdekdop-metaal-zwart-337-mm',
    koppelstuk: 'koppelstuk-337-mm',
  },
}

const BOUWBUIS_PIPES: Partial<Record<MaterialId, Partial<Record<PipeDiameter, string>>>> = {
  staal: {
    26.9: 'steigerbuis-26-9-mm',
    33.7: 'steigerbuis-33-7-mm',
    42.4: 'steigerbuis-42-4-mm',
    48.3: 'steigerbuis-48-3-mm',
  },
  'groen-outdoor': {
    26.9: 'steigerbuis-26-9-mm',
    33.7: 'steigerbuis-33-7-mm',
    42.4: 'steigerbuis-42-4-mm',
    48.3: 'steigerbuis-48-3-mm',
  },
  'zwart-outdoor': {
    26.9: 'steigerbuis-26-9-mm',
    33.7: 'steigerbuis-33-7-mm',
    42.4: 'steigerbuis-42-4-mm',
    48.3: 'steigerbuis-48-3-mm',
  },
  zwart: { 33.7: 'steigerbuis-33-7-mm', 42.4: 'steigerbuis-42-4-mm', 48.3: 'steigerbuis-48-3-mm' },
  wit: { 33.7: 'steigerbuis-33-7-mm', 42.4: 'steigerbuis-42-4-mm' },
  beige: { 33.7: 'steigerbuis-33-7-mm', 42.4: 'steigerbuis-42-4-mm' },
  aluminium: { 33.7: 'steigerbuis-33-7-mm', 42.4: 'steigerbuis-42-4-mm' },
}

const BOUWBUIS_FITTINGS: Partial<Record<'staal' | 'zwart', Partial<Record<FittingType, string>>>> = {
  staal: {
    'kniestuk-90': 'kniestuk-33-7-mm',
    't-kort': 'kort-t-stuk-33-7-mm',
    't-lang': 'lang-t-stuk-33-7-mm',
    kruisstuk: 'kruisstuk-33-7-mm',
    'vierweg-kruisstuk': 'centraal-kruisstuk-33-7-mm',
    '3-weg-hoek': 'hoekstuk-doorlopende-staander-33-7-mm',
    'drieweg-kniestuk': '3-weg-hoekstuk-33-7-mm',
    'voetplaat-rond': 'ronde-wand-plafond-voetplaat-33-7-mm',
    afdekdop: 'inslagdop-metaal-33-7-mm',
    koppelstuk: 'recht-verbindingsstuk-uitwendig-33-7-mm',
  },
  zwart: {
    'kniestuk-90': 'kniestuk-zwart-33-7-mm',
    't-kort': 'kort-t-stuk-33-7-mm',
    't-lang': 'lang-t-stuk-33-7-mm',
    kruisstuk: 'kruisstuk-33-7-mm',
    'voetplaat-rond': 'ronde-wand-plafond-voetplaat-33-7-mm',
  },
}

const FITTING_TYPES = Object.keys(BUISKOPPELEN_FITTINGS_STAAL) as FittingType[]
const PIPE_DIAMETERS = [26.9, 33.7, 42.4, 48.3] as PipeDiameter[]

function fittingFamily(materialId: MaterialId): 'staal' | 'zwart' {
  return materialId === 'zwart' || materialId === 'zwart-outdoor' ? 'zwart' : 'staal'
}

export function buiskoppelenPipeSources(): PipeSource[] {
  const out: PipeSource[] = []
  for (const [materialId, byDia] of Object.entries(BUISKOPPELEN_PIPES) as [
    MaterialId,
    Partial<Record<PipeDiameter, string>>,
  ][]) {
    if (!byDia) continue
    for (const [diameter, slug] of Object.entries(byDia)) {
      if (slug) out.push({ materialId, diameter: Number(diameter) as PipeDiameter, slug })
    }
  }
  return out
}

export function buiskoppelenFittingSources(): FittingSource[] {
  const out: FittingSource[] = []
  const materials = Object.keys(BUISKOPPELEN_PIPES) as MaterialId[]
  for (const materialId of materials) {
    const map =
      fittingFamily(materialId) === 'zwart' ? BUISKOPPELEN_FITTINGS_ZWART : BUISKOPPELEN_FITTINGS_STAAL
    for (const type of FITTING_TYPES) {
      const slug = map[type]
      if (!slug) continue
      for (const diameter of PIPE_DIAMETERS) {
        out.push({ type, materialId, diameter, slug })
      }
    }
  }
  return out
}

export function stunterPipeSources(): PipeSource[] {
  const out: PipeSource[] = []
  const materialIds = Object.keys(BOUWBUIS_PIPES) as MaterialId[]
  for (const materialId of materialIds) {
    const variant = pipeVariant(materialId)
    const byDia = STUNTER_PIPES[variant]
    if (!byDia) continue
    for (const [diameter, slug] of Object.entries(byDia)) {
      if (slug) out.push({ materialId, diameter: Number(diameter) as PipeDiameter, slug })
    }
  }
  return out
}

export function stunterFittingSources(): FittingSource[] {
  const out: FittingSource[] = []
  const materials = Object.keys(BOUWBUIS_PIPES) as MaterialId[]
  for (const materialId of materials) {
    const family = fittingFamily(materialId)
    const map = STUNTER_FITTINGS[family]
    if (!map) continue
    for (const type of FITTING_TYPES) {
      const base = map[type]
      if (!base) continue
      for (const diameter of PIPE_DIAMETERS) {
        const diaSlug = stunterDia(diameter)
        out.push({
          type,
          materialId,
          diameter,
          slug: base.includes('337') ? base.replace('337', diaSlug) : base,
        })
      }
    }
  }
  return out
}

export function bouwbuisPipeSources(): PipeSource[] {
  const out: PipeSource[] = []
  for (const [materialId, byDia] of Object.entries(BOUWBUIS_PIPES) as [
    MaterialId,
    Partial<Record<PipeDiameter, string>>,
  ][]) {
    if (!byDia) continue
    for (const [diameter, slug] of Object.entries(byDia)) {
      if (slug) out.push({ materialId, diameter: Number(diameter) as PipeDiameter, slug })
    }
  }
  return out
}

export function bouwbuisFittingSources(): FittingSource[] {
  const out: FittingSource[] = []
  const materials = Object.keys(BOUWBUIS_PIPES) as MaterialId[]
  for (const materialId of materials) {
    const map = BOUWBUIS_FITTINGS[fittingFamily(materialId)]
    if (!map) continue
    for (const type of FITTING_TYPES) {
      const slug = map[type]
      if (!slug) continue
      for (const diameter of PIPE_DIAMETERS) {
        out.push({ type, materialId, diameter, slug })
      }
    }
  }
  return out
}

export function buiskoppelenProductUrl(slug: string): string {
  return `https://buiskoppelen.nl/${slug}/`
}

export function stunterProductUrl(slug: string): string {
  return `https://www.steigerbuisstunter.nl/products/${slug}`
}

export function bouwbuisProductUrl(slug: string): string {
  return `https://bouwbuis.nl/${slug}`
}

export function buiskoppelenPipeUrl(materialId: MaterialId, diameter: PipeDiameter): string | null {
  const slug = BUISKOPPELEN_PIPES[materialId]?.[diameter]
  return slug ? buiskoppelenProductUrl(slug) : null
}

export function buiskoppelenFittingUrl(
  type: FittingType,
  materialId: MaterialId,
  diameter: PipeDiameter,
): string | null {
  return (
    lookupCatalogFittingUrl('buiskoppelen', type, materialId, diameter) ??
    (() => {
      const map =
        fittingFamily(materialId) === 'zwart' ? BUISKOPPELEN_FITTINGS_ZWART : BUISKOPPELEN_FITTINGS_STAAL
      const slug = map[type]
      return slug ? buiskoppelenProductUrl(slug) : null
    })()
  )
}

export function stunterPipeUrl(materialId: MaterialId, diameter: PipeDiameter): string | null {
  const slug = STUNTER_PIPES[pipeVariant(materialId)]?.[diameter]
  return slug ? stunterProductUrl(slug) : null
}

export function stunterFittingUrl(
  type: FittingType,
  materialId: MaterialId,
  diameter: PipeDiameter,
): string | null {
  return (
    lookupCatalogFittingUrl('steigerbuisstunter', type, materialId, diameter) ??
    (() => {
      const family = fittingFamily(materialId)
      const base = STUNTER_FITTINGS[family]?.[type]
      if (!base) return null
      const slug = base.includes('337') ? base.replace('337', stunterDia(diameter)) : base
      return stunterProductUrl(slug)
    })()
  )
}

export function bouwbuisPipeUrl(materialId: MaterialId, diameter: PipeDiameter): string | null {
  const slug = BOUWBUIS_PIPES[materialId]?.[diameter]
  return slug ? bouwbuisProductUrl(slug) : null
}

export function bouwbuisFittingUrl(
  type: FittingType,
  materialId: MaterialId,
  diameter: PipeDiameter,
): string | null {
  return (
    lookupCatalogFittingUrl('bouwbuis', type, materialId, diameter) ??
    (() => {
      const slug = BOUWBUIS_FITTINGS[fittingFamily(materialId)]?.[type]
      return slug ? bouwbuisProductUrl(slug) : null
    })()
  )
}
