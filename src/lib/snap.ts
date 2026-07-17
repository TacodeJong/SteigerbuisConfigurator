import type { ScenePipe, Vec3 } from '../types'
import {
  canonicalizeToPipe,
  closestTOnSegment,
  dist,
  exactPointOnPipe,
  isPointOnPipe,
  normalize,
  pointOnSegment,
  quantizeMm,
} from './pipeGeometry'

export const GRID_SNAP_M = 0.1
export const ENDPOINT_SNAP_M = 0.22
export const SEGMENT_SNAP_M = 0.22
export const AXIS_LINE_TOL_M = 0.02
/** Cursor moet binnen deze afstand van een as-uitlijnpunt liggen om ernaartoe te snappen. */
export const AXIS_MAGNET_M = 0.28
/** Strakkere snap bij Alt/Option ingedrukt (mm). */
export const PRECISE_ENDPOINT_SNAP_M = 0.065
export const PRECISE_SEGMENT_SNAP_M = 0.09
export const PRECISE_AXIS_MAGNET_M = 0.07
/** Eindpunt binnen deze hoogte van maaiveld → snap naar de grond (y=0). */
export const GROUND_SNAP_M = 0.14
export const MIN_PIPE_LEN_M = 0.08
export const MIN_PIPE_LEN_MM = 100
export const DEFAULT_DRAW_LENGTH_MM = 1000
export const GROUND_SNAP_GRID_M = 0.05

export type SnapKind = 'endpoint' | 'segment' | 'grid' | 'axis' | 'ground'

export interface SnapResult {
  point: Vec3
  kind: SnapKind
  pipeId?: string
  axis?: Vec3
  /** Punt ligt op een bestaande buis — alleen dan mag geplaatst worden */
  connected: boolean
}

export interface DrawTargetInput {
  rayOrigin: Vec3
  rayDir: Vec3
  cameraPos: Vec3
  pipes: ScenePipe[]
  start: Vec3 | null
  /** Buis waar het startpunt op ligt — uitsluiten bij eind-snap langs as. */
  startPipeId?: string | null
  /** Vrij/zwevend punt forceren (negeer grond- en buis-snapping), bv. met Shift. */
  free?: boolean
  /** Minder magnetisme naar eindpunten (Alt/Option). */
  precise?: boolean
  /** Y-hoogte waarop grond-snap landt (0 bij voetplaat, negatief bij grondanker). */
  groundY?: number
}

interface SnapScales {
  endpoint: number
  segment: number
  axisMagnet: number
}

function snapScales(precise?: boolean): SnapScales {
  if (precise) {
    return {
      endpoint: PRECISE_ENDPOINT_SNAP_M,
      segment: PRECISE_SEGMENT_SNAP_M,
      axisMagnet: PRECISE_AXIS_MAGNET_M,
    }
  }
  return { endpoint: ENDPOINT_SNAP_M, segment: SEGMENT_SNAP_M, axisMagnet: AXIS_MAGNET_M }
}

const DRAW_AXES: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function pointOnAxis(origin: Vec3, axis: Vec3, t: number): Vec3 {
  return add(origin, scale(axis, t))
}

export function distance(a: Vec3, b: Vec3): number {
  return dist(a, b)
}

export function isPlaceableSnap(result: SnapResult): boolean {
  return result.connected && (result.kind === 'endpoint' || result.kind === 'segment')
}

/** Eerste punt: grond of bestaande buis. */
export function isValidDrawStart(result: SnapResult): boolean {
  return (
    result.kind === 'ground' ||
    result.kind === 'grid' ||
    (result.connected && (result.kind === 'endpoint' || result.kind === 'segment'))
  )
}

/** Tweede punt: buis of vrij langs as (vrij hangend eind). */
export function isValidDrawEnd(result: SnapResult, start: Vec3): boolean {
  if (result.connected && (result.kind === 'endpoint' || result.kind === 'segment' || result.kind === 'ground')) {
    return dist(start, result.point) >= MIN_PIPE_LEN_M
  }
  if ((result.kind === 'axis' && result.axis) || result.kind === 'grid') {
    return dist(start, result.point) >= MIN_PIPE_LEN_M
  }
  return false
}

