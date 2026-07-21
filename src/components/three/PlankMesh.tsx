import { useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Matrix4, Quaternion, Vector3 } from 'three'
import type { ScenePlank, Vec3 } from '../../types'
import { resolvePlankPlane } from '../../lib/planks'
import { isToolPointer } from '../../lib/pointerModifiers'

/** Houtkleur met lichte nerf-variatie per plank (stabiel op basis van id). */
const WOOD_TINTS = ['#b3854d', '#a97c49', '#bd8f58', '#ab8050'] as const
/** Iets egalere, lichtere tint voor multiplexplaten. */
const PLATE_TINTS = ['#c4a574', '#b89660', '#d0b082', '#c9a86e'] as const

/** Minimale pick-hoogte (m) zodat buizen met vergrote move-hitbox de plank niet stelen. */
const MIN_PICK_HEIGHT_M = 0.1

function woodTint(id: string, plate: boolean): string {
  const palette = plate ? PLATE_TINTS : WOOD_TINTS
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return palette[Math.abs(hash) % palette.length]
}

/**
 * Lokaal: X = lengte, Y = dikte, Z = breedte (xz) of hoogte (xy/yz).
 *
 * Oriëntatie volgt `plane` (niet alleen axis): anders kunnen XY en YZ dezelfde
 * normale (±Z) krijgen wanneer de lengte-as verkeerd/ambigu is.
 * - xz: dikte = wereld-Y (liggend)
 * - xy: lengte ±X, dikte ±Z (voor/achter-wand)
 * - yz: lengte ±Z, dikte ±X (linker/rechter-wand) — haaks op xy
 */
function plankQuaternion(plank: ScenePlank): Quaternion {
  const plane = resolvePlankPlane(plank)
  const up = new Vector3(0, 1, 0)

  if (plane === 'xz') {
    const x = new Vector3(plank.axis[0], 0, plank.axis[2])
    if (x.lengthSq() < 1e-12) x.set(1, 0, 0)
    else x.normalize()
    const z = new Vector3().crossVectors(x, up).normalize()
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, up, z))
  }

  // Verticaal: local X = lengte in vlak, local Z = omhoog, local Y = dikte/normaal.
  const x =
    plane === 'yz'
      ? new Vector3(0, 0, plank.axis[2] >= 0 ? 1 : -1)
      : new Vector3(plank.axis[0] >= 0 ? 1 : -1, 0, 0)
  const y = new Vector3().crossVectors(up, x)
  if (y.lengthSq() < 1e-12) y.set(plane === 'yz' ? 1 : 0, 0, plane === 'yz' ? 0 : -1)
  else y.normalize()
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, up))
}

interface PlankMeshProps {
  plank: ScenePlank
  selected?: boolean
  highlighted?: boolean
  /** Klikbaar voor selectie (select-tool). */
  pickable?: boolean
  /** Semi-transparante teken-preview. */
  ghost?: boolean
  moveMode?: boolean
  onSelect?: (id: string, worldPosition: Vec3) => void
  onMoveStart?: (id: string, grab: Vec3) => void
  onMoveDrag?: (rayOrigin: Vec3, rayDir: Vec3) => void
  onMoveEnd?: (rayOrigin: Vec3, rayDir: Vec3) => void
}

export function PlankMesh({
  plank,
  selected = false,
  highlighted = false,
  pickable = false,
  ghost = false,
  moveMode = false,
  onSelect,
  onMoveStart,
  onMoveDrag,
  onMoveEnd,
}: PlankMeshProps) {
  const plane = resolvePlankPlane(plank)
  const quaternion = useMemo(() => plankQuaternion(plank), [plank, plane])
  const color = ghost ? '#c9a06a' : woodTint(plank.id, plank.kind === 'plate')

  // Lokaal: X = lengte, Y = dikte, Z = breedte (xz) of hoogte (xy/yz).
  const size: [number, number, number] = [
    plank.lengthMm / 1000,
    plank.thicknessMm / 1000,
    plank.widthMm / 1000,
  ]

  const interactive = pickable || moveMode
  const pickH = Math.max(size[1], MIN_PICK_HEIGHT_M)
  const pickSize: [number, number, number] = [size[0], pickH, size[2]]

  const handleSelectClick = (e: ThreeEvent<MouseEvent>) => {
    if (!pickable || moveMode || !onSelect) return
    if (!isToolPointer(e.nativeEvent)) return
    e.stopPropagation()
    onSelect(plank.id, [e.point.x, e.point.y, e.point.z])
  }

  const handleMoveDown = (e: ThreeEvent<PointerEvent>) => {
    if (!moveMode) return
    if (!isToolPointer(e.nativeEvent)) return
    e.stopPropagation()
    ;(e.target as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.pointerId)
    document.body.style.cursor = 'grabbing'
    onMoveStart?.(plank.id, [e.point.x, e.point.y, e.point.z])
  }

  const handleMoveMove = (e: ThreeEvent<PointerEvent>) => {
    if (!moveMode) return
    e.stopPropagation()
    const r = e.ray
    onMoveDrag?.([r.origin.x, r.origin.y, r.origin.z], [r.direction.x, r.direction.y, r.direction.z])
  }

  const handleMoveUp = (e: ThreeEvent<PointerEvent>) => {
    if (!moveMode) return
    e.stopPropagation()
    ;(e.target as Element & { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(e.pointerId)
    document.body.style.cursor = 'grab'
    const r = e.ray
    onMoveEnd?.([r.origin.x, r.origin.y, r.origin.z], [r.direction.x, r.direction.y, r.direction.z])
  }

  const emissive = selected || highlighted ? '#f4d35e' : '#000000'
  const emissiveIntensity = selected ? 0.3 : highlighted ? 0.4 : 0

  const pickHandlers = interactive
    ? {
        onClick: pickable && !moveMode ? handleSelectClick : undefined,
        onPointerDown: moveMode ? handleMoveDown : undefined,
        onPointerMove: moveMode ? handleMoveMove : undefined,
        onPointerUp: moveMode ? handleMoveUp : undefined,
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          document.body.style.cursor = moveMode ? 'grab' : 'pointer'
        },
        onPointerOut: () => {
          document.body.style.cursor = 'default'
        },
      }
    : undefined

  return (
    <group position={plank.position} quaternion={quaternion}>
      {interactive && (
        <mesh position={[0, (pickH - size[1]) / 2, 0]} {...pickHandlers}>
          <boxGeometry args={pickSize} />
          <meshBasicMaterial visible={false} depthWrite={false} />
        </mesh>
      )}
      <mesh castShadow={!ghost} receiveShadow={false} raycast={() => undefined}>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          roughness={0.85}
          metalness={0.05}
          transparent={ghost}
          opacity={ghost ? 0.55 : 1}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
      {!ghost && (
        <mesh
          position={[0, size[1] / 2 + 0.0005, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => undefined}
        >
          <planeGeometry args={[size[0] * 0.96, size[2] * 0.9]} />
          <meshStandardMaterial color="#7d5a33" roughness={0.95} metalness={0} transparent opacity={0.22} />
        </mesh>
      )}
    </group>
  )
}
