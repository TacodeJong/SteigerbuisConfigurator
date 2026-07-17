import type { PlankPlane, SceneModel, ScenePipe, ScenePlank, ScenePlankMount, Vec3 } from '../types'
import { dist, normalize, pipeDirection, quantizeMm } from './pipeGeometry'

export type { PlankPlane }

/** Zij-snap: klikpunt binnen deze afstand van "naast bestaande plank" snapt op het plankbreedte-raster (m). */
const PLANK_SIDE_SNAP_M = 0.15

/** Realistische steigerplank-maat: 30 mm dik × 195 mm breed (instelbaar). */
export const PLANK_THICKNESS_MM = 30
/** Multiplex / houten plaat — typische constructieplaat. */
export const PLATE_THICKNESS_MM = 18
export const PLANK_WIDTH_MM = 195
/** Standaard plaatbreedte (Europese plaat 1220 × 2440). */
export const PLATE_WIDTH_MM = 1220
export const MIN_PLANK_WIDTH_MM = 100
/**
 * Max. breedte: volle plaat in de korte of lange richting (1220 of 2440 mm).
 * Dekt steigerplank én plaatmateriaal.
 */
export const MAX_PLANK_WIDTH_MM = 2440
/** Oversteek voorbij de buitenste dragende buis, per kant. */
export const PLANK_OVERHANG_MM = 50
export const DEFAULT_PLANK_LENGTH_MM = 1000
export const MIN_PLANK_LENGTH_MM = 200
export const MAX_PLANK_LENGTH_MM = 5000
/** Standaardhoogte voor verticale planken / schermen (mm). */
export const DEFAULT_VERTICAL_PLANK_HEIGHT_MM = 1000
export const MIN_VERTICAL_PLANK_HEIGHT_MM = 200
export const MAX_VERTICAL_PLANK_HEIGHT_MM = 2440

export const PLANK_BOM_LABEL = 'Steigerplank'
export const PLATE_BOM_LABEL = 'Houten plaat (multiplex)'
/** Schapsteun / plankdrager (op staander of op horizontale draagbuis onder de plank). */
export const PLANK_MOUNT_LABEL = 'Schapsteun / planksteun'
export const PLANK_MOUNTS_PER_SUPPORT = 1
/** Typisch ≥1 per draagbuis; minimum voor BOM-sanity. */
export const PLANK_MIN_MOUNTS = 2
/**
 * Extra marge rond de plankvoetafdruk (m) — ongeveer een buisstraal.
 * Grotere waarden (~0.3 m) zetten mounts op verre hoekposts naast een smalle plank.
 */
const FOOTPRINT_MARGIN_M = 0.025
/**
 * Max. XZ-afstand staander ↔ snijpunt plank×draagbuis om de schapsteun
 * op die staander te zetten i.p.v. op de ligger (m). Alleen als de staander
 * zélf in de voetafdruk ligt.
 */
const UPRIGHT_NEAR_SUPPORT_M = 0.12

/** @deprecated Gebruik PlankPlane. */
export type PlankOrientation = 'horizontal' | 'vertical'
export type PlankKind = 'plank' | 'plate'

/** Actieve standaardbreedte bij nieuwe horizontale planken (editor kan dit zetten). */
let defaultPlankWidthMm = PLANK_WIDTH_MM
/** Actieve standaardhoogte bij nieuwe verticale planken. */
let defaultVerticalPlankHeightMm = DEFAULT_VERTICAL_PLANK_HEIGHT_MM
/** Actief plaatsingsvlak voor de plank-tool. */
let defaultPlankPlane: PlankPlane = 'xz'
/** Actief type: steigerplank of houten plaat. */
let defaultPlankKind: PlankKind = 'plank'

export function getDefaultPlankWidthMm(): number {
  return defaultPlankWidthMm
}

export function setDefaultPlankWidthMm(widthMm: number): void {
  defaultPlankWidthMm = clampPlankWidthMm(widthMm)
}

export function getDefaultVerticalPlankHeightMm(): number {
  return defaultVerticalPlankHeightMm
}

export function setDefaultVerticalPlankHeightMm(heightMm: number): void {
  defaultVerticalPlankHeightMm = clampVerticalPlankHeightMm(heightMm)
}

export function getDefaultPlankPlane(): PlankPlane {
  return defaultPlankPlane
}

export function setDefaultPlankPlane(plane: PlankPlane): void {
  defaultPlankPlane = plane === 'xy' || plane === 'yz' ? plane : 'xz'
}

/** @deprecated Gebruik getDefaultPlankPlane. */
export function getDefaultPlankOrientation(): PlankOrientation {
  return defaultPlankPlane === 'xz' ? 'horizontal' : 'vertical'
}

/** @deprecated Gebruik setDefaultPlankPlane. */
export function setDefaultPlankOrientation(orientation: PlankOrientation): void {
  setDefaultPlankPlane(orientation === 'vertical' ? 'xy' : 'xz')
}

export function isPlankPlane(value: unknown): value is PlankPlane {
  return value === 'xy' || value === 'xz' || value === 'yz'
}

/**
 * Bepaal het plaatsingsvlak. Oude planken zonder `plane` → xz, of xy/yz uit
 * vertical + lengte-as.
 */
export function resolvePlankPlane(
  plank: Pick<ScenePlank, 'plane' | 'orientation' | 'axis'>,
): PlankPlane {
  if (isPlankPlane(plank.plane)) return plank.plane
  if (plank.orientation === 'vertical') {
    return Math.abs(plank.axis[0]) >= Math.abs(plank.axis[2]) ? 'xy' : 'yz'
  }
  return 'xz'
}

export function plankPlaneLabel(plane: PlankPlane): string {
  switch (plane) {
    case 'xy':
      return 'Verticaal (XY)'
    case 'yz':
      return 'Verticaal (YZ)'
    default:
      return 'Liggend (XZ)'
  }
}

export function getDefaultPlankKind(): PlankKind {
  return defaultPlankKind
}

