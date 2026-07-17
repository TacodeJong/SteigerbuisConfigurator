import type { KlimrekConfig, SceneModel, ScenePipe, Vec3 } from '../types'
import { baseGroundY, pipeLengthMm } from './scene'
import { barLengthFromConfig } from './dimensions'

const GROUND_TOL_M = 0.02
const MERGE_TOL_M = 0.08
/** Aanbevolen bekisting Ø voor grondanker (mm). */
export const ANCHOR_HOLE_DIAMETER_MM = 120

export interface Footprint {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  widthMm: number
  depthMm: number
  marginMm: number
}

export interface AnchorHole {
  id: string
  xMm: number
  zMm: number
  depthMm: number
  diameterMm: number
  label: string
}

export interface FloorplanPipe {
  id: string
  x1Mm: number
  z1Mm: number
  x2Mm: number
  z2Mm: number
  diameterMm: number
  lengthMm: number
}

/** Tolerantie (mm) om gaten op dezelfde rij/kolom of hoek te matchen. */
export const HOLE_ALIGN_TOL_MM = 80

export type HolePoint = Pick<AnchorHole, 'id' | 'xMm' | 'zMm' | 'label'>

/** Gesloten rechthoek van vier hoekgaten (center-to-center). */
export interface ClosedRectangle {
  widthMm: number
  depthMm: number
  diagonalMm: number
  corners: {
    topLeft: HolePoint
    topRight: HolePoint
    bottomLeft: HolePoint
    bottomRight: HolePoint
  }
}

/** Afstand tussen twee aangrenzende gaten op dezelfde rij of kolom. */
export interface HoleSpan {
  from: HolePoint
  to: HolePoint
  distanceMm: number
  direction: 'horizontal' | 'vertical'
  /** Bestelbare buislengte waarop deze span is gebaseerd (indien bekend). */
  pipeLengthMm?: number
}

/** Afstanden tussen gatmiddelpunten — voor uitzetten op de bouwplaats. */
export interface HoleCenterDimensions {
  spanWidthMm: number
  spanDepthMm: number
  diagonalMm: number
  /** Meest linkse / rechtse / voorste / achterste middelpunt (mm). */
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** Hoekgaten voor maatlijnen op de plattegrond. */
  frontLeft: Pick<AnchorHole, 'xMm' | 'zMm' | 'label'>
  frontRight: Pick<AnchorHole, 'xMm' | 'zMm' | 'label'>
  backLeft: Pick<AnchorHole, 'xMm' | 'zMm' | 'label'>
  /** Tegenoverliggende hoeken voor de diagonaal (rechte hoek controleren). */
  diagonalFrom: Pick<AnchorHole, 'xMm' | 'zMm' | 'label'>
  diagonalTo: Pick<AnchorHole, 'xMm' | 'zMm' | 'label'>
  /** Per rechthoekige vak en losse maatstukken. */
  rectangles: ClosedRectangle[]
  spans: HoleSpan[]
}

function distMm(ax: number, az: number, bx: number, bz: number): number {
  return Math.round(Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2))
}

function nearestHole(holes: AnchorHole[], xMm: number, zMm: number): AnchorHole {
  return holes.reduce((best, h) => {
    const d = (h.xMm - xMm) ** 2 + (h.zMm - zMm) ** 2
    const bd = (best.xMm - xMm) ** 2 + (best.zMm - zMm) ** 2
    return d < bd ? h : best
  })
}

function pickHole(h: AnchorHole): Pick<AnchorHole, 'xMm' | 'zMm' | 'label'> {
  return { xMm: h.xMm, zMm: h.zMm, label: h.label }
}

function pickHolePoint(h: AnchorHole): HolePoint {
  return { id: h.id, xMm: h.xMm, zMm: h.zMm, label: h.label }
}

function avgCoord(holes: AnchorHole[], coord: 'xMm' | 'zMm'): number {
  return holes.reduce((s, h) => s + h[coord], 0) / holes.length
}

