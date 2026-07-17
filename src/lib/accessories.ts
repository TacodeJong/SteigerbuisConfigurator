import type { HingeConnection, PipeAccessory, SceneModel, ScenePipe, Vec3, KlimrekConfig } from '../types'
import type { SnapResult } from './snap'
import { MIN_PIPE_LEN_M } from './snap'
import { dist, normalize, pipeDirection, quantizeMm, weldPipeJoints } from './pipeGeometry'
import { createPipeBetween, nextPipeId, purgeOrphanAccessories, syncSceneFittings } from './scene'

const CONNECT_DIST_M = 0.07
const CONNECT_AXIS_DOT = 0.65

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function isHulsType(type: PipeAccessory['type']): boolean {
  return type === 'scharnierhuls' || (type as string) === 'scharnier-vork'
}

/** Pen-koppeling: oog op frame-buis, huls op verbindingsbuis. */
export function hingeConnectionHulsId(conn: HingeConnection): string {
  return conn.hulsId ?? (conn as { forkId?: string }).forkId ?? ''
}

/** Buisas loodrechte richting voor oog/huls, naar cursor toe. */
export function hingeAxisFromTarget(pipeAxis: Vec3, onPipe: Vec3, target: Vec3): Vec3 {
  const axis = normalize(pipeAxis)
  const to = sub(target, onPipe)
  const along = dot(to, axis)
  const perp = sub(to, scale(axis, along))
  if (dist([0, 0, 0], perp) > 0.05) return normalize(perp)
  const ref: Vec3 = Math.abs(axis[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0]
  return normalize(cross(axis, ref))
}

/** Richting waarin oog/huls wijst — loodrecht op buisas, langs de schuine span. */
export function hingeAxisFromDirection(hostPipeAxis: Vec3, spanDirection: Vec3): Vec3 {
  return hingeAxisFromTarget(hostPipeAxis, [0, 0, 0], spanDirection)
}

function findSpanPipe(pipes: ScenePipe[], spanId: string, start: Vec3, end: Vec3): ScenePipe | null {
  return (
    pipes.find((p) => p.id === spanId) ??
    pipes.find((p) => dist(p.start, start) < 0.02 && dist(p.end, end) < 0.02) ??
    pipes.find(
      (p) =>
        (dist(p.start, start) < 0.02 || dist(p.end, start) < 0.02) &&
        (dist(p.start, end) < 0.02 || dist(p.end, end) < 0.02),
    ) ??
    null
  )
}

function addHingeJoint(
  accessories: PipeAccessory[],
  connections: HingeConnection[],
  scene: SceneModel,
  framePipe: ScenePipe,
  spanPipe: ScenePipe,
  at: Vec3,
  towardSpan: Vec3,
): void {
  // Penpunt ligt óp de span-as (op `reach` van het knooppunt), zodat de vork
  // recht in het verlengde van de span-buis valt. De oogplaat kantelt mee.
  const pinDir = normalize(towardSpan)
  // Loodrechte richting t.o.v. de frame-as — bepaalt het pen-as-vlak van de huls.
  const perpAxis = hingeAxisFromDirection(pipeDirection(framePipe), towardSpan)

  const eyeId = nextAccessoryId({ ...scene, accessories })
  accessories.push(createAccessoryOnPipe(framePipe, at, 'scharnieroog', pinDir, eyeId))

  // Huls op het uiteinde van de span-buis: buis-as wijst het buislichaam in;
  // scharnier-as loodrecht (tegengesteld aan de oogzijde) voor de pen-oriëntatie.
  const hulsId = nextAccessoryId({ ...scene, accessories })
  accessories.push({
    ...createAccessoryOnPipe(spanPipe, at, 'scharnierhuls', scale(perpAxis, -1), hulsId),
    pipeAxis: pinDir,
  })

  connections.push({
    id: nextHingeConnectionId({ ...scene, hingeConnections: connections }),
    eyeId,
    hulsId,
  })
}

/** Schuine verbindingsbuis: oog op frame-buis, scharnierhuls op span-buis. */
export function placeHingeSpan(
  scene: SceneModel,
  config: Pick<KlimrekConfig, 'includeRoof' | 'baseType' | 'anchorDepthMm'>,
  start: Vec3,
  end: Vec3,
  startSnap: SnapResult,
  endSnap: SnapResult,
): SceneModel | null {
  if (dist(start, end) < MIN_PIPE_LEN_M || !startSnap.pipeId) return null

  const startPipe = scene.pipes.find((p) => p.id === startSnap.pipeId)
  if (!startPipe) return null

  const spanId = nextPipeId(scene)
  const spanPipeDraft = createPipeBetween(start, end, startPipe.diameterMm, spanId)
  const pipes = weldPipeJoints([...scene.pipes, spanPipeDraft])
  const spanPipe = findSpanPipe(pipes, spanId, start, end)
  if (!spanPipe) return null

  const spanDir = sub(end, start)
  const accessories = [...(scene.accessories ?? [])]
  const connections = [...(scene.hingeConnections ?? [])]

  addHingeJoint(accessories, connections, { ...scene, accessories }, startPipe, spanPipe, start, spanDir)

  const endOnFrame =
    endSnap.connected &&
    endSnap.pipeId != null &&
    endSnap.pipeId !== spanPipe.id &&
    (endSnap.kind === 'endpoint' || endSnap.kind === 'segment')

  if (endOnFrame) {
    const endFramePipe = pipes.find((p) => p.id === endSnap.pipeId)
    if (endFramePipe) {
      addHingeJoint(
        accessories,
        connections,
        { ...scene, accessories },
        endFramePipe,
        spanPipe,
        end,
        scale(spanDir, -1),
      )
    }
  }

  return syncSceneFittings({ ...scene, pipes, accessories, hingeConnections: connections }, config)
}

/** Afstand van buis-hart tot het penpunt — gelijk aan de oogplaat-offset in de 3D-weergave. */
export function hingePinReach(diameterMm: number): number {
  return (diameterMm / 2000) * 1.58 * 1.35
}

export function accessoryConnectPoint(acc: PipeAccessory): Vec3 {
  return add(acc.position, scale(acc.hingeAxis, hingePinReach(acc.diameterMm)))
}

export function nextAccessoryId(scene: SceneModel): string {
  const n = scene.accessories?.length ?? 0
  return `acc-${n + 1}`
}

export function nextHingeConnectionId(scene: SceneModel): string {
  const n = scene.hingeConnections?.length ?? 0
  return `hinge-${n + 1}`
}

export function createAccessoryOnPipe(
  pipe: ScenePipe,
  pointOnPipe: Vec3,
  type: PipeAccessory['type'],
  hingeAxis: Vec3,
  id: string,
): PipeAccessory {
  return {
    id,
    type,
    pipeId: pipe.id,
    position: quantizeMm(pointOnPipe),
    pipeAxis: pipeDirection(pipe),
    hingeAxis: normalize(hingeAxis),
    diameterMm: pipe.diameterMm,
  }
}

export function canConnect(eye: PipeAccessory, huls: PipeAccessory): boolean {
  if (eye.type !== 'scharnieroog' || !isHulsType(huls.type)) return false
  const ep = accessoryConnectPoint(eye)
  const hp = accessoryConnectPoint(huls)
  if (dist(ep, hp) > CONNECT_DIST_M) return false
  if (dot(eye.hingeAxis, huls.hingeAxis) > -CONNECT_AXIS_DOT) return false
  return true
}

export function ensureSceneAccessories(scene: SceneModel): SceneModel {
  return {
    ...scene,
    accessories: scene.accessories ?? [],
    hingeConnections: scene.hingeConnections ?? [],
  }
}

/** Verwijder een scharnier-accessoire én het gekoppelde oog/huls-paar. */
export function removeAccessoryFromScene(scene: SceneModel, accessoryId: string): SceneModel {
  const accessories = scene.accessories ?? []
  const connections = scene.hingeConnections ?? []
  const removeIds = new Set<string>([accessoryId])

  for (const conn of connections) {
    const hulsId = hingeConnectionHulsId(conn)
    if (conn.eyeId === accessoryId || hulsId === accessoryId) {
      removeIds.add(conn.eyeId)
      if (hulsId) removeIds.add(hulsId)
    }
  }

  return purgeOrphanAccessories({
    ...scene,
    accessories: accessories.filter((a) => !removeIds.has(a.id)),
    hingeConnections: connections.filter((c) => {
      const hulsId = hingeConnectionHulsId(c)
      return !removeIds.has(c.eyeId) && !removeIds.has(hulsId)
    }),
  })
}

/** Verwijder een buis en alle scharnieronderdelen die eraan hangen. */
export function removePipeFromScene(scene: SceneModel, pipeId: string): SceneModel {
  const accessories = scene.accessories ?? []
  const connections = scene.hingeConnections ?? []
  const removeAccIds = new Set(accessories.filter((a) => a.pipeId === pipeId).map((a) => a.id))

  for (const conn of connections) {
    const hulsId = hingeConnectionHulsId(conn)
    const eye = accessories.find((a) => a.id === conn.eyeId)
    const huls = accessories.find((a) => a.id === hulsId)
    if (
      eye?.pipeId === pipeId ||
      huls?.pipeId === pipeId ||
      removeAccIds.has(conn.eyeId) ||
      (hulsId && removeAccIds.has(hulsId))
    ) {
      removeAccIds.add(conn.eyeId)
      if (hulsId) removeAccIds.add(hulsId)
    }
  }

  return purgeOrphanAccessories({
    ...scene,
    pipes: scene.pipes.filter((p) => p.id !== pipeId),
    accessories: accessories.filter((a) => !removeAccIds.has(a.id)),
    hingeConnections: connections.filter((c) => {
      const hulsId = hingeConnectionHulsId(c)
      return !removeAccIds.has(c.eyeId) && !(hulsId && removeAccIds.has(hulsId))
    }),
  })
}

const EYE_GROUP_TOL_M = 0.02

export interface HingeEyeGroup {
  /** Twee ogen op één klem: haaks (90°) of in elkaars verlengde (recht). */
  kind: 'scharnieroog' | 'dubbelscharnier-90' | 'dubbelscharnier-recht'
  eyeIds: string[]
}

/**
 * Groepeer scharnierogen die op hetzelfde klempunt van dezelfde buis zitten:
 * twee ogen delen dan één doorloopklem (dubbelscharnier).
 */
export function groupHingeEyes(accessories: PipeAccessory[]): HingeEyeGroup[] {
  const eyes = accessories.filter((a) => a.type === 'scharnieroog')
  const used = new Set<string>()
  const groups: HingeEyeGroup[] = []

  for (const eye of eyes) {
    if (used.has(eye.id)) continue
    used.add(eye.id)
    const cluster = [eye]
    for (const other of eyes) {
      if (used.has(other.id)) continue
      if (other.pipeId !== eye.pipeId) continue
      if (dist(other.position, eye.position) > EYE_GROUP_TOL_M) continue
      used.add(other.id)
      cluster.push(other)
    }

    if (cluster.length < 2) {
      groups.push({ kind: 'scharnieroog', eyeIds: [eye.id] })
      continue
    }

    // Vergelijk de uitsteekrichtingen loodrecht op de klembuis — de pen-richting
    // zelf kantelt met de span mee en zegt niets over de klem-variant.
    const outA = hingeAxisFromDirection(cluster[0].pipeAxis, cluster[0].hingeAxis)
    const outB = hingeAxisFromDirection(cluster[1].pipeAxis, cluster[1].hingeAxis)
    const d = dot(outA, outB)
    groups.push({
      kind: d < -0.7 ? 'dubbelscharnier-recht' : 'dubbelscharnier-90',
      eyeIds: cluster.map((c) => c.id),
    })
  }

  return groups
}

/** Ogen die op een gedeelde klem zitten en geen eigen klemhuls hoeven te tekenen. */
export function sharedSleeveEyeIds(accessories: PipeAccessory[]): Set<string> {
  const hidden = new Set<string>()
  for (const group of groupHingeEyes(accessories)) {
    for (const id of group.eyeIds.slice(1)) hidden.add(id)
  }
  return hidden
}

/**
 * Migreer scharnierhulzen uit oudere modellen naar de huidige semantiek:
 * buis-as wijst het span-buislichaam in, scharnier-as tegengesteld aan het oog.
 */
export function normalizeHingeAccessories(scene: SceneModel): SceneModel {
  const connections = scene.hingeConnections ?? []
  const accessories = scene.accessories ?? []
  if (!connections.length || !accessories.length) return scene

  const byId = new Map(accessories.map((a) => [a.id, a]))
  const updates = new Map<string, PipeAccessory>()

  for (const conn of connections) {
    const eye = byId.get(conn.eyeId)
    const huls = byId.get(hingeConnectionHulsId(conn))
    if (!eye || !huls) continue

    const spanPipe = scene.pipes.find((p) => p.id === huls.pipeId)
    if (!spanPipe) continue

    const dir = pipeDirection(spanPipe)
    const intoSpan =
      dist(huls.position, spanPipe.start) <= dist(huls.position, spanPipe.end)
        ? dir
        : scale(dir, -1)
    // Oog: pen op de span-as. Huls: loodrechte pen-vlak-as, van het oog af.
    const hulsHinge = normalize(scale(hingeAxisFromDirection(eye.pipeAxis, intoSpan), -1))

    if (dot(eye.hingeAxis, intoSpan) < 0.999) {
      updates.set(eye.id, { ...eye, hingeAxis: intoSpan })
    }
    if (dot(huls.pipeAxis, intoSpan) < 0.999 || dot(huls.hingeAxis, hulsHinge) < 0.999) {
      updates.set(huls.id, { ...huls, pipeAxis: intoSpan, hingeAxis: hulsHinge })
    }
  }

  if (!updates.size) return scene
  return { ...scene, accessories: accessories.map((a) => updates.get(a.id) ?? a) }
}