export function setDefaultPlankKind(kind: PlankKind): void {
  const next: PlankKind = kind === 'plate' ? 'plate' : 'plank'
  if (next === defaultPlankKind) return
  defaultPlankKind = next
  // Wissel naar type-defaults (breedte/hoogte) zodat de tool meteen klopt.
  if (next === 'plate') {
    defaultPlankWidthMm = PLATE_WIDTH_MM
    defaultVerticalPlankHeightMm = Math.max(defaultVerticalPlankHeightMm, 1220)
  } else {
    defaultPlankWidthMm = PLANK_WIDTH_MM
  }
}

export function clampPlankWidthMm(widthMm: number): number {
  if (!Number.isFinite(widthMm)) return defaultWidthForKind(defaultPlankKind)
  return Math.min(MAX_PLANK_WIDTH_MM, Math.max(MIN_PLANK_WIDTH_MM, Math.round(widthMm)))
}

export function clampVerticalPlankHeightMm(heightMm: number): number {
  if (!Number.isFinite(heightMm)) return DEFAULT_VERTICAL_PLANK_HEIGHT_MM
  return Math.min(
    MAX_VERTICAL_PLANK_HEIGHT_MM,
    Math.max(MIN_VERTICAL_PLANK_HEIGHT_MM, Math.round(heightMm)),
  )
}

export function isVerticalPlank(
  plank: Pick<ScenePlank, 'plane' | 'orientation' | 'axis'>,
): boolean {
  return resolvePlankPlane(plank) !== 'xz'
}

export function isPlatePlank(plank: Pick<ScenePlank, 'kind'>): boolean {
  return plank.kind === 'plate'
}

export function plankBomLabel(kind?: PlankKind | ScenePlank['kind']): string {
  return kind === 'plate' ? PLATE_BOM_LABEL : PLANK_BOM_LABEL
}

export function defaultThicknessForKind(kind: PlankKind): number {
  return kind === 'plate' ? PLATE_THICKNESS_MM : PLANK_THICKNESS_MM
}

export function defaultWidthForKind(kind: PlankKind): number {
  return kind === 'plate' ? PLATE_WIDTH_MM : PLANK_WIDTH_MM
}

/** Onderkant van de plank in wereld-Y (m). */
export function plankBottomY(plank: ScenePlank): number {
  return isVerticalPlank(plank)
    ? plank.position[1] - plank.widthMm / 2000
    : plank.position[1] - plank.thicknessMm / 2000
}

/** Halve “breedte” van de voetafdruk haaks op de lengte (m). */
function plankAcrossHalfM(plank: ScenePlank): number {
  return isVerticalPlank(plank) ? plank.thicknessMm / 2000 : plank.widthMm / 2000
}

/** Buizen liggen "op dezelfde hoogte" binnen deze tolerantie (m). */
const SUPPORT_HEIGHT_TOL_M = 0.03
/** Buis is horizontaal als de richting bijna geen y-component heeft. */
const HORIZONTAL_AXIS_TOL = 0.08
/** Buizen zijn evenwijdig als |dot| van de richtingen hierboven ligt. */
const PARALLEL_DOT = 0.985

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * Horizontale normale (= lokale dikte) van een verticaal scherm, haaks op de lengte-as.
 * Komt overeen met PlankMesh: local Y = cross(up, lengthAxis).
 * - XY (lengte ±X) → normaal ±Z
 * - YZ (lengte ±Z) → normaal ±X
 */
function plankNormalDir(plankAxis: Vec3): Vec3 {
  return normalize([plankAxis[2], 0, -plankAxis[0]])
}

/** Lengte-as in het plaatsingsvlak (altijd zuiver langs X of Z). */
function plankLengthAxisForPlane(plane: PlankPlane, supportAxis: Vec3): Vec3 {
  if (plane === 'xy') {
    return normalize([supportAxis[0] >= 0 ? 1 : -1, 0, 0])
  }
  if (plane === 'yz') {
    return normalize([0, 0, supportAxis[2] >= 0 ? 1 : -1])
  }
  return normalize([supportAxis[2], 0, -supportAxis[0]])
}

/** Halve dikte + buisstraal + kleine speling — analogon van xz “bovenop de buis”. */
export const VERTICAL_FACE_CLEARANCE_M = 0.002

function verticalFaceOffsetM(pipeDiameterMm: number, thicknessMm: number): number {
  return pipeDiameterMm / 2000 + thicknessMm / 2000 + VERTICAL_FACE_CLEARANCE_M
}

export function isHorizontalPipe(pipe: ScenePipe): boolean {
  const d = pipeDirection(pipe)
  return Math.abs(d[1]) <= HORIZONTAL_AXIS_TOL
}

export function isVerticalPipe(pipe: ScenePipe): boolean {
  const d = pipeDirection(pipe)
  return Math.abs(d[1]) >= 1 - HORIZONTAL_AXIS_TOL
}

/** Horizontale richting van een buis, genormaliseerd met y = 0. */
function horizontalAxis(pipe: ScenePipe): Vec3 | null {
  const d = pipeDirection(pipe)
  if (Math.abs(d[1]) > HORIZONTAL_AXIS_TOL) return null
  const flat: Vec3 = [d[0], 0, d[2]]
  if (dist([0, 0, 0], flat) < 0.001) return null
  return normalize(flat)
}

function pipeCenterY(pipe: ScenePipe): number {
  return (pipe.start[1] + pipe.end[1]) / 2
}

export interface PlankPlacement {
  position: Vec3
  axis: Vec3
  lengthMm: number
  widthMm: number
  thicknessMm: number
  /** Aantal dragende buizen onder de plank. */
  supportCount: number
  plane: PlankPlane
  kind: PlankKind
}

export interface ResolvePlankOptions {
  /** Plankbreedte (xz) of hoogte (xy/yz) in mm. */
  widthMm?: number
  plane?: PlankPlane
  kind?: PlankKind
}

/**
 * Snap het klikpunt zijwaarts (langs de dragende buis) op het plankbreedte-
 * raster van al liggende evenwijdige planken op dezelfde hoogte, zodat
 * planken strak naast elkaar komen te liggen voor een dicht platform.
 */