function finalizeSnap(result: Omit<SnapResult, 'connected'> & { connected?: boolean }, pipes: ScenePipe[]): SnapResult {
  if (result.kind === 'ground') {
    return {
      point: quantizeMm([result.point[0], 0, result.point[2]]),
      kind: 'ground',
      connected: true,
    }
  }

  const point = canonicalizeToPipe(result.point, pipes, result.pipeId)
  const connected = isPointOnPipe(point, pipes)
  let kind = result.kind
  let pipeId = result.pipeId

  if (connected) {
    for (const pipe of pipes) {
      if (dist(point, pipe.start) < 0.002 || dist(point, pipe.end) < 0.002) {
        pipeId = pipe.id
        kind = 'endpoint'
        break
      }
      const on = pointOnSegment(point, pipe.start, pipe.end)
      if (dist(point, on) < 0.002) {
        pipeId = pipe.id
        kind = 'segment'
        break
      }
    }
  }

  return { point, kind, pipeId, axis: result.axis, connected }
}

function snapGroundFromRay(rayOrigin: Vec3, rayDir: Vec3): SnapResult | null {
  const hit = intersectRayPlane(rayOrigin, rayDir, [0, 0, 0], [0, 1, 0])
  if (!hit || hit[1] > 0.05) return null
  const snapped = snapToGrid([hit[0], 0, hit[2]], GROUND_SNAP_GRID_M)
  return { point: quantizeMm(snapped), kind: 'ground', connected: true }
}

function rayTolerance(cameraPos: Vec3, target: Vec3): number {
  const d = dist(cameraPos, target)
  return Math.min(0.85, Math.max(0.3, d * 0.05))
}

function intersectRayPlane(
  origin: Vec3,
  dir: Vec3,
  planePoint: Vec3,
  planeNormal: Vec3,
): Vec3 | null {
  const denom = dot(dir, planeNormal)
  if (Math.abs(denom) < 1e-8) return null
  const w = sub(planePoint, origin)
  const t = dot(w, planeNormal) / denom
  if (t < 0) return null
  return add(origin, scale(dir, t))
}

function cursorOnCameraPlane(start: Vec3, rayOrigin: Vec3, rayDir: Vec3): Vec3 {
  const toCam = normalize(sub(rayOrigin, start))
  const hit = intersectRayPlane(rayOrigin, rayDir, start, toCam)
  if (hit) return hit
  const ground = intersectRayPlane(rayOrigin, rayDir, start, [0, 1, 0])
  return ground ?? add(start, scale(rayDir, 2))
}

export function pickDrawAxis(from: Vec3, to: Vec3): Vec3 {
  const v = sub(to, from)
  const ax = Math.abs(v[0])
  const ay = Math.abs(v[1])
  const az = Math.abs(v[2])

  if (ay >= ax && ay >= az) return [0, v[1] >= 0 ? 1 : -1, 0]
  if (ax >= az) return [v[0] >= 0 ? 1 : -1, 0, 0]
  return [0, 0, v[2] >= 0 ? 1 : -1]
}

function perpDistanceToAxis(point: Vec3, origin: Vec3, axis: Vec3): number {
  const along = dot(sub(point, origin), axis)
  return dist(point, pointOnAxis(origin, axis, along))
}

function intersectAxisWithSegment(
  origin: Vec3,
  axis: Vec3,
  segA: Vec3,
  segB: Vec3,
): { point: Vec3; t: number } | null {
  const u = sub(segB, segA)
  const w0 = sub(origin, segA)
  const a = dot(axis, axis)
  const b = dot(axis, u)
  const c = dot(u, u)
  const d = dot(axis, w0)
  const e = dot(u, w0)
  const denom = a * c - b * b

  if (Math.abs(denom) < 1e-10) return null

  let t = (b * e - c * d) / denom
  let s = (a * e - b * d) / denom
  if (s < 0 || s > 1 || t < 0) return null

  const p = pointOnAxis(origin, axis, t)
  const q = add(segA, scale(u, s))
  if (dist(p, q) > AXIS_LINE_TOL_M) return null
  return { point: quantizeMm(q), t }
}

type AxisHit = { point: Vec3; t: number; kind: 'endpoint' | 'segment'; pipeId: string }