function groupHolesByCoord(holes: AnchorHole[], coord: 'xMm' | 'zMm'): AnchorHole[][] {
  const sorted = [...holes].sort((a, b) => a[coord] - b[coord])
  const groups: AnchorHole[][] = []
  for (const hole of sorted) {
    const group = groups.find((g) => Math.abs(g[0][coord] - hole[coord]) <= HOLE_ALIGN_TOL_MM)
    if (group) group.push(hole)
    else groups.push([hole])
  }
  return groups
}

function holeInRowAndCol(row: AnchorHole[], col: AnchorHole[]): AnchorHole | null {
  return row.find((h) => col.some((c) => c.id === h.id)) ?? null
}

function spanKey(span: HoleSpan): string {
  const [a, b] = span.from.id < span.to.id ? [span.from.id, span.to.id] : [span.to.id, span.from.id]
  return `${a}|${b}|${span.direction}`
}

function rectangleKey(rect: ClosedRectangle): string {
  const ids = [
    rect.corners.topLeft.id,
    rect.corners.topRight.id,
    rect.corners.bottomLeft.id,
    rect.corners.bottomRight.id,
  ].sort()
  return ids.join('|')
}

/** Losse horizontale/verticale maatstukken tussen aangrenzende gaten per rij/kolom. */
export function computeHoleSpans(holes: AnchorHole[]): HoleSpan[] {
  const spans: HoleSpan[] = []
  const seen = new Set<string>()

  for (const row of groupHolesByCoord(holes, 'zMm')) {
    const sorted = [...row].sort((a, b) => a.xMm - b.xMm)
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i]
      const to = sorted[i + 1]
      if (Math.abs(to.xMm - from.xMm) <= HOLE_ALIGN_TOL_MM) continue
      const span: HoleSpan = {
        from: pickHolePoint(from),
        to: pickHolePoint(to),
        distanceMm: Math.abs(to.xMm - from.xMm),
        direction: 'horizontal',
      }
      const key = spanKey(span)
      if (!seen.has(key)) {
        seen.add(key)
        spans.push(span)
      }
    }
  }

  for (const col of groupHolesByCoord(holes, 'xMm')) {
    const sorted = [...col].sort((a, b) => a.zMm - b.zMm)
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i]
      const to = sorted[i + 1]
      if (Math.abs(to.zMm - from.zMm) <= HOLE_ALIGN_TOL_MM) continue
      const span: HoleSpan = {
        from: pickHolePoint(from),
        to: pickHolePoint(to),
        distanceMm: Math.abs(to.zMm - from.zMm),
        direction: 'vertical',
      }
      const key = spanKey(span)
      if (!seen.has(key)) {
        seen.add(key)
        spans.push(span)
      }
    }
  }

  return spans
}

const PIPE_MATCH_TOL_MM = 80

function isHorizontalPipe(p: ScenePipe): boolean {
  const dy = Math.abs(p.end[1] - p.start[1])
  const dx = p.end[0] - p.start[0]
  const dz = p.end[2] - p.start[2]
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return len > 0.05 && dy / len < 0.12
}

function isVerticalPipe(p: ScenePipe): boolean {
  const dy = Math.abs(p.end[1] - p.start[1])
  const dx = p.end[0] - p.start[0]
  const dz = p.end[2] - p.start[2]
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return len > 0.05 && dy / len > 0.85
}

/** Middelpunt–middelpunt tussen staanders = buislengte + diameter (buizen tegen elkaar). */
export function postCenterDistanceFromPipe(pipe: ScenePipe): number {
  return pipeLengthMm(pipe) + pipe.diameterMm
}

