/** Open een nieuw tabblad met volledige HTML (sync, direct na klik). Geen automatische printdialoog. */
export function openPrintDocument(html: string): boolean {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  // Geen noopener: anders is het venster niet bereikbaar en blijft het tabblad leeg.
  const win = window.open(url, '_blank')
  if (!win) {
    URL.revokeObjectURL(url)
    return false
  }
  win.addEventListener(
    'load',
    () => {
      URL.revokeObjectURL(url)
      win.focus()
    },
    { once: true },
  )
  return true
}

/** Open direct een leeg venster (binnen dezelfde gebruikersklik, vóór async werk). */
export function openPrintPlaceholder(): Window | null {
  const win = window.open('about:blank', '_blank')
  if (!win) return null
  win.document.open()
  win.document.write(
    '<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><title>Laden…</title></head><body><p style="font-family:system-ui,sans-serif;padding:2rem">Document laden…</p></body></html>',
  )
  win.document.close()
  return win
}

/** Vul een eerder geopend venster met HTML (bijv. na async laden). Geen automatische printdialoog. */
export function fillPrintWindow(win: Window, html: string): void {
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
}
