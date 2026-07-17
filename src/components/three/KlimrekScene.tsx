import { useMemo } from 'react'
import { MOUSE } from 'three'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import type { KlimrekConfig, SceneModel } from '../../types'
import { MATERIALS } from '../../data/catalog'
import { trimPipesAtFittings } from '../../lib/pipeTrim'
import { FootprintOutline } from './FootprintOutline'
import { GrassGround, SKY_BACKGROUND } from './GrassGround'
import { GroundAnchor } from './GroundAnchor'
import { PipeMesh } from './PipeMesh'
import { FittingMesh } from './FittingMesh'

interface KlimrekSceneProps {
  scene: SceneModel
  config?: Pick<KlimrekConfig, 'width' | 'depth' | 'baseType' | 'anchorDepthMm'>
  selectedId: string | null
  highlightedIds?: Set<string>
  interactive: boolean
  onSelect: (id: string | null) => void
}

export function KlimrekScene({
  scene,
  config,
  selectedId,
  highlightedIds,
  interactive,
  onSelect,
}: KlimrekSceneProps) {
  const color = useMemo(() => {
    const material = MATERIALS.find((m) => m.id === scene.materialId)
    return material?.color ?? '#3d6b4f'
  }, [scene.materialId])

  const trimmedPipes = useMemo(
    () => trimPipesAtFittings(scene.pipes, scene.fittings),
    [scene.pipes, scene.fittings],
  )

  const bounds = useMemo(() => {
    let maxY = 1
    let minY = 0
    let maxXZ = 1
    for (const p of scene.pipes) {
      maxY = Math.max(maxY, p.start[1], p.end[1])
      minY = Math.min(minY, p.start[1], p.end[1])
      maxXZ = Math.max(
        maxXZ,
        Math.abs(p.start[0]),
        Math.abs(p.end[0]),
        Math.abs(p.start[2]),
        Math.abs(p.end[2]),
      )
    }
    return { maxY, minY, maxXZ }
  }, [scene.pipes])

  return (
    <>
      <color attach="background" args={[SKY_BACKGROUND]} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[5, 8, 4]} intensity={1.1} castShadow />
      <directionalLight position={[-4, 3, -3]} intensity={0.35} />

      <GrassGround
        size={Math.max(bounds.maxXZ * 4, 24)}
        onClick={() => interactive && onSelect(null)}
      />

      {config && <GroundAnchor config={config} />}

      <FootprintOutline pipes={scene.pipes} />

      <group>
        {trimmedPipes.map((p) => (
          <PipeMesh
            key={p.id}
            pipe={p}
            color={color}
            selected={selectedId === p.id}
            highlighted={highlightedIds?.has(p.id) ?? false}
            interactive={interactive}
            onSelect={interactive ? (id) => onSelect(id) : undefined}
          />
        ))}
      </group>

      <group>
        {scene.fittings.map((f) => (
          <FittingMesh
            key={f.id}
            fitting={f}
            materialId={scene.materialId}
            highlighted={highlightedIds?.has(f.id) ?? false}
          />
        ))}
      </group>

      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.35}
        scale={bounds.maxXZ * 3}
        blur={2}
        far={bounds.maxY + 1}
      />

      <OrbitControls
        makeDefault
        enablePan
        enableDamping
        dampingFactor={0.08}
        panSpeed={0.8}
        mouseButtons={{
          LEFT: MOUSE.ROTATE,
          MIDDLE: MOUSE.PAN,
          RIGHT: MOUSE.PAN,
        }}
        target={[0, (bounds.maxY + bounds.minY) / 2, 0]}
        minDistance={1}
        maxDistance={bounds.maxXZ * 6}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </>
  )
}
