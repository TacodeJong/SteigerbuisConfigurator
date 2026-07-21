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
  environment: 'buiten',
  dimensionMode: 'buitenmaat',
  baseType: 'voetplaat',
  anchorDepthMm: 400,
}

/** Startpunten: rechthoekig frame met sporten (o.a. klimrek, rek, pergola-achtig). */
export const KLIMREK_PRESETS: KlimrekPreset[] = [
  {
    id: 'klein',
    name: 'Compact frame',
    description: 'Klein rechthoekig frame (2×1,2 m, 1,8 m hoog)',
    config: {
      width: 2000,
      depth: 1200,
      height: 1800,
      rungCount: 3,
      diameter: 26.9,
      materialId: 'groen-outdoor',
      includeRoof: false,
      environment: 'buiten',
      dimensionMode: 'buitenmaat',
      baseType: 'voetplaat',
      anchorDepthMm: 400,
    },
  },
  {
    id: 'standaard',
    name: 'Standaard frame',
    description: 'Veelgebruikte maat (2×1,5 m, 2,2 m hoog)',
    config: DEFAULT_CONFIG,
  },
  {
    id: 'groot',
    name: 'Groot frame',
    description: 'Ruimer frame met extra sporten (2,5×2 m, 2,5 m hoog)',
    config: {
      width: 2500,
      depth: 2000,
      height: 2500,
      rungCount: 5,
      diameter: 42.4,
      materialId: 'groen-outdoor',
      includeRoof: false,
      environment: 'buiten',
      dimensionMode: 'buitenmaat',
      baseType: 'voetplaat',
      anchorDepthMm: 400,
    },
  },
  {
    id: 'met-dak',
    name: 'Frame met dakvlak',
    description: 'Frame met horizontaal dakvlak / bovenste platform',
    config: {
      width: 2000,
      depth: 1500,
      height: 2200,
      rungCount: 4,
      diameter: 33.7,
      materialId: 'groen-outdoor',
      includeRoof: true,
      environment: 'buiten',
      dimensionMode: 'buitenmaat',
      baseType: 'voetplaat',
      anchorDepthMm: 400,
    },
  },
]
