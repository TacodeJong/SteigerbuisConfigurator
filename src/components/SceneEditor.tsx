import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  BaseAnchorType,
  BomHighlight,
  EditorSelection,
  EditorTool,
  KlimrekConfig,
  KlimrekEnvironment,
  MaterialId,
  PipeDiameter,
  SceneModel,
} from '../types'
import { MATERIALS, PIPE_DIAMETERS } from '../data/catalog'
import { configEnvironment, withEnvironment } from '../lib/environment'
import { normalizeHingeAccessories, removeAccessoryFromScene, removePipeFromScene } from '../lib/accessories'
import { baseGroundY, normalizePipeIds, pipeLengthMm, rebaseGroundEndpoints, syncSceneFittings } from '../lib/scene'
import { pickFixedEnd, resizePipeFromFixedEnd } from '../lib/stretch'
import { calculateBomFromScene } from '../lib/bomFromScene'
import { resolveBomHighlightIds } from '../lib/bomHighlight'
import { formatMm } from '../lib/bom'
import { FITTING_TYPE_LABELS } from '../lib/fittings'
import {
  MAX_PLANK_LENGTH_MM,
  MAX_PLANK_WIDTH_MM,
  MAX_VERTICAL_PLANK_HEIGHT_MM,
  MIN_PLANK_LENGTH_MM,
  MIN_PLANK_WIDTH_MM,
  MIN_VERTICAL_PLANK_HEIGHT_MM,
  getDefaultPlankKind,
  getDefaultPlankPlane,
  getDefaultPlankWidthMm,
  getDefaultVerticalPlankHeightMm,
  isVerticalPlank,
  listPlankMountOptions,
  plankPlaneLabel,
  resizePlank,
  resizePlankWidth,
  resolvePlankPlane,
  setDefaultPlankKind,
  setDefaultPlankPlane,
  setDefaultPlankWidthMm,
  setDefaultVerticalPlankHeightMm,
  setPlankKind,
  togglePlankMount,
  type PlankKind,
  type PlankPlane,
} from '../lib/planks'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { EditorCanvas } from './editor/EditorCanvas'
import { DrawPipePanel } from './editor/DrawPipePanel'
import { ModelStoreDialog, type ModelsDialogFocus } from './editor/ModelStorePanel'
import type { DrawUiState } from './three/EditorScene'
import { BomList } from './BomList'
import { BomSheetTrigger, ResponsiveBomSidebar } from './ResponsiveBomSidebar'
import { ConfigSheetTrigger, ResponsiveConfigSidebar } from './ResponsiveConfigSidebar'

