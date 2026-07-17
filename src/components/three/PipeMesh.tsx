import { useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Mesh, Quaternion, Vector3 } from 'three'
import type { ScenePipe, Vec3 } from '../../types'
import type { PointerModifiers } from '../../lib/pointerModifiers'
import { pointerModifiers } from '../../lib/pointerModifiers'
import { snapToPipeCenterline } from '../../lib/snap'

const UP = new Vector3(0, 1, 0)

interface PipeMeshProps {
  pipe: ScenePipe
  color: string
  selected: boolean
  highlighted?: boolean
  interactive: boolean
  drawMode?: boolean
  hingeMode?: boolean
  moveMode?: boolean
  plankMode?: boolean
  onSelect?: (id: string, worldPosition: Vec3) => void
  onDrawClick?: (snapOnPipe: Vec3, pipeId: string, modifiers: PointerModifiers) => void
  onDrawHover?: (snapOnPipe: Vec3, pipeId: string, modifiers: PointerModifiers) => void
  onHingeClick?: (snapOnPipe: Vec3, pipeId: string, modifiers: PointerModifiers) => void
  onHingeHover?: (snapOnPipe: Vec3, pipeId: string, modifiers: PointerModifiers) => void
  onPlankClick?: (snapOnPipe: Vec3, pipeId: string, modifiers: PointerModifiers) => void
  onPlankHover?: (snapOnPipe: Vec3, pipeId: string, modifiers: PointerModifiers) => void
  onMoveStart?: (pipeId: string, grab: Vec3) => void
  onMoveDrag?: (rayOrigin: Vec3, rayDir: Vec3) => void
  onMoveEnd?: (rayOrigin: Vec3, rayDir: Vec3) => void
}

export function PipeMesh({
  pipe,
  color,
  selected,
  highlighted = false,
  interactive,
  drawMode = false,
  hingeMode = false,
  moveMode = false,
  plankMode = false,
  onSelect,
  onDrawClick,
  onDrawHover,
  onHingeClick,
  onHingeHover,
  onPlankClick,
  onPlankHover,
  onMoveStart,
  onMoveDrag,
  onMoveEnd,
}: PipeMeshProps) {
  const meshRef = useRef<Mesh>(null)

  const { position, quaternion, length, radius } = useMemo(() => {
    const start = new Vector3(...pipe.start)
    const end = new Vector3(...pipe.end)
    const dir = end.clone().sub(start)
    const len = dir.length()
    const mid = start.clone().add(end).multiplyScalar(0.5)
    const r = pipe.diameterMm / 2000

    const quat = new Quaternion()
    if (len > 0.0001) {
      quat.setFromUnitVectors(UP, dir.normalize())
    }

    return {
      position: mid,
      quaternion: quat,
      length: Math.max(len, 0.001),
      radius: r,
    }
  }, [pipe])

  const snapOnPipe = (p: { x: number; y: number; z: number }, precise?: boolean) =>
    snapToPipeCenterline([p.x, p.y, p.z], pipe, precise).point

  const mods = (e: ThreeEvent<PointerEvent>) => pointerModifiers(e.nativeEvent)

  // Teken/scharnier: op pointerDown reageren (vóór het grond-vlak) en propagatie stoppen,
  // zodat het onzichtbare grondvlak van de tool niet eerst een buis naar de grond plaatst.
  const handleActionDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || (!drawMode && !hingeMode && !plankMode)) return
    e.stopPropagation()
    const modifiers = mods(e)
    if (onDrawClick) {
      onDrawClick(snapOnPipe(e.point, modifiers.precise), pipe.id, modifiers)
      return
    }
    if (onHingeClick) {
      onHingeClick(snapOnPipe(e.point, modifiers.precise), pipe.id, modifiers)
      return
    }
    if (onPlankClick) {
      // Oppervlakte-hit (niet centerline): verticale planken bepalen hiermee
      // aan welke kant van de buis ze komen (offset = straal + half dikte).
      onPlankClick([e.point.x, e.point.y, e.point.z], pipe.id, modifiers)
    }
  }

  const handleSelectClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || drawMode || hingeMode || moveMode || plankMode) return
    e.stopPropagation()
    onSelect?.(pipe.id, [e.point.x, e.point.y, e.point.z])
  }

  const handleMoveDown = (e: ThreeEvent<PointerEvent>) => {
    if (!moveMode) return
    e.stopPropagation()
    ;(e.target as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.pointerId)
    document.body.style.cursor = 'grabbing'
    onMoveStart?.(pipe.id, [e.point.x, e.point.y, e.point.z])
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

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return
    e.stopPropagation()
    document.body.style.cursor = moveMode
      ? 'grab'
      : drawMode || hingeMode || plankMode
        ? 'crosshair'
        : 'pointer'
  }

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return
    const modifiers = mods(e)
    if (drawMode && onDrawHover) {
      e.stopPropagation()
      onDrawHover(snapOnPipe(e.point, modifiers.precise), pipe.id, modifiers)
      return
    }
    if (hingeMode && onHingeHover) {
      e.stopPropagation()
      onHingeHover(snapOnPipe(e.point, modifiers.precise), pipe.id, modifiers)
      return
    }
    if (plankMode && onPlankHover) {
      e.stopPropagation()
      onPlankHover([e.point.x, e.point.y, e.point.z], pipe.id, modifiers)
    }
  }

  const handlePointerOut = () => {
    document.body.style.cursor = 'default'
  }

  const actionMode = drawMode || hingeMode || plankMode
  const pickRadius = actionMode || moveMode ? radius * 3.2 : radius
  const pickHandlers = {
    onClick: handleSelectClick,
    onPointerDown: moveMode ? handleMoveDown : actionMode ? handleActionDown : undefined,
    onPointerUp: moveMode ? handleMoveUp : undefined,
    onPointerOver: handlePointerOver,
    onPointerMove: moveMode ? handleMoveMove : actionMode ? handlePointerMove : undefined,
    onPointerOut: handlePointerOut,
  }

  const emissive = selected || highlighted ? '#f4d35e' : '#000000'
  const emissiveIntensity = selected ? 0.25 : highlighted ? 0.4 : 0

  return (
    <group position={position} quaternion={quaternion}>
      {(actionMode || moveMode) && (
        <mesh {...pickHandlers}>
          <cylinderGeometry args={[pickRadius, pickRadius, length, 12]} />
          <meshStandardMaterial visible={false} />
        </mesh>
      )}
      <mesh ref={meshRef} {...(actionMode || moveMode ? {} : pickHandlers)}>
        <cylinderGeometry args={[radius, radius, length, 16]} />
        <meshStandardMaterial
          color={color}
          metalness={0.45}
          roughness={0.42}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
    </group>
  )
}
