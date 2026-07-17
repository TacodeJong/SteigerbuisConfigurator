import type { BaseAnchorType, FittingType, SceneFitting, ScenePipe, Vec3 } from '../types'
import {
  canonicalizeToPipe,
  dist,
  isInteriorPointOnPipe,
  isPipeEndpoint,
  isPointOnPipe,
  junctionKey,
  normalize,
  pipeDirection,
  quantizeMm,
  WELD_TOLERANCE_M,
  weldPipeJoints,
} from './pipeGeometry'

const JUNCTION_TOL = 0.004
const JUNCTION_MERGE_TOL_M = WELD_TOLERANCE_M
/** Ruimere tolerantie om T-stuk op doorlopende buis te herkennen */
const INTERIOR_ARM_TOL_M = WELD_TOLERANCE_M
/** Binnen deze afstand van een scharnierpunt geen automatische fitting plaatsen. */
const HINGE_SUPPRESS_TOL_M = 0.02

function nearHingePoint(point: Vec3, hingePoints: Vec3[] | undefined): boolean {
  if (!hingePoints?.length) return false
  return hingePoints.some((hp) => dist(hp, point) <= HINGE_SUPPRESS_TOL_M)
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function negate(v: Vec3): Vec3 {
  return [-v[0], -v[1], -v[2]]
}

function angleBetween(a: Vec3, b: Vec3): number {
  const d = Math.max(-1, Math.min(1, dot(a, b)))
  return Math.acos(d)
}

function fitting(
  id: string,
  type: FittingType,
  position: Vec3,
  axisA: Vec3,
  diameterMm: number,
  axisB?: Vec3,
  axes?: Vec3[],
): SceneFitting {
  return {
    id,
    type,
    position,
    axisA: normalize(axisA),
    axisB: axisB ? normalize(axisB) : undefined,
    axes: axes?.map(normalize),
    diameterMm,
  }
}

interface JunctionArm {
  direction: Vec3
  pipeId: string
}

interface Junction {
  position: Vec3
  arms: JunctionArm[]
  diameterMm: number
}

function addArm(junction: Junction, direction: Vec3, pipeId: string) {
  const n = normalize(direction)
  // Alleen dezelfde richting dedupliceren — tegengestelde armen (+X / −X) zijn nodig voor T-stukken.
  if (junction.arms.some((a) => a.pipeId === pipeId && dot(a.direction, n) > 0.92)) {
    return
  }
  if (junction.arms.some((a) => dot(a.direction, n) > 0.92)) {
    return
  }
  junction.arms.push({ direction: n, pipeId })
}

function findJunctionByPosition(junctions: Map<string, Junction>, position: Vec3): Junction | undefined {
  const key = junctionKey(position)
  const direct = junctions.get(key)
  if (direct) return direct

  for (const junction of junctions.values()) {
    if (dist(junction.position, position) <= JUNCTION_MERGE_TOL_M) return junction
  }
  return undefined
}

function getJunction(
  junctions: Map<string, Junction>,
  point: Vec3,
  pipes: ScenePipe[],
  diameterMm: number,
): Junction {
  const position = canonicalizeToPipe(point, pipes)
  const existing = findJunctionByPosition(junctions, position)

  if (existing) {
    existing.position = canonicalizeToPipe(
      representativePosition([existing.position, position], pipes),
      pipes,
    )
    return existing
  }

  const created: Junction = { position, arms: [], diameterMm }
  junctions.set(junctionKey(position), created)
  return created
}

function representativePosition(points: Vec3[], pipes: ScenePipe[]): Vec3 {
  for (const p of points) {
    for (const pipe of pipes) {
      if (isInteriorPointOnPipe(p, pipe, INTERIOR_ARM_TOL_M, 0.008)) {
        return quantizeMm(canonicalizeToPipe(p, pipes, pipe.id))
      }
    }
  }
  return quantizeMm(points[0])
}

/** Voeg doorlopende armen toe wanneer een buiseinde op een andere buis rust. */
function addThroughArmsAtInteriorPoints(junctions: Map<string, Junction>, pipes: ScenePipe[]) {
  for (const pipeA of pipes) {
    for (const point of [pipeA.start, pipeA.end] as const) {
      for (const pipeB of pipes) {
        if (pipeB.id === pipeA.id) continue
        if (!isInteriorPointOnPipe(point, pipeB, INTERIOR_ARM_TOL_M, 0.008)) continue

        const junction = getJunction(junctions, point, pipes, Math.max(pipeA.diameterMm, pipeB.diameterMm))
        const through = pipeDirection(pipeB)
        addArm(junction, through, pipeB.id)
        addArm(junction, [-through[0], -through[1], -through[2]], pipeB.id)
        junction.diameterMm = Math.max(junction.diameterMm, pipeA.diameterMm, pipeB.diameterMm)
        junction.position = canonicalizeToPipe(junction.position, pipes, pipeB.id)
      }
    }
  }
}

/** Extra pass: verrijk knooppunten met ontbrekende doorloop-armen. */
function enrichThroughArms(junctions: Junction[], pipes: ScenePipe[]) {
  for (const junction of junctions) {
    for (const pipe of pipes) {
      if (!isInteriorPointOnPipe(junction.position, pipe, INTERIOR_ARM_TOL_M, 0.008)) continue
      const through = pipeDirection(pipe)
      addArm(junction, through, pipe.id)
      addArm(junction, [-through[0], -through[1], -through[2]], pipe.id)
      junction.diameterMm = Math.max(junction.diameterMm, pipe.diameterMm)
    }
  }
}

/** Assen samenvouwen — +X en −X worden één lijn. */
function uniqueAxisLines(dirs: Vec3[]): Vec3[] {
  const merged: Vec3[] = []
  for (const d of dirs) {
    const n = normalize(d)
    if (merged.some((m) => Math.abs(dot(m, n)) > 0.92)) continue
    merged.push(n)
  }
  return merged
}

function hasOppositePair(dirs: Vec3[]): boolean {
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      if (angleBetween(dirs[i], dirs[j]) > 2.6) return true
    }
  }
  return false
}

