import type { BomPipe, BomResult, SceneModel } from '../types'
import { groupHingeEyes } from './accessories'
import { PIPE_LABEL } from './bom'
import { FITTING_TYPE_LABELS } from './fittings'
import { pipeLengthMm } from './scene'

export function calculateBomFromScene(scene: SceneModel): BomResult {
  const grouped = new Map<number, BomPipe>()

  for (const p of scene.pipes) {
    const lengthMm = pipeLengthMm(p)
    const existing = grouped.get(lengthMm)
    if (existing) {
      existing.quantity += 1
    } else {
      grouped.set(lengthMm, { lengthMm, quantity: 1, label: PIPE_LABEL })
    }
  }

  const pipes = [...grouped.values()].sort((a, b) => b.lengthMm - a.lengthMm)
  const totalPipeLengthMm = pipes.reduce((sum, p) => sum + p.lengthMm * p.quantity, 0)

  const fittingCounts = new Map<string, { type: SceneModel['fittings'][0]['type']; quantity: number; label: string }>()
  for (const f of scene.fittings) {
    const key = f.type
    const existing = fittingCounts.get(key)
    if (existing) {
      existing.quantity += 1
    } else {
      fittingCounts.set(key, {
        type: f.type,
        quantity: 1,
        label: FITTING_TYPE_LABELS[f.type] ?? f.type,
      })
    }
  }

  const accessories = scene.accessories ?? []
  const bump = (type: SceneModel['fittings'][0]['type']) => {
    const key = `acc-${type}`
    const existing = fittingCounts.get(key)
    if (existing) {
      existing.quantity += 1
    } else {
      fittingCounts.set(key, {
        type,
        quantity: 1,
        label: FITTING_TYPE_LABELS[type] ?? type,
      })
    }
  }

  // Ogen op één klempunt tellen als één dubbelscharnier (90° of recht).
  for (const group of groupHingeEyes(accessories)) {
    bump(group.kind)
  }
  for (const a of accessories) {
    if (a.type === 'scharnieroog') continue
    bump(a.type)
  }

  const fittings = [...fittingCounts.values()].sort((a, b) => a.label.localeCompare(b.label, 'nl'))

  const notes: string[] = [
    'Stuklijst berekend uit de 3D-editor.',
    'Steigerbuisgroothandel zaagt buizen gratis op maat.',
  ]
  if (fittings.length === 0) {
    notes.unshift('Koppelingen zijn niet automatisch berekend — controleer verbindingen handmatig.')
  }

  return {
    pipes,
    fittings,
    totalPipeLengthMm,
    notes,
  }
}
