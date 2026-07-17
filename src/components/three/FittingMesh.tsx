import { useLayoutEffect, useMemo, useRef } from 'react'
import { Group, Mesh, Vector3 } from 'three'
import type { MaterialId, SceneFitting } from '../../types'
import { getFittingMaterial } from '../../lib/fittingMaterial'
import { FITTING_HALF_LENGTH_M } from '../../lib/pipeTrim'
import {
  Collar,
  Corner3WayFitting,
  CrossFitting,
  Elbow90Fitting,
  EndCapFitting,
  FootCapFitting,
  FootPlateFitting,
  FourWayFitting,
  SideOutletFitting,
  TeeFitting,
} from './fittingParts'

function mergeAxes(axes: Vector3[]): Vector3[] {
  const merged: Vector3[] = []
  for (const a of axes) {
    const n = a.clone().normalize()
    if (merged.some((m) => Math.abs(m.dot(n)) > 0.92)) continue
    merged.push(n)
  }
  return merged
}

interface FittingMeshProps {
  fitting: SceneFitting
  materialId: MaterialId
  pickable?: boolean
  highlighted?: boolean
}

export function FittingMesh({ fitting, materialId, pickable = true, highlighted = false }: FittingMeshProps) {
  const pipeR = fitting.diameterMm / 2000
  const mat = useMemo(() => getFittingMaterial(materialId), [materialId])
  const sleeveLen = FITTING_HALF_LENGTH_M * 2

  const pos = useMemo(() => new Vector3(...fitting.position), [fitting.position])
  const axisA = useMemo(() => new Vector3(...fitting.axisA), [fitting.axisA])
  const axisB = useMemo(
    () => (fitting.axisB ? new Vector3(...fitting.axisB) : null),
    [fitting.axisB],
  )
  const allAxes = useMemo(() => {
    if (fitting.axes?.length) {
      return mergeAxes(fitting.axes.map((a) => new Vector3(...a)))
    }
    const axes = [axisA.clone()]
    if (axisB) axes.push(axisB.clone())
    return mergeAxes(axes)
  }, [fitting.axes, axisA, axisB])

  const groupRef = useRef<Group>(null)

  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      if (!pickable) {
        mesh.userData._raycast = mesh.raycast
        mesh.raycast = () => undefined
      } else if (mesh.userData._raycast) {
        mesh.raycast = mesh.userData._raycast
        delete mesh.userData._raycast
      }
    })
  }, [pickable, fitting.id])

  const renderFitting = () => {
    switch (fitting.type) {
      case 'voetplaat-rond':
        return <FootPlateFitting pipeRadius={pipeR} mat={mat} />

      case 'afdekdop':
        return <EndCapFitting axis={axisA} pipeRadius={pipeR} mat={mat} />

      case 'voetdop':
        return <FootCapFitting pipeRadius={pipeR} />

      case 'koppelstuk':
        return <Collar axis={axisA} pipeRadius={pipeR} length={sleeveLen} mat={mat} boltCount={2} />

      case 'kniestuk-90':
        return (
          <Elbow90Fitting
            axisA={axisA}
            axisB={axisB ?? new Vector3(1, 0, 0)}
            pipeRadius={pipeR}
            sleeveLen={sleeveLen}
            mat={mat}
          />
        )

      case 't-kort':
        return (
          <TeeFitting
            through={axisA}
            branch={axisB ?? new Vector3(0, 0, 1)}
            pipeRadius={pipeR}
            sleeveLen={sleeveLen}
            mat={mat}
          />
        )

      case 't-lang':
        return (
          <TeeFitting
            through={axisA}
            branch={axisB ?? new Vector3(0, 0, 1)}
            pipeRadius={pipeR}
            sleeveLen={sleeveLen * 1.4}
            mat={mat}
          />
        )

      case 'voetplaat-vierkant':
        return <FootPlateFitting pipeRadius={pipeR} mat={mat} square />

      case '3-weg-hoek': {
        // axes bevat de ondertekende arm-richtingen (wijzen wég van de buizen).
        const rawArms = fitting.axes?.map((a) => new Vector3(...a)) ?? []
        return (
          <Corner3WayFitting
            arms={rawArms.length >= 3 ? rawArms : allAxes.slice(0, 3)}
            pipeRadius={pipeR}
            sleeveLen={sleeveLen}
            mat={mat}
          />
        )
      }

      case 'drieweg-kniestuk':
      case 'vierweg-kruisstuk': {
        // axes[0] = doorloop-as, rest = getekende (ondertekende) zij-uitgangen.
        const rawAxes = fitting.axes?.map((a) => new Vector3(...a)) ?? []
        const branches = rawAxes.length > 1 ? rawAxes.slice(1) : axisB ? [axisB] : []
        return (
          <SideOutletFitting
            through={axisA}
            branches={branches}
            pipeRadius={pipeR}
            sleeveLen={sleeveLen}
            mat={mat}
          />
        )
      }

      case 'kruisstuk': {
        if (allAxes.length >= 4) {
          return (
            <FourWayFitting
              axes={allAxes.slice(0, 4)}
              pipeRadius={pipeR}
              sleeveLen={sleeveLen}
              mat={mat}
            />
          )
        }
        return (
          <CrossFitting
            axisA={axisA}
            axisB={axisB ?? new Vector3(0, 0, 1)}
            pipeRadius={pipeR}
            sleeveLen={sleeveLen}
            mat={mat}
          />
        )
      }

      default:
        return <Collar axis={axisA} pipeRadius={pipeR} length={sleeveLen} mat={mat} />
    }
  }

  return (
    <group ref={groupRef} position={pos}>
      {renderFitting()}
      {highlighted && (
        <mesh scale={pipeR * 3.2}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshStandardMaterial color="#f4d35e" transparent opacity={0.32} emissive="#f4d35e" emissiveIntensity={0.4} />
        </mesh>
      )}
    </group>
  )
}