function findOppositePair(dirs: Vec3[]): [Vec3, Vec3] | null {
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      if (angleBetween(dirs[i], dirs[j]) > 2.6) {
        return [dirs[i], dirs[j]]
      }
    }
  }
  return null
}

function throughAxisFromPair(a: Vec3, b: Vec3): Vec3 {
  return normalize([a[0] - b[0], a[1] - b[1], a[2] - b[2]])
}

function isPlanarCross(dirs: Vec3[]): boolean {
  if (dirs.length < 4 || !hasOppositePair(dirs)) return false
  const lines = uniqueAxisLines(dirs)
  if (lines.length !== 2) return false
  return Math.abs(angleBetween(lines[0], lines[1]) - Math.PI / 2) < 0.25
}

function isOpenPipeEnd(position: Vec3, arms: JunctionArm[], pipes: ScenePipe[]): boolean {
  const pipe = pipes.find((p) => p.id === arms[0]?.pipeId)
  if (!pipe) return true

  for (const other of pipes) {
    if (other.id === pipe.id) continue
    if (isInteriorPointOnPipe(position, other, INTERIOR_ARM_TOL_M, 0.012)) {
      return false
    }
  }

  return isPipeEndpoint(position, pipe, 0.003) || !isPointOnPipe(position, pipes)
}

interface ClassifyOptions {
  baseType?: BaseAnchorType
  anchorDepthMm?: number
}

