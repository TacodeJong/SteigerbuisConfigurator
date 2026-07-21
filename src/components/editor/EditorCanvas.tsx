import { Suspense, useCallback, useState } from 'react'
import { Canvas, type RootState } from '@react-three/fiber'
import type { EditorSelection, EditorTool, KlimrekConfig, SceneModel } from '../../types'
import type { PlankPlane } from '../../lib/planks'
import { useContainerSize } from '../../hooks/useContainerSize'
import { CameraControlsHint } from '../CameraControlsHint'
import { EditorScene, type DrawUiState } from '../three/EditorScene'
import { ViewportCaptureBridge } from '../three/ViewportCaptureBridge'
import { EditorToolbar } from './EditorToolbar'

interface EditorCanvasProps {
  scene: SceneModel
  config: KlimrekConfig
  tool: EditorTool
  selection: EditorSelection | null
  highlightedIds?: Set<string>
  plankPlane?: PlankPlane
  /** Admin-flag: toon plank-tool. */
  planksEnabled?: boolean
  onSceneChange: (scene: SceneModel) => void
  onSelectionChange: (selection: EditorSelection | null) => void
  onToolChange: (tool: EditorTool) => void
  onPlankPlaneChange?: (plane: PlankPlane) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  onDelete: () => void
  onReset: () => void
  onDrawUiChange?: (ui: DrawUiState | null) => void
}

function Loader() {
  return <div className="canvas-loader">3D laden…</div>
}

export function EditorCanvas({
  scene,
  config,
  tool,
  selection,
  highlightedIds,
  plankPlane = 'xz',
  planksEnabled = true,
  onSceneChange,
  onSelectionChange,
  onToolChange,
  onPlankPlaneChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onDelete,
  onReset,
  onDrawUiChange,
}: EditorCanvasProps) {
  const { ref, width, height } = useContainerSize()
  const [canvasKey, setCanvasKey] = useState(0)
  const onCreated = useCallback((state: RootState) => {
    const { gl } = state
    const onLost = (event: Event) => {
      event.preventDefault()
      window.setTimeout(() => {
        if (gl.getContext().isContextLost()) setCanvasKey((k) => k + 1)
      }, 150)
    }
    gl.domElement.addEventListener('webglcontextlost', onLost, false)
  }, [])
  const ready = width > 0 && height > 0

  const planeHint =
    plankPlane === 'xy'
      ? 'Verticaal XY · klik ligger langs X'
      : plankPlane === 'yz'
        ? 'Verticaal YZ · klik ligger langs Z'
        : 'Liggend XZ · klik liggende buis'

  return (
    <div className="editor-workspace">
      <EditorToolbar
        tool={tool}
        canDelete={!!selection}
        canUndo={canUndo}
        canRedo={canRedo}
        plankPlane={plankPlane}
        planksEnabled={planksEnabled}
        onToolChange={onToolChange}
        onPlankPlaneChange={onPlankPlaneChange}
        onUndo={onUndo}
        onRedo={onRedo}
        onDelete={onDelete}
        onReset={onReset}
      />
      <div
        className={`preview-3d editor-canvas-wrap${tool === 'draw' ? ' draw-mode' : ''}${tool === 'pan' ? ' pan-mode' : ''}${tool === 'hinge' ? ' hinge-mode' : ''}${tool === 'move' ? ' move-mode' : ''}${tool === 'plank' ? ' plank-mode' : ''}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="canvas-inner" ref={ref}>
          {ready ? (
            <Canvas
              key={canvasKey}
              shadows
              camera={{ position: [3, 2.5, 4], fov: 45, near: 0.1, far: 100 }}
              gl={{
                antialias: true,
                powerPreference: 'high-performance',
                preserveDrawingBuffer: true,
              }}
              dpr={[1, 1.75]}
              style={{ width, height }}
              onCreated={onCreated}
            >
              <Suspense fallback={null}>
                <ViewportCaptureBridge />
                <EditorScene
                  scene={scene}
                  config={config}
                  tool={tool}
                  selection={selection}
                  highlightedIds={highlightedIds}
                  plankPlane={plankPlane}
                  onSceneChange={onSceneChange}
                  onSelectionChange={onSelectionChange}
                  onDrawUiChange={onDrawUiChange}
                />
              </Suspense>
            </Canvas>
          ) : (
            <Loader />
          )}
        </div>
        <div className="preview-hint" role="note">
          <p className="preview-hint-tool">
            {tool === 'draw'
              ? 'Teken: klik grond of buis · Alt = nauwkeurig snappen · Shift = vrij eindpunt · Enter = plaatsen'
              : tool === 'hinge'
                ? 'Scharnier: klik frame-buis = oog · Alt = nauwkeurig snappen · tweede klik = eind · Enter = plaatsen'
                : tool === 'plank'
                  ? `Plank: ${planeHint} · vlak kiezen in de gereedschapsbalk`
                  : tool === 'move'
                    ? 'Verplaats: sleep buis of plank · Esc annuleert'
                    : tool === 'pan'
                      ? 'Hand-tool actief'
                      : 'Select: klik voor opties'}
          </p>
          <CameraControlsHint variant={tool === 'pan' ? 'editor-hand' : 'editor'} />
        </div>
      </div>
    </div>
  )
}