function snapPointToPlankGrid(
  point: Vec3,
  supportAxis: Vec3,
  plankAxis: Vec3,
  plankTopCenterY: number,
  planks: ScenePlank[],
  newWidthMm: number = PLANK_WIDTH_MM,
): Vec3 {
  const sClick = dot(point, supportAxis)
  let bestShift = 0
  // Ruimere snap-zone bij brede platen.
  let bestDist = Math.max(PLANK_SIDE_SNAP_M, newWidthMm / 3000 + 0.08)
  const halfNew = newWidthMm / 2000

  for (const plank of planks) {
    if (isVerticalPlank(plank)) continue
    if (Math.abs(dot(plank.axis, plankAxis)) < PARALLEL_DOT) continue
    if (Math.abs(plank.position[1] - plankTopCenterY) > SUPPORT_HEIGHT_TOL_M) continue

    const sPlank = dot(plank.position, supportAxis)
    const halfExisting = plank.widthMm / 2000
    // Strak naast: hart-afstand = halve bestaande + halve nieuwe breedte.
    for (const candidate of [sPlank - halfExisting - halfNew, sPlank + halfExisting + halfNew]) {
      const d = Math.abs(sClick - candidate)
      if (d < bestDist) {
        bestDist = d
        bestShift = candidate - sClick
      }
    }
  }

  if (bestShift === 0) return point
  return add(point, scale(supportAxis, bestShift))
}

/**
 * Bepaal de plank-ligging vanaf een punt op een liggende buis.
 *
 * - `xz`: plank ligt haaks op de aangeklikte buis, bovenop evenwijdige
 *   liggers op (bijna) dezelfde hoogte.
 * - `xy` / `yz`: verticaal scherm; lengte langs de ligger in dat vlak,
 *   widthMm = hoogte; onderkant rust op de buistop. Alleen buizen die bij
 *   het gekozen vlak passen (X-richting voor xy, Z voor yz).
 */
export function resolvePlankPlacement(
  point: Vec3,
  pipe: ScenePipe,
  pipes: ScenePipe[],
  planks: ScenePlank[] = [],
  options: ResolvePlankOptions = {},
): PlankPlacement | null {
  const supportAxis = horizontalAxis(pipe)
  if (!supportAxis) return null

  const resolvedPlane: PlankPlane = isPlankPlane(options.plane)
    ? options.plane
    : defaultPlankPlane
  const resolvedKind: PlankKind = (options.kind ?? defaultPlankKind) === 'plate' ? 'plate' : 'plank'
  const thicknessMm = defaultThicknessForKind(resolvedKind)
  const vertical = resolvedPlane !== 'xz'

  // Verticaal vlak: alleen buizen die in dat vlak liggen (lengte-as ≈ X of Z).
  if (resolvedPlane === 'xy' && Math.abs(supportAxis[0]) < PARALLEL_DOT) return null
  if (resolvedPlane === 'yz' && Math.abs(supportAxis[2]) < PARALLEL_DOT) return null

  const widthMm = vertical
    ? clampVerticalPlankHeightMm(options.widthMm ?? defaultVerticalPlankHeightMm)
    : clampPlankWidthMm(options.widthMm ?? defaultPlankWidthMm)

  const baseY = pipeCenterY(pipe)
  const pipeTop = baseY + pipe.diameterMm / 2000

  // Verticaal scherm: lengte langs de ligger, rechtop vanaf de buistop.
  // Centrum naast de buis (straal + half dikte), niet op de as — zoals xz
  // bovenop ligt (dikte/2 boven de buistop).
  if (vertical) {
    const plankAxis = plankLengthAxisForPlane(resolvedPlane, supportAxis)
    const plankCenterY = pipeTop + widthMm / 2000
    const lengthM = DEFAULT_PLANK_LENGTH_MM / 1000
    const onPipe = projectPointOnPipeAxis(point, pipe)
    const normal = plankNormalDir(plankAxis)
    const offsetM = verticalFaceOffsetM(pipe.diameterMm, thicknessMm)
    // `point` mag oppervlakte-hit zijn (niet alleen centerline) → bepaalt welke kant.
    const side = Math.sign(dot(sub(point, onPipe), normal)) || 1
    const againstPipe = add(onPipe, scale(normal, side * offsetM))
    const centerXz = snapVerticalPlankAlongPipe(
      againstPipe,
      plankAxis,
      plankCenterY,
      planks,
      thicknessMm,
      resolvedPlane,
    )
    return {
      position: quantizeMm([centerXz[0], plankCenterY, centerXz[2]]),
      axis: plankAxis,
      lengthMm: Math.min(MAX_PLANK_LENGTH_MM, Math.max(MIN_PLANK_LENGTH_MM, Math.round(lengthM * 1000))),
      widthMm,
      thicknessMm,
      supportCount: 1,
      plane: resolvedPlane,
      kind: resolvedKind,
    }
  }

  // Liggend (xz): lengte haaks op de dragende buis.
  const plankAxis: Vec3 = normalize([supportAxis[2], 0, -supportAxis[0]])
  const plankCenterY = pipeTop + thicknessMm / 2000

  point = snapPointToPlankGrid(point, supportAxis, plankAxis, plankCenterY, planks, widthMm)

  const ts: number[] = []
  for (const other of pipes) {
    const axis = horizontalAxis(other)
    if (!axis) continue
    if (Math.abs(dot(axis, supportAxis)) < PARALLEL_DOT) continue
    if (Math.abs(pipeCenterY(other) - baseY) > SUPPORT_HEIGHT_TOL_M) continue

    const hit = intersectLineWithSegment(point, plankAxis, other.start, other.end)
    if (hit == null) continue
    ts.push(hit)
  }

  if (ts.length === 0) return null

  const overhang = PLANK_OVERHANG_MM / 1000
  const tMin = Math.min(...ts)
  const tMax = Math.max(...ts)
  let lengthM: number
  let centerT: number

  if (ts.length >= 2 && tMax - tMin > 0.01) {
    lengthM = tMax - tMin + overhang * 2
    centerT = (tMin + tMax) / 2
  } else {
    lengthM = DEFAULT_PLANK_LENGTH_MM / 1000
    centerT = ts[0] ?? 0
  }

  const center = add(point, scale(plankAxis, centerT))

  return {
    position: quantizeMm([center[0], plankCenterY, center[2]]),
    axis: plankAxis,
    lengthMm: Math.min(MAX_PLANK_LENGTH_MM, Math.max(MIN_PLANK_LENGTH_MM, Math.round(lengthM * 1000))),
    widthMm,
    thicknessMm,
    supportCount: ts.length,
    plane: 'xz',
    kind: resolvedKind,
  }
}

