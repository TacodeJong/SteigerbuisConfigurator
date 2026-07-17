import type { ScenePipe, Vec3 } from '../types'
import { dist, normalize, pipeDirection, pointOnSegment, quantizeMm } from './pipeGeometry'

/** Eindpunt van een andere buis ligt binnen deze afstand op de bewogen buis → verbinding. */
const TOUCH_TOL_M = 0.012
const MIN_LEN_M = 0.08
const PARALLEL_DOT = 0.99
const GROUND_TOL_M = 0.01

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function touches(point: Vec3, pipe: ScenePipe): boolean {
  return dist(point, pointOnSegment(point, pipe.start, pipe.end)) < TOUCH_TOL_M
}

/**
 * Verbinding van een andere buis met de bewogen buis.
 * - 'weld': eind-op-eind (elleboog/knie) — rekt altijd mee met de beweging.
 * - 'tee': eindpunt midden op de bewogen buis (T-stuk) — rekt alleen mee als de
 *   beweging langs de eigen as loopt; beweegt de buis in de lengterichting, dan
 *   glijdt de T-koppeling en blijft deze buis staan.
 */
export interface StretchTouch {
  pipeId: string
  end: 'start' | 'end'
  kind: 'weld' | 'tee'
  axis: Vec3
}

/** Eindpunt van de bewogen buis dat midden op een andere buis ligt (T op die buis). */
export interface StretchSlider {
  end: 'start' | 'end'
  pipeId: string
}

export interface StretchPlan {
  pipeId: string
  movedAxis: Vec3
  touches: StretchTouch[]
  sliders: StretchSlider[]
  /** Vaste beweegas (uit elleboog/knie-lassen en T-glijders); null = kies dynamisch. */
  axis: Vec3 | null
  /** Kandidaat-assen bij dynamische keuze: langs de buis glijden of T-takken rekken. */
  candidates: Vec3[]
  /** De bewogen buis staat zelf op de grond → verticale verplaatsing geblokkeerd. */
  groundLocked: boolean
  /** false = verbindingen zijn onderling strijdig; verplaatsen kan niet zonder breken. */
  ok: boolean
}

/**
 * Bepaal hoe een buis verplaatst mag worden zonder verbindingen te verbreken.
 *
 * - Elleboog/knie (eind-op-eind): het gelaste eindpunt volgt altijd → die buis
 *   rekt langs zijn as, dus de beweging moet parallel aan die as zijn.
 * - T-stuk op de bewogen buis: glijdt bij beweging in de lengterichting; rekt
 *   alleen mee bij beweging langs de as van de aftakking.
 * - Eindpunt van de bewogen buis in een T op een andere buis: glijdt langs die
 *   buis — beweging moet parallel aan die buis-as zijn.
 * - De grond is een vast punt: een buis die op de grond staat mag niet verticaal
 *   bewegen, en volgers rekken vanaf hun vaste (bv. grond-)eind.
 */