function classifyJunction(
  id: string,
  position: Vec3,
  arms: JunctionArm[],
  diameterMm: number,
  pipes: ScenePipe[],
  options?: ClassifyOptions,
): SceneFitting | null {
  const pos = quantizeMm(position)
  let dirs = arms.map((a) => normalize(a.direction))

  // Verrijk 2-armige hoeken op doorlopende buis tot T-stuk
  for (const pipe of pipes) {
    if (!isInteriorPointOnPipe(pos, pipe, INTERIOR_ARM_TOL_M, 0.008)) continue
    const through = pipeDirection(pipe)
    if (!dirs.some((d) => dot(d, through) > 0.92)) dirs.push(through)
    if (!dirs.some((d) => dot(d, through) < -0.92)) dirs.push([-through[0], -through[1], -through[2]])
  }

  const n = dirs.length

  if (n === 0) return null

  if (n === 1) {
    const d = dirs[0]
    const buryY = options?.baseType === 'grondanker' ? -(options.anchorDepthMm ?? 0) / 1000 : 0

    if (buryY < -JUNCTION_TOL && pos[1] <= buryY + JUNCTION_TOL) {
      return null
    }

    if (pos[1] < JUNCTION_TOL) {
      if (options?.baseType === 'grondanker') {
        return null
      }
      return fitting(id, 'voetplaat-rond', pos, [0, 1, 0], diameterMm)
    }

    if (!isOpenPipeEnd(pos, arms, pipes)) {
      return null
    }

    if (Math.abs(d[1]) > 0.7) {
      return fitting(id, 'afdekdop', pos, [0, 1, 0], diameterMm)
    }
    return null
  }

  if (n === 2) {
    const angle = angleBetween(dirs[0], dirs[1])
    if (angle > 2.6) {
      return fitting(id, 'koppelstuk', pos, dirs[0], diameterMm)
    }
    if (angle > 1.2 && angle < 1.9) {
      for (const pipe of pipes) {
        if (!isInteriorPointOnPipe(pos, pipe, INTERIOR_ARM_TOL_M, 0.008)) continue
        const through = pipeDirection(pipe)
        const branch = dirs.find((d) => Math.abs(dot(d, through)) < 0.3)
        if (branch) {
          // Armen wijzen wég van de buizen; de aftakkingsklem moet er naartoe.
          return fitting(id, 't-kort', pos, through, diameterMm, negate(branch), dirs)
        }
      }
      return fitting(id, 'kniestuk-90', pos, dirs[0], diameterMm, dirs[1])
    }
    return null
  }

  if (n === 3) {
    const pair = findOppositePair(dirs)
    if (pair) {
      const through = throughAxisFromPair(pair[0], pair[1])
      const branchArm = dirs.find((d) => Math.abs(dot(d, through)) < 0.3)
      const branches = uniqueAxisLines(dirs.filter((d) => Math.abs(dot(d, through)) < 0.3))
      if (branches.length === 1 && branchArm) {
        // Aftakkingsklem naar de buis toe (arm wijst ervan weg).
        return fitting(id, 't-kort', pos, through, diameterMm, negate(branchArm), dirs)
      }
    }
    // Hoekstuk: alle drie de buizen eindigen hier (staander wordt afgedekt).
    // Geef ondertekende armrichtingen door zodat de sockets naar de buizen wijzen.
    return fitting(id, '3-weg-hoek', pos, dirs[0], diameterMm, dirs[1], dirs)
  }

  if (n >= 4) {
    // Doorlopende staander + zijtakken op hetzelfde punt → één echte fitting
    // (geen twee T-stukken over elkaar).
    const pair = findOppositePair(dirs)
    if (pair) {
      const through = throughAxisFromPair(pair[0], pair[1])
      const branchArms = dirs.filter((d) => Math.abs(dot(d, through)) < 0.3)
      const branchLines = uniqueAxisLines(branchArms)

      if (branchArms.length === 2 && branchLines.length === 1) {
        // Staander doorlopend + 2 tegenoverliggende aftakkingen in één vlak.
        return fitting(id, 'kruisstuk', pos, through, diameterMm, branchLines[0], dirs)
      }
      if (branchArms.length === 2 && branchLines.length === 2) {
        // Staander doorlopend + 2 haakse zij-uitgangen (Kee Klamp type 20).
        // Zij-klemmen naar de buizen toe (armen wijzen ervan weg).
        const sockets = branchArms.map(negate)
        return fitting(id, 'drieweg-kniestuk', pos, through, diameterMm, sockets[0], [
          through,
          ...sockets,
        ])
      }
      if (branchArms.length >= 3) {
        // Staander doorlopend + 3-4 zij-uitgangen (vierweg kruisstuk, type 40).
        const sockets = branchArms.map(negate)
        return fitting(id, 'vierweg-kruisstuk', pos, through, diameterMm, sockets[0], [
          through,
          ...sockets,
        ])
      }
    }

    const lines = uniqueAxisLines(dirs)

    if (lines.length === 3) {
      return fitting(id, '3-weg-hoek', pos, dirs[0], diameterMm, dirs[1], dirs)
    }

    if (isPlanarCross(dirs)) {
      return fitting(id, 'kruisstuk', pos, lines[0], diameterMm, lines[1], dirs)
    }

    return fitting(id, 'kruisstuk', pos, dirs[0], diameterMm, dirs[1], dirs)
  }

  return null
}