function findBridgingPipe(span: HoleSpan, pipes: ScenePipe[]): ScenePipe | null {
  const xMin = Math.min(span.from.xMm, span.to.xMm)
  const xMax = Math.max(span.from.xMm, span.to.xMm)
  const zMin = Math.min(span.from.zMm, span.to.zMm)
  const zMax = Math.max(span.from.zMm, span.to.zMm)
  const zMid = (span.from.zMm + span.to.zMm) / 2
  const xMid = (span.from.xMm + span.to.xMm) / 2

  let best: ScenePipe | null = null
  let bestScore = Infinity

  for (const p of pipes) {
    const L = pipeLengthMm(p)
    const D = p.diameterMm
    const r = D / 2
    const px1 = Math.round(Math.min(p.start[0], p.end[0]) * 1000)
    const px2 = Math.round(Math.max(p.start[0], p.end[0]) * 1000)
    const pz1 = Math.round(Math.min(p.start[2], p.end[2]) * 1000)
    const pz2 = Math.round(Math.max(p.start[2], p.end[2]) * 1000)
    const pzMid = (pz1 + pz2) / 2
    const pxMid = (px1 + px2) / 2

    if (span.direction === 'horizontal') {
      if (!isHorizontalPipe(p)) continue
      if (Math.abs(pzMid - zMid) > HOLE_ALIGN_TOL_MM) continue
      const centerSpan = L + D
      const innerMatch =
        Math.abs(px1 - (xMin + r)) <= PIPE_MATCH_TOL_MM && Math.abs(px2 - (xMax - r)) <= PIPE_MATCH_TOL_MM
      const centerMatch =
        Math.abs(px1 - xMin) <= PIPE_MATCH_TOL_MM && Math.abs(px2 - xMax) <= PIPE_MATCH_TOL_MM
      const lengthMatch =
        Math.abs(span.distanceMm - L) <= PIPE_MATCH_TOL_MM ||
        Math.abs(span.distanceMm - centerSpan) <= PIPE_MATCH_TOL_MM
      if (!innerMatch && !centerMatch && !lengthMatch) continue
      const score = Math.abs(pxMid - xMid) + Math.abs(L + D - span.distanceMm) * 0.01
      if (score < bestScore) {
        bestScore = score
        best = p
      }
    } else {
      if (!isHorizontalPipe(p) && !isVerticalPipe(p)) {
        if (Math.abs(p.end[0] - p.start[0]) > 0.05) continue
      }
      if (!isHorizontalPipe(p) && isVerticalPipe(p)) continue
      if (Math.abs(p.end[0] - p.start[0]) > 0.05 && isHorizontalPipe(p)) continue
      const depthPipe = Math.abs(p.end[2] - p.start[2]) > Math.abs(p.end[0] - p.start[0])
      if (!depthPipe) continue
      if (Math.abs(pxMid - xMid) > HOLE_ALIGN_TOL_MM) continue
      const pzA = Math.round(p.start[2] * 1000)
      const pzB = Math.round(p.end[2] * 1000)
      const pzLo = Math.min(pzA, pzB)
      const pzHi = Math.max(pzA, pzB)
      const centerSpan = L + D
      const innerMatch =
        Math.abs(pzLo - (zMin + r)) <= PIPE_MATCH_TOL_MM && Math.abs(pzHi - (zMax - r)) <= PIPE_MATCH_TOL_MM
      const centerMatch =
        Math.abs(pzLo - zMin) <= PIPE_MATCH_TOL_MM && Math.abs(pzHi - zMax) <= PIPE_MATCH_TOL_MM
      const lengthMatch =
        Math.abs(span.distanceMm - L) <= PIPE_MATCH_TOL_MM ||
        Math.abs(span.distanceMm - centerSpan) <= PIPE_MATCH_TOL_MM
      if (!innerMatch && !centerMatch && !lengthMatch) continue
      const score = Math.abs(pzMid - (zMin + zMax) / 2)
      if (score < bestScore) {
        bestScore = score
        best = p
      }
    }
  }

  return best
}

function applyPipeGeometryToSpans(spans: HoleSpan[], pipes: ScenePipe[]): HoleSpan[] {
  return spans.map((span) => {
    const pipe = findBridgingPipe(span, pipes)
    if (!pipe) return span
    const L = pipeLengthMm(pipe)
    const centerSpan = postCenterDistanceFromPipe(pipe)
    return {
      ...span,
      distanceMm: centerSpan,
      pipeLengthMm: L,
    }
  })
}

/**
 * Corrigeer gatposities voor plattegrond: als gemeten afstand ≈ buislengte,
 * verschuif middelpunten naar buislengte + diameter (staander-middellijn).
 * Werkt per rij/kolom als ketting zodat gedeelde gaten (L-vormen) maar
 * één consistente positie krijgen.
 */
