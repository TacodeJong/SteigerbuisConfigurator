import type { ScenePipe, Vec3 } from '../types'

export const JUNCTION_POINT_TOL_M = 0.004
export const SEGMENT_ENDPOINT_TOL_M = 0.008
/** Max afstand om buiseinden te lassen (editor snap-tolerantie). */
export const WELD_TOLERANCE_M = 0.015

export function dist(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
  if (len < 0.0001) return [0, 1, 0]
  return [v[0] / len, v[1] / len, v[2] / len]
}

export function pipeDirection(pipe: ScenePipe): Vec3 {
  return normalize([
    pipe.end[0] - pipe.start[0],
    pipe.end[1] - pipe.start[1],
    pipe.end[2] - pipe.start[2],
  ])
}

export function pipeLength(pipe: ScenePipe): number {
  return dist(pipe.start, pipe.end)
}

export function junctionKey(p: Vec3): string {
  return `${Math.round(p[0] * 1000)}:${Math.round(p[1] * 1000)}:${Math.round(p[2] * 1000)}`
}

/** Rond af op hele mm — zelfde nauwkeurigheid als koppelingsdetectie. */
export function quantizeMm(p: Vec3): Vec3 {
  return [
    Math.round(p[0] * 1000) / 1000,
    Math.round(p[1] * 1000) / 1000,
    Math.round(p[2] * 1000) / 1000,
  ]
}

/** Exact punt op buismiddellijn, afgerond op mm. */
export function exactPointOnPipe(pipe: ScenePipe, point: Vec3): Vec3 {
  const t = closestTOnSegment(point, pipe.start, pipe.end)
  return quantizeMm([
    pipe.start[0] + t * (pipe.end[0] - pipe.start[0]),
    pipe.start[1] + t * (pipe.end[1] - pipe.start[1]),
    pipe.start[2] + t * (pipe.end[2] - pipe.start[2]),
  ])
}

/** Koppel aan bestaand eindpunt of middenlijn — voorkomt zwevende coördinaten. */
export function canonicalizeToPipe(point: Vec3, pipes: ScenePipe[], preferPipeId?: string): Vec3 {
  const ordered = preferPipeId
    ? [...pipes.filter((p) => p.id === preferPipeId), ...pipes.filter((p) => p.id !== preferPipeId)]
    : pipes

  for (const pipe of ordered) {
    if (dist(point, pipe.start) < 0.002) return quantizeMm(pipe.start)
    if (dist(point, pipe.end) < 0.002) return quantizeMm(pipe.end)
  }

  for (const pipe of ordered) {
    const on = pointOnSegment(point, pipe.start, pipe.end)
    if (dist(point, on) < 0.02) return exactPointOnPipe(pipe, point)
  }

  return quantizeMm(point)
}

export function isPointOnPipe(point: Vec3, pipes: ScenePipe[]): boolean {
  for (const pipe of pipes) {
    if (dist(point, pipe.start) < 0.002 || dist(point, pipe.end) < 0.002) return true
    const on = pointOnSegment(point, pipe.start, pipe.end)
    if (dist(point, on) < 0.002) return true
  }
  return false
}

/** Parametrische positie t ∈ [0,1] van het dichtstbijzijnde punt op het lijnstuk. */
export function closestTOnSegment(point: Vec3, start: Vec3, end: Vec3): number {
  const ab: Vec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]]
  const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]
  if (len2 < 1e-12) return 0
  const ap: Vec3 = [point[0] - start[0], point[1] - start[1], point[2] - start[2]]
  const t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2
  return Math.max(0, Math.min(1, t))
}

export function pointOnSegment(point: Vec3, start: Vec3, end: Vec3): Vec3 {
  const t = closestTOnSegment(point, start, end)
  return [start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1]), start[2] + t * (end[2] - start[2])]
}

