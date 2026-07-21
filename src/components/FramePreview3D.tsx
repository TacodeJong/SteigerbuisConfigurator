import { Suspense, useCallback, useState } from 'react'
import { Canvas, type RootState } from '@react-three/fiber'
import type { KlimrekConfig, SceneModel } from '../types'
import { useContainerSize } from '../hooks/useContainerSize'
import { CameraControlsHint } from './CameraControlsHint'
import { KlimrekScene } from './three/KlimrekScene'

interface FramePreview3DProps {
  scene: SceneModel
  config?: KlimrekConfig
  selectedId?: string | null
  highlightedIds?: Set<string>
  interactive?: boolean
  onSelect?: (id: string | null) => void
  /**
   * Lichtere render (lagere dpr, geen shadows) — alleen voor embeds die
   * géén orbit-viewer zijn. Galerij-detail gebruikt dit niet: daar wil je
   * een volle interactieve preview met OrbitControls.
   */
  lightweight?: boolean
  /**
   * Footprint-labels: `config` (default) voor configurator-preview,
   * `scene` voor galerij/opgeslagen custom models (config-maten kloppen vaak niet).
   */
  footprintLabels?: 'config' | 'scene'
}

function Loader() {
  return <div className="canvas-loader">3D laden…</div>
}

/**
 * WebGL-context kan bij zware scene-updates (preset-wissel) verloren gaan.
 * Three.js probeert te herstellen; lukt dat niet, remounten we de Canvas.
 */
function useCanvasRecovery() {
  const [canvasKey, setCanvasKey] = useState(0)
  const onCreated = useCallback((state: RootState) => {
    const { gl } = state
    const canvas = gl.domElement
    const onLost = (event: Event) => {
      event.preventDefault()
      window.setTimeout(() => {
        if (gl.getContext().isContextLost()) {
          setCanvasKey((k) => k + 1)
        }
      }, 150)
    }
    canvas.addEventListener('webglcontextlost', onLost, false)
  }, [])
  return { canvasKey, onCreated }
}

export function FramePreview3D({
  scene,
  config,
  selectedId = null,
  highlightedIds,
  interactive = false,
  onSelect = () => {},
  lightweight = false,
  footprintLabels = 'config',
}: FramePreview3DProps) {
  const { ref, width, height } = useContainerSize()
  const { canvasKey, onCreated } = useCanvasRecovery()
  const ready = width > 0 && height > 0

  return (
    <div className="preview-3d">
      <div className="canvas-inner" ref={ref}>
        {ready ? (
          <Canvas
            key={canvasKey}
            shadows={!lightweight}
            camera={{ position: [3, 2.5, 4], fov: 45, near: 0.1, far: 100 }}
            gl={{
              antialias: true,
              powerPreference: lightweight ? 'default' : 'high-performance',
            }}
            dpr={lightweight ? [1, 1.5] : [1, 1.75]}
            style={{ width, height }}
            onCreated={onCreated}
          >
            {/* Suspense binnen Canvas: Text/font-load mag de WebGL-context niet unmounten. */}
            <Suspense fallback={null}>
              <KlimrekScene
                scene={scene}
                config={config}
                selectedId={selectedId}
                highlightedIds={highlightedIds}
                interactive={interactive}
                onSelect={onSelect}
                showContactShadows={!lightweight}
                footprintLabels={footprintLabels}
              />
            </Suspense>
          </Canvas>
        ) : (
          <Loader />
        )}
      </div>
      <div className="preview-hint" role="note">
        {interactive && (
          <p className="preview-hint-tool">Klik op een buis om te selecteren</p>
        )}
        <CameraControlsHint variant="viewer" />
      </div>
    </div>
  )
}
