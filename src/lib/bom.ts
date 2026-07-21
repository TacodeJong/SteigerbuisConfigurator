import type { BomFitting, BomPipe, BomResult, KlimrekConfig } from '../types'
import { barLengthFromConfig } from './dimensions'

export const PIPE_LABEL = 'Buis'

function addPipe(pipes: BomPipe[], lengthMm: number, quantity: number) {
  const existing = pipes.find((p) => p.lengthMm === lengthMm)
  if (existing) {
    existing.quantity += quantity
  } else {
    pipes.push({ lengthMm, quantity, label: PIPE_LABEL })
  }
}

function addFitting(fittings: BomFitting[], type: BomFitting['type'], quantity: number, label: string) {
  const existing = fittings.find((f) => f.type === type && f.label === label)
  if (existing) {
    existing.quantity += quantity
  } else {
    fittings.push({ type, quantity, label })
  }
}

/**
 * Berekent de stuklijst voor een rechthoekig frame (configurator-startpunt).
 * Buizen zijn altijd gewone buizen op maat — gegroepeerd per lengte.
 */
export function calculateKlimrekBom(config: KlimrekConfig): BomResult {
  const { height, rungCount, includeRoof, baseType, anchorDepthMm } = config
  const pipes: BomPipe[] = []
  const fittings: BomFitting[] = []
  const notes: string[] = []

  const postLength = height + (baseType === 'grondanker' ? anchorDepthMm : 0)
  const rungLength = barLengthFromConfig(config, 'width')
  const depthBarLength = barLengthFromConfig(config, 'depth')

  addPipe(pipes, postLength, 4)
  addPipe(pipes, rungLength, rungCount * 2)
  addPipe(pipes, depthBarLength, rungCount * 2)

  if (includeRoof) {
    addPipe(pipes, rungLength, 2)
    addPipe(pipes, depthBarLength, 2)
    notes.push('Dakvlak: overweeg houten planken of geperforeerde roostervloer bovenop de buizen.')
  }

  if (baseType === 'grondanker') {
    notes.push(
      `Grondanker: ${anchorDepthMm} mm extra buislengte per hoekpaal in beton (maaiveld 0 mm, onderkant −${anchorDepthMm} mm).`,
    )
    notes.push('Tip: gebruik een bekisting van Ø 100–150 mm rond de buis voor een stevige betonpoer.')
  }

  if (baseType === 'voetplaat') {
    addFitting(fittings, 'voetplaat-rond', 4, 'Onder hoekpaal')
  }

  if (baseType === 'vloerdop') {
    addFitting(fittings, 'voetdop', 4, 'Onder hoekpaal')
    notes.push(
      'Binnenopstelling: het rek staat los op de vloer op rubberen/kunststof voetdoppen (anti-slip).',
    )
  }

  addFitting(fittings, 't-kort', rungCount * 4, 'T-stuk op staander')
  addFitting(fittings, 'kniestuk-90', 4, 'Hoekverbinding')

  if (!includeRoof) {
    addFitting(fittings, 'afdekdop', 4, 'Bovenkant paal')
  }

  if (config.diameter === 26.9 && height > 2000) {
    notes.push('Bij een hoogte boven 2 m adviseren we minimaal Ø 33,7 mm voor extra stevigheid.')
  }

  if (
    baseType !== 'vloerdop' &&
    (config.materialId === 'zwart' || config.materialId === 'wit' || config.materialId === 'beige')
  ) {
    notes.push('Gekozen materiaal is primair voor binnen; overweeg groen outdoor of zwart outdoor voor de tuin.')
  }

  notes.push(
    'Veel steigerbuisleveranciers zagen buizen gratis op maat. Geef de exacte lengtes door bij bestelling.',
  )

  const totalPipeLengthMm = pipes.reduce((sum, p) => sum + p.lengthMm * p.quantity, 0)

  return { pipes, fittings, totalPipeLengthMm, notes }
}

export function formatMm(mm: number): string {
  if (mm >= 1000) {
    const meters = mm / 1000
    return Number.isInteger(meters) ? `${meters} m` : `${meters.toFixed(2)} m`
  }
  return `${mm} mm`
}

export function formatMeters(mm: number): string {
  return `${(mm / 1000).toFixed(2)} m`
}
