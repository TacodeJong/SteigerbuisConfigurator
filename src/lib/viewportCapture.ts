import { fillPrintWindow, openPrintPlaceholder } from './printDocument'

type CaptureFn = () => string | null

let captureFn: CaptureFn | null = null

/** Registreer de actieve 3D-viewport (editor of configurator-preview). */
export function registerViewportCapture(fn: CaptureFn): () => void {
  captureFn = fn
  return () => {
    if (captureFn === fn) captureFn = null
  }
}

export function hasViewportCapture(): boolean {
  return captureFn != null
}

/** JPEG data-URL van de huidige camera-pose, of null als er geen viewport is. */
export function captureViewportJpeg(): string | null {
  try {
    return captureFn?.() ?? null
  } catch {
    return null
  }
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
    body {
      font-family: system-ui, sans-serif;
      font-size: 11pt;
      color: #111;
      margin: 1cm 1.2cm;
      line-height: 1.35;
    }
    h1 { font-size: 15pt; margin: 0 0 0.2rem; }
    .meta { color: #555; font-size: 10pt; margin: 0 0 0.75rem; }
    .view {
      width: 100%;
      max-height: calc(100vh - 3.5cm);
      object-fit: contain;
      display: block;
      margin: 0 auto;
      background: #e8edf2;
      border: 1px solid #d0d5db;
    }
    .footer {
      margin-top: 0.75rem;
      padding-top: 0.4rem;
      border-top: 1px solid #ccc;
      font-size: 9pt;
      color: #666;
    }
    @media print {
      body { margin: 0.6cm 0.8cm; }
      .view {
        max-height: none;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  `
}

export function buildViewportPrintHtml(
  imageDataUrl: string,
  options?: { title?: string | null },
): string {
  const date = new Date().toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' })
  const title = options?.title?.trim() || '3D-weergave'
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} — 3D-weergave</title>
  <style>${printStyles()}</style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p class="meta">${esc(date)} · Omgeving zoals in de editor (huidige camerastand)</p>
  <img class="view" src="${imageDataUrl}" alt="3D-weergave van het model" />
  <p class="footer">Gegenereerd met Steigerbuis configurator</p>
</body>
</html>`
}

/**
 * Capture huidige viewport en open printvriendelijke pagina.
 * Opent eerst een placeholder-tab (binnen de gebruikersklik) vóór de capture.
 */
export function printViewportCapture(options?: { title?: string | null }): boolean {
  const win = openPrintPlaceholder()
  if (!win) return false
  const dataUrl = captureViewportJpeg()
  if (!dataUrl) {
    win.close()
    return false
  }
  fillPrintWindow(win, buildViewportPrintHtml(dataUrl, options))
  return true
}