function findHitsAlongAxis(
  start: Vec3,
  axis: Vec3,
  pipes: ScenePipe[],
  excludePipeId?: string,
): AxisHit[] {
  const hits: AxisHit[] = []

  for (const pipe of pipes) {
    if (pipe.id === excludePipeId) continue

    for (const ep of [pipe.start, pipe.end] as const) {
      if (dist(start, ep) < MIN_PIPE_LEN_M) continue
      if (perpDistanceToAxis(ep, start, axis) > AXIS_LINE_TOL_M) continue
      const t = dot(sub(ep, start), axis)
      if (t < MIN_PIPE_LEN_M) continue
      hits.push({ point: quantizeMm(ep), t, kind: 'endpoint', pipeId: pipe.id })
    }

    const hit = intersectAxisWithSegment(start, axis, pipe.start, pipe.end)
    if (hit && hit.t >= MIN_PIPE_LEN_M && dist(start, hit.point) >= MIN_PIPE_LEN_M) {
      const len = dist(pipe.start, pipe.end)
      const segT = closestTOnSegment(hit.point, pipe.start, pipe.end)
      const nearEnd = segT * len < 0.002 || (1 - segT) * len < 0.002
      hits.push({
        point: exactPointOnPipe(pipe, hit.point),
        t: hit.t,
        kind: nearEnd ? 'endpoint' : 'segment',
        pipeId: pipe.id,
      })
    }
  }

  return hits
}

/** Zoek haakse verbinding langs alle 6 assen — kies hit dichtst bij cursor. */
function snapAlongBestAxis(
  start: Vec3,
  cursor: Vec3,
  pipes: ScenePipe[],
  excludePipeId?: string,
  precise?: boolean,
): SnapResult {
  const scales = snapScales(precise)
  let best: (AxisHit & { cursorDist: number }) | null = null

  for (const axis of DRAW_AXES) {
    const hits = findHitsAlongAxis(start, axis, pipes, excludePipeId)
    for (const hit of hits) {
      const cursorDist = dist(hit.point, cursor)
      if (!best) {
        best = { ...hit, cursorDist }
        continue
      }
      // Nauwkeurig: liever midden van buis dan nabij eindpunt als cursor vergelijkbaar dichtbij is.
      if (
        precise &&
        hit.kind === 'segment' &&
        best.kind === 'endpoint' &&
        cursorDist <= best.cursorDist + 0.05
      ) {
        best = { ...hit, cursorDist }
        continue
      }
      if (cursorDist < best.cursorDist) {
        best = { ...hit, cursorDist }
      }
    }
  }

  if (best && best.cursorDist < scales.axisMagnet) {
    return finalizeSnap(
      { point: best.point, kind: best.kind, pipeId: best.pipeId, axis: pickDrawAxis(start, best.point) },
      pipes,
    )
  }

  const axis = pickDrawAxis(start, cursor)
  let t = dot(sub(cursor, start), axis)
  if (t < MIN_PIPE_LEN_M) t = MIN_PIPE_LEN_M
  return {
    point: quantizeMm(pointOnAxis(start, axis, t)),
    kind: 'axis',
    axis,
    connected: false,
  }
}

/** Snap naar dichtstbijzijnde eindpunt of buismiddellijn. */
export function snapPoint(p: Vec3, pipes: ScenePipe[], preferPipeId?: string, precise?: boolean): SnapResult {
  const scales = snapScales(precise)
  type Candidate = { point: Vec3; d: number; pipeId: string; kind: 'endpoint' | 'segment' }
  let best: Candidate | null = null

  const ordered = preferPipeId
    ? [...pipes.filter((pipe) => pipe.id === preferPipeId), ...pipes.filter((pipe) => pipe.id !== preferPipeId)]
    : pipes

  for (const pipe of ordered) {
    for (const ep of [pipe.start, pipe.end] as const) {
      const d = distance(p, ep)
      if (d < scales.endpoint && (!best || d < best.d)) {
        best = { point: quantizeMm(ep), d, pipeId: pipe.id, kind: 'endpoint' }
      }
    }

    const onSeg = pointOnSegment(p, pipe.start, pipe.end)
    const d = distance(p, onSeg)
    if (d < scales.segment) {
      const preferSegment = precise && best?.kind === 'endpoint' && d <= best.d + 0.04
      if (!best || d < best.d || preferSegment) {
        best = { point: exactPointOnPipe(pipe, onSeg), d, pipeId: pipe.id, kind: 'segment' }
      }
    }
  }

  if (best) {
    return finalizeSnap({ point: best.point, kind: best.kind, pipeId: best.pipeId }, pipes)
  }

  return { point: quantizeMm(p), kind: 'grid', connected: false }
}

