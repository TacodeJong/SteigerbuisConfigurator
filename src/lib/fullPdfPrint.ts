import type { BomResult, KlimrekConfig, MaterialId, SceneModel } from '../types'
import { MATERIALS } from '../data/catalog'
import { captureFittingThumbsForPrint } from '../components/BomFittingThumb'
import { buildBomPrintBody } from './bomPrint'
import { buildFloorplanPrintBody } from './buildPrint'
import { fillPrintWindow, openPrintPlaceholder } from './printDocument'
import { captureViewportJpeg } from './viewportCapture'

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
    .doc-title { font-size: 18pt; margin: 0 0 0.35rem; }
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
    .floorplan-wrap { margin: 0.5rem 0 1rem; text-align: center; }
    .floorplan-wrap svg { max-width: 100%; height: auto; border: 1px solid #ddd; background: #f8faf8; }
    .view {
      width: 100%;
      max-height: 70vh;
      object-fit: contain;
      display: block;
      margin: 0 auto;
      background: #e8edf2;
      border: 1px solid #d0d5db;
    }
    .section { page-break-after: always; }
    .section:last-child { page-break-after: auto; }
    @media print {
      body { margin: 0.8cm 1cm; }
      td.thumb img, .view {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .view { max-height: none; }
    }
  `
}

export interface FullPdfPrintOptions {
  bom: BomResult
  config: KlimrekConfig
  materialId: MaterialId
  scene: SceneModel
  title?: string | null
  viewportJpeg?: string | null
  fittingThumbs?: Parameters<typeof buildBomPrintBody>[0]['fittingThumbs']
}

/** Gecombineerde HTML: 3D-weergave + stuklijst + plattegrond (browser → PDF). */
export function buildFullPdfHtml(options: FullPdfPrintOptions): string {
  const { bom, config, materialId, scene, title, viewportJpeg, fittingThumbs } = options
  const material = MATERIALS.find((m) => m.id === materialId)
  const date = new Date().toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' })
  const docTitle = title?.trim() || 'Volledige PDF'

  const viewportSection = viewportJpeg
    ? `<section class="section">
  <h1>3D-weergave</h1>
  <p class="meta">${esc(date)} · Omgeving zoals in de editor (huidige camerastand)</p>
  <img class="view" src="${viewportJpeg}" alt="3D-weergave van het model" />
</section>`
    : `<section class="section">
  <h1>3D-weergave</h1>
  <p class="meta">Kon de 3D-weergave niet vastleggen. Controleer of het 3D-venster zichtbaar is.</p>
</section>`

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <title>${esc(docTitle)} — Volledige PDF</title>
  <style>${printStyles()}</style>
</head>
<body>
  <p class="doc-title">${esc(docTitle)}</p>
  <p class="meta">
    ${esc(date)} · ${esc(material?.name ?? materialId)} · Ø ${config.diameter} mm<br />
    3D-weergave · Stuklijst · Plattegrond
  </p>

  ${viewportSection}

  <section class="section">
${buildBomPrintBody({ bom, config, materialId, fittingThumbs })}
  </section>

  <section class="section">
${buildFloorplanPrintBody({ scene, config, materialId })}
  </section>
</body>
</html>`
}

/**
 * Gecombineerde printbare PDF-pagina: 3D (viewport + omgeving) + stuklijst + plattegrond.
 * Zelfde HTML-printflow als de aparte printacties (browser → PDF opslaan).
 */
export async function printFullPdf(options: {
  bom: BomResult
  config: KlimrekConfig
  materialId: MaterialId
  scene: SceneModel
  title?: string | null
}): Promise<boolean> {
  const win = openPrintPlaceholder()
  if (!win) return false
  try {
    const viewportJpeg = captureViewportJpeg()
    const fittingThumbs = await captureFittingThumbsForPrint(
      options.bom.fittings.map((f) => f.type),
      options.materialId,
      options.config.diameter,
    )
    fillPrintWindow(
      win,
      buildFullPdfHtml({
        ...options,
        viewportJpeg,
        fittingThumbs,
      }),
    )
    return true
  } catch {
    win.close()
    return false
  }
}