export function planStretchMove(pipes: ScenePipe[], pipeId: string, groundY = 0): StretchPlan {
  const moved = pipes.find((p) => p.id === pipeId)
  if (!moved) {
    return {
      pipeId,
      movedAxis: [0, 1, 0],
      touches: [],
      sliders: [],
      axis: null,
      candidates: [],
      groundLocked: false,
      ok: false,
    }
  }

  const movedAxis = pipeDirection(moved)
  const touchList: StretchTouch[] = []
  const sliders: StretchSlider[] = []
  const hardAxes: Vec3[] = []

  const nearMovedEndpoint = (pt: Vec3) =>
    dist(pt, moved.start) < TOUCH_TOL_M || dist(pt, moved.end) < TOUCH_TOL_M

  for (const q of pipes) {
    if (q.id === pipeId) continue
    const qDir = pipeDirection(q)

    for (const end of ['start', 'end'] as const) {
      const pt = q[end]
      if (!touches(pt, moved)) continue
      const kind: StretchTouch['kind'] = nearMovedEndpoint(pt) ? 'weld' : 'tee'
      touchList.push({ pipeId: q.id, end, kind, axis: qDir })
      if (kind === 'weld') hardAxes.push(qDir)
    }

    // Eindpunt van de bewogen buis midden op q (T op q) → glijdt langs q.
    for (const end of ['start', 'end'] as const) {
      const pt = moved[end]
      if (dist(pt, q.start) < TOUCH_TOL_M || dist(pt, q.end) < TOUCH_TOL_M) continue
      if (touches(pt, q)) {
        sliders.push({ end, pipeId: q.id })
        hardAxes.push(qDir)
      }
    }
  }

  const groundLocked =
    moved.start[1] <= groundY + GROUND_TOL_M || moved.end[1] <= groundY + GROUND_TOL_M

  // Harde beperkingen (lassen + glijders) moeten één gedeelde as vormen.
  let axis: Vec3 | null = null
  let ok = true
  for (const a of hardAxes) {
    if (!axis) {
      axis = a
      continue
    }
    if (Math.abs(dot(axis, a)) < PARALLEL_DOT) {
      ok = false
      break
    }
  }

  // T-stukken moeten met de vaste as mee kunnen: rekken (as ∥ tak) of glijden (as ∥ buis).
  if (ok && axis) {
    for (const t of touchList) {
      if (t.kind !== 'tee') continue
      const stretches = Math.abs(dot(axis, t.axis)) >= PARALLEL_DOT
      const slides = Math.abs(dot(axis, movedAxis)) >= PARALLEL_DOT
      if (!stretches && !slides) {
        ok = false
        break
      }
    }
  }

  if (ok && axis && groundLocked && Math.abs(axis[1]) > 0.05) {
    ok = false
  }

  // Geen harde as → kandidaten: in de lengte glijden, of alle T-takken samen rekken.
  const candidates: Vec3[] = []
  if (ok && !axis && touchList.length > 0) {
    if (!(groundLocked && Math.abs(movedAxis[1]) > 0.05)) {
      candidates.push(movedAxis)
    }
    const teeAxes = touchList.filter((t) => t.kind === 'tee').map((t) => t.axis)
    if (
      teeAxes.length > 0 &&
      teeAxes.every((a) => Math.abs(dot(a, teeAxes[0])) >= PARALLEL_DOT) &&
      !(groundLocked && Math.abs(teeAxes[0][1]) > 0.05)
    ) {
      candidates.push(teeAxes[0])
    }
    if (candidates.length === 0) ok = false
  }

  return { pipeId, movedAxis, touches: touchList, sliders, axis, candidates, groundLocked, ok }
}

export interface StretchedPipe {
  id: string
  start: Vec3
  end: Vec3
}

export interface StretchResult {
  /** Bewogen buis + alle meegerekte buizen met hun nieuwe posities. */
  changed: StretchedPipe[]
  delta: Vec3
  valid: boolean
}

