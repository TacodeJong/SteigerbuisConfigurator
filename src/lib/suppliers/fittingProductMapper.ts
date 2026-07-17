import type { FittingType, MaterialId, PipeDiameter } from '../../types'

/** Materiaal-familie zoals leveranciers die onderscheiden (niet 1:1 met MaterialId). */
export type SupplierMaterialFamily = 'staal' | 'zwart' | 'aluminium' | 'outdoor' | 'vierkant' | 'onbehandeld'

const VALID_DIAMETERS: PipeDiameter[] = [26.9, 33.7, 42.4, 48.3]

const HANDLE_DIA: Record<string, PipeDiameter> = {
  '269': 26.9,
  '337': 33.7,
  '424': 42.4,
  '483': 48.3,
}

/** Fitting types die de 3D-editor automatisch plaatst of als accessoire ondersteunt. */
export const EDITOR_FITTING_TYPES: FittingType[] = [
  't-kort',
  't-lang',
  'kniestuk-90',
  'kruisstuk',
  'koppelstuk',
  'voetplaat-rond',
  'voetplaat-vierkant',
  'afdekdop',
  'voetdop',
  '3-weg-hoek',
  'drieweg-kniestuk',
  'vierweg-kruisstuk',
  'scharnieroog',
  'scharnierhuls',
  'dubbelscharnier-90',
  'dubbelscharnier-recht',
]

/** Alleen via detectFittingsFromPipes — geen handmatige plaatsing in toolbar. */
export const AUTO_DETECTED_FITTING_TYPES: FittingType[] = [
  't-kort',
  'kniestuk-90',
  'kruisstuk',
  'koppelstuk',
  'voetplaat-rond',
  'afdekdop',
  'voetdop',
  '3-weg-hoek',
  'drieweg-kniestuk',
  'vierweg-kruisstuk',
]

export function materialFamilyForId(materialId: MaterialId): SupplierMaterialFamily {
  if (materialId === 'zwart' || materialId === 'zwart-outdoor') return 'zwart'
  if (materialId === 'aluminium') return 'aluminium'
  if (materialId === 'groen-outdoor') return 'outdoor'
  return 'staal'
}

export function materialIdMatchesFamily(materialId: MaterialId, family: SupplierMaterialFamily): boolean {
  switch (family) {
    case 'zwart':
      return materialId === 'zwart' || materialId === 'zwart-outdoor'
    case 'aluminium':
      return materialId === 'aluminium'
    case 'outdoor':
      return materialId === 'groen-outdoor' || materialId === 'zwart-outdoor'
    case 'vierkant':
      return false
    case 'onbehandeld':
    case 'staal':
      return (
        materialId === 'staal' ||
        materialId === 'groen-outdoor' ||
        materialId === 'wit' ||
        materialId === 'beige'
      )
    default:
      return false
  }
}

function parseDiameterFromText(text: string): PipeDiameter | null {
  const normalized = text.toLowerCase().replace(',', '.')
  for (const m of normalized.matchAll(/(\d{2,3})[.,](\d)\s*mm/g)) {
    const d = parseFloat(`${m[1]}.${m[2]}`)
    if (VALID_DIAMETERS.includes(d as PipeDiameter)) return d as PipeDiameter
  }
  for (const m of normalized.matchAll(/(\d{2})-(\d)-mm|(\d{3})-mm|(\d{2})-mm1?/g)) {
    const slugBit = (m[1] && m[2] ? `${m[1]}${m[2]}` : m[3] ?? m[4]?.replace(/1$/, '')) ?? ''
    if (HANDLE_DIA[slugBit]) return HANDLE_DIA[slugBit]
    const asDia = parseFloat(slugBit.replace(/(\d{2})(\d)/, '$1.$2'))
    if (VALID_DIAMETERS.includes(asDia as PipeDiameter)) return asDia as PipeDiameter
  }
  if (/\b33\b/.test(normalized) && !/\b33[.,]7/.test(normalized)) return 33.7
  if (/\b42\b/.test(normalized) && !/\b42[.,]4/.test(normalized)) return 42.4
  if (/\b48\b/.test(normalized) && !/\b48[.,]3/.test(normalized)) return 48.3
  return null
}

function parseMaterialFamily(text: string, slug: string): SupplierMaterialFamily | null {
  const t = `${text} ${slug}`.toLowerCase()
  if (t.includes('vierkant') || t.includes('40x40') || t.includes('25x25')) return 'vierkant'
  if (t.includes('aluminium') || t.includes('alum')) return 'aluminium'
  if (t.includes('onbehandeld')) return 'onbehandeld'
  if (t.includes('outdoor') || t.includes('gecoat') && t.includes('buiten')) return 'outdoor'
  if (t.includes('zwart') || t.includes('black')) return 'zwart'
  if (
    t.includes('staal') ||
    t.includes('zink') ||
    t.includes('verzink') ||
    t.includes('gegalvaniseerd') ||
    t.includes('galvan')
  ) {
    return 'staal'
  }
  return 'staal'
}