export function snapToPipeCenterline(point: Vec3, pipe: ScenePipe, precise?: boolean): SnapResult {
  const scales = snapScales(precise)
  const onSeg = pointOnSegment(point, pipe.start, pipe.end)
  const len = dist(pipe.start, pipe.end)
  const t = closestTOnSegment(onSeg, pipe.start, pipe.end)
  const nearStart = t * len < scales.endpoint
  const nearEnd = (1 - t) * len < scales.endpoint

  if (nearStart) {
    return finalizeSnap({ point: pipe.start, kind: 'endpoint', pipeId: pipe.id }, [pipe])
  }
  if (nearEnd) {
    return finalizeSnap({ point: pipe.end, kind: 'endpoint', pipeId: pipe.id }, [pipe])
  }
  return finalizeSnap({ point: exactPointOnPipe(pipe, onSeg), kind: 'segment', pipeId: pipe.id }, [pipe])
}

function snapPipeFromRay(
  rayOrigin: Vec3,
  rayDir: Vec3,
  pipes: ScenePipe[],
  cameraPos: Vec3,
  precise?: boolean,
): SnapResult | null {
  let best: { point: Vec3; score: number; pipeId: string } | null = null

  for (const pipe of pipes) {
    const a = pipe.start
    const b = pipe.end
    const u = sub(b, a)
    const w0 = sub(rayOrigin, a)
    const ua = dot(u, rayDir)
    const ub = dot(u, u)
    const uw = dot(u, w0)
    const dw = dot(rayDir, w0)
    const dd = dot(rayDir, rayDir)
    const denom = ub * dd - ua * ua

    let tSeg = 0
    let tRay = 0
    if (Math.abs(denom) < 1e-10) {
      tRay = dw / dd
    } else {
      tSeg = (ua * dw - uw * dd) / denom
      tRay = (ub * dw - ua * uw) / denom
    }

    tSeg = Math.max(0, Math.min(1, tSeg))
    tRay = Math.max(0, tRay)

    const hit: Vec3 = [a[0] + tSeg * u[0], a[1] + tSeg * u[1], a[2] + tSeg * u[2]]
    const tol = rayTolerance(cameraPos, hit)
    const rx = rayOrigin[0] + tRay * rayDir[0]
    const ry = rayOrigin[1] + tRay * rayDir[1]
    const rz = rayOrigin[2] + tRay * rayDir[2]
    const gap = dist(hit, [rx, ry, rz])

    if (gap < tol && (!best || gap < best.score)) {
      best = { point: hit, score: gap, pipeId: pipe.id }
    }
  }

  if (!best) return null
  const pipe = pipes.find((p) => p.id === best!.pipeId)!
  return finalizeSnap(snapToPipeCenterline(best.point, pipe, precise), pipes)
}

export function resolveDrawTarget(input: DrawTargetInput): SnapResult {
  const { rayOrigin, rayDir, cameraPos, pipes, start, startPipeId, free, precise, groundY = 0 } = input

  if (!start) {
    if (!free) {
      const pipeHit = snapPipeFromRay(rayOrigin, rayDir, pipes, cameraPos, precise)
      if (pipeHit) return pipeHit

      const groundHit = snapGroundFromRay(rayOrigin, rayDir)
      if (groundHit) {
        return groundY !== 0
          ? { ...groundHit, point: quantizeMm([groundHit.point[0], groundY, groundHit.point[2]]) }
          : groundHit
      }
    }

    // Vrij/zwevend startpunt in de lucht (Shift, of niets in de buurt).
    const cursor = cursorOnCameraPlane([0, 1, 0], rayOrigin, rayDir)
    if (!free) {
      const grid = snapPoint(cursor, pipes, undefined, precise)
      if (grid.connected) return grid
    }
    return { point: quantizeMm(cursor), kind: 'grid', connected: false }
  }

  const cursor = cursorOnCameraPlane(start, rayOrigin, rayDir)
  if (free) {
    const axis = pickDrawAxis(start, cursor)
    let t = dot(sub(cursor, start), axis)
    if (t < MIN_PIPE_LEN_M) t = MIN_PIPE_LEN_M
    return { point: quantizeMm(pointOnAxis(start, axis, t)), kind: 'axis', axis, connected: false }
  }
  const axisSnap = snapAlongBestAxis(start, cursor, pipes, startPipeId ?? undefined, precise)
  // Vrij eind vlak boven maaiveld → snap naar de grond. groundY is 0 bij voetplaat
  // en de (negatieve) verankeringsdiepte bij grondanker (geen voetplaat).
  if (!axisSnap.connected && axisSnap.point[1] > groundY && axisSnap.point[1] <= GROUND_SNAP_M) {
    return {
      point: quantizeMm([axisSnap.point[0], groundY, axisSnap.point[2]]),
      kind: 'ground',
      axis: axisSnap.axis,
      connected: true,
    }
  }
  return axisSnap
}

