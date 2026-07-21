import { useMemo } from 'react'
import { Matrix4, Quaternion, Vector3 } from 'three'
import type { MaterialId, ScenePlankMount } from '../../types'
import { Collar } from './fittingParts'

interface PlankMountMeshProps {
  mount: ScenePlankMount
  materialId: MaterialId
  highlighted?: boolean
  ghost?: boolean
}

const UP = new Vector3(0, 1, 0)

/**
 * Vaste Kee Klamp-achtige productmaten (mm) — schalen níet met plankbreedte.
 * Collar past om de buis (via diameterMm); vleugels blijven constant.
 */
const WING_OUTREACH_MM = 52
const WING_WIDTH_MM = 40
const WING_THICKNESS_MM = 7
const WING_HOLE_RADIUS_MM = 4.5
/** Speling buis ↔ plaatvlak (zelfde orde als planks.VERTICAL_FACE_CLEARANCE_M). */
const FACE_CLEARANCE_M = 0.002

/**
 * Contrast t.o.v. donkere buizen én hout — altijd zichtbare zink/grijs tint,
 * ongeacht scene-materiaal (zwart zou anders onzichtbaar zijn op Ø33.7).
 */
function mountBodyColor(highlighted: boolean): string {
  return highlighted ? '#e8c84a' : '#c5ccd4'
}

function flattenHorizontal(v: Vector3, fallback: Vector3): Vector3 {
  const flat = v.clone()
  flat.y = 0
  if (flat.lengthSq() < 1e-8) return fallback.clone().normalize()
  return flat.normalize()
}

function basisQuat(x: Vector3, y: Vector3, z: Vector3): Quaternion {
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
}

/**
 * Schapsteun / plankdrager:
 * - XZ-plank: vleugels horizontaal onder de plank (staander of zadel).
 * - XY/YZ-plaat: vleugels parallel aan het plaatvlak, plat tegen de plaat.
 *
 * mount.position: op buismiddellijn (horizontaal) of op staander (verticaal).
 * Vleugelafmetingen zijn productconstant — niet gekoppeld aan plankWidthMm.
 */