/** Map shop product title + slug naar intern FittingType (null = geen editor/BOM-type). */
export function mapProductToFittingType(name: string, slug: string): FittingType | null {
  const t = `${name} ${slug}`.toLowerCase()
  if (t.includes('vierkant') && (t.includes('voet') || t.includes('plaat'))) return 'voetplaat-vierkant'
  if (t.includes('voetplaat') || (t.includes('voet') && t.includes('plaat'))) {
    if (t.includes('vierkant') || t.includes('ovaal')) return 'voetplaat-vierkant'
    return 'voetplaat-rond'
  }
  if (t.includes('afdekdop') || t.includes('eindkap') || t.includes('inslagdop') || t.includes('einddop')) {
    return 'afdekdop'
  }
  if (t.includes('dubbelscharnier') || t.includes('dubbel scharnier') || t.includes('oogdeel dubbele lip')) {
    if (t.includes('90') || t.includes('haaks')) return 'dubbelscharnier-90'
    return 'dubbelscharnier-recht'
  }
  if (t.includes('scharnieroog') || (t.includes('scharnier') && t.includes('oog'))) return 'scharnieroog'
  if (t.includes('scharnierhuls') || (t.includes('scharnier') && t.includes('huls'))) return 'scharnierhuls'
  if (t.includes('scharnierstuk') || t.includes('scharnier enkel') || t.includes('scharnier-enkel')) {
    return 'scharnieroog'
  }
  if (t.includes('koppelstuk') || t.includes('verbindingsstuk') || t.includes('klemverbinder')) {
    return 'koppelstuk'
  }
  if (t.includes('vierweg') || t.includes('4-weg') || t.includes('4 weg')) return 'vierweg-kruisstuk'
  if (t.includes('centraal kruis') || t.includes('centraal-kruis')) return 'vierweg-kruisstuk'
  if (t.includes('open kruis') || t.includes('kruisstuk 4') || t.includes('kruisstuk-4')) {
    return 'kruisstuk'
  }
  if (t.includes('kruisstuk') || t.includes('kruis')) return 'kruisstuk'
  if (t.includes('drieweg') || t.includes('3-weg') && t.includes('knie')) return 'drieweg-kniestuk'
  if (t.includes('hoekstuk') || t.includes('3-weg-hoek') || t.includes('hoekstuk doorlop')) {
    return '3-weg-hoek'
  }
  if ((t.includes('t-stuk') || t.includes('t stuk') || t.includes('t-stuk')) && t.includes('lang')) {
    return 't-lang'
  }
  if (t.includes('t-stuk') || t.includes('t stuk') || t.includes('kort-t') || t.includes('kort t')) {
    return 't-kort'
  }
  if (t.includes('kniestuk') || t.includes('bocht 90') || t.includes('knie 90') || t.includes('kniebocht')) {
    return 'kniestuk-90'
  }
  return null
}

export function isRoundScaffoldFitting(name: string, slug: string): boolean {
  const t = `${name} ${slug}`.toLowerCase()
  if (parseMaterialFamily(name, slug) === 'vierkant') return false
  if (t.includes('vierkant') || t.includes('25x25') || t.includes('40x40')) return false
  if (t.includes('gasbuis') || t.includes('vlaggenstok') || t.includes('betonblok')) return false
  if (t.includes('borgring') || t.includes('kapbeugel') || t.includes('leuningdrager')) return false
  if (t.includes('boeiboord') || t.includes('wandbeugel') && !t.includes('voetplaat')) return false
  return mapProductToFittingType(name, slug) !== null
}

export interface MappedFittingProduct {
  fittingType: FittingType | null
  diameter: PipeDiameter | null
  materialFamily: SupplierMaterialFamily | null
  editorCompatible: boolean
}

export function mapSupplierFittingProduct(name: string, slug: string): MappedFittingProduct {
  if (!isRoundScaffoldFitting(name, slug)) {
    return { fittingType: null, diameter: null, materialFamily: null, editorCompatible: false }
  }
  const fittingType = mapProductToFittingType(name, slug)
  const diameter = parseDiameterFromText(`${name} ${slug}`)
  const materialFamily = parseMaterialFamily(name, slug)
  return {
    fittingType,
    diameter,
    materialFamily,
    editorCompatible: fittingType !== null && EDITOR_FITTING_TYPES.includes(fittingType),
  }
}