export function resolveDrawFromPoint(
  point: Vec3,
  start: Vec3 | null,
  pipes: ScenePipe[],
  preferPipeId?: string,
  startPipeId?: string | null,
  precise?: boolean,
): SnapResult {
  if (!start) {
    if (preferPipeId) {
      const pipe = pipes.find((p) => p.id === preferPipeId)
      if (pipe) return finalizeSnap(snapToPipeCenterline(point, pipe, precise), pipes)
    }
    return snapPoint(point, pipes, undefined, precise)
  }

  const axisSnap = snapAlongBestAxis(start, point, pipes, startPipeId ?? undefined, precise)
  if (axisSnap.connected) return axisSnap

  // Cursor ligt direct op een (andere) buis → verbind daar, ook als niet haaks.
  if (preferPipeId && preferPipeId !== startPipeId) {
    const pipe = pipes.find((p) => p.id === preferPipeId)
    if (pipe) {
      const onPipe = finalizeSnap(snapToPipeCenterline(point, pipe, precise), pipes)
      if (onPipe.connected && dist(start, onPipe.point) >= MIN_PIPE_LEN_M) {
        return { ...onPipe, axis: normalize(sub(onPipe.point, start)) }
      }
    }
  }

  return axisSnap
}

/** Projecteer de muisstraal op een vlak door `anchor` dat naar de camera kijkt. */
export function projectPointerOnViewPlane(anchor: Vec3, rayOrigin: Vec3, rayDir: Vec3): Vec3 {
  return cursorOnCameraPlane(anchor, rayOrigin, rayDir)
}

const MOVE_GROUND_TOL_M = 0.01

export interface MovedPipe {
  start: Vec3
  end: Vec3
  /** Minstens één eindpunt ligt op een andere buis of op de grond. */
  connected: boolean
  /** Punt waar de verbinding zichtbaar wordt gemaakt (marker). */
  anchor?: Vec3
}

/**
 * Verschuif een buis rigide met een delta en snap één eindpunt magnetisch naar
 * een andere buis. `connected` is waar zolang minstens één eindpunt op een andere
 * buis of op de grond ligt — zodat een buis nooit volledig zwevend wordt.
 */
export function resolveMovedPipe(
  origStart: Vec3,
  origEnd: Vec3,
  delta: Vec3,
  otherPipes: ScenePipe[],
  groundY = 0,
): MovedPipe {
  let start = add(origStart, delta)
  let end = add(origEnd, delta)

  const sSnap = snapPoint(start, otherPipes)
  const eSnap = snapPoint(end, otherPipes)
  const sD = sSnap.connected ? dist(start, sSnap.point) : Infinity
  const eD = eSnap.connected ? dist(end, eSnap.point) : Infinity

  let snapped = false
  if (Number.isFinite(sD) && sD <= eD) {
    const adj = sub(sSnap.point, start)
    start = add(start, adj)
    end = add(end, adj)
    snapped = true
  } else if (Number.isFinite(eD)) {
    const adj = sub(eSnap.point, end)
    start = add(start, adj)
    end = add(end, adj)
    snapped = true
  }

  // Geen buis-snap? Laat het laagste eindpunt op maaiveld vallen als het dichtbij is.
  // Bij grondanker landt het op de (negatieve) verankeringsdiepte i.p.v. y = 0.
  if (!snapped) {
    const lowY = Math.min(start[1], end[1])
    if (lowY > groundY && lowY <= GROUND_SNAP_M) {
      const drop = lowY - groundY
      start = [start[0], start[1] - drop, start[2]]
      end = [end[0], end[1] - drop, end[2]]
    }
  }

  start = quantizeMm(start)
  end = quantizeMm(end)

  const groundContact = groundY + MOVE_GROUND_TOL_M
  const startConn = isPointOnPipe(start, otherPipes) || start[1] <= groundContact
  const endConn = isPointOnPipe(end, otherPipes) || end[1] <= groundContact
  const anchor = startConn ? start : endConn ? end : undefined

  return { start, end, connected: startConn || endConn, anchor }
}

