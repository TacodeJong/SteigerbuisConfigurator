import type { FittingType, PipeAccessory, SceneFitting } from '../types'

/** Preview-inhoud voor BOM-thumbs (zelfde meshes als de editor). */
export type FittingPreviewContent =
  | { kind: 'fitting'; fitting: SceneFitting }
  | {
      kind: 'accessories'
      accessories: PipeAccessory[]
      /** Oog-id's waarvan de klemhuls verborgen blijft (dubbelscharnier). */
      hideSleeveIds?: string[]
    }

const UP: [number, number, number] = [0, 1, 0]
const RIGHT: [number, number, number] = [1, 0, 0]
const FORWARD: [number, number, number] = [0, 0, 1]
const LEFT: [number, number, number] = [-1, 0, 0]
const BACK: [number, number, number] = [0, 0, -1]
const DOWN: [number, number, number] = [0, -1, 0]

function fitting(
  type: FittingType,
  diameterMm: number,
  axisA: [number, number, number],
  axisB?: [number, number, number],
  axes?: [number, number, number][],
): SceneFitting {
  return {
    id: `preview-${type}`,
    type,
    position: [0, 0, 0],
    axisA,
    axisB,
    axes,
    diameterMm,
  }
}

function accessory(
  id: string,
  type: 'scharnieroog' | 'scharnierhuls',
  diameterMm: number,
  pipeAxis: [number, number, number],
  hingeAxis: [number, number, number],
): PipeAccessory {
  return {
    id,
    type,
    pipeId: 'preview-pipe',
    position: [0, 0, 0],
    pipeAxis,
    hingeAxis,
    diameterMm,
  }
}

/**
 * Bouwt een canonieke 3D-pose per FittingType zodat BOM-previews herkenbaar
 * en vergelijkbaar zijn (vaste camera-hoek).
 */
export function buildFittingPreview(type: FittingType, diameterMm: number): FittingPreviewContent {
  switch (type) {
    case 'koppelstuk':
      return { kind: 'fitting', fitting: fitting(type, diameterMm, UP) }

    case 'kniestuk-90':
      return { kind: 'fitting', fitting: fitting(type, diameterMm, UP, RIGHT) }

    case 't-kort':
    case 't-lang':
      return { kind: 'fitting', fitting: fitting(type, diameterMm, UP, RIGHT) }

    case 'kruisstuk':
      return {
        kind: 'fitting',
        fitting: fitting(type, diameterMm, UP, RIGHT, [UP, DOWN, RIGHT, LEFT]),
      }

    case '3-weg-hoek':
      return {
        kind: 'fitting',
        fitting: fitting(type, diameterMm, UP, RIGHT, [UP, RIGHT, FORWARD]),
      }

    case 'drieweg-kniestuk':
      return {
        kind: 'fitting',
        fitting: fitting(type, diameterMm, UP, RIGHT, [UP, RIGHT, FORWARD]),
      }

    case 'vierweg-kruisstuk':
      // Doorloop (UP) + 4 zij = 6 richtingen (DOWN via doorloopmouw).
      return {
        kind: 'fitting',
        fitting: fitting(type, diameterMm, UP, RIGHT, [UP, RIGHT, LEFT, FORWARD, BACK]),
      }

    case 'vijfweg-kruisstuk':
      // Doorloop (UP) + 3 zij = 5 richtingen (DOWN via doorloopmouw).
      return {
        kind: 'fitting',
        fitting: fitting(type, diameterMm, UP, RIGHT, [UP, RIGHT, LEFT, FORWARD]),
      }

    case 'voetplaat-rond':
    case 'voetplaat-vierkant':
    case 'afdekdop':
    case 'voetdop':
      return { kind: 'fitting', fitting: fitting(type, diameterMm, UP) }

    case 'scharnieroog':
      return {
        kind: 'accessories',
        accessories: [accessory('preview-eye', 'scharnieroog', diameterMm, UP, RIGHT)],
      }

    case 'scharnierhuls':
      return {
        kind: 'accessories',
        accessories: [accessory('preview-huls', 'scharnierhuls', diameterMm, UP, RIGHT)],
      }

    case 'dubbelscharnier-90': {
      const eyeA = accessory('preview-eye-a', 'scharnieroog', diameterMm, UP, RIGHT)
      const eyeB = accessory('preview-eye-b', 'scharnieroog', diameterMm, UP, FORWARD)
      return {
        kind: 'accessories',
        accessories: [eyeA, eyeB],
        hideSleeveIds: [eyeB.id],
      }
    }

    case 'dubbelscharnier-recht': {
      const eyeA = accessory('preview-eye-a', 'scharnieroog', diameterMm, UP, RIGHT)
      const eyeB = accessory('preview-eye-b', 'scharnieroog', diameterMm, UP, LEFT)
      return {
        kind: 'accessories',
        accessories: [eyeA, eyeB],
        hideSleeveIds: [eyeB.id],
      }
    }

    default:
      return { kind: 'fitting', fitting: fitting(type, diameterMm, UP) }
  }
}
