import { useMemo } from 'react'
import type { KlimrekConfig, SceneModel } from '../../types'
import { computeAnchorHoles } from '../../lib/floorplan'

const mm = (v: number) => v / 1000

type AnchorConfig = Pick<
  KlimrekConfig,
  'width' | 'depth' | 'dimensionMode' | 'diameter' | 'baseType' | 'anchorDepthMm'
>

interface GroundAnchorProps {
  scene: SceneModel
  config: AnchorConfig
}

/** Visualiseert betonpoeren onder staanders bij grondanker — XZ uit scene-pipes. */
export function GroundAnchor({ scene, config }: GroundAnchorProps) {
  const holes = useMemo(() => computeAnchorHoles(scene, config), [scene, config])

  if (holes.length === 0) return null

  const pitH = mm(config.anchorDepthMm)
  const pitR = 0.09

  return (
    <group>
      {holes.map((h) => (
        <mesh key={h.id} position={[mm(h.xMm), -pitH / 2, mm(h.zMm)]}>
          <cylinderGeometry args={[pitR, pitR * 1.05, pitH, 16]} />
          <meshStandardMaterial color="#8a8f94" roughness={0.95} metalness={0.05} transparent opacity={0.55} />
        </mesh>
      ))}
      {/* Maaiveld-markering */}
      {holes.map((h) => (
        <mesh key={`ring-${h.id}`} position={[mm(h.xMm), 0.003, mm(h.zMm)]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[pitR * 0.55, pitR * 0.72, 24]} />
          <meshStandardMaterial color="#6b5a45" roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}
