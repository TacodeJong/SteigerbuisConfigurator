import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import type { EditorSelection, EditorTool, KlimrekConfig, MaterialId, SceneModel } from '../../types'
import type { PlankPlane } from '../../lib/planks'
import { EditorScene, type DrawUiState } from '../three/EditorScene'
import { EditorToolbar } from './EditorToolbar'

interface EditorCanvasProps {
  scene: SceneModel
  config: KlimrekConfig
  tool: EditorTool
  selection: EditorSelection | null
  highlightedIds?: Set<string>
  plankPlane?: PlankPlane
  onSceneChange: (scene: SceneModel) => void
  onSelectionChange: (selection: EditorSelection | null) => void
  onToolChange: (tool: EditorTool) => void
  onMaterialChange: (id: MaterialId) => void
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
  onSceneChange,
  onSelectionChange,
  onToolChange,
  onMaterialChange,
  onPlankPlaneChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onDelete,
  onReset,
  onDrawUiChange,
}: EditorCanvasProps) {
  const planeHint =
    plankPlane === 'xy'
      ? 'Verticaal XY · klik ligger langs X'
      : plankPlane === 'yz'
        ? 'Verticaal YZ · klik ligger langs Z'
        : 'Liggend XZ · klik liggende buis'

  return (
    <div
      className={`preview-3d editor-canvas-wrap${tool === 'draw' ? ' draw-mode' : ''}${tool === 'pan' ? ' pan-mode' : ''}${tool === 'hinge' ? ' hinge-mode' : ''}${tool === 'move' ? ' move-mode' : ''}${tool === 'plank' ? ' plank-mode' : ''}`}
    >
      <EditorToolbar
        tool={tool}
        materialId={scene.materialId}
        canDelete={!!selection}
        canUndo={canUndo}
        canRedo={canRedo}
        plankPlane={plankPlane}
        onToolChange={onToolChange}
        onMaterialChange={onMaterialChange}
        onPlankPlaneChange={onPlankPlaneChange}
        onUndo={onUndo}
        onRedo={onRedo}
        onDelete={onDelete}
        onReset={onReset}
      />
      <Suspense fallback={<Loader />}>
        <div className="canvas-inner">
          <Canvas
            shadows
            camera={{ position: [3, 2.5, 4], fov: 45, near: 0.1, far: 100 }}
            gl={{ antialias: true }}
          >
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
          </Canvas>
        </div>
      </Suspense>
      <p className="preview-hint">
        {tool === 'draw'
          ? 'Klik grond of buis · Alt = nauwkeurig snappen · Shift = vrij eindpunt · Enter = plaatsen'
          : tool === 'hinge'
            ? 'Klik frame-buis = oog · Alt = nauwkeurig snappen · Tweede klik = eind · Enter = plaatsen'
            : tool === 'plank'
              ? `${planeHint} · Toolbar: plaatsingsvlak · Snap naast bestaande delen`
              : tool === 'move'
                ? 'Sleep een buis of plank · Verbonden buizen rekken mee · Grond blijft vast · Rood = niet toegestaan · Esc annuleert'
                : tool === 'pan'
                  ? 'Sleep om te pannen · Scroll = zoomen'
                  : 'Klik buis of plank = opties · Linkermuis = draaien · Rechtermuis = pannen · Scroll = zoomen'}
      </p>
    </div>
  )
}
