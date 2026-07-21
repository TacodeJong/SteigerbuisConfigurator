import { useEffect, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { DoubleSide, Mesh, Vector3 } from 'three'

const FORWARD = new Vector3()
import type { ScenePipe, Vec3 } from '../../types'
import { keyboardModifiers, isToolPointer, pointerModifiers } from '../../lib/pointerModifiers'
import {
  distance,
  hingeSnapKindLabel,
  isValidHingeEnd,
  isValidHingeStart,
  resolveHingeDrawTarget,
  type SnapKind,
  type SnapResult,
} from '../../lib/snap'

interface HingeDrawToolProps {
  active: boolean
  start: Vec3 | null
  preview: SnapResult | null
  previewEnd: Vec3 | null
  pipes: ScenePipe[]
  onPoint: (result: SnapResult) => void
  onPreview: (result: SnapResult) => void
  onPlace: (preview?: SnapResult) => void
  onCancel: () => void
}

function HingeMarker({ kind, connected }: { kind: SnapKind; connected: boolean }) {
  const color = !connected ? '#e9c46a' : kind === 'endpoint' ? '#f4d35e' : '#9b5de5'
  const scale = 0.05
  return (
    <group>
      <mesh scale={scale}>
        <sphereGeometry args={[1, 14, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} scale={scale * 1.4}>
        <ringGeometry args={[0.85, 1.15, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

export function HingeDrawTool({
  active,
  start,
  preview,
  previewEnd,
  pipes,
  onPoint,
  onPreview,
  onPlace,
  onCancel,
}: HingeDrawToolProps) {
  const { camera } = useThree()
  const planeRef = useRef<Mesh>(null)
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const lastModifiers = useRef(false)

  // Vangvlak is scherm-gericht en ver áchter alle geometrie geplaatst, zodat het
  // alleen kliks opvangt die buizen/grond missen (elke hoek/omhoog), maar buizen
  // zelf niet occludeert.
  useFrame(() => {
    const m = planeRef.current
    if (!m) return
    camera.getWorldDirection(FORWARD)
    m.quaternion.copy(camera.quaternion)
    m.position.copy(camera.position).addScaledVector(FORWARD, 100)
  })

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter' && start) {
        e.preventDefault()
        onPlace()
        return
      }
      const precise = keyboardModifiers(e).precise
      if (precise === lastModifiers.current) return
      lastModifiers.current = precise
      if (lastPointer.current) {
        onPreview(resolveFromPointer(lastPointer.current, precise))
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [active, start, onCancel, onPlace, onPreview])

  const resolveFromPointer = (pointer: { x: number; y: number }, precise: boolean) => {
    const ndc = new Vector3(pointer.x, pointer.y, 0.5)
    ndc.unproject(camera)
    const origin = camera.position.clone()
    const direction = ndc.sub(camera.position).normalize()

    return resolveHingeDrawTarget({
      rayOrigin: [origin.x, origin.y, origin.z],
      rayDir: [direction.x, direction.y, direction.z],
      cameraPos: [origin.x, origin.y, origin.z],
      pipes,
      start,
      precise,
    })
  }

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!active) return
    if (!isToolPointer(event.nativeEvent)) return
    event.stopPropagation()
    const precise = pointerModifiers(event.nativeEvent).precise
    lastModifiers.current = precise
    const result = resolveFromPointer(event.pointer, precise)
    if (!start) {
      if (!isValidHingeStart(result)) return
      onPoint(result)
      return
    }
    if (isValidHingeEnd(result, start)) {
      onPlace(result)
    }
  }

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!active) return
    lastPointer.current = event.pointer
    const precise = pointerModifiers(event.nativeEvent).precise
    lastModifiers.current = precise
    onPreview(resolveFromPointer(event.pointer, precise))
  }

  if (!active) return null

  const hoverPoint = previewEnd ?? preview?.point ?? start
  const hoverKind = preview?.kind ?? 'segment'
  const hoverConnected = preview?.connected ?? !!start
  const previewValid = !!start && !!previewEnd && (!preview || isValidHingeEnd(preview, start))

  return (
    <>
      <mesh
        ref={planeRef}
        name="hinge-draw-plane"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <planeGeometry args={[2000, 2000]} />
        <meshBasicMaterial visible={false} side={DoubleSide} />
      </mesh>

      {hoverPoint && (
        <group position={hoverPoint}>
          <HingeMarker kind={hoverKind} connected={hoverConnected} />
          {!start && (
            <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
              <span className={`snap-label${hoverConnected ? '' : ' snap-label-warn'}`}>
                {hingeSnapKindLabel(hoverKind, hoverConnected)}
              </span>
            </Html>
          )}
        </group>
      )}

      {start && previewEnd && distance(start, previewEnd) > 0.01 && (
        <>
          <Line
            points={[start, previewEnd]}
            color={previewValid ? '#9b5de5' : '#e76f51'}
            lineWidth={2.5}
            dashed={!previewValid}
            dashSize={0.08}
            gapSize={0.05}
          />
          <group position={start}>
            <HingeMarker kind="endpoint" connected />
          </group>
          <group position={previewEnd}>
            <HingeMarker kind={preview?.connected ? preview.kind : 'axis'} connected={preview?.connected ?? false} />
          </group>
        </>
      )}
    </>
  )
}
