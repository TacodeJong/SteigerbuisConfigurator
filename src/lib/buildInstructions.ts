import type { BomResult, KlimrekConfig, SceneFitting, SceneModel, ScenePipe } from '../types'
import { formatMm } from './bom'
import { ANCHOR_HOLE_DIAMETER_MM, computeAnchorHoles } from './floorplan'
import { FITTING_TYPE_LABELS } from './fittings'
import { isVerticalPlank, PLANK_MOUNT_LABEL, plankBomLabel } from './planks'
import { baseGroundY, pipeLengthMm } from './scene'

export interface BuildPart {
  label: string
  quantity: number
  lengthMm?: number
}

export interface BuildStep {
  order: number
  title: string
  description: string
  parts: BuildPart[]
}

const HORIZONTAL_TOL_M = 0.05

function fittingName(type: SceneFitting['type']): string {
  return FITTING_TYPE_LABELS[type] ?? type
}

function isVertical(pipe: ScenePipe): boolean {
  const dx = pipe.end[0] - pipe.start[0]
  const dy = pipe.end[1] - pipe.start[1]
  const dz = pipe.end[2] - pipe.start[2]
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len < 0.01) return false
  return Math.abs(dy) / len > 0.85
}

function isHorizontal(pipe: ScenePipe): boolean {
  const dy = Math.abs(pipe.end[1] - pipe.start[1])
  return dy <= HORIZONTAL_TOL_M
}

function pipeElevationMm(pipe: ScenePipe): number {
  return Math.round(((pipe.start[1] + pipe.end[1]) / 2) * 1000)
}

function groupPipesByLength(pipes: ScenePipe[]): BuildPart[] {
  const byLen = new Map<number, number>()
  for (const p of pipes) {
    const len = pipeLengthMm(p)
    byLen.set(len, (byLen.get(len) ?? 0) + 1)
  }
  return [...byLen.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([lengthMm, quantity]) => ({
      label: `Buis`,
      quantity,
      lengthMm,
    }))
}

function fittingsNearY(fittings: SceneFitting[], yMm: number, tolMm = 80): SceneFitting[] {
  return fittings.filter((f) => Math.abs(Math.round(f.position[1] * 1000) - yMm) <= tolMm)
}

function fittingsAtGround(fittings: SceneFitting[], groundY: number): SceneFitting[] {
  const groundMm = Math.round(groundY * 1000)
  return fittingsNearY(fittings, groundMm, 120)
}

function countFittings(fittings: SceneFitting[]): BuildPart[] {
  const counts = new Map<string, { type: SceneFitting['type']; qty: number }>()
  for (const f of fittings) {
    const key = f.type
    const existing = counts.get(key)
    if (existing) existing.qty += 1
    else counts.set(key, { type: f.type, qty: 1 })
  }
  return [...counts.values()]
    .sort((a, b) => fittingName(a.type).localeCompare(fittingName(b.type), 'nl'))
    .map(({ type, qty }) => ({ label: fittingName(type), quantity: qty }))
}

function postLabel(pipe: ScenePipe, index: number): string {
  if (pipe.id.startsWith('post-')) return `Hoekpaal ${Number(pipe.id.slice(5)) + 1}`
  const x = Math.round(((pipe.start[0] + pipe.end[0]) / 2) * 1000)
  const z = Math.round(((pipe.start[2] + pipe.end[2]) / 2) * 1000)
  return `Staander ${index + 1} (${x}/${z} mm)`
}