export function adjustHolesForFloorplan(holes: AnchorHole[], pipes: ScenePipe[]): AnchorHole[] {
  const adjusted = holes.map((h) => ({ ...h }))
  const byId = new Map(adjusted.map((h) => [h.id, h]))

  const adjustAxis = (
    coord: 'xMm' | 'zMm',
    groupCoord: 'xMm' | 'zMm',
    direction: HoleSpan['direction'],
  ) => {
    for (const group of groupHolesByCoord(holes, groupCoord)) {
      const sorted = [...group].sort((a, b) => a[coord] - b[coord])
      if (sorted.length < 2) continue

      const gaps: number[] = []
      let anyCorrected = false
      for (let i = 0; i < sorted.length - 1; i++) {
        const from = sorted[i]
        const to = sorted[i + 1]
        const raw = to[coord] - from[coord]
        let gap = raw
        if (raw > HOLE_ALIGN_TOL_MM) {
          const span: HoleSpan = {
            from: pickHolePoint(from),
            to: pickHolePoint(to),
            distanceMm: raw,
            direction,
          }
          const pipe = findBridgingPipe(span, pipes)
          if (pipe) {
            const L = pipeLengthMm(pipe)
            const target = L + pipe.diameterMm
            // Alleen corrigeren als de gemeten afstand ≈ kale buislengte
            // (scene zonder diameter-offset); anders is hij al goed.
            if (Math.abs(raw - target) > 10 && Math.abs(raw - L) <= PIPE_MATCH_TOL_MM) {
              gap = target
              anyCorrected = true
            }
          }
        }
        gaps.push(gap)
      }
      if (!anyCorrected) continue

      // Ketting opnieuw uitleggen rond het oorspronkelijke midden van de groep.
      const rawCenter = (sorted[0][coord] + sorted[sorted.length - 1][coord]) / 2
      const total = gaps.reduce((s, g) => s + g, 0)
      let pos = rawCenter - total / 2
      byId.get(sorted[0].id)![coord] = Math.round(pos)
      for (let i = 0; i < gaps.length; i++) {
        pos += gaps[i]
        byId.get(sorted[i + 1].id)![coord] = Math.round(pos)
      }
    }
  }

  adjustAxis('xMm', 'zMm', 'horizontal')
  adjustAxis('zMm', 'xMm', 'vertical')

  return adjusted
}

/** Gaten + maatvoering voor plattegrond (gecorrigeerd t.o.v. buisgeometrie). */
export function prepareFloorplanHoles(scene: SceneModel, config: KlimrekConfig): AnchorHole[] {
  const raw = computeAnchorHoles(scene, config)
  return adjustHolesForFloorplan(raw, scene.pipes)
}

function hasInteriorHole(rect: ClosedRectangle, holes: AnchorHole[]): boolean {
  const { topLeft, topRight, bottomLeft, bottomRight } = rect.corners
  const minX = Math.min(topLeft.xMm, topRight.xMm, bottomLeft.xMm, bottomRight.xMm)
  const maxX = Math.max(topLeft.xMm, topRight.xMm, bottomLeft.xMm, bottomRight.xMm)
  const minZ = Math.min(topLeft.zMm, topRight.zMm, bottomLeft.zMm, bottomRight.zMm)
  const maxZ = Math.max(topLeft.zMm, topRight.zMm, bottomLeft.zMm, bottomRight.zMm)
  const cornerIds = new Set([topLeft.id, topRight.id, bottomLeft.id, bottomRight.id])

  return holes.some((h) => {
    if (cornerIds.has(h.id)) return false
    return (
      h.xMm > minX + HOLE_ALIGN_TOL_MM &&
      h.xMm < maxX - HOLE_ALIGN_TOL_MM &&
      h.zMm > minZ + HOLE_ALIGN_TOL_MM &&
      h.zMm < maxZ - HOLE_ALIGN_TOL_MM
    )
  })
}

function rectangleBounds(rect: ClosedRectangle): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const { topLeft, topRight, bottomLeft, bottomRight } = rect.corners
  return {
    minX: Math.min(topLeft.xMm, topRight.xMm, bottomLeft.xMm, bottomRight.xMm),
    maxX: Math.max(topLeft.xMm, topRight.xMm, bottomLeft.xMm, bottomRight.xMm),
    minZ: Math.min(topLeft.zMm, topRight.zMm, bottomLeft.zMm, bottomRight.zMm),
    maxZ: Math.max(topLeft.zMm, topRight.zMm, bottomLeft.zMm, bottomRight.zMm),
  }
}

