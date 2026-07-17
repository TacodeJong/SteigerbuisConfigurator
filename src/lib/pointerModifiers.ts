/** Modifier-toetsen voor teken-snap (Shift = vrij, Alt/Option = nauwkeurig). */
export interface PointerModifiers {
  free: boolean
  precise: boolean
}

export function pointerModifiers(e: {
  shiftKey?: boolean
  altKey?: boolean
  getModifierState?: (key: string) => boolean
}): PointerModifiers {
  const alt =
    e.altKey === true ||
    e.getModifierState?.('Alt') === true ||
    e.getModifierState?.('AltGraph') === true
  const shift = e.shiftKey === true || e.getModifierState?.('Shift') === true
  return { free: shift, precise: alt }
}

export function keyboardModifiers(e: KeyboardEvent): PointerModifiers {
  return pointerModifiers(e)
}