/** Genereer genummerde bouwstappen uit scene + stuklijst. */
export function buildInstructions(
  scene: SceneModel,
  config: KlimrekConfig,
  bom: BomResult,
): BuildStep[] {
  const steps: BuildStep[] = []
  let order = 1
  const groundY = baseGroundY(config)
  const fittings = scene.fittings ?? []

  if (config.baseType === 'grondanker') {
    const holes = computeAnchorHoles(scene, config)
    steps.push({
      order: order++,
      title: 'Betonpoeren voorbereiden',
      description: `Graaf of bekist ${holes.length} gat${holes.length === 1 ? '' : 'en'} op maaiveld (Y = 0). De buis verdwijnt ${config.anchorDepthMm} mm onder maaiveld.`,
      parts: holes.map((h) => ({
        label: `Gat ${h.label}`,
        quantity: 1,
        lengthMm: h.depthMm,
      })),
    })
    steps[steps.length - 1].parts.push({
      label: `Bekisting Ø ${ANCHOR_HOLE_DIAMETER_MM} mm`,
      quantity: holes.length,
    })
  } else if (config.baseType === 'vloerdop') {
    steps.push({
      order: order++,
      title: 'Voetdoppen monteren',
      description:
        'Schuif op elk buiseinde onderaan een rubberen/kunststof voetdop (anti-slip). Het rek staat los op de vloer — geen graafwerk of verankering nodig. Controleer dat de vloer vlak en schoon is.',
      parts: countFittings(fittings.filter((f) => f.type === 'voetdop')),
    })
  } else {
    steps.push({
      order: order++,
      title: 'Voetplaten plaatsen',
      description: 'Zet op elke hoekpaal een voetplaat op maaiveld (Y = 0). Controleer dat het vlak waterpas is.',
      parts: countFittings(fittings.filter((f) => f.type.startsWith('voetplaat'))),
    })
  }

  const verticals = scene.pipes.filter(isVertical).sort((a, b) => {
    const ya = (a.start[1] + a.end[1]) / 2
    const yb = (b.start[1] + b.end[1]) / 2
    return ya - yb
  })

  if (verticals.length > 0) {
    const parts: BuildPart[] = verticals.map((p, i) => ({
      label: postLabel(p, i),
      quantity: 1,
      lengthMm: pipeLengthMm(p),
    }))
    steps.push({
      order: order++,
      title: 'Hoekpalen plaatsen',
      description:
        config.baseType === 'grondanker'
          ? `Plaats de hoekpalen in de poeren tot ${formatMm(config.anchorDepthMm)} onder maaiveld. Laat het beton uitharden voordat je verder bouwt.`
          : config.baseType === 'vloerdop'
            ? 'Zet de hoekpalen met gemonteerde voetdop rechtop op de vloer en controleer dat ze verticaal staan.'
            : 'Plaats de hoekpalen in de voetplaten en controleer dat ze verticaal staan.',
      parts,
    })
  }

  const horizontals = scene.pipes.filter(isHorizontal)
  const byElevation = new Map<number, ScenePipe[]>()
  for (const p of horizontals) {
    const y = pipeElevationMm(p)
    const list = byElevation.get(y) ?? []
    list.push(p)
    byElevation.set(y, list)
  }

  const elevations = [...byElevation.keys()].sort((a, b) => a - b)
  for (const yMm of elevations) {
    const pipes = byElevation.get(yMm) ?? []
    const layerFittings = fittingsNearY(fittings, yMm)
    const heightLabel = formatMm(yMm)
    steps.push({
      order: order++,
      title: `Horizontale laag op ${heightLabel}`,
      description: `Monteer de liggers en dieptebuizen op hoogte ${heightLabel}. Klik de koppelingen vast op de staanders.`,
      parts: [
        ...groupPipesByLength(pipes),
        ...countFittings(layerFittings),
      ],
    })
  }

  const groundFittings = fittingsAtGround(fittings, groundY)
  if (groundFittings.length > 0 && config.baseType === 'grondanker') {
    const existing = steps.find((s) => s.title === 'Hoekpalen plaatsen')
    if (existing) {
      existing.parts.push(...countFittings(groundFittings))
    }
  }

  const roofPipes = scene.pipes.filter((p) => p.id.startsWith('roof-'))
  if (roofPipes.length > 0 || config.includeRoof) {
    steps.push({
      order: order++,
      title: 'Dakvlak monteren',
      description: 'Plaats de buizen bovenop op de hoogste laag. Overweeg houten planken of roostervloer als loopvlak.',
      parts: groupPipesByLength(roofPipes.length > 0 ? roofPipes : []),
    })
  }

  const endCaps = fittings.filter((f) => f.type === 'afdekdop')
  if (endCaps.length > 0) {
    steps.push({
      order: order++,
      title: 'Afdekdoppen plaatsen',
      description: 'Zet afdekdoppen op de open buiseinden bovenop de staanders.',
      parts: countFittings(endCaps),
    })
  }

  const planks = scene.planks ?? []
  if (planks.length > 0) {
    const byKey = new Map<string, { label: string; lengthMm: number; quantity: number }>()
    const mounts = scene.plankMounts?.length ?? 0
    for (const plank of planks) {
      const label = plankBomLabel(plank.kind)
      const key = `${label}:${plank.lengthMm}`
      const existing = byKey.get(key)
      if (existing) existing.quantity += 1
      else byKey.set(key, { label, lengthMm: plank.lengthMm, quantity: 1 })
    }
    const parts: BuildPart[] = [...byKey.values()]
      .sort((a, b) => b.lengthMm - a.lengthMm)
      .map(({ label, lengthMm, quantity }) => ({ label, quantity, lengthMm }))
    if (mounts > 0) {
      parts.push({ label: PLANK_MOUNT_LABEL, quantity: mounts })
    }
    const hasPlate = planks.some((p) => p.kind === 'plate')
    const hasVertical = planks.some((p) => isVerticalPlank(p))
    steps.push({
      order: order++,
      title: hasPlate ? 'Hout (planken/platen) monteren' : 'Planken monteren',
      description: hasVertical
        ? 'Plaats horizontale planken/platen op de liggers en verticale schermen rechtop op de aangegeven buizen. Schuif per relevante steun een schapsteun (klemhuls met twee vleugels) op en schroef het hout vast door de boutgaten.'
        : 'Leg de steigerplanken of platen haaks op de dragende buizen volgens het 3D-model. Schuif per relevante staander een schapsteun (klemhuls met twee vleugels) op hoogte van de onderkant en schroef vast door de boutgaten.',
      parts,
    })
  }

  const accessories = scene.accessories ?? []
  if (accessories.length > 0) {
    const accCounts = new Map<string, number>()
    for (const a of accessories) {
      const name = fittingName(a.type)
      accCounts.set(name, (accCounts.get(name) ?? 0) + 1)
    }
    steps.push({
      order: order++,
      title: 'Scharnieren monteren',
      description: 'Bevestig scharnierogen en -hulzen volgens het 3D-model.',
      parts: [...accCounts.entries()].map(([label, quantity]) => ({ label, quantity })),
    })
  }

  if (steps.length === 1 && bom.pipes.length > 0) {
    steps.push({
      order: order++,
      title: 'Buizen monteren',
      description: 'Monteer alle buizen volgens de stuklijst. Controleer elke verbinding met de juiste koppeling.',
      parts: bom.pipes.map((p) => ({
        label: 'Buis',
        quantity: p.quantity,
        lengthMm: p.lengthMm,
      })),
    })
    if (bom.fittings.length > 0) {
      steps[steps.length - 1].parts.push(
        ...bom.fittings.map((f) => ({
          label: FITTING_TYPE_LABELS[f.type] ?? f.type,
          quantity: f.quantity,
        })),
      )
    }
  }

  return steps
}
