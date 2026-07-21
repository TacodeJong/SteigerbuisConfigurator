import { useLayoutEffect, useMemo, useRef } from 'react'
import { MOUSE, Vector3 } from 'three'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
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

/** Zet camera/orbit terug op het model na een grote maten-wissel (preset). */
function FrameCameraToBounds({
  maxY,
  minY,
  maxXZ,
  tight = false,
}: {
  maxY: number
  minY: number
  maxXZ: number
  /** Galerij-thumb: dichterbij inzoomen. */
  tight?: boolean
}) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as
    | { target: Vector3; update: () => void; maxDistance: number }
    | null
  const prev = useRef({ maxY: 0, maxXZ: 0 })

  useLayoutEffect(() => {
    const prevSpan = Math.max(prev.current.maxY, prev.current.maxXZ)
    const nextSpan = Math.max(maxY, maxXZ)
    const first = prev.current.maxY === 0 && prev.current.maxXZ === 0
    const changedALot =
      first || prevSpan < 0.01 || Math.abs(nextSpan - prevSpan) / prevSpan > 0.12
    prev.current = { maxY, maxXZ }
    if (!changedALot) return

    const targetY = (maxY + minY) / 2
    const dist = tight
      ? Math.max(maxXZ * 1.85, (maxY - minY) * 1.25, 2.2)
      : Math.max(maxXZ * 2.6, (maxY - minY) * 1.6, 3.2)
    camera.position.set(dist * 0.72, targetY + dist * 0.42, dist * 0.95)
    camera.near = 0.05
    camera.far = Math.max(80, dist * 12)
    camera.updateProjectionMatrix()
    if (controls?.target) {
      controls.target.set(0, targetY, 0)
      controls.maxDistance = Math.max(maxXZ * 6, dist * 2.5)
      controls.update()
    } else {
      camera.lookAt(0, targetY, 0)
    }
  }, [camera, controls, maxY, minY, maxXZ, tight])

  return null
}

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
  /** Gallery/thumbnails: geen orbit, geen footprint-labels (sneller + static). */
  compact?: boolean
  /** Lichte preview (galerij detail): geen ContactShadows. Default: aan. */
  showContactShadows?: boolean
  /** Galerij-thumb: studio-achtergrond + strakkere camera. */
  studioThumb?: boolean
  /**
   * Footprint-maatlabels: `config` = Breedte/Diepte uit config (configurator buitenmaat),
   * `scene` = echte pipe-envelope via computeFootprint (editor / galerij / custom models).
   */
  footprintLabels?: 'config' | 'scene'
}

export function KlimrekScene({
  scene,
  config,
  selectedId,
  highlightedIds,
  interactive,
  onSelect,
  compact = false,
  showContactShadows = true,
  studioThumb = false,
  footprintLabels = 'config',
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

  const orbitTarget = useMemo(
    (): [number, number, number] => [0, (bounds.maxY + bounds.minY) / 2, 0],
    [bounds.maxY, bounds.minY],
  )
  const shadowKey = `${bounds.maxXZ.toFixed(2)}:${bounds.maxY.toFixed(2)}`

  return (
    <>
      <SceneEnvironment
        environment={config ? configEnvironment(config) : 'buiten'}
        size={Math.max(bounds.maxXZ * 4, 24)}
        onClick={() => interactive && onSelect(null)}
        studio={studioThumb}
      />

      {config && !studioThumb && <GroundAnchor scene={scene} config={config} />}

      {!compact && (
        <FootprintOutline
          pipes={scene.pipes}
          // Configurator (buitenmaat): labels = invoervelden. Galerij/custom:
          // altijd scene-envelope — config.width/depth is vaak nog default.
          labelWidthMm={
            footprintLabels === 'config' &&
            config &&
            configDimensionMode(config) === 'buitenmaat'
              ? config.width
              : undefined
          }
          labelDepthMm={
            footprintLabels === 'config' &&
            config &&
            configDimensionMode(config) === 'buitenmaat'
              ? config.depth
              : undefined
          }
        />
      )}

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

      {/* frames={1}: één shadow-pass per maten-wissel i.p.v. elke frame — minder GPU-druk bij presets. */}
      {showContactShadows && (
        <ContactShadows
          key={shadowKey}
          position={[0, 0, 0]}
          opacity={0.35}
          scale={Math.max(bounds.maxXZ * 3, 6)}
          blur={2}
          far={bounds.maxY + 1}
          resolution={compact ? 128 : 256}
          frames={1}
        />
      )}

      {!compact && (
        <OrbitControls
          makeDefault
          enablePan
          enableDamping
          dampingFactor={0.08}
          panSpeed={0.8}
          mouseButtons={{
            // Zelfde schema als Hand-tool / viewer: LMB draaien, Shift+sleep pannen;
            // middelste/rechter ook draaien (CAD-achtig).
            LEFT: MOUSE.ROTATE,
            MIDDLE: MOUSE.ROTATE,
            RIGHT: MOUSE.ROTATE,
          }}
          target={orbitTarget}
          minDistance={1}
          maxDistance={Math.max(bounds.maxXZ * 6, 8)}
          minPolarAngle={0}
          maxPolarAngle={Math.PI * 0.95}
        />
      )}

      <FrameCameraToBounds
        maxY={bounds.maxY}
        minY={bounds.minY}
        maxXZ={bounds.maxXZ}
        tight={studioThumb}
      />
    </>
  )
}
