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
  | 'voetdop'
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

/** Buiten: voetplaat of grondanker. Binnen: 'vloerdop' — rek staat los op rubberen voetdoppen. */
export type BaseAnchorType = 'voetplaat' | 'grondanker' | 'vloerdop'

export type KlimrekEnvironment = 'buiten' | 'binnen'

/**
 * Welke maat de velden Breedte/Diepte betekenen.
 * Ontbreekt in oude configs → behandelen als 'buitenmaat'.
 */
export type DimensionMode = 'buitenmaat' | 'buislengte'

export interface KlimrekConfig {
  width: number
  depth: number
  height: number
  rungCount: number
  diameter: PipeDiameter
  materialId: MaterialId
  includeRoof: boolean
  /**
   * Buiten (default) of binnen. Ontbreekt in oude opgeslagen configs — dan
   * geldt 'buiten'. Bij 'binnen' hoort baseType 'vloerdop'.
   */
  environment?: KlimrekEnvironment
  /**
   * Of Breedte/Diepte de gewenste buitenmaat zijn, of de bestelbare buislengte.
   * Ontbreekt → 'buitenmaat' (backwards-compat).
   */
  dimensionMode?: DimensionMode
  /** Voetplaat op maaiveld, buis in beton verankeren, of los op voetdoppen (binnen) */
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
  | { kind: 'plank'; lengthMm: number; widthMm?: number }

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

export interface BomPlank {
  lengthMm: number
  widthMm: number
  thicknessMm: number
  quantity: number
  label: string
}

/** Klein bevestigingsmateriaal (bv. slotbouten voor planken). */
export interface BomHardwareItem {
  label: string
  quantity: number
}

export interface BomResult {
  pipes: BomPipe[]
  fittings: BomFitting[]
  /** Steigerplanken uit de 3D-editor (ontbreekt bij configurator-BOM zonder planken). */
  planks?: BomPlank[]
  /** Bevestigingsmateriaal, bv. slotbouten per plank-steunpunt. */
  hardware?: BomHardwareItem[]
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

/** Plaatsingsvlak van een plank/plaat: xz = liggend, xy/yz = verticaal wandvlak. */
export type PlankPlane = 'xy' | 'xz' | 'yz'

/** Houten steigerplank of plaat die bovenop liggende buizen rust, of verticaal als wand/scherm. */
export interface ScenePlank {
  id: string
  /** Middelpunt van de plank (m) — bij horizontaal: bovenkant buis + halve dikte */
  position: Vec3
  /** Lengterichting van de plank (genormaliseerd; in het plaatsingsvlak) */
  axis: Vec3
  lengthMm: number
  /**
   * Liggend (xz): plank-/plaatbreedte. Verticaal (xy/yz): hoogte van het scherm/wanddeel.
   */
  widthMm: number
  thicknessMm: number
  /**
   * Plaatsingsvlak. Ontbreekt → afleiden uit `orientation` / as (backwards-compat).
   * - `xz` — liggend op liggers
   * - `xy` — verticaal wandvlak (lengte langs X)
   * - `yz` — verticaal wandvlak (lengte langs Z)
   */
  plane?: PlankPlane
  /**
   * @deprecated Gebruik `plane`. `vertical` ≈ xy/yz, ontbreekt/`horizontal` ≈ xz.
   */
  orientation?: 'horizontal' | 'vertical'
  /**
   * `plate` = houten plaat / multiplex. Ontbreekt / `plank` = steigerplank.
   */
  kind?: 'plank' | 'plate'
}

/**
 * Schapsteun / plankdrager: klem op verticale staander óf zadel op horizontale
 * draagbuis onder de plank. Door de gebruiker geplaatst (per plank persistent);
 * positie/oriëntatie wordt per (plank, buis)-paar gesynchroniseerd.
 * Veld `retainerDir` = vleugelrichting (backwards-compat naam).
 */
export interface ScenePlankMount {
  id: string
  plankId: string
  pipeId: string
  /**
   * Op buismiddellijn: bij staander Y ≈ onderkant plank; bij ligger =
   * snijpunt plank×draagbuis (Y = buishart).
   */
  position: Vec3
  /** As van de buis waar de klem omheen zit (verticaal of horizontaal) */
  pipeAxis: Vec3
  /** Lengterichting van de plank */
  plankAxis: Vec3
  /**
   * Vleugelrichting: bij liggende planken horizontaal naar het plankhart
   * (vleugels onder de plank); bij verticale planken de vlaknormaal van buis
   * naar plaat (vleugels ín het plaatvlak).
   */
  retainerDir: Vec3
  diameterMm: number
  thicknessMm: number
  /** Plaatsingsvlak van de bijbehorende plank. Ontbreekt (oude scenes) → 'xz'. */
  plane?: PlankPlane
  /**
   * Plankbreedte (metadata / oude scenes). Mesh gebruikt vaste productmaten —
   * niet schalen met deze waarde.
   */
  plankWidthMm?: number
}

export interface SceneModel {
  pipes: ScenePipe[]
  fittings: SceneFitting[]
  accessories?: PipeAccessory[]
  hingeConnections?: HingeConnection[]
  /** Steigerplanken — ontbreekt in oude opgeslagen scenes (= lege lijst). */
  planks?: ScenePlank[]
  /** Schapsteunen — ontbreekt in oude scenes; opnieuw af te leiden via sync. */
  plankMounts?: ScenePlankMount[]
  materialId: MaterialId
}

export type ViewMode = 'configurator' | 'editor'

export type EditorTool = 'select' | 'draw' | 'pan' | 'hinge' | 'move' | 'plank'

export type EditorSelection =
  | { kind: 'pipe'; pipeId: string; worldPosition: Vec3 }
  | { kind: 'accessory'; accessoryId: string; worldPosition: Vec3 }
  | { kind: 'plank'; plankId: string; worldPosition: Vec3 }

export type AddPipeAxis = 'x' | 'y' | 'z'
