import type { HingeConnection, KlimrekConfig, SceneModel, ScenePipe, Vec3 } from '../types'
import { PIPE_LABEL } from './bom'
import { detectFittingsFromPipes } from './fittings'
import { dist, isInteriorPointOnPipe, isPipeEndpoint, weldPipeJoints } from './pipeGeometry'

export const POST_INSET_MM = 50

/** Afstand tussen staander-middelpunten = bestelbare buislengte + buisdiameter (buizen tegen elkaar). */
export function postCenterSpanMm(axisMm: number, diameterMm: number): number {
  return axisMm - POST_INSET_MM * 2 + diameterMm
}

export function orderedBarLengthMm(axisMm: number): number {
  return axisMm - POST_INSET_MM * 2
}

const HINGE_POINT_TOL_M = 0.025

function hingeHulsId(conn: HingeConnection): string {
  return conn.hulsId ?? (conn as { forkId?: string }).forkId ?? ''
}

/**
 * Verwijder ongebruikte scharnieronderdelen: geen buis, geen geldige
 * oog↔huls-verbinding, of losse ogen/hulzen zonder koppeling.
 */
export function purgeOrphanAccessories(scene: SceneModel): SceneModel {
  const pipeIds = new Set(scene.pipes.map((p) => p.id))
  const accessories = (scene.accessories ?? []).filter((a) => pipeIds.has(a.pipeId))
  const byId = new Map(accessories.map((a) => [a.id, a]))

  const connections = (scene.hingeConnections ?? []).filter((c) => {
    const hulsId = hingeHulsId(c)
    if (!hulsId) return false
    const eye = byId.get(c.eyeId)
    const huls = byId.get(hulsId)
    if (!eye || !huls) return false
    if (!pipeIds.has(eye.pipeId) || !pipeIds.has(huls.pipeId)) return false
    if (dist(eye.position, huls.position) > HINGE_POINT_TOL_M) return false

    const spanPipe = scene.pipes.find((p) => p.id === huls.pipeId)
    const framePipe = scene.pipes.find((p) => p.id === eye.pipeId)
    if (!spanPipe || !framePipe) return false

    const onSpan =
      isPipeEndpoint(huls.position, spanPipe, HINGE_POINT_TOL_M) ||
      isInteriorPointOnPipe(huls.position, spanPipe, HINGE_POINT_TOL_M, 0.012)
    const onFrame =
      isPipeEndpoint(eye.position, framePipe, HINGE_POINT_TOL_M) ||
      isInteriorPointOnPipe(eye.position, framePipe, HINGE_POINT_TOL_M, 0.012)
    return onSpan && onFrame
  })

  const linked = new Set<string>()
  for (const conn of connections) {
    linked.add(conn.eyeId)
    linked.add(hingeHulsId(conn))
  }

  const cleaned = accessories.filter((a) => {
    if (a.type !== 'scharnieroog' && a.type !== 'scharnierhuls') return true
    return linked.has(a.id)
  })

  const changed =
    cleaned.length !== (scene.accessories?.length ?? 0) ||
    connections.length !== (scene.hingeConnections?.length ?? 0)

  if (!changed) return scene
  return { ...scene, accessories: cleaned, hingeConnections: connections }
}

const mm = (value: number) => value / 1000

function pipe(
  id: string,
  start: Vec3,
  end: Vec3,
  label: string,
  diameterMm: number,
): ScenePipe {
  return { id, start, end, label, diameterMm }
}

function rungHeights(heightMm: number, rungCount: number): number[] {
  return Array.from({ length: rungCount }, (_, i) => {
    const t = (i + 1) / (rungCount + 1)
    return heightMm * t
  })
}

export function buildSceneFromConfig(config: KlimrekConfig): SceneModel {
  const { width, depth, height, rungCount, diameter, materialId, includeRoof } = config
  const pipes: ScenePipe[] = []

  // Centerline-model: staanders op bestelbare buislengte uit elkaar, liggers
  // lopen tot de staander-as. Zo kloppen buislengtes in scene én BOM en werkt
  // fitting-detectie (armen op middellijnen). De fysieke +Ø-offset van de
  // gatafstanden wordt in de plattegrond gecorrigeerd (adjustHolesForFloorplan).
  const halfW = orderedBarLengthMm(width) / 2
  const halfD = orderedBarLengthMm(depth) / 2

  const corners: Vec3[] = [
    [-halfW, 0, -halfD],
    [halfW, 0, -halfD],
    [-halfW, 0, halfD],
    [halfW, 0, halfD],
  ]

  const heights = rungHeights(height, rungCount)
  const anchorMm = config.baseType === 'grondanker' ? config.anchorDepthMm : 0
  const postStartY = mm(-anchorMm)
  const postEndY = mm(height)

  // 4 doorlopende hoekstaanders (niet per sport gesegmenteerd)
  corners.forEach(([x, , z], i) => {
    pipes.push(
      pipe(`post-${i}`, [mm(x), postStartY, mm(z)], [mm(x), postEndY, mm(z)], PIPE_LABEL, diameter),
    )
  })

  heights.forEach((yMm, i) => {
    const y = mm(yMm)

    pipes.push(
      pipe(`rung-front-${i}`, [mm(-halfW), y, mm(-halfD)], [mm(halfW), y, mm(-halfD)], PIPE_LABEL, diameter),
      pipe(`rung-back-${i}`, [mm(-halfW), y, mm(halfD)], [mm(halfW), y, mm(halfD)], PIPE_LABEL, diameter),
      pipe(`depth-left-${i}`, [mm(-halfW), y, mm(-halfD)], [mm(-halfW), y, mm(halfD)], PIPE_LABEL, diameter),
      pipe(`depth-right-${i}`, [mm(halfW), y, mm(-halfD)], [mm(halfW), y, mm(halfD)], PIPE_LABEL, diameter),
    )
  })

  if (includeRoof) {
    const y = mm(height)
    pipes.push(
      pipe('roof-front', [mm(-halfW), y, mm(-halfD)], [mm(halfW), y, mm(-halfD)], PIPE_LABEL, diameter),
      pipe('roof-back', [mm(-halfW), y, mm(halfD)], [mm(halfW), y, mm(halfD)], PIPE_LABEL, diameter),
      pipe('roof-left', [mm(-halfW), y, mm(-halfD)], [mm(-halfW), y, mm(halfD)], PIPE_LABEL, diameter),
      pipe('roof-right', [mm(halfW), y, mm(-halfD)], [mm(halfW), y, mm(halfD)], PIPE_LABEL, diameter),
    )
  }

  const welded = weldPipeJoints(pipes)

  return {
    pipes: welded,
    fittings: detectFittingsFromPipes(welded, fittingDetectOptions(config)),
    accessories: [],
    hingeConnections: [],
    materialId,
  }
}

