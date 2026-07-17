import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import type { KlimrekConfig, SceneModel } from '../types'
import { KlimrekScene } from './three/KlimrekScene'

interface FramePreview3DProps {
  scene: SceneModel
  config?: KlimrekConfig
  selectedId?: string | null
  highlightedIds?: Set<string>
  interactive?: boolean
  onSelect?: (id: string | null) => void
}

function Loader() {
  return <div className="canvas-loader">3D laden…</div>
}

export function FramePreview3D({
  scene,
  config,
  selectedId = null,
  highlightedIds,
  interactive = false,
  onSelect = () => {},
}: FramePreview3DProps) {
  return (
    <div className="preview-3d">
      <Suspense fallback={<Loader />}>
        <div className="canvas-inner">
          <Canvas
            shadows
            camera={{ position: [3, 2.5, 4], fov: 45, near: 0.1, far: 100 }}
            gl={{ antialias: true }}
          >
            <KlimrekScene
              scene={scene}
              config={config}
              selectedId={selectedId}
              highlightedIds={highlightedIds}
              interactive={interactive}
              onSelect={onSelect}
            />
          </Canvas>
        </div>
      </Suspense>
      <p className="preview-hint">
        {interactive
          ? 'Klik op een buis om te selecteren · Sleep om te draaien · Scroll om te zoomen'
          : 'Sleep om te draaien · Scroll om te zoomen'}
      </p>
    </div>
  )
}
