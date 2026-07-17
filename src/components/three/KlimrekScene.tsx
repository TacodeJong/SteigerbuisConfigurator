import { useMemo } from 'react'
import { MOUSE } from 'three'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import type { KlimrekConfig, SceneModel } from '../../types'
import { MATERIALS } from '../../data/catalog'
import { configEnvironment } from '../../lib/environment'
import { configDimensionMode } from '../../lib/dimensions'
import { trimPipesAtFittings } from '../../lib/pipeTrim'
import { FootprintOutline } from './FootprintOutline'
import { SceneEnvironment } from './SceneEnvironment'
import { GroundAnchor } from './GroundAnchor'
import { PipeMesh } from './PipeMesh'
import { FittingMesh } from './FittingMesh'
import { PlankMesh } from './PlankMesh'
import { PlankMountMesh } from './PlankMountMesh'

interface KlimrekSceneProps {
  scene: SceneModel
  config?: Pick<
    KlimrekConfig,
    | 'width'
    | 'depth'
    | 'diameter'
    | 'dimensionMode'
    | 'baseType'
    | 'anchorDepthMm'
    | 'environment'
  >
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
      <SceneEnvironment
        environment={config ? configEnvironment(config) : 'buiten'}
        size={Math.max(bounds.maxXZ * 4, 24)}
        onClick={() => interactive && onSelect(null)}
      />

      {config && <GroundAnchor scene={scene} config={config} />}

      <FootprintOutline
        pipes={scene.pipes}
        // Buitenmaat-modus: labels matchen de invoervelden. Buislengte-modus:
        // toon de echte footprint (L+Ø) die meegroeit met diameter.
        labelWidthMm={
          config && configDimensionMode(config) === 'buitenmaat' ? config.width : undefined
        }
        labelDepthMm={
          config && configDimensionMode(config) === 'buitenmaat' ? config.depth : undefined
        }
      />

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

      <group>
        {(scene.planks ?? []).map((plank) => (
          <PlankMesh
            key={plank.id}
            plank={plank}
            highlighted={highlightedIds?.has(plank.id) ?? false}
          />
        ))}
      </group>

      {/* Na fittings/planken zodat schapsteunen zichtbaar blijven op knooppunten. */}
      <group>
        {(scene.plankMounts ?? []).map((mount) => (
          <PlankMountMesh
            key={mount.id}
            mount={mount}
            materialId={scene.materialId}
            highlighted={highlightedIds?.has(mount.plankId) ?? false}
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
