import type { KlimrekConfig } from '../types'

export interface KlimrekPreset {
  id: string
  name: string
  description: string
  config: KlimrekConfig
}

export const DEFAULT_CONFIG: KlimrekConfig = {
  width: 2000,
  depth: 1500,
  height: 2200,
  rungCount: 4,
  diameter: 33.7,
  materialId: 'groen-outdoor',
  includeRoof: false,
  baseType: 'voetplaat',
  anchorDepthMm: 400,
}

export const KLIMREK_PRESETS: KlimrekPreset[] = [
  {
    id: 'klein',
    name: 'Klein klimrek',
    description: 'Compact rek voor jonge kinderen (2×1,2 m, 1,8 m hoog)',
    config: {
      width: 2000,
      depth: 1200,
      height: 1800,
      rungCount: 3,
      diameter: 26.9,
      materialId: 'groen-outdoor',
      includeRoof: false,
      baseType: 'voetplaat',
      anchorDepthMm: 400,
    },
  },
  {
    id: 'standaard',
    name: 'Standaard klimrek',
    description: 'Klassiek tuin-klimrek (2×1,5 m, 2,2 m hoog)',
    config: DEFAULT_CONFIG,
  },
  {
    id: 'groot',
    name: 'Groot klimrek',
    description: 'Ruim klimrek met extra sporten (2,5×2 m, 2,5 m hoog)',
    config: {
      width: 2500,
      depth: 2000,
      height: 2500,
      rungCount: 5,
      diameter: 42.4,
      materialId: 'groen-outdoor',
      includeRoof: false,
      baseType: 'voetplaat',
      anchorDepthMm: 400,
    },
  },
  {
    id: 'met-dak',
    name: 'Klimrek met dak',
    description: 'Klimrek met horizontaal dakvlak als speelplatform',
    config: {
      width: 2000,
      depth: 1500,
      height: 2200,
      rungCount: 4,
      diameter: 33.7,
      materialId: 'groen-outdoor',
      includeRoof: true,
      baseType: 'voetplaat',
      anchorDepthMm: 400,
    },
  },
]