export function fittingDetectOptions(
  config: Pick<KlimrekConfig, 'includeRoof' | 'baseType' | 'anchorDepthMm'>,
) {
  return {
    suppressEndCaps: config.includeRoof,
    baseType: config.baseType,
    anchorDepthMm: config.anchorDepthMm,
  }
}

/** Punten met scharnieronderdelen — daar geen automatische fitting plaatsen. */
function hingePointsOfScene(scene: SceneModel): Vec3[] {
  const points: Vec3[] = []
  for (const a of scene.accessories ?? []) {
    if (a.type === 'scharnieroog' || a.type === 'scharnierhuls') {
      points.push(a.position)
    }
  }
  return points
}

export function syncSceneFittings(
  scene: SceneModel,
  config: Pick<KlimrekConfig, 'includeRoof' | 'baseType' | 'anchorDepthMm'>,
): SceneModel {
  const sanitized = purgeOrphanAccessories(scene)
  const pipes = weldPipeJoints(sanitized.pipes)
  return {
    ...sanitized,
    pipes,
    fittings: detectFittingsFromPipes(pipes, {
      ...fittingDetectOptions(config),
      hingePoints: hingePointsOfScene(sanitized),
    }),
    accessories: sanitized.accessories ?? [],
    hingeConnections: sanitized.hingeConnections ?? [],
  }
}

/** Grond-hoogte voor de basis: 0 bij voetplaat, negatieve verankeringsdiepte bij grondanker. */
export function baseGroundY(config: Pick<KlimrekConfig, 'baseType' | 'anchorDepthMm'>): number {
  return config.baseType === 'grondanker' ? -(config.anchorDepthMm ?? 0) / 1000 : 0
}

const GROUND_BASE_TOL_M = 0.02

/** Verplaats eindpunten op de oude grondhoogte naar de nieuwe grondhoogte. */
export function rebaseGroundEndpoints(
  pipes: ScenePipe[],
  newGroundY: number,
  oldGroundY = 0,
): ScenePipe[] {
  const nearGround = (y: number) => Math.abs(y - oldGroundY) <= GROUND_BASE_TOL_M
  return pipes.map((p) => ({
    ...p,
    start: nearGround(p.start[1]) ? ([p.start[0], newGroundY, p.start[2]] as Vec3) : p.start,
    end: nearGround(p.end[1]) ? ([p.end[0], newGroundY, p.end[2]] as Vec3) : p.end,
  }))
}

export function pipeLengthMm(p: ScenePipe): number {
  const dx = p.end[0] - p.start[0]
  const dy = p.end[1] - p.start[1]
  const dz = p.end[2] - p.start[2]
  return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000)
}

/** Herstelt dubbele buis-id's (legacy scenes) zodat highlight/keys uniek blijven. */
export function normalizePipeIds(scene: SceneModel): SceneModel {
  const seen = new Set<string>()
  let changed = false
  const pipes = scene.pipes.map((p) => {
    if (!seen.has(p.id)) {
      seen.add(p.id)
      return p
    }
    changed = true
    let n = 2
    let id = `${p.id}-${n}`
    while (seen.has(id)) {
      n++
      id = `${p.id}-${n}`
    }
    seen.add(id)
    return { ...p, id }
  })
  return changed ? { ...scene, pipes } : scene
}

export function nextPipeId(scene: SceneModel): string {
  const existing = new Set(scene.pipes.map((p) => p.id))
  let n = scene.pipes.length + 1
  while (existing.has(`custom-${n}`)) n++
  return `custom-${n}`
}

export function createPipeAlongAxis(
  axis: 'x' | 'y' | 'z',
  center: Vec3,
  lengthMm: number,
  diameterMm: number,
  id: string,
): ScenePipe {
  const half = mm(lengthMm / 2)
  const [cx, cy, cz] = center

  if (axis === 'x') {
    return pipe(id, [cx - half, cy, cz], [cx + half, cy, cz], PIPE_LABEL, diameterMm)
  }
  if (axis === 'y') {
    return pipe(id, [cx, cy - half, cz], [cx, cy + half, cz], PIPE_LABEL, diameterMm)
  }
  return pipe(id, [cx, cy, cz - half], [cx, cy, cz + half], PIPE_LABEL, diameterMm)
}

export function createPipeBetween(
  start: Vec3,
  end: Vec3,
  diameterMm: number,
  id: string,
  label = PIPE_LABEL,
): ScenePipe {
  return pipe(id, start, end, label, diameterMm)
}
