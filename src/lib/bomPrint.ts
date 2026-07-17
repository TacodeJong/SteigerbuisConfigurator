import type { BomResult, KlimrekConfig, MaterialId } from '../types'
import { FITTINGS, MATERIALS } from '../data/catalog'
import { FITTING_TYPE_LABELS } from './fittings'
import { formatMm, formatMeters } from './bom'
import { fillPrintWindow, openPrintDocument, openPrintPlaceholder } from './printDocument'
import { steigerbuisGroothandelAgent } from './suppliers/agents/steigerbuisGroothandelAgent'
import type { QuoteLine } from './suppliers/types'

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

function skuByLineKey(lines: QuoteLine[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of lines) {
    if (line.sku) map.set(line.lineKey, line.sku)
  }
  return map
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
    .notes { margin: 1rem 0 0; padding-left: 1.2rem; font-size: 10pt; color: #444; }
    .footer { margin-top: 1.5rem; padding-top: 0.5rem; border-top: 1px solid #ccc; font-size: 9pt; color: #666; }
    @media print { body { margin: 0.8cm 1cm; } }
  `
}

export interface PrintBomOptions {
  bom: BomResult
  config: KlimrekConfig
  materialId: MaterialId
  /** Artikelnummers van Steigerbuisgroothandel (optioneel). */
  quoteLines?: QuoteLine[]
}

export function buildOrderListText(bom: BomResult, quoteLines?: QuoteLine[]): string {
  const skus = quoteLines ? skuByLineKey(quoteLines) : new Map<string, string>()
  const rows: string[] = []

  for (const pipe of bom.pipes) {
    const key = `pipe:${pipe.lengthMm}`
    const sku = skus.get(key)
    const skuPart = sku ? `\t${sku}` : ''
    rows.push(`${pipe.quantity}×\tBuis ${formatMm(pipe.lengthMm)}${skuPart}`)
  }

  for (const fitting of bom.fittings) {
    const key = `fitting:${fitting.type}:${fitting.label ?? ''}`
    const sku = skus.get(key)
    const label = fittingLabel(fitting.type)
    const skuPart = sku ? `\t${sku}` : ''
    rows.push(`${fitting.quantity}×\t${label} (${fitting.label})${skuPart}`)
  }

  return rows.join('\n')
}

export function buildBomHtml({ bom, config, materialId, quoteLines }: PrintBomOptions): string {
  const material = MATERIALS.find((m) => m.id === materialId)
  const skus = quoteLines ? skuByLineKey(quoteLines) : new Map<string, string>()
  const hasSku = skus.size > 0
  const date = new Date().toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' })

  const pipeRows = bom.pipes
    .map((pipe) => {
      const sku = skus.get(`pipe:${pipe.lengthMm}`)
      return `<tr>
        <td>Buis · ${esc(formatMm(pipe.lengthMm))}</td>
        <td class="num">${pipe.quantity}×</td>
        ${hasSku ? `<td>${sku ? esc(sku) : '—'}</td>` : ''}
      </tr>`
    })
    .join('')

  const fittingRows = bom.fittings
    .map((fitting) => {
      const sku = skus.get(`fitting:${fitting.type}:${fitting.label ?? ''}`)
      const label = fittingLabel(fitting.type)
      return `<tr>
        <td>${esc(label)}</td>
        <td>${esc(fitting.label)}</td>
        <td class="num">${fitting.quantity}×</td>
        ${hasSku ? `<td>${sku ? esc(sku) : '—'}</td>` : ''}
      </tr>`
    })
    .join('')

  const notes = bom.notes.map((n) => `<li>${esc(n)}</li>`).join('')

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <title>Stuklijst — ${esc(material?.name ?? materialId)}</title>
  <style>${printStyles()}</style>
</head>
<body>
  <h1>Stuklijst</h1>
  <p class="meta">
    ${esc(date)}<br />
    Materiaal: <strong>${esc(material?.name ?? materialId)}</strong> · Ø ${config.diameter} mm<br />
    Totaal buislengte: <strong>${esc(formatMeters(bom.totalPipeLengthMm))}</strong>
    ${config.baseType === 'grondanker' ? ` · Grondanker ${config.anchorDepthMm} mm` : ' · Voetplaten'}
  </p>

  <h2>Steigerbuizen</h2>
  <table>
    <thead><tr>
      <th>Lengte</th><th>Aantal</th>${hasSku ? '<th>Art.nr.</th>' : ''}
    </tr></thead>
    <tbody>${pipeRows}</tbody>
  </table>

  ${
    bom.fittings.length > 0
      ? `<h2>Buiskoppelingen</h2>
  <table>
    <thead><tr>
      <th>Onderdeel</th><th>Positie</th><th>Aantal</th>${hasSku ? '<th>Art.nr.</th>' : ''}
    </tr></thead>
    <tbody>${fittingRows}</tbody>
  </table>`
      : ''
  }

  ${bom.notes.length > 0 ? `<ul class="notes">${notes}</ul>` : ''}

  <p class="footer">
    Gegenereerd met Steigerbuis configurator · Onderdelen via
    <a href="https://www.steigerbuisgroothandel.nl/">steigerbuisgroothandel.nl</a>
    ${hasSku ? ' · Artikelnummers: Steigerbuisgroothandel' : ''}
  </p>
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
    const quote = await steigerbuisGroothandelAgent.quote(bom, {
      diameter: config.diameter,
      materialId,
    })
    fillPrintWindow(
      win,
      buildBomHtml({ bom, config, materialId, quoteLines: quote.lines }),
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
  const quote = await steigerbuisGroothandelAgent.quote(bom, {
    diameter: config.diameter,
    materialId,
  })
  const text = buildOrderListText(bom, quote.lines)
  const header = `Stuklijst — ${MATERIALS.find((m) => m.id === materialId)?.name ?? materialId} · Ø ${config.diameter} mm\n\n`
  try {
    await navigator.clipboard.writeText(header + text)
    return true
  } catch {
    return false
  }
}