/**
 * Snap verticale planken naast elkaar in dikterichting (loodrecht op het
 * plaatsingsvlak) wanneer het klikpunt dicht bij een bestaande plank ligt.
 */
function snapVerticalPlankAlongPipe(
  point: Vec3,
  plankAxis: Vec3,
  plankCenterY: number,
  planks: ScenePlank[],
  newThicknessMm: number,
  plane: PlankPlane,
): Vec3 {
  const widthDir = plankNormalDir(plankAxis)
  const sClick = dot(point, widthDir)
  let bestShift = 0
  let bestDist = Math.max(PLANK_SIDE_SNAP_M, newThicknessMm / 3000 + 0.08)
  const halfNew = newThicknessMm / 2000

  for (const plank of planks) {
    if (resolvePlankPlane(plank) !== plane) continue
    if (Math.abs(dot(plank.axis, plankAxis)) < PARALLEL_DOT) continue
    if (Math.abs(plank.position[1] - plankCenterY) > SUPPORT_HEIGHT_TOL_M * 4) continue

    const sPlank = dot(plank.position, widthDir)
    const halfExisting = plank.thicknessMm / 2000
    for (const candidate of [sPlank - halfExisting - halfNew, sPlank + halfExisting + halfNew]) {
      const d = Math.abs(sClick - candidate)
      if (d < bestDist) {
        bestDist = d
        bestShift = candidate - sClick
      }
    }
  }

  if (bestShift === 0) return point
  return add(point, scale(widthDir, bestShift))
}

/** Projecteer een XZ-punt op de horizontale as van een buis. */
function projectPointOnPipeAxis(point: Vec3, pipe: ScenePipe): Vec3 {
  const axis = horizontalAxis(pipe)
  if (!axis) return point
  const mid: Vec3 = [
    (pipe.start[0] + pipe.end[0]) / 2,
    (pipe.start[1] + pipe.end[1]) / 2,
    (pipe.start[2] + pipe.end[2]) / 2,
  ]
  const t = (point[0] - mid[0]) * axis[0] + (point[2] - mid[2]) * axis[2]
  // Clamp op segment.
  const halfLen = dist(pipe.start, pipe.end) / 2
  const tc = Math.max(-halfLen, Math.min(halfLen, t))
  return add(mid, scale(axis, tc))
}

/**
 * Snijpunt van een lijn (origin + t·dir, horizontaal) met een buissegment,
 * geprojecteerd op het grondvlak. Retourneert t langs de lijn of null.
 */
function intersectLineWithSegment(origin: Vec3, dir: Vec3, segA: Vec3, segB: Vec3): number | null {
  // 2D (x/z) lijn-segment-snijding.
  const ox = origin[0]
  const oz = origin[2]
  const dx = dir[0]
  const dz = dir[2]
  const ax = segA[0]
  const az = segA[2]
  const ux = segB[0] - ax
  const uz = segB[2] - az

  const denom = dx * uz - dz * ux
  if (Math.abs(denom) < 1e-9) {
    // Evenwijdig in bovenaanzicht — behandel als steunpunt op t=0 als de
    // lijn (bijna) door het segment gaat (aangeklikte buis zelf).
    const t = closestT2d(ox, oz, ax, az, segB[0], segB[2])
    const px = ax + (segB[0] - ax) * t
    const pz = az + (segB[2] - az) * t
    if (Math.hypot(px - ox, pz - oz) < 0.02) return 0
    return null
  }

  const s = (dx * (oz - az) - dz * (ox - ax)) / denom
  if (s < -0.001 || s > 1.001) return null
  const t = Math.abs(dx) > Math.abs(dz) ? (ax + s * ux - ox) / dx : (az + s * uz - oz) / dz
  return t
}

function closestT2d(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const ux = bx - ax
  const uz = bz - az
  const lenSq = ux * ux + uz * uz
  if (lenSq < 1e-12) return 0
  return Math.max(0, Math.min(1, ((px - ax) * ux + (pz - az) * uz) / lenSq))
}

export interface PlankSupport {
  pipe: ScenePipe
  /** Snijpunt op buismiddellijn (m), onder het plankhart. */
  position: Vec3
  pipeAxis: Vec3
}

