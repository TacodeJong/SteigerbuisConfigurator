import { useLayoutEffect, useMemo, useRef } from 'react'
import { Group, Mesh, Vector3 } from 'three'
import type { HingeConnection, MaterialId, PipeAccessory } from '../../types'
import { accessoryConnectPoint, hingeConnectionHulsId } from '../../lib/accessories'
import { getFittingMaterial } from '../../lib/fittingMaterial'
import { HingePinMesh, SwivelEyeAccessory, SwivelHulsAccessory } from './fittingParts'

interface AccessoryMeshProps {
  accessory: PipeAccessory
  materialId: MaterialId
  selected?: boolean
  highlighted?: boolean
  pickable?: boolean
  /** Oog op een gedeelde dubbelscharnier-klem: klemhuls niet dubbel tekenen. */
  hideSleeve?: boolean
  onSelect?: (id: string, worldPosition: [number, number, number]) => void
}

export function AccessoryMesh({
  accessory,
  materialId,
  selected = false,
  highlighted = false,
  pickable = true,
  hideSleeve = false,
  onSelect,
}: AccessoryMeshProps) {
  const pipeR = accessory.diameterMm / 2000
  const mat = useMemo(() => getFittingMaterial(materialId), [materialId])
  const pos = useMemo(() => new Vector3(...accessory.position), [accessory.position])
  const pipeAxis = useMemo(() => new Vector3(...accessory.pipeAxis), [accessory.pipeAxis])
  const hingeAxis = useMemo(() => new Vector3(...accessory.hingeAxis), [accessory.hingeAxis])
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
  }, [pickable, accessory.id])

  const handleClick = (e: { stopPropagation: () => void; point: { x: number; y: number; z: number } }) => {
    if (!pickable || !onSelect) return
    e.stopPropagation()
    onSelect(accessory.id, [e.point.x, e.point.y, e.point.z])
  }

  return (
    <group
      ref={groupRef}
      position={pos}
      onClick={handleClick}
      onPointerOver={() => {
        if (pickable) document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      {accessory.type === 'scharnieroog' ? (
        <SwivelEyeAccessory
          pipeAxis={pipeAxis}
          hingeAxis={hingeAxis}
          pipeRadius={pipeR}
          mat={mat}
          hideSleeve={hideSleeve}
        />
      ) : (
        <SwivelHulsAccessory pipeAxis={pipeAxis} hingeAxis={hingeAxis} pipeRadius={pipeR} mat={mat} />
      )}
      {(selected || highlighted) && (
        <mesh scale={pipeR * 3.5}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshStandardMaterial
            color="#f4d35e"
            transparent
            opacity={selected ? 0.35 : 0.32}
            emissive="#f4d35e"
            emissiveIntensity={selected ? 0.3 : 0.4}
          />
        </mesh>
      )}
    </group>
  )
}

interface HingeConnectionMeshesProps {
  accessories: PipeAccessory[]
  connections: HingeConnection[]
}

export function HingeConnectionMeshes({ accessories, connections }: HingeConnectionMeshesProps) {
  return (
    <>
      {connections.map((conn) => {
        const eye = accessories.find((a) => a.id === conn.eyeId)
        const huls = accessories.find((a) => a.id === hingeConnectionHulsId(conn))
        if (!eye || !huls) return null
        const p = accessoryConnectPoint(eye)
        const r = eye.diameterMm / 2000
        // Pen-as staat loodrecht op scharnier-as en buis-as van het oog.
        const pinAxis = new Vector3(...eye.hingeAxis).cross(new Vector3(...eye.pipeAxis))
        return (
          <group key={conn.id} position={p}>
            <HingePinMesh radius={r} axis={pinAxis} />
          </group>
        )
      })}
    </>
  )
}
