import { useEffect, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { DoubleSide, Mesh, Vector3 } from 'three'

const FORWARD = new Vector3()
import type { ScenePipe, Vec3 } from '../../types'
import { keyboardModifiers, pointerModifiers, type PointerModifiers } from '../../lib/pointerModifiers'
import {
  distance,
  isValidDrawEnd,
  isValidDrawStart,
  resolveDrawTarget,
  type SnapKind,
  type SnapResult,
  snapKindLabel,
} from '../../lib/snap'

interface DrawPipeToolProps {
  active: boolean
  start: Vec3 | null
  startPipeId?: string | null
  groundY?: number
  preview: SnapResult | null
  previewEnd: Vec3 | null
  pipes: ScenePipe[]
  onPoint: (result: SnapResult) => void
  onPreview: (result: SnapResult) => void
  onPlace: (preview?: SnapResult) => void
  onCancel: () => void
}

function SnapMarker({ kind, connected }: { kind: SnapKind; connected: boolean }) {
  const color =
    kind === 'ground'
      ? '#8b6914'
      : !connected
        ? '#74c0fc'
        : kind === 'endpoint'
          ? '#f4d35e'
          : kind === 'segment'
            ? '#52b788'
            : '#74c0fc'
  const scale = kind === 'endpoint' || kind === 'ground' ? 0.055 : 0.045
  return (
    <group>
      <mesh scale={scale}>
        <sphereGeometry args={[1, 14, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} scale={scale * 1.35}>
        <ringGeometry args={[0.85, 1.15, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
    </group>
  )
}

export function DrawPipeTool({
  active,
  start,
  startPipeId = null,
  groundY = 0,
  preview,
  previewEnd,
  pipes,
  onPoint,
  onPreview,
  onPlace,
  onCancel,
}: DrawPipeToolProps) {
  const { camera } = useThree()
  const planeRef = useRef<Mesh>(null)
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const lastModifiers = useRef<PointerModifiers>({ free: false, precise: false })

  // Vangvlak is scherm-gericht en ver áchter alle geometrie geplaatst, zodat het
  // alleen kliks opvangt die buizen/grond missen (elke richting, ook de lucht),
  // maar buizen zelf niet occludeert.
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
      const modifiers = keyboardModifiers(e)
      const prev = lastModifiers.current
      if (modifiers.free === prev.free && modifiers.precise === prev.precise) return
      lastModifiers.current = modifiers
      if (lastPointer.current) {
        onPreview(resolveFromPointer(lastPointer.current, modifiers))
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [active, start, onCancel, onPlace, onPreview])

  const resolveFromPointer = (pointer: { x: number; y: number }, modifiers: PointerModifiers) => {
    const ndc = new Vector3(pointer.x, pointer.y, 0.5)
    ndc.unproject(camera)
    const origin = camera.position.clone()
    const direction = ndc.sub(camera.position).normalize()

    return resolveDrawTarget({
      rayOrigin: [origin.x, origin.y, origin.z],
      rayDir: [direction.x, direction.y, direction.z],
      cameraPos: [origin.x, origin.y, origin.z],
      pipes,
      start,
      startPipeId,
      free: modifiers.free,
      precise: modifiers.precise,
      groundY,
    })
  }

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!active) return
    event.stopPropagation()
    const modifiers = pointerModifiers(event.nativeEvent)
    lastModifiers.current = modifiers
    const result = resolveFromPointer(event.pointer, modifiers)
    if (!start) {
      if (!isValidDrawStart(result)) return
      onPoint(result)
      return
    }
    if (isValidDrawEnd(result, start)) {
      onPlace(result)
      return
    }
  }

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!active) return
    lastPointer.current = event.pointer
    const modifiers = pointerModifiers(event.nativeEvent)
    lastModifiers.current = modifiers
    onPreview(resolveFromPointer(event.pointer, modifiers))
  }

  if (!active) return null

  const hoverPoint = previewEnd ?? preview?.point ?? start
  const hoverKind = preview?.kind ?? (start ? 'axis' : 'ground')
  const hoverConnected = preview?.connected ?? !!start

  const previewValid =
    !!start && !!previewEnd && (!preview || isValidDrawEnd(preview, start) || preview.kind === 'axis')

  return (
    <>
      <mesh
        ref={planeRef}
        name="draw-plane"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <planeGeometry args={[2000, 2000]} />
        <meshBasicMaterial visible={false} side={DoubleSide} />
      </mesh>

      {hoverPoint && (
        <group position={hoverPoint}>
          <SnapMarker kind={hoverKind} connected={hoverConnected} />
          {!start && (
            <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
              <span className={`snap-label${hoverConnected ? '' : ' snap-label-warn'}`}>
                {snapKindLabel(hoverKind, hoverConnected, preview?.axis)}
              </span>
            </Html>
          )}
        </group>
      )}

      {start && previewEnd && distance(start, previewEnd) > 0.01 && (
        <>
          <Line
            points={[start, previewEnd]}
            color={previewValid ? '#2d6a4f' : '#e76f51'}
            lineWidth={2.5}
            dashed={!previewValid}
            dashSize={0.08}
            gapSize={0.05}
          />
          <group position={start}>
            <SnapMarker kind="endpoint" connected />
          </group>
          <group position={previewEnd}>
            <SnapMarker kind={preview?.connected ? preview.kind : 'axis'} connected={preview?.connected ?? false} />
          </group>
        </>
      )}
    </>
  )
}
