import { useEffect, useMemo } from 'react'
import {
  CatmullRomCurve3,
  EllipseCurve,
  Matrix4,
  Quaternion,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import type { FittingMaterialProps } from '../../lib/fittingMaterial'
import { FITTING_ARM_OFFSET_M, FITTING_HALF_LENGTH_M } from '../../lib/pipeTrim'

const UP = new Vector3(0, 1, 0)

export function quatFromAxis(from: Vector3, to: Vector3): Quaternion {
  const q = new Quaternion()
  if (from.dot(to) < -0.9999) {
    q.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI)
  } else {
    q.setFromUnitVectors(from, to)
  }
  return q
}

function boltTangent(axis: Vector3): Vector3 {
  const ref = Math.abs(axis.y) < 0.85 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
  return axis.clone().cross(ref).normalize()
}

interface CollarProps {
  axis: Vector3
  pipeRadius: number
  length: number
  mat: FittingMaterialProps
  offset?: number
  boltCount?: number
}

export function Collar({ axis, pipeRadius, length, mat, offset = 0, boltCount = 1 }: CollarProps) {
  const outerR = pipeRadius * 1.58
  const quat = useMemo(() => quatFromAxis(UP, axis), [axis])
  const pos = useMemo(() => axis.clone().multiplyScalar(offset), [axis, offset])
  const tangent = useMemo(() => boltTangent(axis), [axis])
  const boltQuat = useMemo(() => quatFromAxis(UP, tangent), [tangent])

  const bolts = useMemo(() => {
    const positions: Vector3[] = []
    if (boltCount === 1) {
      positions.push(tangent.clone().multiplyScalar(outerR * 1.04))
    } else {
      const bit = axis.clone().normalize()
      positions.push(
        tangent.clone().multiplyScalar(outerR * 1.04).add(bit.multiplyScalar(length * 0.15)),
        tangent.clone().multiplyScalar(outerR * 1.04).sub(bit.clone().multiplyScalar(length * 0.15)),
      )
    }
    return positions
  }, [axis, tangent, outerR, length, boltCount])

  return (
    <group position={pos} quaternion={quat}>
      <mesh>
        <cylinderGeometry args={[outerR, outerR * 0.98, length, 20]} />
        <meshStandardMaterial color={mat.body} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
      {bolts.map((boltPos, i) => (
        <group key={i} position={boltPos} quaternion={boltQuat}>
          <mesh rotation={[0, 0, Math.PI / 6]}>
            <cylinderGeometry args={[outerR * 0.19, outerR * 0.19, outerR * 0.14, 6]} />
            <meshStandardMaterial color={mat.bolt} metalness={0.92} roughness={0.15} />
          </mesh>
          <mesh position={[0, outerR * 0.08, 0]}>
            <cylinderGeometry args={[outerR * 0.07, outerR * 0.07, outerR * 0.1, 8]} />
            <meshStandardMaterial color={mat.bolt} metalness={0.92} roughness={0.15} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

interface TeeFittingProps {
  through: Vector3
  branch: Vector3
  pipeRadius: number
  sleeveLen: number
  mat: FittingMaterialProps
}

export function TeeFitting({ through, branch, pipeRadius, mat }: TeeFittingProps) {
  const outerR = pipeRadius * 1.58
  const od = pipeRadius * 2
  const throughLen = od * 1.52 * 1.12
  const branchLen = od * 1.38
  const branchOffset = FITTING_ARM_OFFSET_M

  const throughQuat = useMemo(() => quatFromAxis(UP, through), [through])
  const tangent = useMemo(() => boltTangent(through), [through])
  const boltQuat = useMemo(() => quatFromAxis(UP, tangent), [tangent])
  const branchOut = useMemo(() => {
    const n = new Vector3().crossVectors(through, branch).normalize()
    return n.lengthSq() > 1e-8 ? n : boltTangent(branch)
  }, [through, branch])
  const branchBoltQuat = useMemo(() => quatFromAxis(UP, branchOut), [branchOut])

  const throughBolts = useMemo(() => {
    const bit = through.clone().normalize()
    return [
      tangent.clone().multiplyScalar(outerR * 1.05).add(bit.multiplyScalar(throughLen * 0.2)),
      tangent.clone().multiplyScalar(outerR * 1.05).sub(bit.clone().multiplyScalar(throughLen * 0.2)),
    ]
  }, [through, tangent, outerR, throughLen])

  const branchBoltPos = useMemo(
    () => branch.clone().normalize().multiplyScalar(branchOffset * 0.95).add(branchOut.clone().multiplyScalar(outerR * 1.05)),
    [branch, branchOffset, branchOut, outerR],
  )

  const matProps = useMemo(
    () => ({ color: mat.body, roughness: mat.roughness, metalness: mat.metalness }),
    [mat.body, mat.roughness, mat.metalness],
  )

  return (
    <group>
      {/* Doorloopmouw — buis schuift erdoor (Kee Klamp type 25 / steigerbuis T-stuk) */}
      <group quaternion={throughQuat}>
        <mesh>
          <cylinderGeometry args={[outerR, outerR * 0.98, throughLen, 24]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
        {throughBolts.map((boltPos, i) => (
          <group key={i} position={boltPos} quaternion={boltQuat}>
            <mesh rotation={[0, 0, Math.PI / 6]}>
              <cylinderGeometry args={[outerR * 0.19, outerR * 0.19, outerR * 0.14, 6]} />
              <meshStandardMaterial color={mat.bolt} metalness={0.92} roughness={0.15} />
            </mesh>
          </group>
        ))}
      </group>
      {/* Aftakkingsklem */}
      <Collar
        axis={branch}
        pipeRadius={pipeRadius}
        length={branchLen}
        mat={mat}
        offset={branchOffset}
        boltCount={0}
      />
      <group position={branchBoltPos} quaternion={branchBoltQuat}>
        <mesh rotation={[0, 0, Math.PI / 6]}>
          <cylinderGeometry args={[outerR * 0.19, outerR * 0.19, outerR * 0.14, 6]} />
          <meshStandardMaterial color={mat.bolt} metalness={0.92} roughness={0.15} />
        </mesh>
      </group>
    </group>
  )
}

interface SideOutletProps {
  through: Vector3
  branches: Vector3[]
  pipeRadius: number
  sleeveLen: number
  mat: FittingMaterialProps
}

/**
 * Doorlopende staander met haakse zij-uitgangen op hetzelfde punt:
 * 2 uitgangen = drieweg kniestuk (type 20), 3-4 = vierweg kruisstuk (type 40).
 */
export function SideOutletFitting({ through, branches, pipeRadius, sleeveLen, mat }: SideOutletProps) {
  const outerR = pipeRadius * 1.58
  const arm = FITTING_ARM_OFFSET_M
  const throughLen = sleeveLen * 1.35

  const throughQuat = useMemo(() => quatFromAxis(UP, through), [through])
  const tangent = useMemo(() => boltTangent(through), [through])
  const boltQuat = useMemo(() => quatFromAxis(UP, tangent), [tangent])

  const throughBolts = useMemo(() => {
    const bit = through.clone().normalize()
    return [
      tangent.clone().multiplyScalar(outerR * 1.05).add(bit.multiplyScalar(throughLen * 0.2)),
      tangent.clone().multiplyScalar(outerR * 1.05).sub(bit.clone().multiplyScalar(throughLen * 0.2)),
    ]
  }, [through, tangent, outerR, throughLen])

  return (
    <group>
      <group quaternion={throughQuat}>
        <mesh>
          <cylinderGeometry args={[outerR, outerR * 0.98, throughLen, 22]} />
          <meshStandardMaterial color={mat.body} roughness={mat.roughness} metalness={mat.metalness} />
        </mesh>
        {throughBolts.map((boltPos, i) => (
          <group key={i} position={boltPos} quaternion={boltQuat}>
            <mesh rotation={[0, 0, Math.PI / 6]}>
              <cylinderGeometry args={[outerR * 0.19, outerR * 0.19, outerR * 0.14, 6]} />
              <meshStandardMaterial color={mat.bolt} metalness={0.92} roughness={0.15} />
            </mesh>
          </group>
        ))}
      </group>
      {branches.map((axis, i) => (
        <Collar
          key={i}
          axis={axis}
          pipeRadius={pipeRadius}
          length={sleeveLen * 0.85}
          mat={mat}
          offset={arm}
          boltCount={1}
        />
      ))}
    </group>
  )
}

interface Corner3WayProps {
  /** Ondertekende arm-richtingen van het knooppunt — wijzen wég van de buislichamen. */
  arms: Vector3[]
  pipeRadius: number
  sleeveLen: number
  mat: FittingMaterialProps
}

/**
 * Hoekstuk (3-weg): alle drie de buizen eindigen in de fitting. Gesloten
 * hoeklichaam (dekt het staander-eind af) met per buis één socket — géén
 * doorloopmouw, dat is het verschil met het drieweg kniestuk.
 */
export function Corner3WayFitting({ arms, pipeRadius, sleeveLen, mat }: Corner3WayProps) {
  const outerR = pipeRadius * 1.58
  const off = FITTING_ARM_OFFSET_M

  // Sockets wijzen naar de buizen toe (tegengesteld aan de arm-richtingen).
  const sockets = useMemo(
    () => arms.slice(0, 3).map((a) => a.clone().normalize().negate()),
    [arms],
  )

  return (
    <group>
      {/* Gesloten hoeklichaam — sluit het eindigende buiseinde af */}
      <mesh>
        <sphereGeometry args={[outerR * 1.12, 20, 20]} />
        <meshStandardMaterial color={mat.body} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
      {sockets.map((axis, i) => (
        <Collar
          key={i}
          axis={axis}
          pipeRadius={pipeRadius}
          length={sleeveLen * 0.85}
          mat={mat}
          offset={off}
          boltCount={1}
        />
      ))}
    </group>
  )
}

/** Kee Klamp 15-5: D ≈ 1,52× buis-OD; bochtstraal ≈ 1,44× OD (26,9 mm → 41 mm / 39 mm). */
function elbowDimensions(pipeRadius: number) {
  const od = pipeRadius * 2
  return { armReach: od * 1.52, bendR: od * 1.44 }
}

function elbowOrientation(axisA: Vector3, axisB: Vector3): Quaternion {
  const ay = axisA.clone().normalize()
  const axTarget = axisB.clone().normalize()
  let z = new Vector3().crossVectors(axTarget, ay)
  if (z.lengthSq() < 1e-8) {
    const ref = Math.abs(ay.y) < 0.85 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
    z = new Vector3().crossVectors(axTarget, ref)
  }
  z.normalize()
  const ax = new Vector3().crossVectors(ay, z).normalize()
  const base = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(ax, ay, z))
  // De junction-armen wijzen wég van de buislichamen; de L-vorm moet met zijn
  // sockets juist naar de buizen toe. 180° om de lokale z (buiging-normaal)
  // draait de arm-uiteinden naar de aangesloten buizen.
  const flipZ = new Quaternion(0, 0, 1, 0)
  return base.multiply(flipZ)
}

/**
 * Centerline: sockettip A → kwartbocht (fillet, raakt beide buisassen) → sockettip B
 * (as A = +Y, as B = +X). Begint bij de tip — niet in het hoekpunt, anders
 * overlapt de tube-body zichzelf en oogt het als een losse cilinder + knie.
 */
function buildElbowCurve(bendR: number, armReach: number): CatmullRomCurve3 {
  const pts: Vector3[] = [new Vector3(0, Math.max(armReach, bendR * 1.02), 0)]
  const arc = new EllipseCurve(bendR, bendR, bendR, bendR, Math.PI, Math.PI * 1.5, false)
  for (const p of arc.getPoints(32)) {
    pts.push(new Vector3(p.x, p.y, 0))
  }
  pts.push(new Vector3(Math.max(armReach, bendR * 1.02), 0, 0))
  return new CatmullRomCurve3(pts, false, 'centripetal')
}

function SocketBolt({
  position,
  boltQuat,
  outerR,
  mat,
}: {
  position: Vector3
  boltQuat: Quaternion
  outerR: number
  mat: FittingMaterialProps
}) {
  return (
    <group position={position} quaternion={boltQuat}>
      <mesh rotation={[0, 0, Math.PI / 6]}>
        <cylinderGeometry args={[outerR * 0.19, outerR * 0.19, outerR * 0.14, 6]} />
        <meshStandardMaterial color={mat.bolt} metalness={0.92} roughness={0.15} />
      </mesh>
      <mesh position={[0, outerR * 0.08, 0]}>
        <cylinderGeometry args={[outerR * 0.07, outerR * 0.07, outerR * 0.1, 8]} />
        <meshStandardMaterial color={mat.bolt} metalness={0.92} roughness={0.15} />
      </mesh>
    </group>
  )
}

interface Elbow90Props {
  axisA: Vector3
  axisB: Vector3
  pipeRadius: number
  sleeveLen: number
  mat: FittingMaterialProps
}

/**
 * Kniestuk 90° — gegoten elleboog (Kee Klamp type 15 / steigerbuis kniestuk).
 * Proporties: Kee Klamp 15-5 datasheet (D=41 mm @ 26,9 mm OD).
 * Referentie-3D: steigerbuisstunter.nl STEP, Simplified Building SketchUp, 3D Warehouse.
 */
export function Elbow90Fitting({ axisA, axisB, pipeRadius, sleeveLen, mat }: Elbow90Props) {
  const outerR = pipeRadius * 1.58
  const { armReach, bendR } = elbowDimensions(pipeRadius)
  const clampLen = sleeveLen * 0.42

  const orient = useMemo(() => elbowOrientation(axisA, axisB), [axisA, axisB])
  const boltOut = useMemo(() => {
    const ay = axisA.clone().normalize()
    const ax = axisB.clone().normalize()
    const z = new Vector3().crossVectors(ax, ay).normalize()
    return z.lengthSq() > 1e-8 ? z.negate() : new Vector3(0, 0, -1)
  }, [axisA, axisB])

  const bodyGeom = useMemo(() => {
    const curve = buildElbowCurve(bendR, armReach)
    return new TubeGeometry(curve, 56, outerR, 24, false)
  }, [bendR, armReach, outerR])

  const clampYGeom = useMemo(
    () => new TorusGeometry(outerR * 1.04, outerR * 0.14, 10, 24, Math.PI * 0.55),
    [outerR],
  )
  const clampXGeom = useMemo(
    () => new TorusGeometry(outerR * 1.04, outerR * 0.14, 10, 24, Math.PI * 0.55),
    [outerR],
  )

  useEffect(
    () => () => {
      bodyGeom.dispose()
      clampYGeom.dispose()
      clampXGeom.dispose()
    },
    [bodyGeom, clampYGeom, clampXGeom],
  )

  const boltArmA = useMemo(() => new Vector3(0, armReach * 0.38, 0), [armReach])
  const boltArmB = useMemo(() => new Vector3(armReach * 0.38, 0, 0), [armReach])
  const boltQuat = useMemo(() => quatFromAxis(UP, boltOut), [boltOut])

  const matProps = useMemo(
    () => ({ color: mat.body, roughness: mat.roughness, metalness: mat.metalness }),
    [mat.body, mat.roughness, mat.metalness],
  )

  return (
    <group quaternion={orient}>
      <mesh geometry={bodyGeom}>
        <meshStandardMaterial {...matProps} />
      </mesh>

      {/* Klemringen aan buiteinde van elke socket */}
      <group position={[0, armReach - clampLen * 0.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh geometry={clampYGeom}>
          <meshStandardMaterial {...matProps} />
        </mesh>
      </group>
      <group position={[armReach - clampLen * 0.35, 0, 0]} rotation={[0, Math.PI / 2, Math.PI / 2]}>
        <mesh geometry={clampXGeom}>
          <meshStandardMaterial {...matProps} />
        </mesh>
      </group>

      <SocketBolt position={boltArmA} boltQuat={boltQuat} outerR={outerR} mat={mat} />
      <SocketBolt position={boltArmB} boltQuat={boltQuat} outerR={outerR} mat={mat} />
    </group>
  )
}

interface CrossFittingProps {
  /** Doorloop-as (buis schuift erdoor). */
  axisA: Vector3
  /** Aftakkingslijn — klemmen aan beide zijden. */
  axisB: Vector3
  pipeRadius: number
  sleeveLen: number
  mat: FittingMaterialProps
}

/** Vlak kruisstuk: doorloopmouw + aftakkingsklem aan weerszijden. */
export function CrossFitting({ axisA, axisB, pipeRadius, sleeveLen, mat }: CrossFittingProps) {
  const branches = useMemo(
    () => [axisB.clone().normalize(), axisB.clone().normalize().negate()],
    [axisB],
  )
  return (
    <SideOutletFitting
      through={axisA}
      branches={branches}
      pipeRadius={pipeRadius}
      sleeveLen={sleeveLen}
      mat={mat}
    />
  )
}

interface FourWayProps {
  axes: Vector3[]
  pipeRadius: number
  sleeveLen: number
  mat: FittingMaterialProps
}

export function FourWayFitting({ axes, pipeRadius, sleeveLen, mat }: FourWayProps) {
  const outerR = pipeRadius * 1.58
  const arm = FITTING_ARM_OFFSET_M
  return (
    <group>
      <mesh>
        <sphereGeometry args={[outerR * 1.5, 14, 14]} />
        <meshStandardMaterial color={mat.body} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
      {axes.map((axis, i) => (
        <Collar
          key={i}
          axis={axis}
          pipeRadius={pipeRadius}
          length={sleeveLen * 0.72}
          mat={mat}
          offset={arm}
          boltCount={1}
        />
      ))}
    </group>
  )
}

interface EndCapProps {
  axis: Vector3
  pipeRadius: number
  mat: FittingMaterialProps
}

export function EndCapFitting({ axis, pipeRadius, mat }: EndCapProps) {
  const quat = useMemo(() => quatFromAxis(UP, axis), [axis])
  const outerR = pipeRadius * 1.55
  const sleeveLen = FITTING_HALF_LENGTH_M * 2

  return (
    <group quaternion={quat}>
      {/* Klem grijpt buiseinde */}
      <mesh position={[0, -sleeveLen / 2, 0]}>
        <cylinderGeometry args={[outerR, outerR * 0.98, sleeveLen, 20]} />
        <meshStandardMaterial color={mat.body} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
      {/* Afdekdop — halfronde kap */}
      <mesh position={[0, outerR * 0.15, 0]}>
        <sphereGeometry args={[outerR, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={mat.body} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
    </group>
  )
}

interface FootCapProps {
  pipeRadius: number
}

/** Rubberen/kunststof voetdop op buiseinde (binnenopstelling) — dop om de buis, rek staat los op de vloer. */
export function FootCapFitting({ pipeRadius }: FootCapProps) {
  const capR = pipeRadius * 1.25
  const capH = pipeRadius * 2.2
  const rubber = { color: '#23262a', roughness: 0.95, metalness: 0.02 }

  return (
    <group>
      {/* Huls om het buiseinde */}
      <mesh position={[0, capH / 2, 0]}>
        <cylinderGeometry args={[capR, capR * 1.08, capH, 20]} />
        <meshStandardMaterial {...rubber} />
      </mesh>
      {/* Iets bredere anti-slip zool op de vloer */}
      <mesh position={[0, pipeRadius * 0.15, 0]}>
        <cylinderGeometry args={[capR * 1.12, capR * 1.18, pipeRadius * 0.3, 20]} />
        <meshStandardMaterial {...rubber} />
      </mesh>
    </group>
  )
}

interface FootPlateProps {
  pipeRadius: number
  mat: FittingMaterialProps
  square?: boolean
}

export function FootPlateFitting({ pipeRadius, mat, square = false }: FootPlateProps) {
  const outerR = pipeRadius * 1.58
  const plateR = pipeRadius * 4.8
  const plateH = 0.008
  const socketLen = FITTING_HALF_LENGTH_M * 2

  return (
    <group>
      {/* Horizontale voetplaat op de grond */}
      <mesh position={[0, plateH / 2, 0]}>
        {square ? (
          <boxGeometry args={[plateR * 2, plateH, plateR * 2]} />
        ) : (
          <cylinderGeometry args={[plateR, plateR, plateH, 28]} />
        )}
        <meshStandardMaterial color={mat.body} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
      {/* Bevestigingsgaten */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * plateR * 0.62, plateH + 0.002, Math.sin(a) * plateR * 0.62]}
          >
            <cylinderGeometry args={[pipeRadius * 0.3, pipeRadius * 0.3, plateH + 0.004, 10]} />
            <meshStandardMaterial color="#3a4048" metalness={0.55} roughness={0.45} />
          </mesh>
        )
      })}
      {/* Verticale klem op de plaat */}
      <mesh position={[0, plateH + socketLen / 2, 0]}>
        <cylinderGeometry args={[outerR, outerR * 0.98, socketLen, 20]} />
        <meshStandardMaterial color={mat.body} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
    </group>
  )
}

function accessoryOrientation(pipeAxis: Vector3, hingeAxis: Vector3): Quaternion {
  const ay = pipeAxis.clone().normalize()
  const ax = hingeAxis.clone().normalize()
  let z = new Vector3().crossVectors(ax, ay)
  if (z.lengthSq() < 1e-8) {
    const ref = Math.abs(ay.y) < 0.85 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
    z = new Vector3().crossVectors(ax, ref)
  }
  z.normalize()
  const axOrtho = new Vector3().crossVectors(ay, z).normalize()
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(axOrtho, ay, z))
}

interface HingeAccessoryProps {
  pipeAxis: Vector3
  hingeAxis: Vector3
  pipeRadius: number
  mat: FittingMaterialProps
  /** Bij een dubbelscharnier deelt dit oog de klem met een ander oog. */
  hideSleeve?: boolean
}

/**
 * Scharnieroog (vrouw) — klem op buis + oogplaat naar het penpunt. `hingeAxis`
 * wijst naar het penpunt (op de span-as). De klemhuls verschuift langs de
 * framebuis zodat het penpunt loodrecht vóór het midden van de klem ligt.
 */
export function SwivelEyeAccessory({ pipeAxis, hingeAxis, pipeRadius, mat, hideSleeve = false }: HingeAccessoryProps) {
  const outerR = pipeRadius * 1.58
  const sleeveLen = pipeRadius * 4.6
  const orient = useMemo(() => accessoryOrientation(pipeAxis, hingeAxis), [pipeAxis, hingeAxis])
  const matProps = useMemo(
    () => ({ color: mat.body, roughness: mat.roughness, metalness: mat.metalness }),
    [mat],
  )

  // Penpunt in lokale coördinaten (moet overeenkomen met hingePinReach).
  // pinX = loodrechte afstand tot de framebuis, pinY = verschuiving langs de buis.
  const { pinX, pinY } = useMemo(() => {
    const reach = pipeRadius * 1.58 * 1.35
    const pin = hingeAxis
      .clone()
      .normalize()
      .multiplyScalar(reach)
      .applyQuaternion(orient.clone().invert())
    return { pinX: pin.x, pinY: pin.y }
  }, [hingeAxis, orient, pipeRadius])

  return (
    <group quaternion={orient}>
      {/* Klem — gecentreerd op de hoogte van het penpunt */}
      {!hideSleeve && (
        <group position={[0, pinY, 0]}>
          <mesh>
            <cylinderGeometry args={[outerR, outerR * 0.98, sleeveLen, 20]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 6]} position={[-outerR * 1.05, 0, 0]}>
            <cylinderGeometry args={[outerR * 0.17, outerR * 0.17, outerR * 0.12, 6]} />
            <meshStandardMaterial color={mat.bolt} metalness={0.9} roughness={0.18} />
          </mesh>
        </group>
      )}
      {/* Oogplaat — loodrecht uit het midden van de klem naar het penpunt */}
      <mesh position={[(outerR * 0.4 + pinX) / 2, pinY, 0]}>
        <boxGeometry args={[Math.max(pinX - outerR * 0.4, outerR * 0.3), outerR * 1.2, outerR * 0.5]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
      {/* Oogring met gat, om het penpunt */}
      <mesh position={[pinX, pinY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[outerR * 0.6, outerR * 0.6, outerR * 0.5, 16]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
      <mesh position={[pinX, pinY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[outerR * 0.26, outerR * 0.26, outerR * 0.56, 12]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.5} roughness={0.6} />
      </mesh>
    </group>
  )
}

/**
 * Scharnierhuls — huls op het uiteinde van de verbindingsbuis die in het
 * verlengde van de buis overgaat in een vork om de oogplaat, met de pen als
 * draaipunt. `pipeAxis` wijst het buislichaam in; `hingeAxis` wijst van het
 * penpunt af (tegengesteld aan het oog).
 */
export function SwivelHulsAccessory({ pipeAxis, hingeAxis, pipeRadius, mat }: HingeAccessoryProps) {
  const outerR = pipeRadius * 1.58
  const forkLen = outerR * 1.4
  const socketLen = pipeRadius * 3.6
  const orient = useMemo(() => accessoryOrientation(pipeAxis, hingeAxis), [pipeAxis, hingeAxis])
  const matProps = useMemo(
    () => ({ color: mat.body, roughness: mat.roughness, metalness: mat.metalness }),
    [mat],
  )

  // Penpunt ligt óp de span-as (op `reach` van het knooppunt), dus vork,
  // overgang en huls liggen allemaal recht in het verlengde van de buis.
  const { pinY, sleeveStartY } = useMemo(() => {
    const reach = pipeRadius * 1.58 * 1.35
    return { pinY: reach, sleeveStartY: reach + forkLen }
  }, [pipeRadius, forkLen])

  return (
    <group quaternion={orient}>
      {/* Vork: ogen om de pen + platen recht omhoog naar de huls-voet */}
      <group position={[0, pinY, 0]}>
        {[1, -1].map((s) => (
          <mesh key={`ring${s}`} position={[0, 0, s * outerR * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[outerR * 0.55, outerR * 0.55, outerR * 0.28, 14]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
        ))}
        {[1, -1].map((s) => (
          <mesh key={`plate${s}`} position={[0, forkLen * 0.5, s * outerR * 0.5]}>
            <boxGeometry args={[outerR * 1.05, forkLen, outerR * 0.28]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
        ))}
      </group>
      {/* Overgang vork → huls, op de buis-as */}
      <mesh position={[0, sleeveStartY + outerR * 0.25, 0]}>
        <cylinderGeometry args={[outerR * 0.98, outerR * 0.82, outerR * 0.5, 18]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
      {/* Huls waar de buis in schuift — exact in het verlengde van de buis */}
      <mesh position={[0, sleeveStartY + outerR * 0.5 + socketLen / 2, 0]}>
        <cylinderGeometry args={[outerR, outerR * 0.98, socketLen, 20]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
      {/* Borgbout op de huls */}
      <mesh
        rotation={[0, 0, Math.PI / 6]}
        position={[outerR * 1.02, sleeveStartY + outerR * 0.5 + socketLen * 0.62, 0]}
      >
        <cylinderGeometry args={[outerR * 0.17, outerR * 0.17, outerR * 0.12, 6]} />
        <meshStandardMaterial color={mat.bolt} metalness={0.9} roughness={0.18} />
      </mesh>
    </group>
  )
}

interface HingePinProps {
  radius: number
  /** Pen-as (door het ooggat) — cross van scharnier-as en buis-as van het oog. */
  axis?: Vector3
}

export function HingePinMesh({ radius, axis }: HingePinProps) {
  const quat = useMemo(
    () => (axis && axis.lengthSq() > 1e-8 ? quatFromAxis(UP, axis.clone().normalize()) : null),
    [axis],
  )
  return (
    <group quaternion={quat ?? undefined} rotation={quat ? undefined : [Math.PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[radius * 0.22, radius * 0.22, radius * 2.4, 10]} />
        <meshStandardMaterial color="#8a9098" metalness={0.88} roughness={0.22} />
      </mesh>
      {/* Penkop */}
      <mesh position={[0, radius * 1.2, 0]}>
        <cylinderGeometry args={[radius * 0.34, radius * 0.34, radius * 0.16, 10]} />
        <meshStandardMaterial color="#8a9098" metalness={0.88} roughness={0.22} />
      </mesh>
    </group>
  )
}
