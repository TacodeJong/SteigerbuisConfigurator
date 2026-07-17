import type { FittingType, SceneFitting, ScenePipe, Vec3 } from '../types'
import {
  dist,
  isInteriorPointOnPipe,
  junctionKey,
  pipeDirection,
} from './pipeGeometry'

/** Halve lengte van een koppeling — buizen worden hierop ingekort. */
export const FITTING_HALF_LENGTH_M = 0.028

/** Offset van klemarm t.o.v. knooppunt — moet overeenkomen met trim. */
export const FITTING_ARM_OFFSET_M = FITTING_HALF_LENGTH_M * 0.92

const TRIM_BY_TYPE: Partial<Record<FittingType, number>> = {
  afdekdop: FITTING_HALF_LENGTH_M * 0.85,
  'voetplaat-rond': FITTING_HALF_LENGTH_M * 0.85,
  't-kort': FITTING_HALF_LENGTH_M * 0.88,
  'kniestuk-90': FITTING_HALF_LENGTH_M * 0.92,
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function fittingAtPoint(fittings: SceneFitting[]): Map<string, SceneFitting> {
  const map = new Map<string, SceneFitting>()
  for (const f of fittings) {
    map.set(junctionKey(f.position), f)
  }
  return map
}

/** Doorlopende buis bij T-stuk / hoek — niet inkorten (koppeling schuift eromheen). */
function isThroughPipeAtJunction(pipe: ScenePipe, fitting: SceneFitting, junction: Vec3): boolean {
  if (!isInteriorPointOnPipe(junction, pipe)) return false

  const pipeDir = pipeDirection(pipe)

  if (fitting.type === 't-kort' || fitting.type === 't-lang') {
    return Math.abs(dot(pipeDir, fitting.axisA)) > 0.85
  }

  if (fitting.type === '3-weg-hoek' || fitting.type === 'kruisstuk') {
    const axes = fitting.axes ?? [fitting.axisA, ...(fitting.axisB ? [fitting.axisB] : [])]
    return axes.some((axis) => Math.abs(dot(pipeDir, axis)) > 0.85)
  }

  return false
}

/** Kort buizen af waar een koppeling zit — behalve doorlopende buizen bij T-stukken. */
export function trimPipesAtFittings(pipes: ScenePipe[], fittings: SceneFitting[]): ScenePipe[] {
  const junctions = fittingAtPoint(fittings)
  const defaultTrim = FITTING_HALF_LENGTH_M

  return pipes.map((pipe) => {
    const dir = pipeDirection(pipe)
    const len = dist(pipe.start, pipe.end)
    if (len < defaultTrim * 2) return pipe

    let start = pipe.start
    let end = pipe.end

    const startFit = junctions.get(junctionKey(pipe.start))
    const endFit = junctions.get(junctionKey(pipe.end))

    if (startFit && !isThroughPipeAtJunction(pipe, startFit, pipe.start)) {
      const trim = TRIM_BY_TYPE[startFit.type] ?? defaultTrim
      start = [
        pipe.start[0] + dir[0] * trim,
        pipe.start[1] + dir[1] * trim,
        pipe.start[2] + dir[2] * trim,
      ]
    }
    if (endFit && !isThroughPipeAtJunction(pipe, endFit, pipe.end)) {
      const trim = TRIM_BY_TYPE[endFit.type] ?? defaultTrim
      end = [
        pipe.end[0] - dir[0] * trim,
        pipe.end[1] - dir[1] * trim,
        pipe.end[2] - dir[2] * trim,
      ]
    }

    return { ...pipe, start, end }
  })
}