/** Dragende buis onder/naast de plank — per buis (of null als deze niet draagt). */
export function plankSupportForPipe(plank: ScenePlank, pipe: ScenePipe): PlankSupport | null {
  const half = plank.lengthMm / 2000
  const bottomY = plankBottomY(plank)
  const vertical = isVerticalPlank(plank)

  const axis = horizontalAxis(pipe)
  if (!axis) return null
  if (vertical) {
    // Verticaal scherm: onderkant rust op een ligger evenwijdig aan de planklengte.
    if (Math.abs(dot(axis, plank.axis)) < PARALLEL_DOT) return null
  } else {
    // Horizontaal: dragende buizen liggen haaks op de planklengte.
    if (Math.abs(dot(axis, plank.axis)) > 1 - PARALLEL_DOT + 0.1) return null
  }
  const topY = pipeCenterY(pipe) + pipe.diameterMm / 2000
  if (Math.abs(topY - bottomY) > SUPPORT_HEIGHT_TOL_M + 0.01) return null

  if (vertical) {
    // Snijpunt: projecteer plankhart op de ligger.
    const hit = projectPointOnPipeAxis(plank.position, pipe)
    const along = (hit[0] - plank.position[0]) * plank.axis[0] + (hit[2] - plank.position[2]) * plank.axis[2]
    if (Math.abs(along) > half + 0.05) return null
    const acrossHalf = plankAcrossHalfM(plank)
    const widthDir = plankWidthDir(plank)
    const across =
      (hit[0] - plank.position[0]) * widthDir[0] + (hit[2] - plank.position[2]) * widthDir[2]
    if (Math.abs(across) > acrossHalf + pipe.diameterMm / 2000 + 0.02) return null
    return {
      pipe,
      position: quantizeMm([hit[0], pipeCenterY(pipe), hit[2]]),
      pipeAxis: axis,
    }
  }

  const widthDir = plankWidthDir(plank)
  const halfW = plankAcrossHalfM(plank)
  // Snijpunt middenvlak (lengte door plankhart) × draagbuis.
  const hit = intersectLineWithSegment(plank.position, plank.axis, pipe.start, pipe.end)
  if (hit == null) return null
  if (hit < -half - 0.001 || hit > half + 0.001) return null

  const onMidPlane = add(plank.position, scale(plank.axis, hit))
  const onPipe = projectPointOnPipeAxis(onMidPlane, pipe)
  const local = plankLocalXz(plank, onPipe, widthDir)
  const rad = pipe.diameterMm / 2000
  // Alleen buizen die echt onder/in de voetafdruk snijden — geen parallelle
  // liggers in een aangrenzend vak.
  if (Math.abs(local.along) > half + rad + FOOTPRINT_MARGIN_M) return null
  if (Math.abs(local.across) > halfW + rad + FOOTPRINT_MARGIN_M) return null

  return {
    pipe,
    position: quantizeMm([onPipe[0], pipeCenterY(pipe), onPipe[2]]),
    pipeAxis: axis,
  }
}

/** Dragende buizen onder een plank (haaks op de planklengte, net onder de onderkant). */
export function findPlankSupports(plank: ScenePlank, pipes: ScenePipe[]): PlankSupport[] {
  const supports: PlankSupport[] = []
  for (const pipe of pipes) {
    const support = plankSupportForPipe(plank, pipe)
    if (support) supports.push(support)
  }
  supports.sort((a, b) => dot(a.position, plank.axis) - dot(b.position, plank.axis))
  return supports
}

/** Aantal dragende buizen onder een plank. */
export function plankSupportCount(plank: ScenePlank, pipes: ScenePipe[]): number {
  return findPlankSupports(plank, pipes).length
}

/** Aantal schapsteunen voor een plank (automatisch voorstel — niet de geplaatste). */
export function plankMountCount(plank: ScenePlank, pipes: ScenePipe[]): number {
  return buildPlankMounts(plank, pipes).length
}

/** Aantal geplaatste schapsteunen in de scene (BOM / UI). */
export function placedPlankMountCount(scene: SceneModel, plankId?: string): number {
  const mounts = scene.plankMounts ?? []
  if (!plankId) return mounts.length
  return mounts.filter((m) => m.plankId === plankId).length
}

/** Breedterichting / horizontale normale (horizontaal, haaks op de lengte). */
function plankWidthDir(plank: ScenePlank): Vec3 {
  return plankNormalDir(plank.axis)
}

/** XZ-punt van een verticale buis op gegeven hoogte Y. */
function uprightXzAtY(pipe: ScenePipe, y: number): Vec3 {
  const dy = pipe.end[1] - pipe.start[1]
  if (Math.abs(dy) < 1e-9) {
    return [(pipe.start[0] + pipe.end[0]) / 2, y, (pipe.start[2] + pipe.end[2]) / 2]
  }
  const t = (y - pipe.start[1]) / dy
  return [
    pipe.start[0] + t * (pipe.end[0] - pipe.start[0]),
    y,
    pipe.start[2] + t * (pipe.end[2] - pipe.start[2]),
  ]
}

function uprightSpansHeight(pipe: ScenePipe, y: number): boolean {
  const yMin = Math.min(pipe.start[1], pipe.end[1])
  const yMax = Math.max(pipe.start[1], pipe.end[1])
  return y >= yMin - 0.01 && y <= yMax + 0.01
}

function horizontalDist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2])
}

/** Lokale (along, across) t.o.v. plankhart in het XZ-vlak. */
function plankLocalXz(plank: ScenePlank, point: Vec3, widthDir: Vec3): { along: number; across: number } {
  const dx = point[0] - plank.position[0]
  const dz = point[2] - plank.position[2]
  return {
    along: dx * plank.axis[0] + dz * plank.axis[2],
    across: dx * widthDir[0] + dz * widthDir[2],
  }
}

export interface PlankUpright {
  pipe: ScenePipe
  /** Punt op staander-as op hoogte van de plankonderkant. */
  position: Vec3
  pipeAxis: Vec3
  /** Horizontale richting van de vleugels (onder de plank). */
  wingDir: Vec3
}

function wingDirTowardPlank(plank: ScenePlank, at: Vec3, fallback: Vec3): Vec3 {
  const toCenter: Vec3 = [plank.position[0] - at[0], 0, plank.position[2] - at[2]]
  return dist([0, 0, 0], toCenter) > 0.015 ? normalize(toCenter) : fallback
}

/**
 * Vleugelrichting voor een mount:
 * - Liggend (xz): horizontaal naar het plankhart (vleugels onder de plank).
 * - Verticaal (xy/yz): zuiver langs de vlaknormaal, aan de kant waar de plaat
 *   zit (buis → plaatvlak) — vleugels moeten ín het plaatvlak liggen, dus de
 *   richting mag niet diagonaal naar het plaathart wijzen.
 */
