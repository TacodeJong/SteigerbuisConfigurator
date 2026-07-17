import type { BomHighlight, SceneModel } from '../types'
import { groupHingeEyes } from './accessories'
import { pipeLengthMm } from './scene'

export function resolveBomHighlightIds(scene: SceneModel, highlight: BomHighlight | null): Set<string> {
  if (!highlight) return new Set()

  switch (highlight.kind) {
    case 'pipe':
      return new Set(
        scene.pipes.filter((p) => pipeLengthMm(p) === highlight.lengthMm).map((p) => p.id),
      )
    case 'fitting':
      return new Set(scene.fittings.filter((f) => f.type === highlight.type).map((f) => f.id))
    case 'accessory': {
      const accessories = scene.accessories ?? []
      // Scharnierogen zijn gegroepeerd in de stuklijst: enkel oog of dubbelscharnier.
      if (
        highlight.type === 'scharnieroog' ||
        highlight.type === 'dubbelscharnier-90' ||
        highlight.type === 'dubbelscharnier-recht'
      ) {
        const ids = new Set<string>()
        for (const group of groupHingeEyes(accessories)) {
          if (group.kind !== highlight.type) continue
          for (const id of group.eyeIds) ids.add(id)
        }
        return ids
      }
      return new Set(accessories.filter((a) => a.type === highlight.type).map((a) => a.id))
    }
    case 'plank':
      return new Set(
        (scene.planks ?? [])
          .filter(
            (p) =>
              p.lengthMm === highlight.lengthMm &&
              (highlight.widthMm == null || p.widthMm === highlight.widthMm),
          )
          .map((p) => p.id),
      )
  }
}

export function isSameBomHighlight(a: BomHighlight | null, b: BomHighlight | null): boolean {
  if (!a || !b) return false
  if (a.kind !== b.kind) return false
  if (a.kind === 'pipe' && b.kind === 'pipe') return a.lengthMm === b.lengthMm
  if (a.kind === 'fitting' && b.kind === 'fitting') {
    return a.type === b.type && a.label === b.label
  }
  if (a.kind === 'accessory' && b.kind === 'accessory') return a.type === b.type
  if (a.kind === 'plank' && b.kind === 'plank') {
    return a.lengthMm === b.lengthMm && (a.widthMm ?? null) === (b.widthMm ?? null)
  }
  return false
}
