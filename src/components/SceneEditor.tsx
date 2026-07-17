import { useCallback, useMemo, useState } from 'react'
import type {
  BaseAnchorType,
  BomHighlight,
  EditorSelection,
  EditorTool,
  KlimrekConfig,
  MaterialId,
  PipeDiameter,
  SceneModel,
} from '../types'
import { PIPE_DIAMETERS } from '../data/catalog'
import { normalizeHingeAccessories, removeAccessoryFromScene, removePipeFromScene } from '../lib/accessories'
import { baseGroundY, normalizePipeIds, pipeLengthMm, rebaseGroundEndpoints, syncSceneFittings } from '../lib/scene'
import { pickFixedEnd, resizePipeFromFixedEnd } from '../lib/stretch'
import { calculateBomFromScene } from '../lib/bomFromScene'
import { resolveBomHighlightIds } from '../lib/bomHighlight'
import { formatMm } from '../lib/bom'
import { FITTING_TYPE_LABELS } from '../lib/fittings'
import { EditorCanvas } from './editor/EditorCanvas'
import { DrawPipePanel } from './editor/DrawPipePanel'
import { ModelStorePanel } from './editor/ModelStorePanel'
import type { DrawUiState } from './three/EditorScene'
import { BomList } from './BomList'

interface SceneEditorProps {
  config: KlimrekConfig
  scene: SceneModel
  onSceneChange: (scene: SceneModel) => void
  onConfigChange?: (config: KlimrekConfig) => void
  onResetFromConfig: () => void
}