/** Punt ligt op het lijnstuk (niet op de uiteinden) — geschikt voor T-stuk op doorlopende buis. */
export function isInteriorPointOnPipe(
  point: Vec3,
  pipe: ScenePipe,
  tol = JUNCTION_POINT_TOL_M,
  endpointTol = SEGMENT_ENDPOINT_TOL_M,
): boolean {
  const len = pipeLength(pipe)
  if (len < endpointTol * 3) return false

  const closest = pointOnSegment(point, pipe.start, pipe.end)
  if (dist(point, closest) > tol) return false

  const t = closestTOnSegment(point, pipe.start, pipe.end)
  const fromStart = t * len
  const fromEnd = (1 - t) * len
  return fromStart > endpointTol && fromEnd > endpointTol
}

export function isPipeEndpoint(point: Vec3, pipe: ScenePipe, tol = JUNCTION_POINT_TOL_M): boolean {
  return dist(point, pipe.start) <= tol || dist(point, pipe.end) <= tol
}

function weldTargetForPoint(
  point: Vec3,
  selfId: string,
  pipes: ScenePipe[],
  tol = WELD_TOLERANCE_M,
): Vec3 | null {
  let best: { point: Vec3; d: number } | null = null

  for (const other of pipes) {
    for (const ep of [other.start, other.end] as const) {
      const d = dist(point, ep)
      if (d <= tol && (!best || d < best.d)) {
        best = { point: quantizeMm(ep), d }
      }
    }

    if (other.id === selfId) continue

    const on = pointOnSegment(point, other.start, other.end)
    const d = dist(point, on)
    if (d <= tol && (!best || d < best.d)) {
      best = { point: exactPointOnPipe(other, on), d }
    }
  }

  return best?.point ?? null
}

function representativeJunctionPoint(points: Vec3[], pipes: ScenePipe[]): Vec3 {
  for (const p of points) {
    for (const pipe of pipes) {
      if (isInteriorPointOnPipe(p, pipe, WELD_TOLERANCE_M, SEGMENT_ENDPOINT_TOL_M)) {
        return exactPointOnPipe(pipe, p)
      }
    }
  }

  const n = points.length
  const avg: Vec3 = [
    points.reduce((s, p) => s + p[0], 0) / n,
    points.reduce((s, p) => s + p[1], 0) / n,
    points.reduce((s, p) => s + p[2], 0) / n,
  ]
  return quantizeMm(avg)
}

/**
 * Las nabije buiseinden aan elkaar of aan een buismiddellijn.
 * Essentieel voor editor: voorkomt zwevende koppelingen door afrondingsverschillen.
 */
export function weldPipeJoints(pipes: ScenePipe[]): ScenePipe[] {
  if (pipes.length === 0) return pipes

  const welded = pipes.map((p) => ({
    ...p,
    start: quantizeMm(p.start),
    end: quantizeMm(p.end),
  }))

  type EndpointRef = { pipeId: string; end: 'start' | 'end'; point: Vec3 }
  const endpoints: EndpointRef[] = []

  for (const pipe of welded) {
    for (const end of ['start', 'end'] as const) {
      const snapped = weldTargetForPoint(pipe[end], pipe.id, welded)
      if (snapped) pipe[end] = snapped
      endpoints.push({ pipeId: pipe.id, end, point: pipe[end] })
    }
  }

  const parent = endpoints.map((_, i) => i)
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i])
    return parent[i]
  }
  const unite = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let i = 0; i < endpoints.length; i++) {
    for (let j = i + 1; j < endpoints.length; j++) {
      if (dist(endpoints[i].point, endpoints[j].point) <= WELD_TOLERANCE_M) unite(i, j)
    }
  }

  const clusters = new Map<number, number[]>()
  for (let i = 0; i < endpoints.length; i++) {
    const root = find(i)
    const list = clusters.get(root) ?? []
    list.push(i)
    clusters.set(root, list)
  }

  for (const indices of clusters.values()) {
    const rep = representativeJunctionPoint(
      indices.map((i) => endpoints[i].point),
      welded,
    )
    for (const i of indices) {
      const ref = endpoints[i]
      const pipe = welded.find((p) => p.id === ref.pipeId)
      if (pipe) pipe[ref.end] = rep
    }
  }

  return welded
}