function rectangleContains(outer: ClosedRectangle, inner: ClosedRectangle): boolean {
  if (rectangleKey(outer) === rectangleKey(inner)) return false
  const o = rectangleBounds(outer)
  const i = rectangleBounds(inner)
  const outerArea = (o.maxX - o.minX) * (o.maxZ - o.minZ)
  const innerArea = (i.maxX - i.minX) * (i.maxZ - i.minZ)
  if (outerArea <= innerArea) return false
  return (
    o.minX <= i.minX + HOLE_ALIGN_TOL_MM &&
    o.maxX >= i.maxX - HOLE_ALIGN_TOL_MM &&
    o.minZ <= i.minZ + HOLE_ALIGN_TOL_MM &&
    o.maxZ >= i.maxZ - HOLE_ALIGN_TOL_MM
  )
}

function filterMinimalRectangles(rectangles: ClosedRectangle[]): ClosedRectangle[] {
  return rectangles.filter(
    (rect) => !rectangles.some((other) => rectangleContains(rect, other)),
  )
}

/** Gesloten axis-aligned rechthoeken waar vier hoekgaten bestaan. */
export function findClosedRectangles(holes: AnchorHole[]): ClosedRectangle[] {
  if (holes.length < 4) return []

  const rows = groupHolesByCoord(holes, 'zMm').sort((a, b) => avgCoord(a, 'zMm') - avgCoord(b, 'zMm'))
  const cols = groupHolesByCoord(holes, 'xMm').sort((a, b) => avgCoord(a, 'xMm') - avgCoord(b, 'xMm'))
  const rectangles: ClosedRectangle[] = []
  const seen = new Set<string>()

  for (let ri = 0; ri < rows.length - 1; ri++) {
    for (let rj = ri + 1; rj < rows.length; rj++) {
      for (let ci = 0; ci < cols.length - 1; ci++) {
        for (let cj = ci + 1; cj < cols.length; cj++) {
          const topLeft = holeInRowAndCol(rows[ri], cols[ci])
          const topRight = holeInRowAndCol(rows[ri], cols[cj])
          const bottomLeft = holeInRowAndCol(rows[rj], cols[ci])
          const bottomRight = holeInRowAndCol(rows[rj], cols[cj])
          if (!topLeft || !topRight || !bottomLeft || !bottomRight) continue

          const cornerIds = new Set([topLeft.id, topRight.id, bottomLeft.id, bottomRight.id])
          if (cornerIds.size < 4) continue

          const widthMm = Math.abs(topRight.xMm - topLeft.xMm)
          const depthMm = Math.abs(bottomLeft.zMm - topLeft.zMm)
          if (widthMm <= HOLE_ALIGN_TOL_MM || depthMm <= HOLE_ALIGN_TOL_MM) continue

          const rect: ClosedRectangle = {
            widthMm,
            depthMm,
            diagonalMm: distMm(topLeft.xMm, topLeft.zMm, bottomRight.xMm, bottomRight.zMm),
            corners: {
              topLeft: pickHolePoint(topLeft),
              topRight: pickHolePoint(topRight),
              bottomLeft: pickHolePoint(bottomLeft),
              bottomRight: pickHolePoint(bottomRight),
            },
          }

          if (hasInteriorHole(rect, holes)) continue

          const key = rectangleKey(rect)
          if (!seen.has(key)) {
            seen.add(key)
            rectangles.push(rect)
          }
        }
      }
    }
  }

  return filterMinimalRectangles(rectangles).sort(
    (a, b) => a.corners.topLeft.zMm - b.corners.topLeft.zMm || a.corners.topLeft.xMm - b.corners.topLeft.xMm,
  )
}