function mountWingDir(plank: ScenePlank, at: Vec3): Vec3 {
  const normal = plankWidthDir(plank)
  if (!isVerticalPlank(plank)) {
    return wingDirTowardPlank(plank, at, normal)
  }
  const toCenter: Vec3 = [plank.position[0] - at[0], 0, plank.position[2] - at[2]]
  const side = Math.sign(dot(toCenter, normal)) || 1
  return side > 0 ? normal : ([-normal[0], -normal[1], -normal[2]] as Vec3)
}

function uprightAxisUp(pipe: ScenePipe): Vec3 {
  const axis = pipeDirection(pipe)
  return axis[1] < 0 ? [-axis[0], -axis[1], -axis[2]] : axis
}

/** Staander of snijpunt ligt in/onder de plankvoetafdruk (XZ). */
function inPlankFootprint(
  plank: ScenePlank,
  point: Vec3,
  widthDir: Vec3,
  marginM = FOOTPRINT_MARGIN_M,
): boolean {
  const halfL = plank.lengthMm / 2000
  const halfW = plankAcrossHalfM(plank)
  const { along, across } = plankLocalXz(plank, point, widthDir)
  return Math.abs(along) <= halfL + marginM && Math.abs(across) <= halfW + marginM
}

/** Staander in de plankvoetafdruk — per buis (of null). */
export function plankUprightForPipe(plank: ScenePlank, pipe: ScenePipe): PlankUpright | null {
  if (!isVerticalPipe(pipe)) return null
  const widthDir = plankWidthDir(plank)
  // Bij verticale planken: klem op mid-hoogte van het scherm.
  const mountY = isVerticalPlank(plank) ? plank.position[1] : plankBottomY(plank)
  if (!uprightSpansHeight(pipe, mountY)) return null
  const at = uprightXzAtY(pipe, mountY)
  const margin = pipe.diameterMm / 2000 + FOOTPRINT_MARGIN_M
  if (!inPlankFootprint(plank, at, widthDir, margin)) return null

  return {
    pipe,
    position: quantizeMm([at[0], mountY, at[2]]),
    pipeAxis: uprightAxisUp(pipe),
    wingDir: mountWingDir(plank, at),
  }
}

/**
 * Verticale staanders die écht in de plankvoetafdruk liggen (niet hoekposts
 * naast een smalle plank in het midden van een vak).
 */
export function findPlankUprights(plank: ScenePlank, pipes: ScenePipe[]): PlankUpright[] {
  const widthDir = plankWidthDir(plank)
  const uprights: PlankUpright[] = []
  for (const pipe of pipes) {
    const upright = plankUprightForPipe(plank, pipe)
    if (upright) uprights.push(upright)
  }

  uprights.sort((a, b) => {
    const la = plankLocalXz(plank, a.position, widthDir)
    const lb = plankLocalXz(plank, b.position, widthDir)
    return la.along - lb.along || la.across - lb.across
  })
  return uprights
}

/**
 * Staander bij een draagbuis-snijpunt — alleen als die staander onder/in de
 * plank ligt (anders blijft de mount op de ligger onder het snijpunt).
 */
function nearestUprightAtSupport(
  plank: ScenePlank,
  support: PlankSupport,
  pipes: ScenePipe[],
): PlankUpright | null {
  let best: PlankUpright | null = null
  let bestD = UPRIGHT_NEAR_SUPPORT_M

  for (const pipe of pipes) {
    const upright = plankUprightForPipe(plank, pipe)
    if (!upright) continue
    const d = horizontalDist(upright.position, support.position)
    if (d > bestD) continue
    bestD = d
    best = upright
  }
  return best
}

function makeUprightMount(plank: ScenePlank, upright: PlankUpright): ScenePlankMount {
  return {
    id: `pm-${plank.id}-${upright.pipe.id}`,
    plankId: plank.id,
    pipeId: upright.pipe.id,
    position: upright.position,
    pipeAxis: upright.pipeAxis,
    plankAxis: plank.axis,
    retainerDir: upright.wingDir,
    diameterMm: upright.pipe.diameterMm,
    thicknessMm: plank.thicknessMm,
    plane: resolvePlankPlane(plank),
    // Metadata alleen — mesh gebruikt vaste productmaat, niet deze breedte.
    plankWidthMm: plank.widthMm,
  }
}

/** Plankdrager op de horizontale draagbuis, precies onder het snijpunt met de plank. */
function makeSupportMount(plank: ScenePlank, support: PlankSupport): ScenePlankMount {
  const widthDir = plankWidthDir(plank)
  // Verticaal: vleugels langs de vlaknormaal, aan de plaatzijde.
  const retainerDir = isVerticalPlank(plank)
    ? mountWingDir(plank, support.position)
    : widthDir
  return {
    id: `pm-${plank.id}-${support.pipe.id}`,
    plankId: plank.id,
    pipeId: support.pipe.id,
    // Buismiddellijn op het snijpunt — mesh legt vleugels op de buistop onder de plank.
    position: quantizeMm([support.position[0], support.position[1], support.position[2]]),
    pipeAxis: support.pipeAxis,
    plankAxis: plank.axis,
    // Vleugels langs de plankbreedte (onder de plank), vaste maat in de mesh.
    retainerDir,
    diameterMm: support.pipe.diameterMm,
    thicknessMm: plank.thicknessMm,
    plane: resolvePlankPlane(plank),
    plankWidthMm: plank.widthMm,
  }
}

/**
 * Automatisch voorstel: schapsteunen / plankdragers voor één plank:
 * - 1 per draagbuis onder de plank, op het snijpunt met het middenvlak
 * - op een staander alleen als die in de voetafdruk bij dat snijpunt staat
 * - plus eventuele overige staanders die écht in de voetafdruk vallen
 */
export function buildPlankMounts(plank: ScenePlank, pipes: ScenePipe[]): ScenePlankMount[] {
  const byId = new Map<string, ScenePlankMount>()

  for (const support of findPlankSupports(plank, pipes)) {
    const upright = nearestUprightAtSupport(plank, support, pipes)
    const mount = upright ? makeUprightMount(plank, upright) : makeSupportMount(plank, support)
    byId.set(mount.id, mount)
  }

  for (const upright of findPlankUprights(plank, pipes)) {
    const mount = makeUprightMount(plank, upright)
    if (!byId.has(mount.id)) byId.set(mount.id, mount)
  }

  return [...byId.values()]
}

