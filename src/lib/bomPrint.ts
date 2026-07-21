import type { BomResult, FittingType, KlimrekConfig, MaterialId } from '../types'
import { FITTINGS, MATERIALS } from '../data/catalog'
import { PRICED_SUPPLIERS } from '../data/supplierRegistry'
import { FITTING_TYPE_LABELS } from './fittings'
import { formatMm, formatMeters } from './bom'
import { fillPrintWindow, openPrintDocument, openPrintPlaceholder } from './printDocument'
import { captureFittingThumbsForPrint } from '../components/BomFittingThumb'

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fittingLabel(type: BomResult['fittings'][number]['type']): string {
  return FITTING_TYPE_LABELS[type] ?? FITTINGS.find((f) => f.type === type)?.name ?? type
}

function printStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; font-size: 11pt; color: #111; margin: 1.2cm 1.5cm; line-height: 1.4; }
    h1 { font-size: 16pt; margin: 0 0 0.25rem; }
    .meta { color: #444; font-size: 10pt; margin-bottom: 1rem; }
    h2 { font-size: 12pt; margin: 1rem 0 0.4rem; border-bottom: 1px solid #ccc; padding-bottom: 0.2rem; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 0.5rem; }
    th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #e5e5e5; vertical-align: middle; }
    th { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    td.num { text-align: right; white-space: nowrap; }
    td.thumb { width: 52px; padding: 0.25rem 0.35rem; }
    td.thumb img {
      width: 44px; height: 44px; object-fit: cover; display: block;
      border-radius: 4px; border: 1px solid #d8dde3; background: #e8edf2;
    }
    .notes { margin: 1rem 0 0; padding-left: 1.2rem; font-size: 10pt; color: #444; }
    .footer { margin-top: 1.5rem; padding-top: 0.5rem; border-top: 1px solid #ccc; font-size: 9pt; color: #666; }
    @media print {
      body { margin: 0.8cm 1cm; }
      td.thumb img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `
}

export interface PrintBomOptions {
  bom: BomResult
  config: KlimrekConfig
  materialId: MaterialId
  /** JPEG data-URLs per fitting type (3D-voorbeeld, print-vriendelijk). */
  fittingThumbs?: Map<FittingType, string> | Record<string, string>
}

/** Bestellijst voor klembord: aantallen + namen/lengtes, zonder webshop-artikelnummers. */
export function buildOrderListText(bom: BomResult): string {
  const rows: string[] = []

  for (const pipe of bom.pipes) {
    rows.push(`${pipe.quantity}×\tBuis ${formatMm(pipe.lengthMm)}`)
  }

  for (const fitting of bom.fittings) {
    const label = fittingLabel(fitting.type)
    rows.push(`${fitting.quantity}×\t${label} (${fitting.label})`)
  }

  for (const plank of bom.planks ?? []) {
    rows.push(
      `${plank.quantity}×\t${plank.label} ${formatMm(plank.lengthMm)} (${plank.thicknessMm} × ${plank.widthMm} mm)`,
    )
  }

  for (const item of bom.hardware ?? []) {
    rows.push(`${item.quantity}×\t${item.label}`)
  }

  return rows.join('\n')
}

function thumbFor(
  fittingThumbs: PrintBomOptions['fittingThumbs'],
  type: FittingType,
): string | undefined {
  if (!fittingThumbs) return undefined
  if (fittingThumbs instanceof Map) return fittingThumbs.get(type)
  return fittingThumbs[type]
}

/** Body-HTML voor stuklijst (zonder art.nr.; optionele koppeling-thumbs). */
export function buildBomPrintBody({
  bom,
  config,
  materialId,
  fittingThumbs,
}: PrintBomOptions): string {
  const material = MATERIALS.find((m) => m.id === materialId)
  const hasThumbs =
    !!fittingThumbs &&
    (fittingThumbs instanceof Map ? fittingThumbs.size > 0 : Object.keys(fittingThumbs).length > 0)
  const date = new Date().toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' })

  const pipeRows = bom.pipes
    .map(
      (pipe) => `<tr>
        <td>Buis · ${esc(formatMm(pipe.lengthMm))}</td>
        <td class="num">${pipe.quantity}×</td>
      </tr>`,
    )
    .join('')

  const fittingRows = bom.fittings
    .map((fitting) => {
      const label = fittingLabel(fitting.type)
      const thumb = thumbFor(fittingThumbs, fitting.type)
      const thumbCell = hasThumbs
        ? `<td class="thumb">${
            thumb
              ? `<img src="${thumb}" alt="${esc(label)}" width="44" height="44" />`
              : ''
          }</td>`
        : ''
      return `<tr>
        ${thumbCell}
        <td>${esc(label)}</td>
        <td>${esc(fitting.label)}</td>
        <td class="num">${fitting.quantity}×</td>
      </tr>`
    })
    .join('')

  const plankRows = (bom.planks ?? [])
    .map(
      (plank) => `<tr>
        <td>${esc(plank.label)} · ${esc(formatMm(plank.lengthMm))} (${plank.thicknessMm} × ${plank.widthMm} mm)</td>
        <td class="num">${plank.quantity}×</td>
      </tr>`,
    )
    .join('')

  const hardwareRows = (bom.hardware ?? [])
    .map(
      (item) => `<tr>
        <td>${esc(item.label)}</td>
        <td class="num">${item.quantity}×</td>
      </tr>`,
    )
    .join('')

  const notes = bom.notes.map((n) => `<li>${esc(n)}</li>`).join('')
  const supplierLinks = PRICED_SUPPLIERS.map(
    (s) => `<a href="${esc(s.website)}">${esc(s.name)}</a>`,
  ).join(' · ')

  return `
  <h1>Stuklijst</h1>
  <p class="meta">
    ${esc(date)}<br />
    Materiaal: <strong>${esc(material?.name ?? materialId)}</strong> · Ø ${config.diameter} mm<br />
    Totaal buislengte: <strong>${esc(formatMeters(bom.totalPipeLengthMm))}</strong>
    ${
      config.baseType === 'grondanker'
        ? ` · Grondanker ${config.anchorDepthMm} mm`
        : config.baseType === 'vloerdop'
          ? ' · Binnen, los op voetdoppen'
          : ' · Voetplaten'
    }
  </p>

  <h2>Steigerbuizen</h2>
  <table>
    <thead><tr>
      <th>Lengte</th><th>Aantal</th>
    </tr></thead>
    <tbody>${pipeRows}</tbody>
  </table>

  ${
    bom.fittings.length > 0
      ? `<h2>Buiskoppelingen</h2>
  <table>
    <thead><tr>
      ${hasThumbs ? '<th>Vorm</th>' : ''}<th>Onderdeel</th><th>Positie</th><th>Aantal</th>
    </tr></thead>
    <tbody>${fittingRows}</tbody>
  </table>`
      : ''
  }

  ${
    plankRows || hardwareRows
      ? `<h2>Steigerplanken &amp; bevestiging</h2>
  <table>
    <thead><tr>
      <th>Onderdeel</th><th>Aantal</th>
    </tr></thead>
    <tbody>${plankRows}${hardwareRows}</tbody>
  </table>`
      : ''
  }

  ${bom.notes.length > 0 ? `<ul class="notes">${notes}</ul>` : ''}

  <p class="footer">
    Gegenereerd met Steigerbuis configurator · Bestel bij een steigerbuisleverancier:
    ${supplierLinks}
  </p>`
}

export function buildBomHtml({ bom, config, materialId, fittingThumbs }: PrintBomOptions): string {
  const material = MATERIALS.find((m) => m.id === materialId)
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <title>Stuklijst — ${esc(material?.name ?? materialId)}</title>
  <style>${printStyles()}</style>
</head>
<body>
${buildBomPrintBody({ bom, config, materialId, fittingThumbs })}
</body>
</html>`
}

export function printBom(options: PrintBomOptions): boolean {
  return openPrintDocument(buildBomHtml(options))
}

export async function printBomWithGroothandelSkus(
  bom: BomResult,
  config: KlimrekConfig,
  materialId: MaterialId,
): Promise<boolean> {
  const win = openPrintPlaceholder()
  if (!win) return false
  try {
    const fittingThumbs = await captureFittingThumbsForPrint(
      bom.fittings.map((f) => f.type),
      materialId,
      config.diameter,
    )
    fillPrintWindow(
      win,
      buildBomHtml({
        bom,
        config,
        materialId,
        fittingThumbs,
      }),
    )
    return true
  } catch {
    win.close()
    return false
  }
}

export async function copyGroothandelOrderList(
  bom: BomResult,
  config: KlimrekConfig,
  materialId: MaterialId,
): Promise<boolean> {
  const text = buildOrderListText(bom)
  const header = `Stuklijst — ${MATERIALS.find((m) => m.id === materialId)?.name ?? materialId} · Ø ${config.diameter} mm\n\n`
  try {
    await navigator.clipboard.writeText(header + text)
    return true
  } catch {
    return false
  }
}