/** Breedte, diepte en diagonaal tussen gatmiddelpunten. */
export function computeHoleCenterDimensions(
  holes: AnchorHole[],
  pipes?: ScenePipe[],
): HoleCenterDimensions | null {
  if (holes.length < 2) return null

  const xs = holes.map((h) => h.xMm)
  const zs = holes.map((h) => h.zMm)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)

  const frontLeft = nearestHole(holes, minX, minZ)
  const frontRight = nearestHole(holes, maxX, minZ)
  const backLeft = nearestHole(holes, minX, maxZ)
  const backRight = nearestHole(holes, maxX, maxZ)

  const spanWidthMm = Math.abs(frontRight.xMm - frontLeft.xMm)
  const spanDepthMm = Math.abs(backLeft.zMm - frontLeft.zMm)

  let diagonalFrom = frontLeft
  let diagonalTo = backRight
  if (diagonalFrom.xMm === diagonalTo.xMm && diagonalFrom.zMm === diagonalTo.zMm) {
    diagonalTo = frontRight.xMm === frontLeft.xMm && frontRight.zMm === frontLeft.zMm ? backLeft : frontRight
  }

  const diagonalMm = distMm(diagonalFrom.xMm, diagonalFrom.zMm, diagonalTo.xMm, diagonalTo.zMm)

  let spans = computeHoleSpans(holes)
  if (pipes?.length) spans = applyPipeGeometryToSpans(spans, pipes)

  const rectangles = findClosedRectangles(holes).map((rect) => {
    const hSpan = spans.find(
      (s) =>
        s.direction === 'horizontal' &&
        s.from.zMm === rect.corners.topLeft.zMm &&
        Math.abs(s.from.xMm - rect.corners.topLeft.xMm) < HOLE_ALIGN_TOL_MM &&
        Math.abs(s.to.xMm - rect.corners.topRight.xMm) < HOLE_ALIGN_TOL_MM,
    )
    const vSpan = spans.find(
      (s) =>
        s.direction === 'vertical' &&
        s.from.xMm === rect.corners.topLeft.xMm &&
        Math.abs(s.from.zMm - rect.corners.topLeft.zMm) < HOLE_ALIGN_TOL_MM &&
        Math.abs(s.to.zMm - rect.corners.bottomLeft.zMm) < HOLE_ALIGN_TOL_MM,
    )
    const widthMm = hSpan?.distanceMm ?? rect.widthMm
    const depthMm = vSpan?.distanceMm ?? rect.depthMm
    const tl = rect.corners.topLeft
    const br = rect.corners.bottomRight
    // Diagonaal uit de (buis-gecorrigeerde) breedte/diepte als beide bekend
    // zijn — consistent met de getoonde zijden; anders uit de coördinaten.
    const diagonalMm =
      hSpan && vSpan
        ? Math.round(Math.hypot(widthMm, depthMm) * 10) / 10
        : distMm(tl.xMm, tl.zMm, br.xMm, br.zMm)
    return {
      ...rect,
      widthMm,
      depthMm,
      diagonalMm,
    }
  })

  return {
    spanWidthMm,
    spanDepthMm,
    diagonalMm,
    minX,
    maxX,
    minZ,
    maxZ,
    frontLeft: pickHole(frontLeft),
    frontRight: pickHole(frontRight),
    backLeft: pickHole(backLeft),
    diagonalFrom: pickHole(diagonalFrom),
    diagonalTo: pickHole(diagonalTo),
    rectangles,
    spans,
  }
}

function mToMm(v: number): number {
  return Math.round(v * 1000)
}

/** Axis-aligned footprint van alle buizen (buitenmaat incl. buisdiameter). */
export function computeFootprint(pipes: ScenePipe[]): Footprint | null {
  if (!pipes.length) return null

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let marginM = 0

  for (const p of pipes) {
    for (const pt of [p.start, p.end]) {
      minX = Math.min(minX, pt[0])
      maxX = Math.max(maxX, pt[0])
      minZ = Math.min(minZ, pt[2])
      maxZ = Math.max(maxZ, pt[2])
    }
    marginM = Math.max(marginM, p.diameterMm / 2000)
  }

  minX -= marginM
  maxX += marginM
  minZ -= marginM
  maxZ += marginM

  const w = maxX - minX
  const d = maxZ - minZ
  if (w < 0.01 || d < 0.01) return null

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    widthMm: mToMm(w),
    depthMm: mToMm(d),
    marginMm: mToMm(marginM),
  }
}