/**
 * Herbereken één (plank, buis)-paar: staanderklem of liggerzadel op de actuele
 * geometrie. Null als de buis de plank niet (meer) draagt/kruist.
 */
export function buildPlankMountForPipe(plank: ScenePlank, pipe: ScenePipe): ScenePlankMount | null {
  const upright = plankUprightForPipe(plank, pipe)
  if (upright) return makeUprightMount(plank, upright)
  const support = plankSupportForPipe(plank, pipe)
  return support ? makeSupportMount(plank, support) : null
}

/**
 * Of er ruimte is om een kopie van de plank strak ernaast te leggen (`side`
 * = teken van de breedterichting `[axis.z, 0, -axis.x]`).
 */
export function canPlacePlankBeside(
  source: ScenePlank,
  side: 1 | -1,
  planks: ScenePlank[],
  pipes: ScenePipe[],
): boolean {
  const widthDir = plankWidthDir(source)
  // Verticaal: ernaast = naast in dikterichting; horizontaal: in breedterichting.
  const stepMm = isVerticalPlank(source) ? source.thicknessMm : source.widthMm
  const offsetM = (stepMm / 1000) * side
  const candidate: ScenePlank = {
    ...source,
    id: `${source.id}-beside-probe`,
    position: quantizeMm([
      source.position[0] + widthDir[0] * offsetM,
      source.position[1],
      source.position[2] + widthDir[2] * offsetM,
    ]),
  }

  if (findPlankSupports(candidate, pipes).length === 0) return false

  const sourcePlane = resolvePlankPlane(source)
  const halfNew = plankAcrossHalfM(candidate)
  for (const other of planks) {
    if (other.id === source.id) continue
    if (resolvePlankPlane(other) !== sourcePlane) continue
    if (Math.abs(dot(other.axis, candidate.axis)) < PARALLEL_DOT) continue
    if (Math.abs(other.position[1] - candidate.position[1]) > SUPPORT_HEIGHT_TOL_M) continue

    const dx = other.position[0] - candidate.position[0]
    const dz = other.position[2] - candidate.position[2]
    const across = dx * widthDir[0] + dz * widthDir[2]
    const along = dx * candidate.axis[0] + dz * candidate.axis[2]
    const halfOther = plankAcrossHalfM(other)
    const halfL = (candidate.lengthMm + other.lengthMm) / 4000
    if (Math.abs(across) < halfNew + halfOther - 0.01 && Math.abs(along) < halfL + 0.05) {
      return false
    }
  }

  return true
}

/**
 * Synchroniseer handmatig geplaatste schapsteunen met de actuele planken/buizen:
 * - behoudt de door de gebruiker gekozen (plank, buis)-paren (zet ze niet terug)
 * - herberekent positie/oriëntatie per paar (plank of buis kan verplaatst zijn)
 * - verwijdert alleen orphans: steun zonder plank, zonder buis, of waarvan de
 *   buis de plank niet meer draagt
 * - oude scenes zonder `plankMounts`-veld krijgen eenmalig het automatische voorstel
 */
