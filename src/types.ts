export type PipeDiameter = 26.9 | 33.7 | 42.4 | 48.3

export type MaterialId =
  | 'groen-outdoor'
  | 'zwart-outdoor'
  | 'zwart'
  | 'staal'
  | 'wit'
  | 'beige'
  | 'aluminium'

export type FittingType =
  | 't-kort'
  | 't-lang'
  | 'kniestuk-90'
  | 'kruisstuk'
  | 'koppelstuk'
  | 'voetplaat-rond'
  | 'voetplaat-vierkant'
  | 'afdekdop'
  | '3-weg-hoek'
  | 'drieweg-kniestuk'
  | 'vierweg-kruisstuk'
  | 'scharnieroog'
  | 'scharnierhuls'
  | 'dubbelscharnier-90'
  | 'dubbelscharnier-recht'

export interface Material {
  id: MaterialId
  name: string
  description: string
  outdoor: boolean
  color: string
  shopUrl: string
}

export interface FittingCatalogItem {
  type: FittingType
  name: string
  description: string
  shopCategory: string
}

export type BaseAnchorType = 'voetplaat' | 'grondanker'

export interface KlimrekConfig {
  width: number
  depth: number
  height: number
  rungCount: number
  diameter: PipeDiameter
  materialId: MaterialId
  includeRoof: boolean
  /** Voetplaat op maaiveld of buis in beton verankeren */
  baseType: BaseAnchorType
  /** Diepte grondanker in mm (buis die in beton verdwijnt) */
  anchorDepthMm: number
}

/** Accessoire-regels in de stuklijst — losse delen of gegroepeerde dubbelscharnieren. */
export type AccessoryBomType = HingeAccessoryType | 'dubbelscharnier-90' | 'dubbelscharnier-recht'

export type BomHighlight =
  | { kind: 'pipe'; lengthMm: number }
  | { kind: 'fitting'; type: FittingType; label: string }
  | { kind: 'accessory'; type: AccessoryBomType }

export interface BomPipe {
  lengthMm: number
  quantity: number
  label: string
}

export interface BomFitting {
  type: FittingType
  quantity: number
  label: string
}

export interface BomResult {
  pipes: BomPipe[]
  fittings: BomFitting[]
  totalPipeLengthMm: number
  notes: string[]
}

export type Vec3 = [number, number, number]

export interface ScenePipe {
  id: string
  start: Vec3
  end: Vec3
  label: string
  diameterMm: number
}

export interface SceneFitting {
  id: string
  type: FittingType
  position: Vec3
  /** Primaire as (door de koppeling) */
  axisA: Vec3
  /** Secundaire as (aftakking of tweede been) */
  axisB?: Vec3
  /** Alle aansluitrichtingen op dit knooppunt */
  axes?: Vec3[]
  diameterMm: number
}

/** Scharnieroog op frame-buis; scharnierhuls (met vork) op verbindingsbuis. */
export type HingeAccessoryType = 'scharnieroog' | 'scharnierhuls'

export interface PipeAccessory {
  id: string
  type: HingeAccessoryType
  pipeId: string
  /** Positie op buismiddellijn (m) */
  position: Vec3
  /** Buisrichting (genormaliseerd) */
  pipeAxis: Vec3
  /** Richting waarin oog/vork wijst — loodrecht op buisas */
  hingeAxis: Vec3
  diameterMm: number
}

export interface HingeConnection {
  id: string
  eyeId: string
  hulsId: string
}

export interface SceneModel {
  pipes: ScenePipe[]
  fittings: SceneFitting[]
  accessories?: PipeAccessory[]
  hingeConnections?: HingeConnection[]
  materialId: MaterialId
}

export type ViewMode = 'configurator' | 'editor'

export type EditorTool = 'select' | 'draw' | 'pan' | 'hinge' | 'move'

export type EditorSelection =
  | { kind: 'pipe'; pipeId: string; worldPosition: Vec3 }
  | { kind: 'accessory'; accessoryId: string; worldPosition: Vec3 }

export type AddPipeAxis = 'x' | 'y' | 'z'