export function isValidHingeStart(result: SnapResult): boolean {
  return result.connected && (result.kind === 'endpoint' || result.kind === 'segment')
}

export function isValidHingeEnd(result: SnapResult, start: Vec3): boolean {
  return dist(start, result.point) >= MIN_PIPE_LEN_M
}

/** Scharnier-tekenen: start op buis, eind vrij onder elke hoek of op buis. */
export function resolveHingeDrawTarget(input: DrawTargetInput): SnapResult {
  const { rayOrigin, rayDir, cameraPos, pipes, start, precise } = input

  if (!start) {
    const pipeHit = snapPipeFromRay(rayOrigin, rayDir, pipes, cameraPos, precise)
    if (pipeHit && isValidHingeStart(pipeHit)) return pipeHit
    return { point: quantizeMm([0, 0, 0]), kind: 'grid', connected: false }
  }

  const pipeHit = snapPipeFromRay(rayOrigin, rayDir, pipes, cameraPos, precise)
  if (pipeHit?.connected && dist(start, pipeHit.point) >= MIN_PIPE_LEN_M) {
    return pipeHit
  }

  const cursor = cursorOnCameraPlane(start, rayOrigin, rayDir)
  const onPipe = snapPoint(quantizeMm(cursor), pipes, undefined, precise)
  if (onPipe.connected && dist(start, onPipe.point) >= MIN_PIPE_LEN_M) {
    return onPipe
  }

  const dir = sub(cursor, start)
  const len = Math.max(dist(start, cursor), MIN_PIPE_LEN_M)
  const n = dist([0, 0, 0], dir) > 0.001 ? normalize(dir) : ([1, 0, 0] as Vec3)
  return {
    point: quantizeMm(add(start, scale(n, len))),
    kind: 'axis',
    axis: n,
    connected: false,
  }
}

export function resolveHingeFromPoint(
  point: Vec3,
  start: Vec3 | null,
  pipes: ScenePipe[],
  preferPipeId?: string,
  precise?: boolean,
): SnapResult {
  if (!start) {
    if (preferPipeId) {
      const pipe = pipes.find((p) => p.id === preferPipeId)
      if (pipe) return snapToPipeCenterline(point, pipe, precise)
    }
    return snapPoint(point, pipes, undefined, precise)
  }

  const onPipe = snapPoint(point, pipes, undefined, precise)
  if (onPipe.connected && dist(start, onPipe.point) >= MIN_PIPE_LEN_M) {
    return onPipe
  }

  const dir = sub(point, start)
  const len = Math.max(dist(start, point), MIN_PIPE_LEN_M)
  const n = dist([0, 0, 0], dir) > 0.001 ? normalize(dir) : ([1, 0, 0] as Vec3)
  return {
    point: quantizeMm(add(start, scale(n, len))),
    kind: 'axis',
    axis: n,
    connected: false,
  }
}

export function resolveHingeDrawEnd(start: Vec3, preview: SnapResult, lengthMm: number): Vec3 {
  if (preview.connected && (preview.kind === 'endpoint' || preview.kind === 'segment')) {
    return preview.point
  }
  const axis = preview.axis ?? normalize(sub(preview.point, start))
  const len = Math.max(MIN_PIPE_LEN_M, lengthMm / 1000)
  return quantizeMm(add(start, scale(axis, len)))
}

export function hingeSnapKindLabel(kind: SnapKind, connected: boolean): string {
  if (!connected && kind === 'axis') return 'Schuine richting'
  if (kind === 'endpoint') return 'Eindpunt buis'
  if (kind === 'segment') return 'Op buis'
  return 'Klik op buis'
}