export function syncPlankMounts(scene: SceneModel): SceneModel {
  const planks = scene.planks ?? []

  if (scene.plankMounts == null) {
    return { ...scene, planks, plankMounts: planks.flatMap((p) => buildPlankMounts(p, scene.pipes)) }
  }

  const plankById = new Map(planks.map((p) => [p.id, p]))
  const pipeById = new Map(scene.pipes.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const plankMounts: ScenePlankMount[] = []

  for (const mount of scene.plankMounts) {
    const plank = plankById.get(mount.plankId)
    const pipe = pipeById.get(mount.pipeId)
    if (!plank || !pipe) continue
    const next = buildPlankMountForPipe(plank, pipe)
    if (!next || seen.has(next.id)) continue
    seen.add(next.id)
    plankMounts.push(next)
  }

  return { ...scene, planks, plankMounts }
}

export interface PlankMountOption {
  pipeId: string
  pipeLabel: string
  /** true als deze steun al geplaatst is */
  placed: boolean
  kind: 'upright' | 'support'
}

/** Kandidaten (auto-voorstel) + of ze al geplaatst zijn — voor het select-panel. */
export function listPlankMountOptions(
  plank: ScenePlank,
  pipes: ScenePipe[],
  placedMounts: ScenePlankMount[] | undefined,
): PlankMountOption[] {
  const placed = new Set(
    (placedMounts ?? []).filter((m) => m.plankId === plank.id).map((m) => m.pipeId),
  )
  const pipeById = new Map(pipes.map((p) => [p.id, p]))
  return buildPlankMounts(plank, pipes).map((mount) => ({
    pipeId: mount.pipeId,
    pipeLabel: pipeById.get(mount.pipeId)?.label ?? mount.pipeId,
    placed: placed.has(mount.pipeId),
    kind: Math.abs(mount.pipeAxis[1]) >= 0.75 ? 'upright' : 'support',
  }))
}

/** Voeg automatische voorstel-steunen toe voor één nieuwe plank (bestaande blijven). */
export function seedPlankMountsForPlank(scene: SceneModel, plank: ScenePlank): SceneModel {
  const proposed = buildPlankMounts(plank, scene.pipes)
  const existing = scene.plankMounts ?? []
  const seen = new Set(existing.map((m) => m.id))
  const added = proposed.filter((m) => !seen.has(m.id))
  if (added.length === 0 && scene.plankMounts != null) return scene
  return { ...scene, plankMounts: [...existing, ...added] }
}

/**
 * Schakel een schapsteun op (plank, buis) — toevoegen of verwijderen.
 * Alleen als de buis nog een geldige kandidaat is.
 */
export function togglePlankMount(scene: SceneModel, plankId: string, pipeId: string): SceneModel {
  const mounts = scene.plankMounts ?? []
  const existingIdx = mounts.findIndex((m) => m.plankId === plankId && m.pipeId === pipeId)
  if (existingIdx >= 0) {
    return {
      ...scene,
      plankMounts: mounts.filter((_, i) => i !== existingIdx),
    }
  }
  const plank = (scene.planks ?? []).find((p) => p.id === plankId)
  const pipe = scene.pipes.find((p) => p.id === pipeId)
  if (!plank || !pipe) return scene
  const mount = buildPlankMountForPipe(plank, pipe)
  if (!mount) return scene
  return { ...scene, plankMounts: [...mounts, mount] }
}

export function nextPlankId(scene: SceneModel): string {
  const existing = new Set((scene.planks ?? []).map((p) => p.id))
  let n = (scene.planks?.length ?? 0) + 1
  while (existing.has(`plank-${n}`)) n++
  return `plank-${n}`
}

export function createPlank(placement: PlankPlacement, id: string): ScenePlank {
  const plane = placement.plane
  // Forceer zuivere lengte-as per vlak (voorkomt dat YZ per ongeluk als XY rendert).
  const axis: Vec3 =
    plane === 'xy'
      ? [placement.axis[0] >= 0 ? 1 : -1, 0, 0]
      : plane === 'yz'
        ? [0, 0, placement.axis[2] >= 0 ? 1 : -1]
        : placement.axis
  return {
    id,
    position: placement.position,
    axis,
    lengthMm: placement.lengthMm,
    widthMm: placement.widthMm,
    thicknessMm: placement.thicknessMm,
    plane,
    // Backwards-compat voor oudere loaders / instructies.
    orientation: plane === 'xz' ? undefined : 'vertical',
    kind: placement.kind === 'plate' ? 'plate' : undefined,
  }
}

/** Wissel steigerplank ↔ houten plaat; past dikte en (indien nog default) breedte aan. */
export function setPlankKind(plank: ScenePlank, kind: PlankKind): ScenePlank {
  const nextKind: PlankKind = kind === 'plate' ? 'plate' : 'plank'
  const prevKind: PlankKind = isPlatePlank(plank) ? 'plate' : 'plank'
  if (nextKind === prevKind) return plank

  const nextThickness = defaultThicknessForKind(nextKind)
  let nextWidth = plank.widthMm
  if (!isVerticalPlank(plank) && plank.widthMm === defaultWidthForKind(prevKind)) {
    nextWidth = defaultWidthForKind(nextKind)
  }

  if (isVerticalPlank(plank)) {
    const bottom = plankBottomY(plank)
    return {
      ...plank,
      kind: nextKind === 'plate' ? 'plate' : undefined,
      thicknessMm: nextThickness,
      widthMm: nextWidth,
      position: quantizeMm([plank.position[0], bottom + nextWidth / 2000, plank.position[2]]),
    }
  }

  // Horizontaal: onderkant op dezelfde buistop houden → centrum verschuift met dikte.
  const bottom = plankBottomY(plank)
  return {
    ...plank,
    kind: nextKind === 'plate' ? 'plate' : undefined,
    thicknessMm: nextThickness,
    widthMm: nextWidth,
    position: quantizeMm([plank.position[0], bottom + nextThickness / 2000, plank.position[2]]),
  }
}

/**
 * Verschuif een plank in het eigen vlak: xz → X+Z; xy → X+Y; yz → Z+Y.
 * De normaalcoördinaat blijft vast.
 */
export function movePlankHorizontal(plank: ScenePlank, delta: Vec3): ScenePlank {
  const plane = resolvePlankPlane(plank)
  const dx = plane === 'yz' ? 0 : delta[0]
  const dy = plane === 'xz' ? 0 : delta[1]
  const dz = plane === 'xy' ? 0 : delta[2]
  return {
    ...plank,
    position: quantizeMm([
      plank.position[0] + dx,
      plank.position[1] + dy,
      plank.position[2] + dz,
    ]),
  }
}

/** Pas de planklengte aan met behoud van het middelpunt. */
export function resizePlank(plank: ScenePlank, lengthMm: number): ScenePlank {
  const clamped = Math.min(MAX_PLANK_LENGTH_MM, Math.max(MIN_PLANK_LENGTH_MM, Math.round(lengthMm)))
  return { ...plank, lengthMm: clamped }
}

/** Pas de plankbreedte (horizontaal) of hoogte (verticaal) aan. */
export function resizePlankWidth(plank: ScenePlank, widthMm: number): ScenePlank {
  if (isVerticalPlank(plank)) {
    const nextH = clampVerticalPlankHeightMm(widthMm)
    const bottom = plankBottomY(plank)
    // Houd onderkant vast; verschuif het midden mee.
    return {
      ...plank,
      widthMm: nextH,
      position: quantizeMm([plank.position[0], bottom + nextH / 2000, plank.position[2]]),
    }
  }
  return { ...plank, widthMm: clampPlankWidthMm(widthMm) }
}

/** Hoekpunten van de plank in bovenaanzicht (mm, x/z) — voor de plattegrond-print. */
export function plankFootprintCorners(plank: ScenePlank): { xMm: number; zMm: number }[] {
  const halfL = plank.lengthMm / 2
  const halfW = (isVerticalPlank(plank) ? plank.thicknessMm : plank.widthMm) / 2
  const ax = plank.axis[0]
  const az = plank.axis[2]
  // Breedterichting: horizontaal, haaks op de planklengte.
  const wx = az
  const wz = -ax
  const cx = plank.position[0] * 1000
  const cz = plank.position[2] * 1000

  return [
    { xMm: cx + ax * halfL + wx * halfW, zMm: cz + az * halfL + wz * halfW },
    { xMm: cx + ax * halfL - wx * halfW, zMm: cz + az * halfL - wz * halfW },
    { xMm: cx - ax * halfL - wx * halfW, zMm: cz - az * halfL - wz * halfW },
    { xMm: cx - ax * halfL + wx * halfW, zMm: cz - az * halfL + wz * halfW },
  ]
}
