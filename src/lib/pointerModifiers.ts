/** Modifier-toetsen voor teken-snap (Shift = vrij, Alt/Option = nauwkeurig). */
export interface PointerModifiers {
  free: boolean
  precise: boolean
}

function isAltHeld(e: {
  altKey?: boolean
  getModifierState?: (key: string) => boolean
}): boolean {
  return (
    e.altKey === true ||
    e.getModifierState?.('Alt') === true ||
    e.getModifierState?.('AltGraph') === true
  )
}

export function pointerModifiers(e: {
  shiftKey?: boolean
  altKey?: boolean
  getModifierState?: (key: string) => boolean
}): PointerModifiers {
  const shift = e.shiftKey === true || e.getModifierState?.('Shift') === true
  return { free: shift, precise: isAltHeld(e) }
}

export function keyboardModifiers(e: KeyboardEvent): PointerModifiers {
  return pointerModifiers(e)
}

/**
 * Primary tool action: left button only, without Alt.
 * Middle/right and Alt+LMB are reserved for camera orbit (CAD-style).
 * Alt+Shift+LMB pans (OrbitControls maps Shift+rotate → pan).
 */
export function isToolPointer(e: {
  button?: number
  altKey?: boolean
  getModifierState?: (key: string) => boolean
}): boolean {
  if (e.button !== undefined && e.button !== 0) return false
  return !isAltHeld(e)
}
