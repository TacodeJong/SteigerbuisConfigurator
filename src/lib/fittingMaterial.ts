import type { MaterialId } from '../types'

export interface FittingMaterialProps {
  body: string
  bolt: string
  roughness: number
  metalness: number
}

/** Kleuren afgestemd op steigerbuisgroothandel.nl (mat zwart poedercoat / zink). */
export function getFittingMaterial(materialId: MaterialId): FittingMaterialProps {
  switch (materialId) {
    case 'staal':
      return { body: '#9aa3ad', bolt: '#e4e8ec', roughness: 0.38, metalness: 0.72 }
    case 'aluminium':
      return { body: '#a8b0b8', bolt: '#e8ecef', roughness: 0.32, metalness: 0.78 }
    case 'wit':
    case 'beige':
      return { body: '#2e2e2e', bolt: '#c5c9ce', roughness: 0.86, metalness: 0.14 }
    default:
      // Zwart / groen outdoor — mat zwart zoals op de website
      return { body: '#1e1e1e', bolt: '#b8bec4', roughness: 0.9, metalness: 0.1 }
  }
}
