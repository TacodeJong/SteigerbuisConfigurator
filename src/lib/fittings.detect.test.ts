import { detectFittingsFromPipes } from './fittings'
import type { ScenePipe } from '../types'
import { weldPipeJoints } from './pipeGeometry'

function pipe(id: string, start: [number, number, number], end: [number, number, number]): ScenePipe {
  return { id, start, end, label: 'Buis', diameterMm: 26.9 }
}

function fittingAt(pipes: ScenePipe[], y: number) {
  return detectFittingsFromPipes(pipes).find((f) => Math.abs(f.position[1] - y) < 0.02)
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// T-kruising: verticale buis op horizontale buis
{
  const f = fittingAt(
    [
      pipe('h', [-2, 1, 0], [2, 1, 0]),
      pipe('v', [-1, 0, 0], [-1, 1, 0]),
    ],
    1,
  )
  assert(f?.type === 't-kort', `T-kruising verwacht t-kort, kreeg ${f?.type}`)
}

// L-hoek: twee buizen eindpunt op eindpunt
{
  const f = fittingAt(
    [
      pipe('post', [-1, 0, 0], [-1, 1, 0]),
      pipe('h', [-1, 1, 0], [1, 1, 0]),
    ],
    1,
  )
  assert(f?.type === 'kniestuk-90', `L-hoek verwacht kniestuk-90, kreeg ${f?.type}`)
}

// Editor-tolerantie: eindpunt 10 mm naast buis → na lassen T-stuk
{
  const loose = [
    pipe('h', [-2, 1, 0], [2, 1, 0]),
    pipe('v', [-1, 0, 0], [-1, 1.01, 0]),
  ]
  const welded = weldPipeJoints(loose)
  const f = fittingAt(welded, 1)
  assert(f?.type === 't-kort', `Los eindpunt verwacht t-kort na lassen, kreeg ${f?.type}`)
}

// Staander loopt dóór + 2 haakse zij-uitgangen → drieweg kniestuk
{
  const f = fittingAt(
    [
      pipe('post', [-1, 0, -1], [-1, 2.5, -1]),
      pipe('a', [-1, 1, -1], [1, 1, -1]),
      pipe('b', [-1, 1, -1], [-1, 1, 1]),
    ],
    1,
  )
  assert(f?.type === 'drieweg-kniestuk', `Doorlopende staander verwacht drieweg-kniestuk, kreeg ${f?.type}`)
}

// Staander eindigt op de hoek + 2 haakse buizen → hoekstuk (3-weg)
{
  const f = fittingAt(
    [
      pipe('post', [-1, 0, -1], [-1, 1, -1]),
      pipe('a', [-1, 1, -1], [1, 1, -1]),
      pipe('b', [-1, 1, -1], [-1, 1, 1]),
    ],
    1,
  )
  assert(f?.type === '3-weg-hoek', `Eindigende staander verwacht 3-weg-hoek, kreeg ${f?.type}`)
}

// Scharnierpunt: geen automatische fitting op het oog/huls-punt
{
  const fittings = detectFittingsFromPipes(
    [
      pipe('post', [-1, 0, 0], [-1, 2, 0]),
      pipe('span', [-1, 1, 0], [0.5, 2, 0]),
    ],
    { hingePoints: [[-1, 1, 0]] },
  )
  const atHinge = fittings.find((f) => Math.abs(f.position[1] - 1) < 0.02)
  assert(atHinge == null, `Scharnierpunt verwacht geen fitting, kreeg ${atHinge?.type}`)
}

console.log('fittings.detect.test.ts: alle tests geslaagd')