export function SceneEditor({ config, scene: rawScene, onSceneChange, onConfigChange, onResetFromConfig }: SceneEditorProps) {
  const [tool, setTool] = useState<EditorTool>('select')
  const [selection, setSelection] = useState<EditorSelection | null>(null)
  const [bomHighlight, setBomHighlight] = useState<BomHighlight | null>(null)

  // Repareer dubbele buis-id's en verouderde scharnierhulzen (legacy) en
  // hersynchroniseer fittings, zodat oude auto-fittings direct verdwijnen.
  const scene = useMemo(
    () => syncSceneFittings(normalizeHingeAccessories(normalizePipeIds(rawScene)), config),
    [rawScene, config],
  )
  const [drawUi, setDrawUi] = useState<DrawUiState | null>(null)
  const handleDrawUiChange = useCallback((ui: DrawUiState | null) => setDrawUi(ui), [])

  const highlightIds = useMemo(
    () => resolveBomHighlightIds(scene, bomHighlight),
    [scene, bomHighlight],
  )

  const selectedPipe =
    selection?.kind === 'pipe' ? (scene.pipes.find((p) => p.id === selection.pipeId) ?? null) : null
  const selectedAccessory =
    selection?.kind === 'accessory'
      ? (scene.accessories?.find((a) => a.id === selection.accessoryId) ?? null)
      : null
  const bom = useMemo(() => calculateBomFromScene(scene), [scene])

  const deleteSelected = () => {
    if (!selection) return

    if (selection.kind === 'pipe') {
      onSceneChange(syncSceneFittings(removePipeFromScene(scene, selection.pipeId), config))
    } else {
      onSceneChange(syncSceneFittings(removeAccessoryFromScene(scene, selection.accessoryId), config))
    }
    setSelection(null)
  }

  const changeMaterial = (materialId: MaterialId) => {
    if (materialId !== config.materialId) {
      onConfigChange?.({ ...config, materialId })
    }
    onSceneChange({ ...scene, materialId })
  }

  const changeDiameter = (diameter: PipeDiameter) => {
    if (diameter === config.diameter) return
    const nextConfig = { ...config, diameter }
    const pipes = scene.pipes.map((p) => ({ ...p, diameterMm: diameter }))
    const accessories = (scene.accessories ?? []).map((a) => ({ ...a, diameterMm: diameter }))
    onConfigChange?.(nextConfig)
    onSceneChange(syncSceneFittings({ ...scene, pipes, accessories }, nextConfig))
  }

  const changeBaseType = (baseType: BaseAnchorType) => {
    if (baseType === config.baseType) return
    const nextConfig = { ...config, baseType }
    const oldGroundY = baseGroundY(config)
    const newGroundY = baseGroundY(nextConfig)
    const rebased = rebaseGroundEndpoints(scene.pipes, newGroundY, oldGroundY)
    onConfigChange?.(nextConfig)
    onSceneChange(syncSceneFittings({ ...scene, pipes: rebased }, nextConfig))
  }

  const changeAnchorDepth = (anchorDepthMm: number) => {
    if (config.baseType !== 'grondanker') return
    const clamped = Math.max(200, Math.min(800, Math.round(anchorDepthMm)))
    if (clamped === config.anchorDepthMm) return
    const nextConfig = { ...config, anchorDepthMm: clamped }
    const oldGroundY = baseGroundY(config)
    const newGroundY = baseGroundY(nextConfig)
    const rebased = rebaseGroundEndpoints(scene.pipes, newGroundY, oldGroundY)
    onConfigChange?.(nextConfig)
    onSceneChange(syncSceneFittings({ ...scene, pipes: rebased }, nextConfig))
  }

  // Vast punt voor lengte-aanpassing: grondzijde > verbonden zijde > startpunt.
  const fixedEndInfo = useMemo(() => {
    if (!selectedPipe) return null
    const others = scene.pipes.filter((p) => p.id !== selectedPipe.id)
    return pickFixedEnd(selectedPipe, others, baseGroundY(config))
  }, [selectedPipe, scene.pipes, config])

  const updateSelectedLength = (lengthMm: number) => {
    if (!selectedPipe || selection?.kind !== 'pipe' || lengthMm < 100 || !fixedEndInfo) return

    const resized = resizePipeFromFixedEnd(selectedPipe, fixedEndInfo.fixed, lengthMm)
    if (!resized) return

    const updated = scene.pipes.map((p) =>
      p.id === selection.pipeId ? { ...p, start: resized.start, end: resized.end } : p,
    )
    onSceneChange(syncSceneFittings({ ...scene, pipes: updated }, config))
  }

  return (
    <main className="app-main">
      <div className="main-left">
        <section className="editor-panel form-section">
          <h2>Buisdiameter</h2>
          <div className="base-type-toggle diameter-toggle" role="group" aria-label="Buisdiameter">
            {PIPE_DIAMETERS.map((d) => (
              <button
                key={d.value}
                type="button"
                className={config.diameter === d.value ? 'active' : ''}
                onClick={() => changeDiameter(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="base-type-hint">
            Geldt voor het hele model — alle buizen en koppelingen schalen mee.
          </p>
        </section>

        <section className="editor-panel form-section base-type-panel">
          <h2>Verankering</h2>
          <div className="base-type-toggle" role="group" aria-label="Verankeringstype">
            <button
              type="button"
              className={config.baseType === 'voetplaat' ? 'active' : ''}
              onClick={() => changeBaseType('voetplaat')}
            >
              Voetplaat
            </button>
            <button
              type="button"
              className={config.baseType === 'grondanker' ? 'active' : ''}
              onClick={() => changeBaseType('grondanker')}
            >
              Grondanker
            </button>
          </div>
          {config.baseType === 'grondanker' && (
            <label className="anchor-depth-field">
              Diepte in grond (mm)
              <input
                type="number"
                min={200}
                max={800}
                step={50}
                value={config.anchorDepthMm}
                onChange={(e) => changeAnchorDepth(Number(e.target.value))}
              />
              <span className="field-hint">
                Onderkant verankerde buizen en snap-punt in de editor volgen deze diepte (200–800 mm).
              </span>
            </label>
          )}
          <p className="base-type-hint">
            {config.baseType === 'grondanker'
              ? `Buizen verankerd in beton (${config.anchorDepthMm} mm onder maaiveld) — geen voetplaten.`
              : 'Voetplaten op maaiveld onder elke staander.'}
          </p>
        </section>

        {drawUi && (
          <DrawPipePanel
            lengthMm={drawUi.lengthMm}
            directionLabel={drawUi.directionLabel}
            startLabel={drawUi.startLabel}
            endFree={drawUi.endFree}
            onLengthChange={drawUi.onLengthChange}
            onPlace={drawUi.onPlace}
            onCancel={drawUi.onCancel}
          />
        )}

        {selectedPipe && tool === 'select' && (
          <section className="editor-panel form-section">
            <h2>Geselecteerd — buis</h2>
            <dl className="prop-list">
              <div>
                <dt>Label</dt>
                <dd>{selectedPipe.label}</dd>
              </div>
              <div>
                <dt>Lengte</dt>
                <dd>{formatMm(pipeLengthMm(selectedPipe))}</dd>
              </div>
              <div>
                <dt>Diameter</dt>
                <dd>{selectedPipe.diameterMm} mm</dd>
              </div>
            </dl>
            <label className="length-adjust">
              Lengte aanpassen (mm)
              <input
                type="number"
                min={100}
                max={6000}
                step={50}
                defaultValue={pipeLengthMm(selectedPipe)}
                key={selectedPipe.id}
                onBlur={(e) => updateSelectedLength(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') updateSelectedLength(Number((e.target as HTMLInputElement).value))
                }}
              />
            </label>
            {fixedEndInfo && (
              <p className="length-fixed-hint">
                Vast punt: {fixedEndInfo.reason === 'grond' ? 'kant op de grond' : fixedEndInfo.reason === 'verbonden' ? 'verbonden kant' : 'startpunt'} — de andere kant schuift.
              </p>
            )}
          </section>
        )}

        {selectedAccessory && tool === 'select' && (
          <section className="editor-panel form-section">
            <h2>Geselecteerd — scharnier</h2>
            <dl className="prop-list">
              <div>
                <dt>Type</dt>
                <dd>{FITTING_TYPE_LABELS[selectedAccessory.type]}</dd>
              </div>
              <div>
                <dt>Buis</dt>
                <dd>{selectedAccessory.pipeId}</dd>
              </div>
              <div>
                <dt>Diameter</dt>
                <dd>{selectedAccessory.diameterMm} mm</dd>
              </div>
            </dl>
          </section>
        )}

        <ModelStorePanel
          scene={scene}
          config={config}
          onLoad={(m) => {
            onConfigChange?.(m.config)
            onSceneChange(m.scene)
            setSelection(null)
            setBomHighlight(null)
          }}
        />
      </div>

      <div className="main-center">
        <div className="preview-panel preview-panel-fill">
          <h2>3D Editor</h2>
          <EditorCanvas
            scene={scene}
            config={config}
            tool={tool}
            selection={selection}
            highlightedIds={highlightIds}
            onSceneChange={onSceneChange}
            onSelectionChange={setSelection}
            onToolChange={(t) => {
              setTool(t)
              if (t === 'draw' || t === 'pan' || t === 'hinge' || t === 'move') setSelection(null)
            }}
            onMaterialChange={changeMaterial}
            onDelete={deleteSelected}
            onReset={onResetFromConfig}
            onDrawUiChange={handleDrawUiChange}
          />
        </div>
      </div>

      <aside className="main-sidebar">
        <BomList
          bom={bom}
          config={config}
          scene={scene}
          materialId={scene.materialId}
          highlight={bomHighlight}
          onHighlightChange={setBomHighlight}
        />
      </aside>
    </main>
  )
}
