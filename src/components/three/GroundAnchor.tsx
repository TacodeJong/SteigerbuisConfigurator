import type { KlimrekConfig } from '../../types'
import { orderedBarLengthMm } from '../../lib/scene'

const mm = (v: number) => v / 1000

interface GroundAnchorProps {
  config: Pick<KlimrekConfig, 'width' | 'depth' | 'baseType' | 'anchorDepthMm'>
}

/** Visualiseert betonpoeren onder hoekstaanders bij grondanker. */
export function GroundAnchor({ config }: GroundAnchorProps) {
  if (config.baseType !== 'grondanker' || config.anchorDepthMm <= 0) return null

  // Zelfde posities als de hoekstaanders in buildSceneFromConfig.
  const halfW = orderedBarLengthMm(config.width) / 2
  const halfD = orderedBarLengthMm(config.depth) / 2
  const depthM = mm(config.anchorDepthMm)
  const pitR = 0.09
  const pitH = depthM

  const corners: [number, number, number][] = [
    [-halfW, 0, -halfD],
    [halfW, 0, -halfD],
    [-halfW, 0, halfD],
    [halfW, 0, halfD],
  ].map(([x, , z]) => [mm(x), 0, mm(z)])

  return (
    <group>
      {corners.map(([x, , z], i) => (
        <mesh key={i} position={[x, -pitH / 2, z]}>
          <cylinderGeometry args={[pitR, pitR * 1.05, pitH, 16]} />
          <meshStandardMaterial color="#8a8f94" roughness={0.95} metalness={0.05} transparent opacity={0.55} />
        </mesh>
      ))}
      {/* Maaiveld-markering */}
      {corners.map(([x, , z], i) => (
        <mesh key={`ring-${i}`} position={[x, 0.003, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[pitR * 0.55, pitR * 0.72, 24]} />
          <meshStandardMaterial color="#6b5a45" roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}
