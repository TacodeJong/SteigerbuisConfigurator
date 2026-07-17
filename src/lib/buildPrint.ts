import type { BomResult, KlimrekConfig, MaterialId, SceneModel } from '../types'
import { MATERIALS } from '../data/catalog'
import { formatMm } from './bom'
import { buildInstructions } from './buildInstructions'
import {
  computeFootprint,
  computeHoleCenterDimensions,
  floorplanPipes,
  prepareFloorplanHoles,
  type AnchorHole,
  type ClosedRectangle,
  type HoleCenterDimensions,
  type HoleSpan,
} from './floorplan'
import { openPrintDocument } from './printDocument'

const dimNumberFormat = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 })

/** Uitzetmaat altijd in hele mm (met evt. 1 decimaal) — nooit afronden naar meters. */
function formatDimMm(mm: number): string {
  return `${dimNumberFormat.format(mm)} mm`
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function printStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; font-size: 11pt; color: #111; margin: 1.2cm 1.5cm; line-height: 1.4; }
    h1 { font-size: 16pt; margin: 0 0 0.25rem; }
    .meta { color: #444; font-size: 10pt; margin-bottom: 1rem; }
    h2 { font-size: 12pt; margin: 1rem 0 0.4rem; border-bottom: 1px solid #ccc; padding-bottom: 0.2rem; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 0.5rem; }
    th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #e5e5e5; }
    th { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    td.num { text-align: right; white-space: nowrap; }
    .footer { margin-top: 1.5rem; padding-top: 0.5rem; border-top: 1px solid #ccc; font-size: 9pt; color: #666; }
    .floorplan-wrap { margin: 0.5rem 0 1rem; text-align: center; }
    .floorplan-wrap svg { max-width: 100%; height: auto; border: 1px solid #ddd; background: #f8faf8; }
    .dim-table { max-width: 28rem; }
    .step { margin-bottom: 1rem; page-break-inside: avoid; }
    .step h3 { font-size: 11pt; margin: 0 0 0.2rem; }
    .step p { margin: 0 0 0.35rem; color: #333; font-size: 10pt; }
    .step-num { display: inline-block; min-width: 1.6rem; font-weight: 700; }
    @media print { body { margin: 0.8cm 1cm; } }
  `
}

function openPrintWindow(title: string, bodyHtml: string): boolean {
  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>${printStyles()}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`

  return openPrintDocument(html)
}

interface SvgLayout {
  viewBox: string
  width: number
  height: number
}

function svgLayout(
  footprint: NonNullable<ReturnType<typeof computeFootprint>>,
  padMm: number,
  holeDims?: ReturnType<typeof computeHoleCenterDimensions> | null,
): SvgLayout {
  let vbX = footprint.minX * 1000 - padMm
  let vbZ = footprint.minZ * 1000 - padMm
  let w = footprint.widthMm + padMm * 2
  let h = footprint.depthMm + padMm * 2

  if (holeDims) {
    const rowCount = new Set(holeDims.spans.filter((s) => s.direction === 'horizontal').map((s) => s.from.zMm)).size
    const colCount = new Set(holeDims.spans.filter((s) => s.direction === 'vertical').map((s) => s.from.xMm)).size
    const dimPad = 140 + Math.max(rowCount, colCount) * 70
    vbX = Math.min(vbX, holeDims.minX - dimPad)
    vbZ = Math.min(vbZ, holeDims.minZ - dimPad)
    const vbRight = Math.max(footprint.maxX * 1000 + padMm, holeDims.maxX + dimPad)
    const vbBottom = Math.max(footprint.maxZ * 1000 + padMm, holeDims.maxZ + dimPad)
    w = vbRight - vbX
    h = vbBottom - vbZ
  }

  return {
    viewBox: `${vbX} ${vbZ} ${w} ${h}`,
    width: Math.min(720, w * 1.2),
    height: Math.min(560, h * 1.2),
  }
}

function svgDimMarkers(): string {
  return `<defs>
    <marker id="dim-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
      <path d="M0,0 L8,4 L0,8 Z" fill="#6d28d9" />
    </marker>
  </defs>`
}

/** Horizontale maatlijn tussen twee X-posities op vaste Z (offset naar boven in SVG). */
function svgHorizontalDim(x1: number, x2: number, z: number, label: string, offset: number): string {
  const y = z - offset
  const midX = (x1 + x2) / 2
  const lx = Math.min(x1, x2)
  const rx = Math.max(x1, x2)
  return `<g class="hole-dim">
    <line x1="${lx}" y1="${z}" x2="${lx}" y2="${y}" stroke="#6d28d9" stroke-width="3" />
    <line x1="${rx}" y1="${z}" x2="${rx}" y2="${y}" stroke="#6d28d9" stroke-width="3" />
    <line x1="${lx}" y1="${y}" x2="${rx}" y2="${y}" stroke="#6d28d9" stroke-width="4"
      marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)" />
    <text x="${midX}" y="${y - 14}" text-anchor="middle" font-size="30" font-weight="700"
      fill="#5b21b6" font-family="system-ui,sans-serif">${esc(label)}</text>
  </g>`
}

/** Verticale maatlijn tussen twee Z-posities op vaste X (offset naar links in SVG). */
function svgVerticalDim(z1: number, z2: number, x: number, label: string, offset: number): string {
  const dimX = x - offset
  const midZ = (z1 + z2) / 2
  const tz = Math.min(z1, z2)
  const bz = Math.max(z1, z2)
  return `<g class="hole-dim">
    <line x1="${x}" y1="${tz}" x2="${dimX}" y2="${tz}" stroke="#6d28d9" stroke-width="3" />
    <line x1="${x}" y1="${bz}" x2="${dimX}" y2="${bz}" stroke="#6d28d9" stroke-width="3" />
    <line x1="${dimX}" y1="${tz}" x2="${dimX}" y2="${bz}" stroke="#6d28d9" stroke-width="4"
      marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)" />
    <text x="${dimX - 16}" y="${midZ}" text-anchor="middle" font-size="30" font-weight="700"
      fill="#5b21b6" font-family="system-ui,sans-serif" transform="rotate(-90 ${dimX - 16} ${midZ})">${esc(label)}</text>
  </g>`
}

function svgDiagonalDim(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  label: string,
  color = '#16a34a',
  textColor = '#15803d',
): string {
  const midX = (x1 + x2) / 2
  const midZ = (z1 + z2) / 2
  const nx = -(z2 - z1)
  const ny = x2 - x1
  const len = Math.sqrt(nx * nx + ny * ny) || 1
  const ox = (nx / len) * 28
  const oz = (ny / len) * 28
  return `<g class="hole-dim-diag">
    <line x1="${x1}" y1="${z1}" x2="${x2}" y2="${z2}" stroke="${color}" stroke-width="5"
      stroke-dasharray="16 10" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)" />
    <rect x="${midX + ox - 90}" y="${midZ + oz - 22}" width="180" height="44" rx="8"
      fill="rgba(255,255,255,0.92)" stroke="${color}" stroke-width="2" />
    <text x="${midX + ox}" y="${midZ + oz + 10}" text-anchor="middle" font-size="28" font-weight="700"
      fill="${textColor}" font-family="system-ui,sans-serif">${esc(label)}</text>
  </g>`
}

function rowOffsetIndex(zMm: number, rows: number[]): number {
  const sorted = [...rows].sort((a, b) => a - b)
  return sorted.indexOf(rows.find((z) => Math.abs(z - zMm) < 1) ?? zMm)
}

function colOffsetIndex(xMm: number, cols: number[]): number {
  const sorted = [...cols].sort((a, b) => a - b)
  return sorted.indexOf(cols.find((x) => Math.abs(x - xMm) < 1) ?? xMm)
}

function svgRectangleDiagonal(rect: ClosedRectangle): string {
  const { topLeft, bottomRight } = rect.corners
  return svgDiagonalDim(
    topLeft.xMm,
    topLeft.zMm,
    bottomRight.xMm,
    bottomRight.zMm,
    `↗ ${formatDimMm(rect.diagonalMm)}`,
  )
}

function svgHoleSpans(spans: HoleSpan[]): string {
  const horizontal = spans.filter((s) => s.direction === 'horizontal')
  const vertical = spans.filter((s) => s.direction === 'vertical')
  const rowZs = [...new Set(horizontal.map((s) => s.from.zMm))].sort((a, b) => a - b)
  const colXs = [...new Set(vertical.map((s) => s.from.xMm))].sort((a, b) => a - b)
  const parts: string[] = []

  for (const span of horizontal) {
    const z = Math.min(span.from.zMm, span.to.zMm)
    const idx = rowOffsetIndex(z, rowZs)
    parts.push(svgHorizontalDim(span.from.xMm, span.to.xMm, z, formatDimMm(span.distanceMm), 90 + idx * 70))
  }

  for (const span of vertical) {
    const x = Math.min(span.from.xMm, span.to.xMm)
    const idx = colOffsetIndex(x, colXs)
    parts.push(svgVerticalDim(span.from.zMm, span.to.zMm, x, formatDimMm(span.distanceMm), 90 + idx * 70))
  }

  return parts.join('')
}

function svgHoleCenterDimensions(dims: HoleCenterDimensions): string {
  const parts: string[] = []

  if (dims.spans.length > 0) {
    parts.push(svgHoleSpans(dims.spans))
  } else {
    const { spanWidthMm, spanDepthMm, frontLeft, frontRight, backLeft } = dims
    if (spanWidthMm > 0) {
      const z = Math.min(frontLeft.zMm, frontRight.zMm)
      parts.push(svgHorizontalDim(frontLeft.xMm, frontRight.xMm, z, formatDimMm(spanWidthMm), 100))
    }
    if (spanDepthMm > 0) {
      parts.push(svgVerticalDim(frontLeft.zMm, backLeft.zMm, frontLeft.xMm, formatDimMm(spanDepthMm), 100))
    }
  }

  if (dims.rectangles.length > 0) {
    for (const rect of dims.rectangles) {
      parts.push(svgRectangleDiagonal(rect))
    }
  } else if (dims.diagonalMm > 0 && holesSpan2d(dims.spanWidthMm, dims.spanDepthMm)) {
    parts.push(
      svgDiagonalDim(
        dims.diagonalFrom.xMm,
        dims.diagonalFrom.zMm,
        dims.diagonalTo.xMm,
        dims.diagonalTo.zMm,
        `↗ ${formatDimMm(dims.diagonalMm)}`,
        '#db2777',
        '#9d174d',
      ),
    )
  }

  return parts.join('')
}

function rectangleCornerLabels(rect: ClosedRectangle): string {
  const { topLeft, topRight, bottomLeft, bottomRight } = rect.corners
  return `${topLeft.label}, ${topRight.label}, ${bottomRight.label}, ${bottomLeft.label}`
}

function holeDimensionsSummary(dims: HoleCenterDimensions): string {
  const rectPart =
    dims.rectangles.length > 0
      ? `${dims.rectangles.length} rechthoek${dims.rectangles.length === 1 ? '' : 'en'}`
      : `diagonaal ${formatDimMm(dims.diagonalMm)}`
  const spanPart =
    dims.spans.length > 0
      ? `${dims.spans.length} maatstuk${dims.spans.length === 1 ? '' : 'ken'}`
      : `${formatDimMm(dims.spanWidthMm)} breed × ${formatDimMm(dims.spanDepthMm)} diep`
  return `Gatmiddelpunten: <strong>${esc(spanPart)}</strong> · ${rectPart}`
}

function holesSpan2d(widthMm: number, depthMm: number): boolean {
  return widthMm > 0 && depthMm > 0
}

/** mm-coördinaten: X naar rechts, Z naar beneden (bovenaanzicht). */
export function buildFloorplanSvg(scene: SceneModel, config: KlimrekConfig): string {
  const footprint = computeFootprint(scene.pipes)
  if (!footprint) return '<p>Geen buizen om weer te geven.</p>'

  const padMm = 180
  const holes = prepareFloorplanHoles(scene, config)
  const holeDims = holes.length >= 2 ? computeHoleCenterDimensions(holes, scene.pipes) : null
  const layout = svgLayout(footprint, padMm, holeDims)
  const pipes = floorplanPipes(scene.pipes)

  const minXmm = footprint.minX * 1000
  const maxXmm = footprint.maxX * 1000
  const minZmm = footprint.minZ * 1000
  const maxZmm = footprint.maxZ * 1000

  const rect = `<rect x="${minXmm}" y="${minZmm}" width="${footprint.widthMm}" height="${footprint.depthMm}"
    fill="none" stroke="#2d5a3d" stroke-width="6" stroke-dasharray="20 14" opacity="0.55" />`

  // Staanders projecteren van bovenaf tot een punt — die worden als cirkel
  // op ware grootte getekend; liggende buizen als lijn op ware breedte.
  const isPointProjection = (p: (typeof pipes)[number]) =>
    Math.hypot(p.x2Mm - p.x1Mm, p.z2Mm - p.z1Mm) < p.diameterMm

  const pipeLines = pipes
    .filter((p) => !isPointProjection(p))
    .map(
      (p) => `<line x1="${p.x1Mm}" y1="${p.z1Mm}" x2="${p.x2Mm}" y2="${p.z2Mm}"
        stroke="#4a6fa5" stroke-width="${Math.max(p.diameterMm, 6)}" stroke-linecap="butt" opacity="0.55" />`,
    )
    .join('')

  // Gaten zijn op de plattegrond +Ø-gecorrigeerd; zet de staander in het
  // dichtstbijzijnde gatmiddelpunt zodat hij netjes in zijn gat staat.
  const snapToHole = (cx: number, cz: number): [number, number] => {
    let best: [number, number] = [cx, cz]
    let bestD = 100
    for (const h of holes) {
      const d = Math.hypot(h.xMm - cx, h.zMm - cz)
      if (d < bestD) {
        bestD = d
        best = [h.xMm, h.zMm]
      }
    }
    return best
  }

  const postMarks = pipes
    .filter(isPointProjection)
    .map((p) => {
      const [cx, cz] = snapToHole((p.x1Mm + p.x2Mm) / 2, (p.z1Mm + p.z2Mm) / 2)
      return `<circle cx="${cx}" cy="${cz}" r="${p.diameterMm / 2}"
        fill="#2f4f7a" stroke="#1e3450" stroke-width="3" opacity="0.95" />`
    })
    .join('')

  const holeMarks = holes
    .map((h, i) => {
      const r = h.diameterMm / 2
      return `<g>
        <circle cx="${h.xMm}" cy="${h.zMm}" r="${r}" fill="none" stroke="#c45c26" stroke-width="5" />
        <circle cx="${h.xMm}" cy="${h.zMm}" r="5" fill="#c45c26" />
        <circle cx="${h.xMm}" cy="${h.zMm}" r="2" fill="#fff" />
        <text x="${h.xMm}" y="${h.zMm - r - 16}" text-anchor="middle" font-size="26" font-weight="700"
          fill="#8b3d12" font-family="system-ui,sans-serif">${i + 1}</text>
      </g>`
    })
    .join('')

  const holeDimLines = holeDims ? svgHoleCenterDimensions(holeDims) : ''

  const footprintNote =
    holeDims == null
      ? `<text x="${(minXmm + maxXmm) / 2}" y="${maxZmm + 90}" text-anchor="middle" font-size="28" fill="#20402c" font-family="system-ui,sans-serif">${esc(formatMm(footprint.widthMm))} × ${esc(formatMm(footprint.depthMm))}</text>`
      : ''

  const north = `<text x="${(minXmm + maxXmm) / 2}" y="${minZmm - 50}" text-anchor="middle" font-size="24" fill="#666" font-family="system-ui,sans-serif">voor (Z−)</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${layout.viewBox}" width="${layout.width}" height="${layout.height}" role="img" aria-label="Plattegrond bovenaanzicht">
    ${svgDimMarkers()}
    ${rect}
    ${pipeLines}
    ${postMarks}
    ${holeDimLines}
    ${holeMarks}
    ${footprintNote}
    ${north}
  </svg>`
}

function holeMeasureTables(dims: HoleCenterDimensions | null): string {
  if (!dims) return ''

  const globalRows =
    dims.rectangles.length === 0 && dims.spans.length === 0
      ? `<tr><td colspan="2"><strong>Breedte</strong> (middelpunt ↔ middelpunt)</td><td colspan="3" class="num">${esc(formatDimMm(dims.spanWidthMm))}</td></tr>
       <tr><td colspan="2"><strong>Diepte</strong> (middelpunt ↔ middelpunt)</td><td colspan="3" class="num">${esc(formatDimMm(dims.spanDepthMm))}</td></tr>
       <tr><td colspan="2"><strong>Diagonaal</strong> (${esc(dims.diagonalFrom.label)} → ${esc(dims.diagonalTo.label)})</td><td colspan="3" class="num">${esc(formatDimMm(dims.diagonalMm))}</td></tr>`
      : ''

  const spanRows =
    dims.spans.length > 0
      ? dims.spans
          .map(
            (s) => `<tr>
        <td>${esc(s.from.label)} → ${esc(s.to.label)}</td>
        <td class="num">${s.direction === 'horizontal' ? 'horizontaal' : 'verticaal'}</td>
        <td class="num">${esc(formatDimMm(s.distanceMm))}</td>
        <td class="num">${s.pipeLengthMm != null ? esc(formatDimMm(s.pipeLengthMm)) : '—'}</td>
      </tr>`,
          )
          .join('')
      : ''

  const spanTable =
    dims.spans.length > 0
      ? `<h2>Losse maatstukken</h2>
  <table class="dim-table">
    <thead><tr><th>Van → naar</th><th>Richting</th><th>Middelpunt ↔ middelpunt</th><th>Buislengte</th></tr></thead>
    <tbody>${spanRows}</tbody>
  </table>`
      : ''

  const rectRows =
    dims.rectangles.length > 0
      ? dims.rectangles
          .map(
            (r, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(rectangleCornerLabels(r))}</td>
        <td class="num">${esc(formatDimMm(r.widthMm))}</td>
        <td class="num">${esc(formatDimMm(r.depthMm))}</td>
        <td class="num">${esc(formatDimMm(r.diagonalMm))}</td>
      </tr>`,
          )
          .join('')
      : ''

  const rectTable =
    dims.rectangles.length > 0
      ? `<h2>Gesloten rechthoeken</h2>
  <table class="dim-table">
    <thead><tr><th>#</th><th>Hoeken</th><th>Breedte</th><th>Diepte</th><th>Diagonaal</th></tr></thead>
    <tbody>${rectRows}</tbody>
  </table>`
      : ''

  return `${globalRows ? `<table class="dim-table"><tbody>${globalRows}</tbody></table>` : ''}${spanTable}${rectTable}`
}

function holeTableRows(holes: AnchorHole[], scene: SceneModel): string {
  if (!holes.length) return ''
  const dims = computeHoleCenterDimensions(holes, scene.pipes)
  const rows = holes
    .map(
      (h, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(h.label)}</td>
      <td class="num">X ${h.xMm} mm</td>
      <td class="num">Z ${h.zMm} mm</td>
      <td class="num">Ø ${h.diameterMm} mm · ${formatMm(h.depthMm)} diep</td>
    </tr>`,
    )
    .join('')

  return `<h2>Gaten voor grondankers</h2>
  <table class="dim-table">
    <thead><tr><th>#</th><th>Hoek</th><th>X</th><th>Z</th><th>Maat gat</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${holeMeasureTables(dims)}
  <p style="font-size:10pt;color:#555;">Maatvoering in mm tussen <strong>middelpunten</strong> van de gaten (= bestelbare buislengte + buisdiameter per richting, buizen tegen staanders). Paarse lijnen = losse maatstukken; groene stippellijn = diagonaal per gesloten rechthoek. Y = 0 is maaiveld.</p>`
}

export interface FloorplanPrintOptions {
  scene: SceneModel
  config: KlimrekConfig
  materialId: MaterialId
}

export function printFloorplan({ scene, config, materialId }: FloorplanPrintOptions): boolean {
  const material = MATERIALS.find((m) => m.id === materialId)
  const footprint = computeFootprint(scene.pipes)
  const holes = prepareFloorplanHoles(scene, config)
  const holeDims = holes.length >= 2 ? computeHoleCenterDimensions(holes, scene.pipes) : null
  const date = new Date().toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' })
  const svg = buildFloorplanSvg(scene, config)

  const body = `
  <h1>Plattegrond — gaten &amp; footprint</h1>
  <p class="meta">
    ${esc(date)}<br />
    Materiaal: <strong>${esc(material?.name ?? materialId)}</strong> · Ø ${config.diameter} mm<br />
    ${holeDims ? `${holeDimensionsSummary(holeDims)}<br />` : ''}
    ${footprint ? `Footprint buitenmaat: ${esc(formatMm(footprint.widthMm))} × ${esc(formatMm(footprint.depthMm))}` : ''}
    ${config.baseType === 'grondanker' ? ` · Grondanker ${config.anchorDepthMm} mm onder maaiveld` : ' · Voetplaten (geen gaten)'}
  </p>
  <div class="floorplan-wrap">${svg}</div>
  ${config.baseType === 'grondanker' ? holeTableRows(holes, scene) : '<p>Voetplaat-onderstel: geen betonpoeren nodig. Zet voetplaten op maaiveld op de hoeken van het footprint.</p>'}
  <p class="footer">Legenda: oranje cirkel = gat (middelpunt gemarkeerd), donkerblauwe stip = staander (doorsnede op ware grootte), lichtblauwe lijn = liggende buis, paars = losse maatstukken tussen middelpunten, groene stippellijn = diagonaal per gesloten rechthoek, donkergroen stippel = footprint buitenmaat.</p>`

  return openPrintWindow('Plattegrond', body)
}

export interface BuildInstructionPrintOptions {
  scene: SceneModel
  config: KlimrekConfig
  materialId: MaterialId
  bom: BomResult
}

export function printBuildInstructions({
  scene,
  config,
  materialId,
  bom,
}: BuildInstructionPrintOptions): boolean {
  const material = MATERIALS.find((m) => m.id === materialId)
  const steps = buildInstructions(scene, config, bom)
  const holes = prepareFloorplanHoles(scene, config)
  const holeDims = holes.length >= 2 ? computeHoleCenterDimensions(holes, scene.pipes) : null
  const date = new Date().toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' })
  const svg = buildFloorplanSvg(scene, config)

  const stepHtml = steps
    .map(
      (step) => `<div class="step">
      <h3><span class="step-num">${step.order}.</span> ${esc(step.title)}</h3>
      <p>${esc(step.description)}</p>
      ${
        step.parts.length > 0
          ? `<table><thead><tr><th>Onderdeel</th><th>Aantal</th><th>Lengte</th></tr></thead>
      <tbody>${step.parts
        .map(
          (p) => `<tr>
          <td>${esc(p.label)}</td>
          <td class="num">${p.quantity}×</td>
          <td class="num">${p.lengthMm != null ? esc(formatMm(p.lengthMm)) : '—'}</td>
        </tr>`,
        )
        .join('')}</tbody></table>`
          : ''
      }
    </div>`,
    )
    .join('')

  const body = `
  <h1>Bouwinstructie</h1>
  <p class="meta">
    ${esc(date)}<br />
    Materiaal: <strong>${esc(material?.name ?? materialId)}</strong> · Ø ${config.diameter} mm<br />
    ${config.baseType === 'grondanker' ? `Grondanker: buizen ${config.anchorDepthMm} mm onder maaiveld` : 'Onderstel: voetplaten op maaiveld'}
    ${holeDims ? `<br />${holeDimensionsSummary(holeDims)}` : ''}
  </p>

  <h2>Plattegrond (bovenaanzicht)</h2>
  <div class="floorplan-wrap">${svg}</div>
  ${config.baseType === 'grondanker' ? holeTableRows(holes, scene) : ''}

  <h2>Bouwstappen</h2>
  ${stepHtml}

  <p class="footer">Gegenereerd met Steigerbuis configurator. Controleer alle maten in de 3D-weergave vóór montage.${config.baseType === 'grondanker' ? ' Zet de poeren uit met de losse maatstukken per rij/kolom; meet daarna per rechthoek de groene diagonaal om haakse hoeken te controleren.' : ''}</p>`

  return openPrintWindow('Bouwinstructie', body)
}