/** Pas een verplaatsing toe volgens het plan: lassen rekken, T-stukken glijden of rekken. */
export function applyStretchMove(
  pipes: ScenePipe[],
  plan: StretchPlan,
  rawDelta: Vec3,
  groundY = 0,
): StretchResult {
  const moved = pipes.find((p) => p.id === plan.pipeId)
  if (!moved || !plan.ok) {
    return { changed: [], delta: [0, 0, 0], valid: false }
  }

  // Beweegas: vast, of dynamisch de kandidaat die het best bij de muisbeweging past.
  let axisUsed: Vec3 | null = plan.axis
  if (!axisUsed && plan.candidates.length > 0) {
    let best = plan.candidates[0]
    let bestDot = Math.abs(dot(rawDelta, best))
    for (const c of plan.candidates.slice(1)) {
      const d = Math.abs(dot(rawDelta, c))
      if (d > bestDot) {
        best = c
        bestDot = d
      }
    }
    axisUsed = best
  }

  let delta: Vec3 = axisUsed ? scale(axisUsed, dot(rawDelta, axisUsed)) : rawDelta
  if (!axisUsed && plan.groundLocked) {
    delta = [delta[0], 0, delta[2]]
  }

  const newStart = quantizeMm(add(moved.start, delta))
  // Werkelijke delta ná kwantisatie, zodat volgers exact blijven aansluiten.
  const qDelta = sub(newStart, moved.start)
  const newEnd = quantizeMm(add(moved.end, qDelta))

  let valid = true
  if (plan.groundLocked && Math.abs(qDelta[1]) > 0.0005) valid = false
  if (Math.min(newStart[1], newEnd[1]) < groundY - 0.001) valid = false

  const deltaLen = dist(qDelta, [0, 0, 0])
  const deltaDir: Vec3 | null = deltaLen > 1e-6 ? scale(qDelta, 1 / deltaLen) : null

  // Wijzigingen per buis verzamelen (een buis kan met beide einden verbonden zijn).
  const changedMap = new Map<string, { start: Vec3; end: Vec3 }>()

  for (const t of plan.touches) {
    const q = pipes.find((p) => p.id === t.pipeId)
    if (!q) continue

    const followsStretch =
      t.kind === 'weld' || (deltaDir !== null && Math.abs(dot(deltaDir, t.axis)) >= PARALLEL_DOT)

    if (followsStretch) {
      const entry = changedMap.get(q.id) ?? { start: q.start, end: q.end }
      if (t.end === 'start') entry.start = quantizeMm(add(q.start, qDelta))
      else entry.end = quantizeMm(add(q.end, qDelta))
      changedMap.set(q.id, entry)
    } else {
      // T-stuk glijdt: koppelpunt moet op de verplaatste buis blijven liggen.
      const pt = q[t.end]
      if (dist(pt, pointOnSegment(pt, newStart, newEnd)) > TOUCH_TOL_M) valid = false
    }
  }

  // Rek-validatie: niet te kort, niet omklappen, niet onder de grond.
  for (const [id, entry] of changedMap) {
    const q = pipes.find((p) => p.id === id)!
    const newLen = dist(entry.start, entry.end)
    const oldDir = normalize(sub(q.end, q.start))
    const newDir = normalize(sub(entry.end, entry.start))
    if (newLen < MIN_LEN_M || dot(oldDir, newDir) < 0.5) valid = false
    if (Math.min(entry.start[1], entry.end[1]) < groundY - 0.001) valid = false
  }

  // Glijders: eindpunt van de bewogen buis moet op zijn draagbuis blijven.
  for (const s of plan.sliders) {
    const q = pipes.find((p) => p.id === s.pipeId)
    if (!q) continue
    const pt = s.end === 'start' ? newStart : newEnd
    if (dist(pt, pointOnSegment(pt, q.start, q.end)) > TOUCH_TOL_M) valid = false
  }

  const changed: StretchedPipe[] = [
    { id: moved.id, start: newStart, end: newEnd },
    ...[...changedMap.entries()].map(([id, e]) => ({ id, start: e.start, end: e.end })),
  ]

  return { changed, delta: qDelta, valid }
}

/**
 * Vast punt voor lengte-aanpassing: grondzijde eerst, anders de zijde die met
 * een andere buis verbonden is, anders het startpunt.
 */
export function pickFixedEnd(
  pipe: ScenePipe,
  otherPipes: ScenePipe[],
  groundY = 0,
): { fixed: 'start' | 'end'; reason: 'grond' | 'verbonden' | 'startpunt' } {
  const onGround = (pt: Vec3) => pt[1] <= groundY + GROUND_TOL_M
  const connected = (pt: Vec3) => otherPipes.some((q) => touches(pt, q))

  const sGround = onGround(pipe.start)
  const eGround = onGround(pipe.end)
  if (sGround !== eGround) {
    return { fixed: sGround ? 'start' : 'end', reason: 'grond' }
  }

  const sConn = connected(pipe.start)
  const eConn = connected(pipe.end)
  if (sConn !== eConn) {
    return { fixed: sConn ? 'start' : 'end', reason: 'verbonden' }
  }

  if (sGround) return { fixed: 'start', reason: 'grond' }
  if (sConn) return { fixed: 'start', reason: 'verbonden' }
  return { fixed: 'start', reason: 'startpunt' }
}

/** Nieuwe eindpunten voor een lengte-aanpassing vanaf het vaste punt. */
export function resizePipeFromFixedEnd(
  pipe: ScenePipe,
  fixed: 'start' | 'end',
  lengthMm: number,
): { start: Vec3; end: Vec3 } | null {
  const dir = pipeDirection(pipe)
  const len = lengthMm / 1000
  if (len < MIN_LEN_M) return null

  if (fixed === 'start') {
    return { start: pipe.start, end: quantizeMm(add(pipe.start, scale(dir, len))) }
  }
  return { start: quantizeMm(sub(pipe.end, scale(dir, len))), end: pipe.end }
}