interface SceneEditorProps {
  config: KlimrekConfig
  scene: SceneModel
  onSceneChange: (scene: SceneModel) => void
  onConfigChange?: (config: KlimrekConfig) => void
  /** Bevestig + bouw scene; null = geannuleerd. SceneEditor past toe via history. */
  onResetFromConfig: () => SceneModel | null
  activeCloudModelId: string | null
  activeCloudModelName?: string | null
  onActiveCloudModelIdChange: (id: string | null, name?: string | null) => void
  /** Externe open-aanvraag vanuit de app-sidebar. */
  openModelsTick?: number
  openModelsFocus?: ModelsDialogFocus
  /** Externe open-aanvraag voor de config/editor bottom sheet (mobiel). */
  openConfigSheetTick?: number
  /** Admin-featureflag: plank/plaat-tool in de editor. */
  planksEnabled?: boolean
  /** Na cloud-opslaan of laden: markeer editor als clean (geen beforeunload). */
  onEditorBaseline?: (scene: SceneModel, config: KlimrekConfig) => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

export function SceneEditor({
  config,
  scene: rawScene,
  onSceneChange,
  onConfigChange,
  onResetFromConfig,
  activeCloudModelId,
  activeCloudModelName = null,
  onActiveCloudModelIdChange,
  openModelsTick = 0,
  openModelsFocus = 'browse',
  openConfigSheetTick = 0,
  planksEnabled = true,
  onEditorBaseline,
}: SceneEditorProps) {
  const [tool, setTool] = useState<EditorTool>('select')
  const [selection, setSelection] = useState<EditorSelection | null>(null)
  const [bomHighlight, setBomHighlight] = useState<BomHighlight | null>(null)
  const [bomSheetOpen, setBomSheetOpen] = useState(false)
  const [configSheetOpen, setConfigSheetOpen] = useState(false)
  const [plankToolWidthMm, setPlankToolWidthMm] = useState(getDefaultPlankWidthMm())
  const [plankToolKind, setPlankToolKind] = useState<PlankKind>(getDefaultPlankKind())
  const [plankToolPlane, setPlankToolPlane] = useState<PlankPlane>(getDefaultPlankPlane())
  const [modelsOpen, setModelsOpen] = useState(false)
  const [modelsFocus, setModelsFocus] = useState<ModelsDialogFocus>('browse')
  const plankToolVertical = plankToolPlane !== 'xz'

  useEffect(() => {
    if (!planksEnabled && tool === 'plank') setTool('select')
  }, [planksEnabled, tool])

  useEffect(() => {
    if (openModelsTick <= 0) return
    setModelsFocus(openModelsFocus)
    setModelsOpen(true)
  }, [openModelsTick, openModelsFocus])

  useEffect(() => {
    if (openConfigSheetTick <= 0) return
    setBomSheetOpen(false)
    setConfigSheetOpen(true)
  }, [openConfigSheetTick])

  // Repareer dubbele buis-id's en verouderde scharnierhulzen (legacy) en
  // hersynchroniseer fittings, zodat oude auto-fittings direct verdwijnen.
  const scene = useMemo(
    () => syncSceneFittings(normalizeHingeAccessories(normalizePipeIds(rawScene)), config),
    [rawScene, config],
  )

  const {
    setSceneWithHistory,
    commitWithHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useEditorHistory({
    scene,
    config,
    onSceneChange,
    onConfigChange,
  })

  const environment = configEnvironment(config)
  const [drawUi, setDrawUi] = useState<DrawUiState | null>(null)
  const handleDrawUiChange = useCallback((ui: DrawUiState | null) => setDrawUi(ui), [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

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
  const selectedPlank =
    selection?.kind === 'plank' ? (scene.planks?.find((p) => p.id === selection.plankId) ?? null) : null
  const bom = useMemo(() => calculateBomFromScene(scene), [scene])

  const deleteSelected = () => {
    if (!selection) return

    if (selection.kind === 'pipe') {
      setSceneWithHistory(syncSceneFittings(removePipeFromScene(scene, selection.pipeId), config))
    } else if (selection.kind === 'accessory') {
      setSceneWithHistory(syncSceneFittings(removeAccessoryFromScene(scene, selection.accessoryId), config))
    } else if (selection.kind === 'plank') {
      const planks = (scene.planks ?? []).filter((p) => p.id !== selection.plankId)
      setSceneWithHistory(syncSceneFittings({ ...scene, planks }, config))
    }
    setSelection(null)
  }

  const changeMaterial = (materialId: MaterialId) => {
    if (materialId === scene.materialId && materialId === config.materialId) return
    commitWithHistory({ ...scene, materialId }, { ...config, materialId })
  }

  const changeDiameter = (diameter: PipeDiameter) => {
    if (diameter === config.diameter) return
    const nextConfig = { ...config, diameter }
    const pipes = scene.pipes.map((p) => ({ ...p, diameterMm: diameter }))
    const accessories = (scene.accessories ?? []).map((a) => ({ ...a, diameterMm: diameter }))
    commitWithHistory(syncSceneFittings({ ...scene, pipes, accessories }, nextConfig), nextConfig)
  }

  const applyConfigWithRebase = (nextConfig: KlimrekConfig) => {
    const oldGroundY = baseGroundY(config)
    const newGroundY = baseGroundY(nextConfig)
    const rebased = rebaseGroundEndpoints(scene.pipes, newGroundY, oldGroundY)
    commitWithHistory(syncSceneFittings({ ...scene, pipes: rebased }, nextConfig), nextConfig)
  }

  const changeBaseType = (baseType: BaseAnchorType) => {
    if (baseType === config.baseType) return
    applyConfigWithRebase({ ...config, baseType })
  }

  const changeEnvironment = (environment: KlimrekEnvironment) => {
    if (environment === configEnvironment(config)) return
    applyConfigWithRebase(withEnvironment(config, environment))
  }

  const changeAnchorDepth = (anchorDepthMm: number) => {
    if (config.baseType !== 'grondanker') return
    const clamped = Math.max(200, Math.min(800, Math.round(anchorDepthMm)))
    if (clamped === config.anchorDepthMm) return
    const nextConfig = { ...config, anchorDepthMm: clamped }
    const oldGroundY = baseGroundY(config)
    const newGroundY = baseGroundY(nextConfig)
    const rebased = rebaseGroundEndpoints(scene.pipes, newGroundY, oldGroundY)
    commitWithHistory(syncSceneFittings({ ...scene, pipes: rebased }, nextConfig), nextConfig)
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
    setSceneWithHistory(syncSceneFittings({ ...scene, pipes: updated }, config))
  }

  const updateSelectedPlankLength = (lengthMm: number) => {
    if (!selectedPlank || selection?.kind !== 'plank' || !Number.isFinite(lengthMm)) return
    const planks = (scene.planks ?? []).map((p) =>
      p.id === selection.plankId ? resizePlank(p, lengthMm) : p,
    )
    setSceneWithHistory(syncSceneFittings({ ...scene, planks }, config))
  }

  const updateSelectedPlankWidth = (widthMm: number) => {
    if (!selectedPlank || selection?.kind !== 'plank' || !Number.isFinite(widthMm)) return
    const next = resizePlankWidth(selectedPlank, widthMm)
    if (isVerticalPlank(next)) {
      setDefaultVerticalPlankHeightMm(next.widthMm)
    } else {
      setDefaultPlankWidthMm(next.widthMm)
      setPlankToolWidthMm(next.widthMm)
    }
    const planks = (scene.planks ?? []).map((p) => (p.id === selection.plankId ? next : p))
    setSceneWithHistory(syncSceneFittings({ ...scene, planks }, config))
  }

  const updateSelectedPlankKind = (kind: PlankKind) => {
    if (!selectedPlank || selection?.kind !== 'plank') return
    const next = setPlankKind(selectedPlank, kind)
    setDefaultPlankKind(kind)
    setPlankToolKind(kind)
    if (!isVerticalPlank(next)) {
      setPlankToolWidthMm(next.widthMm)
      setDefaultPlankWidthMm(next.widthMm)
    }
    const planks = (scene.planks ?? []).map((p) => (p.id === selection.plankId ? next : p))
    setSceneWithHistory(syncSceneFittings({ ...scene, planks }, config))
  }

  const toggleSelectedPlankMount = (pipeId: string) => {
    if (!selectedPlank || selection?.kind !== 'plank') return
    setSceneWithHistory(syncSceneFittings(togglePlankMount(scene, selectedPlank.id, pipeId), config))
  }

  const plankMountOptions = useMemo(
    () =>
      selectedPlank
        ? listPlankMountOptions(selectedPlank, scene.pipes, scene.plankMounts)
        : [],
    [selectedPlank, scene.pipes, scene.plankMounts],
  )

  const updateDefaultPlankWidth = (widthMm: number) => {
    if (plankToolVertical) {
      setDefaultVerticalPlankHeightMm(widthMm)
      setPlankToolWidthMm(getDefaultVerticalPlankHeightMm())
    } else {
      setDefaultPlankWidthMm(widthMm)
      setPlankToolWidthMm(getDefaultPlankWidthMm())
    }
  }

  const updatePlankToolKind = (kind: PlankKind) => {
    setDefaultPlankKind(kind)
    setPlankToolKind(kind)
    setPlankToolWidthMm(plankToolVertical ? getDefaultVerticalPlankHeightMm() : getDefaultPlankWidthMm())
  }

  const updatePlankToolPlane = (plane: PlankPlane) => {
    setDefaultPlankPlane(plane)
    setPlankToolPlane(plane)
    setPlankToolWidthMm(plane === 'xz' ? getDefaultPlankWidthMm() : getDefaultVerticalPlankHeightMm())
  }

  return (
    <main className="app-main">
      <ResponsiveConfigSidebar
        open={configSheetOpen}
        onOpenChange={setConfigSheetOpen}
        title="Aanpassen"
      >
        <section className="editor-panel form-section">
          <h2>Buis</h2>
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
          <p className="field-label">Materiaal & kleur</p>
          <div className="material-picker" role="group" aria-label="Materiaal en kleur">
            {MATERIALS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`material-swatch-btn${scene.materialId === m.id ? ' active' : ''}`}
                title={m.name}
                aria-label={m.name}
                aria-pressed={scene.materialId === m.id}
                onClick={() => changeMaterial(m.id)}
              >
                <span className="swatch" style={{ background: m.color }} />
              </button>
            ))}
          </div>
        </section>

        <section className="editor-panel form-section base-type-panel">
          <h2>Omgeving</h2>
          <div className="base-type-toggle" role="group" aria-label="Omgeving">
            <button
              type="button"
              className={environment === 'buiten' ? 'active' : ''}
              onClick={() => changeEnvironment('buiten')}
            >
              Buiten
            </button>
            <button
              type="button"
              className={environment === 'binnen' ? 'active' : ''}
              onClick={() => changeEnvironment('binnen')}
            >
              Binnen
            </button>
          </div>
          {environment === 'buiten' && (
            <>
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
            </>
          )}
          <p className="base-type-hint">
            {environment === 'binnen'
              ? 'Binnenopstelling: constructie staat los op de vloer op rubberen voetdoppen — geen verankering.'
              : config.baseType === 'grondanker'
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

        {selectedPlank && tool === 'select' && (
          <section className="editor-panel form-section">
            <h2>Geselecteerd — {selectedPlank.kind === 'plate' ? 'plaat' : 'plank'}</h2>
            <div className="base-type-toggle diameter-toggle" role="group" aria-label="Houttype">
              <button
                type="button"
                className={selectedPlank.kind !== 'plate' ? 'active' : ''}
                onClick={() => updateSelectedPlankKind('plank')}
              >
                Plank
              </button>
              <button
                type="button"
                className={selectedPlank.kind === 'plate' ? 'active' : ''}
                onClick={() => updateSelectedPlankKind('plate')}
              >
                Houten plaat
              </button>
            </div>
            <dl className="prop-list">
              <div>
                <dt>Type</dt>
                <dd>{selectedPlank.kind === 'plate' ? 'Houten plaat' : 'Steigerplank'}</dd>
              </div>
              <div>
                <dt>Oriëntatie</dt>
                <dd>{plankPlaneLabel(resolvePlankPlane(selectedPlank))}</dd>
              </div>
              <div>
                <dt>Dikte</dt>
                <dd>{selectedPlank.thicknessMm} mm</dd>
              </div>
              <div>
                <dt>Lengte</dt>
                <dd>{formatMm(selectedPlank.lengthMm)}</dd>
              </div>
            </dl>
            <label className="length-adjust">
              {isVerticalPlank(selectedPlank) ? 'Hoogte (mm)' : 'Breedte (mm)'}
              <input
                type="number"
                min={isVerticalPlank(selectedPlank) ? MIN_VERTICAL_PLANK_HEIGHT_MM : MIN_PLANK_WIDTH_MM}
                max={isVerticalPlank(selectedPlank) ? MAX_VERTICAL_PLANK_HEIGHT_MM : MAX_PLANK_WIDTH_MM}
                step={5}
                defaultValue={selectedPlank.widthMm}
                key={`${selectedPlank.id}-w-${selectedPlank.widthMm}`}
                onBlur={(e) => updateSelectedPlankWidth(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') updateSelectedPlankWidth(Number((e.target as HTMLInputElement).value))
                }}
              />
            </label>
            <label className="length-adjust">
              Lengte aanpassen (mm)
              <input
                type="number"
                min={MIN_PLANK_LENGTH_MM}
                max={MAX_PLANK_LENGTH_MM}
                step={50}
                defaultValue={selectedPlank.lengthMm}
                key={`${selectedPlank.id}-l`}
                onBlur={(e) => updateSelectedPlankLength(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') updateSelectedPlankLength(Number((e.target as HTMLInputElement).value))
                }}
              />
            </label>
            <p className="length-fixed-hint">
              Breedte {MIN_PLANK_WIDTH_MM}–{MAX_PLANK_WIDTH_MM} mm · Verplaatsen met het Verplaats-gereedschap.
            </p>
            <h3 className="mount-options-title">Schapsteunen</h3>
            {plankMountOptions.length === 0 ? (
              <p className="length-fixed-hint">Geen kandidaat-buizen bij deze plank.</p>
            ) : (
              <ul className="mount-options-list">
                {plankMountOptions.map((opt) => (
                  <li key={opt.pipeId}>
                    <button
                      type="button"
                      className={opt.placed ? 'active' : ''}
                      onClick={() => toggleSelectedPlankMount(opt.pipeId)}
                      aria-pressed={opt.placed}
                    >
                      {opt.placed ? 'Verwijder' : 'Plaats'} · {opt.pipeLabel} (
                      {opt.kind === 'upright' ? 'staander' : 'ligger'})
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="length-fixed-hint">
              Of klik in 3D op een buis die de plank raakt om een steun te plaatsen/verwijderen.
            </p>
          </section>
        )}

        {planksEnabled && tool === 'plank' && (
          <section className="editor-panel form-section">
            <h2>Plank / plaat plaatsen</h2>
            <div className="base-type-toggle diameter-toggle" role="group" aria-label="Houttype">
              <button
                type="button"
                className={plankToolKind === 'plank' ? 'active' : ''}
                onClick={() => updatePlankToolKind('plank')}
              >
                Plank
              </button>
              <button
                type="button"
                className={plankToolKind === 'plate' ? 'active' : ''}
                onClick={() => updatePlankToolKind('plate')}
              >
                Houten plaat
              </button>
            </div>
            <label className="length-adjust">
              {plankToolVertical ? 'Hoogte nieuwe delen (mm)' : 'Breedte nieuwe delen (mm)'}
              <input
                type="number"
                min={plankToolVertical ? MIN_VERTICAL_PLANK_HEIGHT_MM : MIN_PLANK_WIDTH_MM}
                max={plankToolVertical ? MAX_VERTICAL_PLANK_HEIGHT_MM : MAX_PLANK_WIDTH_MM}
                step={5}
                defaultValue={plankToolWidthMm}
                key={`plank-tool-w-${plankToolKind}-${plankToolPlane}-${plankToolWidthMm}`}
                onBlur={(e) => updateDefaultPlankWidth(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    updateDefaultPlankWidth(Number((e.target as HTMLInputElement).value))
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
              />
            </label>
            <p className="length-fixed-hint">
              {plankToolKind === 'plate'
                ? `Plaat: typ. 18 mm dik, breedte tot ${MAX_PLANK_WIDTH_MM} mm (standaard 1220).`
                : `Plank: typ. 30×195 mm, breedte tot ${MAX_PLANK_WIDTH_MM} mm.`}{' '}
              Plaatsingsvlak kies je in de gereedschapbalk (uitklappen): {plankPlaneLabel(plankToolPlane)}.
            </p>
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

      </ResponsiveConfigSidebar>

      <div className="main-center">
        <div className="preview-panel preview-panel-fill">
          <div className="preview-panel-header">
            <h2>3D Editor</h2>
            <div className="preview-panel-actions">
              <ConfigSheetTrigger
                onClick={() => {
                  setBomSheetOpen(false)
                  setConfigSheetOpen(true)
                }}
              />
              <BomSheetTrigger
                onClick={() => {
                  setConfigSheetOpen(false)
                  setBomSheetOpen(true)
                }}
              />
            </div>
          </div>
          <EditorCanvas
            scene={scene}
            config={config}
            tool={tool}
            selection={selection}
            highlightedIds={highlightIds}
            plankPlane={plankToolPlane}
            planksEnabled={planksEnabled}
            onSceneChange={setSceneWithHistory}
            onSelectionChange={setSelection}
            onToolChange={(t) => {
              setTool(t)
              if (t === 'draw' || t === 'pan' || t === 'hinge' || t === 'move' || t === 'plank') setSelection(null)
            }}
            onPlankPlaneChange={updatePlankToolPlane}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            onDelete={deleteSelected}
            onReset={() => {
              const next = onResetFromConfig()
              if (!next) return
              setSceneWithHistory(next)
              setSelection(null)
              setBomHighlight(null)
            }}
            onDrawUiChange={handleDrawUiChange}
          />
        </div>
      </div>

      <ResponsiveBomSidebar
        open={bomSheetOpen}
        onOpenChange={setBomSheetOpen}
      >
        <BomList
          bom={bom}
          config={config}
          scene={scene}
          materialId={scene.materialId}
          highlight={bomHighlight}
          onHighlightChange={setBomHighlight}
          cloudModelId={activeCloudModelId}
          modelTitle={activeCloudModelName}
        />
      </ResponsiveBomSidebar>

      <ModelStoreDialog
        open={modelsOpen}
        onClose={() => setModelsOpen(false)}
        initialFocus={modelsFocus}
        scene={scene}
        config={config}
        activeCloudModelId={activeCloudModelId}
        activeCloudModelName={activeCloudModelName}
        onActiveCloudModelIdChange={onActiveCloudModelIdChange}
        onLoad={(m) => {
          commitWithHistory(m.scene, m.config)
          setSelection(null)
          setBomHighlight(null)
          onEditorBaseline?.(m.scene, m.config)
        }}
        onSaved={() => onEditorBaseline?.(rawScene, config)}
      />
    </main>
  )
}