function cornerLabel(xMm: number, zMm: number, cxMm: number, czMm: number): string {
  const lr = xMm < cxMm ? 'links' : 'rechts'
  const fb = zMm < czMm ? 'voor' : 'achter'
  return `${lr}-${fb}`
}

function configCornerHoles(
  config: Pick<KlimrekConfig, 'width' | 'depth' | 'dimensionMode' | 'baseType' | 'anchorDepthMm'>,
): AnchorHole[] {
  // Zelfde centerline-afstand als buildSceneFromConfig (niet +Ø).
  const halfW = barLengthFromConfig(config, 'width') / 2
  const halfD = barLengthFromConfig(config, 'depth') / 2
  const positions: [number, number][] = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [-halfW, halfD],
    [halfW, halfD],
  ]
  const cx = 0
  const cz = 0
  return positions.map(([x, z], i) => ({
    id: `corner-${i}`,
    xMm: x,
    zMm: z,
    depthMm: config.anchorDepthMm,
    diameterMm: ANCHOR_HOLE_DIAMETER_MM,
    label: cornerLabel(x, z, cx, cz),
  }))
}

function groundContactPoint(pipe: ScenePipe, groundY: number): Vec3 | null {
  const near = (y: number) => Math.abs(y - groundY) <= GROUND_TOL_M
  if (near(pipe.start[1]) && pipe.end[1] > pipe.start[1] + GROUND_TOL_M) return pipe.start
  if (near(pipe.end[1]) && pipe.start[1] > pipe.end[1] + GROUND_TOL_M) return pipe.end
  return null
}

function mergeGroundPoints(points: Vec3[]): Vec3[] {
  const merged: Vec3[] = []
  for (const pt of points) {
    const existing = merged.find(
      (m) => Math.abs(m[0] - pt[0]) <= MERGE_TOL_M && Math.abs(m[2] - pt[2]) <= MERGE_TOL_M,
    )
    if (!existing) merged.push(pt)
  }
  return merged
}

/** Betonpoeren / gaten voor grondankers — afgeleid uit scene of config-hoeken. */
export function computeAnchorHoles(
  scene: SceneModel,
  config: Pick<
    KlimrekConfig,
    'width' | 'depth' | 'dimensionMode' | 'diameter' | 'baseType' | 'anchorDepthMm'
  >,
): AnchorHole[] {
  if (config.baseType !== 'grondanker' || config.anchorDepthMm <= 0) return []

  const groundY = baseGroundY(config)
  const contacts: Vec3[] = []
  for (const pipe of scene.pipes) {
    const pt = groundContactPoint(pipe, groundY)
    if (pt) contacts.push(pt)
  }

  const points = mergeGroundPoints(contacts)
  if (points.length === 0) return configCornerHoles(config)

  const cxMm = points.reduce((s, p) => s + mToMm(p[0]), 0) / points.length
  const czMm = points.reduce((s, p) => s + mToMm(p[2]), 0) / points.length

  return points
    .map((pt, i) => ({
      id: `anchor-${i}`,
      xMm: mToMm(pt[0]),
      zMm: mToMm(pt[2]),
      depthMm: config.anchorDepthMm,
      diameterMm: ANCHOR_HOLE_DIAMETER_MM,
      label: cornerLabel(mToMm(pt[0]), mToMm(pt[2]), cxMm, czMm),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'nl'))
}

/** Buisprojecties op het XZ-vlak (bovenaanzicht). */
export function floorplanPipes(pipes: ScenePipe[]): FloorplanPipe[] {
  return pipes.map((p) => {
    const dx = p.end[0] - p.start[0]
    const dy = p.end[1] - p.start[1]
    const dz = p.end[2] - p.start[2]
    const lengthMm = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000)
    return {
      id: p.id,
      x1Mm: mToMm(p.start[0]),
      z1Mm: mToMm(p.start[2]),
      x2Mm: mToMm(p.end[0]),
      z2Mm: mToMm(p.end[2]),
      diameterMm: p.diameterMm,
      lengthMm,
    }
  })
}
