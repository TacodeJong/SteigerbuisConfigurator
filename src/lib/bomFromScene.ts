import type { BomHardwareItem, BomPipe, BomPlank, BomResult, SceneModel } from '../types'
import { groupHingeEyes } from './accessories'
import { PIPE_LABEL } from './bom'
import { FITTING_TYPE_LABELS } from './fittings'
import { PLANK_MOUNT_LABEL, plankBomLabel } from './planks'
import { pipeLengthMm } from './scene'

function plankGroupKey(
  lengthMm: number,
  widthMm: number,
  thicknessMm: number,
  kind: string,
): string {
  return `${kind}:${lengthMm}x${widthMm}x${thicknessMm}`
}

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

  // Hout (plank/plaat) gegroepeerd op soort × lengte × breedte × dikte + schapsteunen.
  const scenePlanks = scene.planks ?? []
  const plankGroups = new Map<string, BomPlank>()
  for (const plank of scenePlanks) {
    const kind = plank.kind === 'plate' ? 'plate' : 'plank'
    const key = plankGroupKey(plank.lengthMm, plank.widthMm, plank.thicknessMm, kind)
    const existing = plankGroups.get(key)
    if (existing) {
      existing.quantity += 1
    } else {
      plankGroups.set(key, {
        lengthMm: plank.lengthMm,
        widthMm: plank.widthMm,
        thicknessMm: plank.thicknessMm,
        quantity: 1,
        label: plankBomLabel(kind),
      })
    }
  }
  const planks = [...plankGroups.values()].sort(
    (a, b) => b.lengthMm - a.lengthMm || b.widthMm - a.widthMm,
  )

  const stored = scene.plankMounts ?? []
  const mountCount = stored.length

  const hardware: BomHardwareItem[] =
    mountCount > 0 ? [{ label: PLANK_MOUNT_LABEL, quantity: mountCount }] : []

  const notes: string[] = [
    'Stuklijst berekend uit de 3D-editor.',
    'Veel steigerbuisleveranciers zagen buizen gratis op maat.',
  ]
  if (fittings.length === 0) {
    notes.unshift('Koppelingen zijn niet automatisch berekend — controleer verbindingen handmatig.')
  }
  if (planks.length > 0) {
    notes.push(
      'Hout: steigerplank (typ. 30×195 mm) of multiplexplaat (typ. 18 mm); breedte tot 2440 mm. Schapsteunen: alleen de handmatig geplaatste (of bij nieuwe plank als voorstel).',
    )
  }

  return {
    pipes,
    fittings,
    ...(planks.length > 0 ? { planks, hardware } : {}),
    totalPipeLengthMm,
    notes,
  }
}