export function PlankMountMesh({
  mount,
  materialId: _materialId,
  highlighted = false,
  ghost = false,
}: PlankMountMeshProps) {
  void _materialId
  const pipeR = mount.diameterMm / 2000
  const pipeAxis = useMemo(() => new Vector3(...mount.pipeAxis).normalize(), [mount.pipeAxis])
  const wingDir = useMemo(() => new Vector3(...mount.retainerDir), [mount.retainerDir])
  const plankAxis = useMemo(() => new Vector3(...mount.plankAxis).normalize(), [mount.plankAxis])
  const isVerticalPipe = Math.abs(pipeAxis.y) >= 0.75
  const plateVertical = mount.plane === 'xy' || mount.plane === 'yz'

  const mat = useMemo(
    () => ({
      body: mountBodyColor(highlighted),
      bolt: '#e8ecef',
      roughness: 0.42,
      metalness: 0.55,
    }),
    [highlighted],
  )

  /** Collar schaalt met buisdiameter; vleugels blijven mm-constant. */
  const outerR = pipeR * 1.72
  const sleeveLen = pipeR * 2.8
  const wingT = WING_THICKNESS_MM / 1000
  const wingW = WING_WIDTH_MM / 1000
  const holeR = WING_HOLE_RADIUS_MM / 1000
  /** Hart → vleugeltip (vaste outreach), minstens voorbij de collar. */
  const tipX = Math.max(outerR + WING_OUTREACH_MM / 1000, outerR + pipeR * 1.2)
  /** Afstand hart → nabijgelegen plaatvlak (buitenkant hout). */
  const nearFaceDist = pipeR + FACE_CLEARANCE_M

  /** Staander + liggende plank: lokale Y = buisas, X = vleugelrichting. */
  const uprightShelfQuat = useMemo(() => {
    const y = pipeAxis.clone().normalize()
    if (y.y < 0) y.negate()
    let x = flattenHorizontal(wingDir, new Vector3(1, 0, 0))
    x.addScaledVector(y, -x.dot(y)).normalize()
    if (x.lengthSq() < 1e-8) {
      x =
        Math.abs(y.y) < 0.9
          ? new Vector3(0, 1, 0).cross(y).normalize()
          : new Vector3(1, 0, 0).cross(y).normalize()
    }
    const z = new Vector3().crossVectors(x, y).normalize()
    const x2 = new Vector3().crossVectors(y, z).normalize()
    return basisQuat(x2, y, z)
  }, [pipeAxis, wingDir])

  /** Zadel + liggende plank: vleugels horizontaal (Y = omhoog). */
  const saddleShelfQuat = useMemo(() => {
    const alongPipe = flattenHorizontal(pipeAxis, new Vector3(1, 0, 0))
    let x = flattenHorizontal(wingDir, alongPipe)
    if (x.lengthSq() < 1e-8) x = alongPipe.clone()
    const z = new Vector3().crossVectors(x, UP).normalize()
    if (z.lengthSq() < 1e-8) z.copy(new Vector3(0, 0, 1))
    const x2 = new Vector3().crossVectors(UP, z).normalize()
    return basisQuat(x2, UP, z)
  }, [pipeAxis, wingDir])

  /**
   * Verticale plaat: vleugelvlak // plaat (lokale Y = vlaknormaal buis→plaat),
   * span in het plaatvlak (lokale X).
   */
  const plateWingQuat = useMemo(() => {
    const face = flattenHorizontal(wingDir, new Vector3(1, 0, 0))
    let x = flattenHorizontal(plankAxis, new Vector3().crossVectors(UP, face))
    if (x.lengthSq() < 1e-8) {
      x = new Vector3().crossVectors(UP, face)
      if (x.lengthSq() < 1e-8) x = new Vector3(1, 0, 0)
      else x.normalize()
    }
    x.addScaledVector(face, -x.dot(face)).normalize()
    const z = new Vector3().crossVectors(x, face).normalize()
    if (z.lengthSq() < 1e-8) {
      z.copy(UP).addScaledVector(face, -UP.dot(face)).normalize()
    }
    const x2 = new Vector3().crossVectors(face, z).normalize()
    return basisQuat(x2, face, z)
  }, [wingDir, plankAxis])

  /** Collar op staander: lokale Y = buisas (omhoog). */
  const uprightCollarQuat = useMemo(() => {
    const y = pipeAxis.clone().normalize()
    if (y.y < 0) y.negate()
    let x = flattenHorizontal(plankAxis, new Vector3(1, 0, 0))
    x.addScaledVector(y, -x.dot(y)).normalize()
    if (x.lengthSq() < 1e-8) x = new Vector3(1, 0, 0).cross(y).normalize()
    const z = new Vector3().crossVectors(x, y).normalize()
    const x2 = new Vector3().crossVectors(y, z).normalize()
    return basisQuat(x2, y, z)
  }, [pipeAxis, plankAxis])

  const opacity = ghost ? 0.5 : 1
  const bodyProps = {
    color: mat.body,
    roughness: mat.roughness,
    metalness: mat.metalness,
    transparent: ghost || highlighted,
    opacity: highlighted ? 0.9 : opacity,
    emissive: highlighted ? '#f4d35e' : '#2a3038',
    emissiveIntensity: highlighted ? 0.4 : 0.12,
  }
  const holeProps = {
    color: '#1a1a1a',
    roughness: 0.7,
    metalness: 0.4,
    transparent: ghost || highlighted,
    opacity: highlighted ? 0.85 : opacity,
  }

  /**
   * Twee vleugels met boutgaten — vaste productlengte vanaf de collar.
   * tipX = afstand hart → vleugeltip in lokale X.
   * wingCenterY = lokale Y van het vleugelmidden (top ≈ 0 of plaatvlak).
   */
  const wings = (tip: number, wingCenterY: number) => {
    const wingLen = Math.max(tip - outerR, WING_OUTREACH_MM / 1000)
    const actualTip = outerR + wingLen
    const wingCenterX = outerR + wingLen / 2
    const holeX = outerR + wingLen * 0.72
    return ([-1, 1] as const).map((side) => (
      <group key={side} position={[0, wingCenterY, 0]}>
        <mesh position={[side * wingCenterX, 0, 0]} castShadow={false} raycast={() => undefined}>
          <boxGeometry args={[wingLen, wingT, wingW]} />
          <meshStandardMaterial {...bodyProps} />
        </mesh>
        <mesh
          position={[side * actualTip, 0, 0]}
          rotation={[0, side > 0 ? 0 : Math.PI, 0]}
          castShadow={false}
          raycast={() => undefined}
        >
          <cylinderGeometry args={[wingW / 2, wingW / 2, wingT, 16, 1, false, -Math.PI / 2, Math.PI]} />
          <meshStandardMaterial {...bodyProps} />
        </mesh>
        <mesh position={[side * holeX, 0, 0]} castShadow={false} raycast={() => undefined}>
          <cylinderGeometry args={[holeR, holeR, wingT * 1.25, 12]} />
          <meshStandardMaterial {...holeProps} />
        </mesh>
      </group>
    ))
  }

  // —— Verticale plaat (XY/YZ): vleugels in het plaatvlak, tegen de plaat ——
  if (plateVertical) {
    const wingCenterY = nearFaceDist - wingT / 2
    if (isVerticalPipe) {
      const collarCenterY = -sleeveLen * 0.28
      return (
        <group position={mount.position}>
          <group quaternion={uprightCollarQuat} position={[0, collarCenterY, 0]}>
            <Collar axis={UP} pipeRadius={pipeR} length={sleeveLen} mat={mat} boltCount={1} />
          </group>
          <group quaternion={plateWingQuat}>{wings(tipX, wingCenterY)}</group>
        </group>
      )
    }
    return (
      <group position={mount.position}>
        <Collar axis={pipeAxis} pipeRadius={pipeR} length={sleeveLen} mat={mat} boltCount={1} />
        <group quaternion={plateWingQuat}>{wings(tipX, wingCenterY)}</group>
      </group>
    )
  }

  // —— Liggende plank (XZ): vleugels onder de plank ——
  if (!isVerticalPipe) {
    const wingCenterY = pipeR - wingT / 2 - 0.001
    return (
      <group position={mount.position}>
        <Collar axis={pipeAxis} pipeRadius={pipeR} length={sleeveLen} mat={mat} boltCount={1} />
        <group quaternion={saddleShelfQuat}>{wings(tipX, wingCenterY)}</group>
      </group>
    )
  }

  // Staander onder liggende plank: lokale Y = buisas, vleugeltop op Y=0.
  const wingCenterY = -wingT / 2
  const collarCenterY = -sleeveLen * 0.28

  return (
    <group position={mount.position} quaternion={uprightShelfQuat}>
      <group position={[0, collarCenterY, 0]}>
        <Collar axis={UP} pipeRadius={pipeR} length={sleeveLen} mat={mat} boltCount={1} />
      </group>
      {wings(tipX, wingCenterY)}
    </group>
  )
}