/** Bepaal eindpunt: op buis als gesnapt, anders vaste lengte langs as. */
export function resolveDrawEnd(start: Vec3, preview: SnapResult, lengthMm: number): Vec3 {
  if (preview.connected && (preview.kind === 'endpoint' || preview.kind === 'segment' || preview.kind === 'ground')) {
    return preview.point
  }
  const axis = preview.axis ?? pickDrawAxis(start, preview.point)
  const len = Math.max(MIN_PIPE_LEN_M, lengthMm / 1000)
  return quantizeMm([
    start[0] + axis[0] * len,
    start[1] + axis[1] * len,
    start[2] + axis[2] * len,
  ])
}

/** Start op grond/buis; eind vrij of op buis. */
export function finalizePipeDraw(
  start: Vec3,
  end: Vec3,
  pipes: ScenePipe[],
  startKind?: SnapKind,
  startPipeId?: string | null,
): { start: Vec3; end: Vec3 } | null {
  const startPipe = startPipeId ? pipes.find((p) => p.id === startPipeId) : null
  const s = startPipe
    ? finalizeSnap(snapToPipeCenterline(start, startPipe), pipes)
    : snapPoint(start, pipes)
  const startPoint =
    startKind === 'ground' || start[1] <= 0.002
      ? quantizeMm([start[0], 0, start[2]])
      : s.connected
        ? s.point
        : quantizeMm(start)

  const e = snapPoint(end, pipes)
  const endPoint = e.connected ? e.point : quantizeMm(end)

  if (dist(startPoint, endPoint) < MIN_PIPE_LEN_M) return null
  return { start: startPoint, end: endPoint }
}

/** @deprecated Gebruik finalizePipeDraw */
export function finalizeDrawEndpoints(
  start: Vec3,
  end: Vec3,
  pipes: ScenePipe[],
): { start: Vec3; end: Vec3 } | null {
  const s = snapPoint(start, pipes)
  const e = snapPoint(end, pipes)
  if (!isPlaceableSnap(s) || !isPlaceableSnap(e)) return null
  if (dist(s.point, e.point) < MIN_PIPE_LEN_M) return null
  return { start: s.point, end: e.point }
}

export function snapKindLabel(kind: SnapKind, connected: boolean, axis?: Vec3): string {
  if (kind === 'ground') return 'Grond'
  if (kind === 'axis' && !connected) {
    return axis ? `Vrij · ${axisLabel(axis)}` : 'Vrij hangend'
  }
  if (!connected && kind !== 'endpoint' && kind !== 'segment') {
    return 'Klik grond of buis'
  }
  switch (kind) {
    case 'endpoint':
      return 'Eindpunt buis'
    case 'segment':
      return 'Op buis'
    case 'axis':
      return axis ? `Haaks (${axisLabel(axis)})` : 'Haaks'
    default:
      return 'Klik grond of buis'
  }
}

function axisLabel(axis: Vec3): string {
  if (Math.abs(axis[1]) > 0.5) return axis[1] > 0 ? '+Y' : '-Y'
  if (Math.abs(axis[0]) > 0.5) return axis[0] > 0 ? '+X' : '-X'
  return axis[2] > 0 ? '+Z' : '-Z'
}

/** @deprecated */
export function applyAxisLock(from: Vec3, to: Vec3, pipes: ScenePipe[]): SnapResult {
  return snapAlongBestAxis(from, to, pipes)
}

/** @deprecated */
export function snapFromRay(input: {
  rayOrigin: Vec3
  rayDir: Vec3
  pipes: ScenePipe[]
  start: Vec3 | null
  planeY: number
}): SnapResult {
  return resolveDrawTarget({
    rayOrigin: input.rayOrigin,
    rayDir: input.rayDir,
    cameraPos: input.rayOrigin,
    pipes: input.pipes,
    start: input.start,
  })
}

export function snapToGrid(p: Vec3, step = GRID_SNAP_M): Vec3 {
  return [
    Math.round(p[0] / step) * step,
    Math.round(p[1] / step) * step,
    Math.round(p[2] / step) * step,
  ]
}

export function collectEndpoints(pipes: ScenePipe[]): Vec3[] {
  const points: Vec3[] = []
  for (const p of pipes) {
    points.push(p.start, p.end)
  }
  return points
}

export function vec3FromPoint(p: { x: number; y: number; z: number }): Vec3 {
  return [p.x, p.y, p.z]
}