function mergeJunctionList(junctions: Junction[], pipes: ScenePipe[]): Junction[] {
  const merged: Junction[] = []

  for (const junction of junctions) {
    const position = canonicalizeToPipe(junction.position, pipes)
    const existing = merged.find((j) => dist(j.position, position) <= JUNCTION_MERGE_TOL_M)

    if (existing) {
      for (const arm of junction.arms) {
        addArm(existing, arm.direction, arm.pipeId)
      }
      existing.diameterMm = Math.max(existing.diameterMm, junction.diameterMm)
      existing.position = representativePosition([existing.position, position], pipes)
      existing.position = canonicalizeToPipe(existing.position, pipes)
    } else {
      merged.push({
        position,
        arms: junction.arms.map((a) => ({ ...a, direction: normalize(a.direction) })),
        diameterMm: junction.diameterMm,
      })
    }
  }

  enrichThroughArms(merged, pipes)
  return merged
}

export interface FittingDetectOptions {
  suppressEndCaps?: boolean
  baseType?: BaseAnchorType
  anchorDepthMm?: number
  /** Scharnierpunten (oog/huls): hier geen automatische fitting plaatsen. */
  hingePoints?: Vec3[]
}

export function detectFittingsFromPipes(
  pipes: ScenePipe[],
  options?: FittingDetectOptions,
): SceneFitting[] {
  const welded = weldPipeJoints(pipes)
  const junctions = new Map<string, Junction>()

  for (const p of welded) {
    const dir = pipeDirection(p)

    for (const [point, outward] of [
      [p.start, [-dir[0], -dir[1], -dir[2]] as Vec3],
      [p.end, dir] as const,
    ]) {
      const junction = getJunction(junctions, point, welded, p.diameterMm)
      addArm(junction, outward, p.id)
      junction.diameterMm = Math.max(junction.diameterMm, p.diameterMm)
      junction.position = canonicalizeToPipe(junction.position, welded)
    }
  }

  addThroughArmsAtInteriorPoints(junctions, welded)

  const merged = mergeJunctionList([...junctions.values()], welded)

  const fittings: SceneFitting[] = []
  let i = 0
  for (const junction of merged) {
    // Scharnierpunt: het oog/huls-paar ís de verbinding — geen automatische fitting.
    if (nearHingePoint(junction.position, options?.hingePoints)) continue
    const f = classifyJunction(`fit-${i++}`, junction.position, junction.arms, junction.diameterMm, welded, {
      baseType: options?.baseType,
      anchorDepthMm: options?.anchorDepthMm,
    })
    if (!f) continue
    if (options?.suppressEndCaps && f.type === 'afdekdop') continue
    fittings.push(f)
  }

  return fittings
}

export const FITTING_TYPE_LABELS: Record<FittingType, string> = {
  't-kort': 'Kort T-stuk 90°',
  't-lang': 'Lang T-stuk 90°',
  'kniestuk-90': 'Kniestuk 90°',
  kruisstuk: 'Kruisstuk / 4-weg',
  koppelstuk: 'Koppelstuk',
  'voetplaat-rond': 'Voetplaat rond',
  'voetplaat-vierkant': 'Voetplaat vierkant',
  afdekdop: 'Afdekdop',
  '3-weg-hoek': 'Hoekstuk (3-weg)',
  'drieweg-kniestuk': 'Drieweg kniestuk',
  'vierweg-kruisstuk': 'Vierweg kruisstuk',
  scharnieroog: 'Scharnieroog',
  scharnierhuls: 'Scharnierhuls',
  'dubbelscharnier-90': 'Dubbelscharnier 90°',
  'dubbelscharnier-recht': 'Dubbelscharnier recht',
}
