import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MOUSE } from 'three'
import { ContactShadows, Html, Line, OrbitControls } from '@react-three/drei'
import type { EditorSelection, EditorTool, KlimrekConfig, SceneModel, Vec3 } from '../../types'
import { MATERIALS } from '../../data/catalog'
import { PIPE_LABEL } from '../../lib/bom'
import { configEnvironment } from '../../lib/environment'
import { placeHingeSpan, removeAccessoryFromScene, removePipeFromScene, sharedSleeveEyeIds } from '../../lib/accessories'
import { trimPipesAtFittings } from '../../lib/pipeTrim'
import {
  DEFAULT_DRAW_LENGTH_MM,
  distance,
  finalizePipeDraw,
  isValidDrawEnd,
  isValidDrawStart,
  MIN_PIPE_LEN_M,
  MIN_PIPE_LEN_MM,
  resolveDrawEnd,
  resolveDrawFromPoint,
  resolveHingeDrawEnd,
  resolveHingeFromPoint,
  resolveMovedPipe,
  projectPointerOnViewPlane,
  projectPointerOnPlane,
  isValidHingeEnd,
  isValidHingeStart,
  type MovedPipe,
  type SnapKind,
  type SnapResult,
} from '../../lib/snap'
import { createPipeBetween, nextPipeId, syncSceneFittings } from '../../lib/scene'
import {
  createPlank,
  getDefaultPlankKind,
  getDefaultPlankWidthMm,
  getDefaultVerticalPlankHeightMm,
  isVerticalPlank,
  movePlankHorizontal,
  nextPlankId,
  resolvePlankPlane,
  resolvePlankPlacement,
  buildPlankMountForPipe,
  buildPlankMounts,
  canPlacePlankBeside,
  seedPlankMountsForPlank,
  togglePlankMount,
  type PlankPlacement,
  type PlankPlane,
} from '../../lib/planks'
import type { PointerModifiers } from '../../lib/pointerModifiers'
import { keyboardModifiers } from '../../lib/pointerModifiers'
import { applyStretchMove, planStretchMove, type StretchPlan, type StretchResult } from '../../lib/stretch'
import { DrawPipeTool } from '../editor/DrawPipeTool'
import { HingeDrawTool } from '../editor/HingeDrawTool'
import { drawStartLabel } from '../editor/DrawPipePanel'
import { RadialMenu } from '../editor/RadialMenu'
import { AccessoryMesh, HingeConnectionMeshes } from './AccessoryMesh'
import { PipeMesh } from './PipeMesh'
import { PlankMesh } from './PlankMesh'
import { PlankMountMesh } from './PlankMountMesh'
import { FittingMesh } from './FittingMesh'
import { SceneEnvironment } from './SceneEnvironment'
import { FootprintOutline } from './FootprintOutline'
import { GroundAnchor } from './GroundAnchor'

export interface DrawUiState {
  kind: 'draw' | 'hinge'
  lengthMm: number
  directionLabel: string
  startLabel: string
  endFree: boolean
  onLengthChange: (mm: number) => void
  onPlace: () => void
  onCancel: () => void
}

interface EditorSceneProps {
  scene: SceneModel
  config: KlimrekConfig
  tool: EditorTool
  selection: EditorSelection | null
  highlightedIds?: Set<string>
  /** Actief plaatsingsvlak voor de plank-tool (ghost volgt dit). */
  plankPlane?: PlankPlane
  onSceneChange: (scene: SceneModel) => void
  onSelectionChange: (selection: EditorSelection | null) => void
  onDrawUiChange?: (ui: DrawUiState | null) => void
}

export function EditorScene({
  scene,
  config,
  tool,
  selection,
  highlightedIds,
  plankPlane = 'xz',
  onSceneChange,
  onSelectionChange,
  onDrawUiChange,
}: EditorSceneProps) {
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<Vec3 | null>(null)
  const [drawStartKind, setDrawStartKind] = useState<SnapKind>('endpoint')
  const [drawStartPipeId, setDrawStartPipeId] = useState<string | null>(null)
  const [drawPreview, setDrawPreview] = useState<SnapResult | null>(null)
  const [drawLengthMm, setDrawLengthMm] = useState(DEFAULT_DRAW_LENGTH_MM)
  const [hingeStart, setHingeStart] = useState<Vec3 | null>(null)
  const [hingeStartSnap, setHingeStartSnap] = useState<SnapResult | null>(null)
  const [hingePreview, setHingePreview] = useState<SnapResult | null>(null)
  const [hingeLengthMm, setHingeLengthMm] = useState(DEFAULT_DRAW_LENGTH_MM)
  const [moveState, setMoveState] = useState<{
    pipeId: string
    grab: Vec3
    start: Vec3
    end: Vec3
    plan: StretchPlan
  } | null>(null)
  const [movePreview, setMovePreview] = useState<MovedPipe | null>(null)
  const [stretchPreview, setStretchPreview] = useState<StretchResult | null>(null)
  const [plankPreview, setPlankPreview] = useState<PlankPlacement | null>(null)
  const [plankMoveState, setPlankMoveState] = useState<{ plankId: string; grab: Vec3 } | null>(null)
  const [plankMovePreview, setPlankMovePreview] = useState<Vec3 | null>(null)
  const lastDrawPipeHover = useRef<{ raw: Vec3; pipeId: string; precise: boolean } | null>(null)
  const lastHingePipeHover = useRef<{ raw: Vec3; pipeId: string; precise: boolean } | null>(null)
  const lastPlankPipeHover = useRef<{ raw: Vec3; pipeId: string } | null>(null)

  const cancelMove = useCallback(() => {
    setMoveState(null)
    setMovePreview(null)
    setStretchPreview(null)
    setPlankMoveState(null)
    setPlankMovePreview(null)
    document.body.style.cursor = 'default'
  }, [])

  const accessories = useMemo(() => scene.accessories ?? [], [scene.accessories])
  const planks = useMemo(() => scene.planks ?? [], [scene.planks])

  // Ghost volgt het toolbar-vlak bij — herbereken of wis bij wissel.
  useEffect(() => {
    if (tool !== 'plank') {
      setPlankPreview(null)
      lastPlankPipeHover.current = null
      return
    }
    const last = lastPlankPipeHover.current
    if (!last) {
      setPlankPreview(null)
      return
    }
    const pipe = scene.pipes.find((p) => p.id === last.pipeId)
    if (!pipe) {
      setPlankPreview(null)
      return
    }
    const kind = getDefaultPlankKind()
    const widthMm =
      plankPlane === 'xz' ? getDefaultPlankWidthMm() : getDefaultVerticalPlankHeightMm()
    setPlankPreview(
      resolvePlankPlacement(last.raw, pipe, scene.pipes, planks, {
        widthMm,
        plane: plankPlane,
        kind,
      }),
    )
  }, [plankPlane, tool, scene.pipes, planks])

  // Bij dubbelscharnieren (twee ogen op één klempunt) tekent alleen het eerste oog de klem.
  const sharedSleeves = useMemo(() => sharedSleeveEyeIds(accessories), [accessories])

  // Grond-snap-hoogte: 0 bij voetplaat, negatieve verankeringsdiepte bij grondanker (geen voetplaat).
  const groundY = useMemo(
    () => (config.baseType === 'grondanker' ? -(config.anchorDepthMm ?? 0) / 1000 : 0),
    [config.baseType, config.anchorDepthMm],
  )

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

  const addPipe = useCallback(
    (pipes: SceneModel['pipes']) => {
      onSceneChange(syncSceneFittings({ ...scene, pipes }, config))
    },
    [scene, config, onSceneChange],
  )

  const handlePipeSelect = useCallback(
    (pipeId: string, worldPosition: Vec3) => {
      if (tool !== 'select') return
      // Plank geselecteerd: klik op een kandidaat-buis schakelt de schapsteun.
      if (selection?.kind === 'plank') {
        const plank = planks.find((p) => p.id === selection.plankId)
        const pipe = scene.pipes.find((p) => p.id === pipeId)
        if (plank && pipe && buildPlankMountForPipe(plank, pipe)) {
          onSceneChange(syncSceneFittings(togglePlankMount(scene, plank.id, pipeId), config))
          return
        }
      }
      onSelectionChange({ kind: 'pipe', pipeId, worldPosition })
    },
    [tool, selection, planks, scene, config, onSceneChange, onSelectionChange],
  )

  const previewEnd = useMemo(() => {
    if (!drawStart || !drawPreview) return null
    return resolveDrawEnd(drawStart, drawPreview, drawLengthMm)
  }, [drawStart, drawPreview, drawLengthMm])

  const cancelDraw = useCallback(() => {
    setDrawStart(null)
    setDrawStartKind('endpoint')
    setDrawStartPipeId(null)
    setDrawPreview(null)
    setDrawLengthMm(DEFAULT_DRAW_LENGTH_MM)
    setIsDrawing(false)
  }, [])

  const placeDraw = useCallback(
    (previewOverride?: SnapResult) => {
      if (!drawStart) return
      const preview = previewOverride ?? drawPreview
      if (!preview) return
      const end = resolveDrawEnd(drawStart, preview, drawLengthMm)
      if (distance(drawStart, end) < 0.08) return

      const finalized = finalizePipeDraw(drawStart, end, scene.pipes, drawStartKind, drawStartPipeId)
      if (!finalized) return

      const id = nextPipeId(scene)
      const newPipe = createPipeBetween(finalized.start, finalized.end, config.diameter, id)
      addPipe([...scene.pipes, newPipe])
      onSelectionChange({
        kind: 'pipe',
        pipeId: id,
        worldPosition: [
          (finalized.start[0] + finalized.end[0]) / 2,
          (finalized.start[1] + finalized.end[1]) / 2,
          (finalized.start[2] + finalized.end[2]) / 2,
        ],
      })
      cancelDraw()
    },
    [drawStart, drawPreview, drawLengthMm, drawStartKind, drawStartPipeId, scene, config.diameter, addPipe, onSelectionChange, cancelDraw],
  )

  const updateDrawPreview = useCallback(
    (result: SnapResult) => {
      setDrawPreview(result)
      if (drawStart && result.axis) {
        const fromMouse = Math.round(distance(drawStart, result.point) * 1000)
        if (fromMouse >= MIN_PIPE_LEN_MM) {
          setDrawLengthMm(fromMouse)
        }
      }
    },
    [drawStart],
  )

  const handleDrawPoint = useCallback(
    (result: SnapResult) => {
      if (!isValidDrawStart(result)) return

      if (!drawStart) {
        setDrawStart(result.point)
        setDrawStartKind(result.kind)
        setDrawStartPipeId(result.pipeId ?? null)
        updateDrawPreview(result)
        setIsDrawing(true)
      }
    },
    [drawStart, updateDrawPreview],
  )

  const handleDrawClickFromPipe = useCallback(
    (raw: Vec3, pipeId: string, modifiers: PointerModifiers) => {
      const result = resolveDrawFromPoint(raw, drawStart, scene.pipes, pipeId, drawStartPipeId, modifiers.precise)
      if (!drawStart) {
        handleDrawPoint(result)
        return
      }
      if (isValidDrawEnd(result, drawStart)) {
        placeDraw(result)
      }
    },
    [drawStart, drawStartPipeId, scene.pipes, handleDrawPoint, placeDraw],
  )

  const handleDrawHover = useCallback(
    (raw: Vec3, pipeId: string, modifiers: PointerModifiers) => {
      if (tool !== 'draw') return
      lastDrawPipeHover.current = { raw, pipeId, precise: modifiers.precise }
      updateDrawPreview(resolveDrawFromPoint(raw, drawStart, scene.pipes, pipeId, drawStartPipeId, modifiers.precise))
    },
    [tool, drawStart, drawStartPipeId, scene.pipes, updateDrawPreview],
  )

  const hingePreviewEnd = useMemo(() => {
    if (!hingeStart || !hingePreview) return null
    return resolveHingeDrawEnd(hingeStart, hingePreview, hingeLengthMm)
  }, [hingeStart, hingePreview, hingeLengthMm])

  const cancelHingeDraw = useCallback(() => {
    setHingeStart(null)
    setHingeStartSnap(null)
    setHingePreview(null)
    setHingeLengthMm(DEFAULT_DRAW_LENGTH_MM)
  }, [])

  useEffect(() => {
    if (tool !== 'draw') cancelDraw()
    if (tool !== 'hinge') cancelHingeDraw()
    if (tool !== 'move') cancelMove()
    if (tool !== 'plank') setPlankPreview(null)
  }, [tool, cancelDraw, cancelHingeDraw, cancelMove])

  useEffect(() => {
    if (tool !== 'move') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelMove()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, cancelMove])

  const placeHingeDraw = useCallback(
    (previewOverride?: SnapResult) => {
      if (!hingeStart || !hingeStartSnap) return
      const preview = previewOverride ?? hingePreview
      if (!preview) return
      const end = resolveHingeDrawEnd(hingeStart, preview, hingeLengthMm)
      if (distance(hingeStart, end) < 0.08) return

      const updated = placeHingeSpan(scene, config, hingeStart, end, hingeStartSnap, preview)
      if (!updated) return

      onSceneChange(updated)
      cancelHingeDraw()
    },
    [hingeStart, hingeStartSnap, hingePreview, hingeLengthMm, scene, config, onSceneChange, cancelHingeDraw],
  )

  const updateHingePreview = useCallback(
    (result: SnapResult) => {
      setHingePreview(result)
      if (hingeStart) {
        const fromMouse = Math.round(distance(hingeStart, result.point) * 1000)
        if (fromMouse >= MIN_PIPE_LEN_MM) {
          setHingeLengthMm(fromMouse)
        }
      }
    },
    [hingeStart],
  )

  const handleHingePoint = useCallback(
    (result: SnapResult) => {
      if (!hingeStart) {
        if (!isValidHingeStart(result)) return
        setHingeStart(result.point)
        setHingeStartSnap(result)
        updateHingePreview(result)
      }
    },
    [hingeStart, updateHingePreview],
  )

  const handleHingeClickFromPipe = useCallback(
    (raw: Vec3, pipeId: string, modifiers: PointerModifiers) => {
      const result = resolveHingeFromPoint(raw, hingeStart, scene.pipes, pipeId, modifiers.precise)
      if (!hingeStart) {
        handleHingePoint(result)
        return
      }
      if (isValidHingeEnd(result, hingeStart)) {
        placeHingeDraw(result)
      }
    },
    [hingeStart, scene.pipes, handleHingePoint, placeHingeDraw],
  )

  const handleHingeHoverFromPipe = useCallback(
    (raw: Vec3, pipeId: string, modifiers: PointerModifiers) => {
      if (tool !== 'hinge') return
      lastHingePipeHover.current = { raw, pipeId, precise: modifiers.precise }
      updateHingePreview(resolveHingeFromPoint(raw, hingeStart, scene.pipes, pipeId, modifiers.precise))
    },
    [tool, hingeStart, scene.pipes, updateHingePreview],
  )

  // Plank-tool: hover toont een ghost-plank in het gekozen plaatsingsvlak;
  // één klik plaatst hem (zij-snap op het breedte-/dikte-raster).
  const handlePlankHoverFromPipe = useCallback(
    (raw: Vec3, pipeId: string) => {
      if (tool !== 'plank') return
      const pipe = scene.pipes.find((p) => p.id === pipeId)
      if (!pipe) return
      lastPlankPipeHover.current = { raw, pipeId }
      const kind = getDefaultPlankKind()
      const widthMm =
        plankPlane === 'xz' ? getDefaultPlankWidthMm() : getDefaultVerticalPlankHeightMm()
      setPlankPreview(
        resolvePlankPlacement(raw, pipe, scene.pipes, planks, {
          widthMm,
          plane: plankPlane,
          kind,
        }),
      )
    },
    [tool, scene.pipes, planks, plankPlane],
  )

  const handlePlankClickFromPipe = useCallback(
    (raw: Vec3, pipeId: string) => {
      const pipe = scene.pipes.find((p) => p.id === pipeId)
      if (!pipe) return
      const kind = getDefaultPlankKind()
      const widthMm =
        plankPlane === 'xz' ? getDefaultPlankWidthMm() : getDefaultVerticalPlankHeightMm()
      const placement = resolvePlankPlacement(raw, pipe, scene.pipes, planks, {
        widthMm,
        plane: plankPlane,
        kind,
      })
      if (!placement) return
      const id = nextPlankId(scene)
      const plank = createPlank(placement, id)
      const withPlank = { ...scene, planks: [...planks, plank] }
      onSceneChange(syncSceneFittings(seedPlankMountsForPlank(withPlank, plank), config))
      onSelectionChange({ kind: 'plank', plankId: id, worldPosition: plank.position })
    },
    [scene, planks, config, plankPlane, onSceneChange, onSelectionChange],
  )

  const handlePlankSelect = useCallback(
    (plankId: string, worldPosition: Vec3) => {
      if (tool !== 'select') return
      onSelectionChange({ kind: 'plank', plankId, worldPosition })
    },
    [tool, onSelectionChange],
  )

  const deletePlank = useCallback(
    (plankId: string) => {
      onSceneChange(
        syncSceneFittings({ ...scene, planks: planks.filter((p) => p.id !== plankId) }, config),
      )
      onSelectionChange(null)
    },
    [scene, planks, config, onSceneChange, onSelectionChange],
  )

  /**
   * Kopieer de plank strak ernaast (plankbreedte opzij) — voor een dicht platform.
   * `side` +1 / −1 = beide kanten loodrecht op de planglengte.
   */
  const duplicatePlank = useCallback(
    (plankId: string, side: 1 | -1) => {
      const source = planks.find((p) => p.id === plankId)
      if (!source) return
      const widthDir: Vec3 = [source.axis[2], 0, -source.axis[0]]
      const stepMm = isVerticalPlank(source) ? source.thicknessMm : source.widthMm
      const offset = (stepMm / 1000) * side
      const id = nextPlankId(scene)
      // Offset in dikte-/breedterichting (kan buiten het vlak zijn) — niet via movePlankHorizontal.
      const copy: typeof source = {
        ...source,
        id,
        position: [
          source.position[0] + widthDir[0] * offset,
          source.position[1],
          source.position[2] + widthDir[2] * offset,
        ],
      }
      const withPlank = { ...scene, planks: [...planks, copy] }
      onSceneChange(syncSceneFittings(seedPlankMountsForPlank(withPlank, copy), config))
      onSelectionChange({ kind: 'plank', plankId: id, worldPosition: copy.position })
    },
    [scene, planks, config, onSceneChange, onSelectionChange],
  )

  const handlePlankMoveStart = useCallback(
    (plankId: string, grab: Vec3) => {
      setPlankMoveState({ plankId, grab })
      setPlankMovePreview(null)
    },
    [],
  )

  const plankMoveDelta = useCallback(
    (rayOrigin: Vec3, rayDir: Vec3): Vec3 | null => {
      if (!plankMoveState) return null
      const plank = planks.find((p) => p.id === plankMoveState.plankId)
      if (!plank) return null
      const plane = resolvePlankPlane(plank)
      const grab = plankMoveState.grab

      let cursor: Vec3
      if (plane === 'xy') {
        // Raycast tegen XY-vlak door de plank (normaal ±Z).
        cursor =
          projectPointerOnPlane(grab, [0, 0, 1], rayOrigin, rayDir) ??
          projectPointerOnViewPlane(grab, rayOrigin, rayDir)
        cursor = [cursor[0], cursor[1], grab[2]]
      } else if (plane === 'yz') {
        // Raycast tegen YZ-vlak door de plank (normaal ±X).
        cursor =
          projectPointerOnPlane(grab, [1, 0, 0], rayOrigin, rayDir) ??
          projectPointerOnViewPlane(grab, rayOrigin, rayDir)
        cursor = [grab[0], cursor[1], cursor[2]]
      } else {
        // xz: bestaand gedrag — view-plane; Y blijft vast in movePlankHorizontal.
        cursor = projectPointerOnViewPlane(grab, rayOrigin, rayDir)
      }

      return [cursor[0] - grab[0], cursor[1] - grab[1], cursor[2] - grab[2]]
    },
    [plankMoveState, planks],
  )

  const handlePlankMoveDrag = useCallback(
    (rayOrigin: Vec3, rayDir: Vec3) => {
      const delta = plankMoveDelta(rayOrigin, rayDir)
      if (!delta) return
      setPlankMovePreview(delta)
    },
    [plankMoveDelta],
  )

  const handlePlankMoveEnd = useCallback(
    (rayOrigin: Vec3, rayDir: Vec3) => {
      const delta = plankMoveDelta(rayOrigin, rayDir)
      if (delta && plankMoveState && Math.hypot(delta[0], delta[1], delta[2]) > 0.0005) {
        const nextPlanks = planks.map((p) =>
          p.id === plankMoveState.plankId ? movePlankHorizontal(p, delta) : p,
        )
        onSceneChange(syncSceneFittings({ ...scene, planks: nextPlanks }, config))
      }
      setPlankMoveState(null)
      setPlankMovePreview(null)
    },
    [plankMoveDelta, plankMoveState, planks, scene, config, onSceneChange],
  )

  useEffect(() => {
    if (tool !== 'draw' && tool !== 'hinge') return
    const refresh = (e: KeyboardEvent) => {
      const precise = keyboardModifiers(e).precise
      if (tool === 'draw' && lastDrawPipeHover.current) {
        const { raw, pipeId } = lastDrawPipeHover.current
        if (lastDrawPipeHover.current.precise === precise) return
        lastDrawPipeHover.current = { raw, pipeId, precise }
        updateDrawPreview(resolveDrawFromPoint(raw, drawStart, scene.pipes, pipeId, drawStartPipeId, precise))
      }
      if (tool === 'hinge' && lastHingePipeHover.current) {
        const { raw, pipeId } = lastHingePipeHover.current
        if (lastHingePipeHover.current.precise === precise) return
        lastHingePipeHover.current = { raw, pipeId, precise }
        updateHingePreview(resolveHingeFromPoint(raw, hingeStart, scene.pipes, pipeId, precise))
      }
    }
    window.addEventListener('keydown', refresh)
    window.addEventListener('keyup', refresh)
    return () => {
      window.removeEventListener('keydown', refresh)
      window.removeEventListener('keyup', refresh)
    }
  }, [tool, drawStart, drawStartPipeId, hingeStart, scene.pipes, updateDrawPreview, updateHingePreview])

  // Stabiele verwijzingen naar de plaats/annuleer-acties, zodat de UI-descriptor
  // die naar buiten (buiten de 3D-view) gaat niet elke render verandert.
  const placeDrawRef = useRef(placeDraw)
  placeDrawRef.current = placeDraw
  const cancelDrawRef = useRef(cancelDraw)
  cancelDrawRef.current = cancelDraw
  const placeHingeDrawRef = useRef(placeHingeDraw)
  placeHingeDrawRef.current = placeHingeDraw
  const cancelHingeDrawRef = useRef(cancelHingeDraw)
  cancelHingeDrawRef.current = cancelHingeDraw

  useEffect(() => {
    if (!onDrawUiChange) return
    if (drawStart && drawPreview) {
      const a = drawPreview.axis
      const directionLabel = a
        ? a[1] > 0.5
          ? '+Y omhoog'
          : a[1] < -0.5
            ? '-Y omlaag'
            : a[0] > 0.5
              ? '+X'
              : a[0] < -0.5
                ? '-X'
                : a[2] > 0.5
                  ? '+Z'
                  : '-Z'
        : 'Beweeg muis'
      onDrawUiChange({
        kind: 'draw',
        lengthMm: drawLengthMm,
        directionLabel,
        startLabel: drawStartLabel(drawStartKind),
        endFree: !drawPreview.connected,
        onLengthChange: setDrawLengthMm,
        onPlace: () => placeDrawRef.current(),
        onCancel: () => cancelDrawRef.current(),
      })
    } else if (hingeStart && hingePreview) {
      onDrawUiChange({
        kind: 'hinge',
        lengthMm: hingeLengthMm,
        directionLabel: hingePreview.connected
          ? 'Op buis'
          : hingePreview.axis
            ? 'Schuine richting'
            : 'Beweeg muis',
        startLabel: 'Oog op frame-buis',
        endFree: !hingePreview.connected,
        onLengthChange: setHingeLengthMm,
        onPlace: () => placeHingeDrawRef.current(),
        onCancel: () => cancelHingeDrawRef.current(),
      })
    } else {
      onDrawUiChange(null)
    }
  }, [
    drawStart,
    drawPreview,
    drawLengthMm,
    drawStartKind,
    hingeStart,
    hingePreview,
    hingeLengthMm,
    onDrawUiChange,
  ])

  const handleMoveStart = useCallback(
    (pipeId: string, grab: Vec3) => {
      const p = scene.pipes.find((pipe) => pipe.id === pipeId)
      if (!p) return
      const plan = planStretchMove(scene.pipes, pipeId, groundY)
      setMoveState({ pipeId, grab, start: p.start, end: p.end, plan })
      if (plan.touches.length > 0 || plan.sliders.length > 0) {
        setStretchPreview({
          changed: [{ id: p.id, start: p.start, end: p.end }],
          delta: [0, 0, 0],
          valid: plan.ok,
        })
      } else {
        setMovePreview({ start: p.start, end: p.end, connected: true })
      }
    },
    [scene.pipes, groundY],
  )

  /** Verbonden buizen → stretch-pad (lassen rekken, T-stukken glijden); losse buizen → rigide pad. */
  const isStretchMove = (plan: StretchPlan) => plan.touches.length > 0 || plan.sliders.length > 0

  const handleMoveDrag = useCallback(
    (rayOrigin: Vec3, rayDir: Vec3) => {
      if (!moveState) return
      const cursor = projectPointerOnViewPlane(moveState.grab, rayOrigin, rayDir)
      const delta: Vec3 = [
        cursor[0] - moveState.grab[0],
        cursor[1] - moveState.grab[1],
        cursor[2] - moveState.grab[2],
      ]
      if (isStretchMove(moveState.plan)) {
        setStretchPreview(applyStretchMove(scene.pipes, moveState.plan, delta, groundY))
        return
      }
      const others = scene.pipes.filter((p) => p.id !== moveState.pipeId)
      setMovePreview(resolveMovedPipe(moveState.start, moveState.end, delta, others, groundY))
    },
    [moveState, scene.pipes, groundY],
  )

  const handleMoveEnd = useCallback(
    (rayOrigin: Vec3, rayDir: Vec3) => {
      if (!moveState) {
        cancelMove()
        return
      }
      const cursor = projectPointerOnViewPlane(moveState.grab, rayOrigin, rayDir)
      const delta: Vec3 = [
        cursor[0] - moveState.grab[0],
        cursor[1] - moveState.grab[1],
        cursor[2] - moveState.grab[2],
      ]

      if (isStretchMove(moveState.plan)) {
        const result = applyStretchMove(scene.pipes, moveState.plan, delta, groundY)
        if (result.valid && distance(result.delta, [0, 0, 0]) > 0.0005) {
          const byId = new Map(result.changed.map((c) => [c.id, c]))
          const nextPipes = scene.pipes.map((p) => {
            const c = byId.get(p.id)
            return c ? { ...p, start: c.start, end: c.end } : p
          })
          onSceneChange(syncSceneFittings({ ...scene, pipes: nextPipes }, config))
        }
        cancelMove()
        return
      }

      const others = scene.pipes.filter((p) => p.id !== moveState.pipeId)
      const moved = resolveMovedPipe(moveState.start, moveState.end, delta, others, groundY)
      // Constraint: buis mag nooit volledig zwevend worden.
      if (moved.connected && distance(moved.start, moved.end) >= MIN_PIPE_LEN_M) {
        const nextPipes = scene.pipes.map((p) =>
          p.id === moveState.pipeId ? { ...p, start: moved.start, end: moved.end } : p,
        )
        onSceneChange(syncSceneFittings({ ...scene, pipes: nextPipes }, config))
      }
      cancelMove()
    },
    [moveState, scene, config, groundY, onSceneChange, cancelMove],
  )

  const deleteAccessory = useCallback(
    (accessoryId: string) => {
      onSceneChange(syncSceneFittings(removeAccessoryFromScene(scene, accessoryId), config))
      onSelectionChange(null)
    },
    [scene, config, onSceneChange, onSelectionChange],
  )

  const handleAccessorySelect = useCallback(
    (accessoryId: string, worldPosition: Vec3) => {
      if (tool !== 'select') return
      onSelectionChange({ kind: 'accessory', accessoryId, worldPosition })
    },
    [tool, onSelectionChange],
  )

  const deletePipe = useCallback(
    (pipeId: string) => {
      onSceneChange(syncSceneFittings(removePipeFromScene(scene, pipeId), config))
      onSelectionChange(null)
    },
    [scene, config, onSceneChange, onSelectionChange],
  )

  const duplicatePipe = useCallback(
    (pipeId: string) => {
      const source = scene.pipes.find((p) => p.id === pipeId)
      if (!source) return
      const offset = 0.25
      const id = nextPipeId(scene)
      const copy = {
        ...source,
        id,
        start: [source.start[0] + offset, source.start[1], source.start[2]] as Vec3,
        end: [source.end[0] + offset, source.end[1], source.end[2]] as Vec3,
        label: PIPE_LABEL,
      }
      addPipe([...scene.pipes, copy])
      onSelectionChange({
        kind: 'pipe',
        pipeId: id,
        worldPosition: [
          (copy.start[0] + copy.end[0]) / 2,
          (copy.start[1] + copy.end[1]) / 2,
          (copy.start[2] + copy.end[2]) / 2,
        ],
      })
    },
    [scene, addPipe, onSelectionChange],
  )

  const selectedPipe = selection?.kind === 'pipe' ? scene.pipes.find((p) => p.id === selection.pipeId) : null
  const selectedAccessory =
    selection?.kind === 'accessory' ? accessories.find((a) => a.id === selection.accessoryId) : null
  const selectedPlank = selection?.kind === 'plank' ? planks.find((p) => p.id === selection.plankId) : null

  return (
    <>
      <SceneEnvironment
        environment={configEnvironment(config)}
        size={Math.max(bounds.maxXZ * 4, 24)}
        onClick={() => tool === 'select' && onSelectionChange(null)}
      />

      <GroundAnchor scene={scene} config={config} />

      <FootprintOutline pipes={scene.pipes} />

      <group>
        {trimmedPipes.map((p) => (
          <PipeMesh
            key={p.id}
            pipe={p}
            color={color}
            selected={selection?.kind === 'pipe' && selection.pipeId === p.id}
            highlighted={highlightedIds?.has(p.id) ?? false}
            interactive={tool === 'select' || tool === 'draw' || tool === 'hinge' || tool === 'move' || tool === 'plank'}
            drawMode={tool === 'draw'}
            hingeMode={tool === 'hinge'}
            moveMode={tool === 'move'}
            plankMode={tool === 'plank'}
            onSelect={tool === 'select' ? handlePipeSelect : undefined}
            onDrawClick={tool === 'draw' ? handleDrawClickFromPipe : undefined}
            onDrawHover={tool === 'draw' ? handleDrawHover : undefined}
            onHingeClick={tool === 'hinge' ? handleHingeClickFromPipe : undefined}
            onHingeHover={tool === 'hinge' ? handleHingeHoverFromPipe : undefined}
            onPlankClick={tool === 'plank' ? handlePlankClickFromPipe : undefined}
            onPlankHover={tool === 'plank' ? handlePlankHoverFromPipe : undefined}
            onMoveStart={tool === 'move' ? handleMoveStart : undefined}
            onMoveDrag={tool === 'move' ? handleMoveDrag : undefined}
            onMoveEnd={tool === 'move' ? handleMoveEnd : undefined}
          />
        ))}
      </group>

      <group>
        {planks.map((plank) => {
          const moving = plankMoveState?.plankId === plank.id && plankMovePreview != null
          const shown = moving ? movePlankHorizontal(plank, plankMovePreview!) : plank
          return (
            <PlankMesh
              key={plank.id}
              plank={shown}
              selected={selection?.kind === 'plank' && selection.plankId === plank.id}
              highlighted={highlightedIds?.has(plank.id) ?? false}
              pickable={tool === 'select'}
              moveMode={tool === 'move'}
              ghost={moving}
              onSelect={tool === 'select' ? handlePlankSelect : undefined}
              onMoveStart={tool === 'move' ? handlePlankMoveStart : undefined}
              onMoveDrag={tool === 'move' ? handlePlankMoveDrag : undefined}
              onMoveEnd={tool === 'move' ? handlePlankMoveEnd : undefined}
            />
          )
        })}
      </group>

      {tool === 'plank' && plankPreview && (
        <PlankMesh
          plank={{
            id: 'plank-ghost',
            position: plankPreview.position,
            axis: plankPreview.axis,
            lengthMm: plankPreview.lengthMm,
            widthMm: plankPreview.widthMm,
            thicknessMm: plankPreview.thicknessMm,
            plane: plankPreview.plane,
            orientation: plankPreview.plane === 'xz' ? undefined : 'vertical',
            kind: plankPreview.kind === 'plate' ? 'plate' : undefined,
          }}
          ghost
        />
      )}

      <group>
        {accessories.map((acc) => (
          <AccessoryMesh
            key={acc.id}
            accessory={acc}
            materialId={scene.materialId}
            selected={selection?.kind === 'accessory' && selection.accessoryId === acc.id}
            highlighted={highlightedIds?.has(acc.id) ?? false}
            pickable={tool === 'select'}
            hideSleeve={sharedSleeves.has(acc.id)}
            onSelect={tool === 'select' ? handleAccessorySelect : undefined}
          />
        ))}
      </group>

      <HingeConnectionMeshes accessories={accessories} connections={scene.hingeConnections ?? []} />

      <group>
        {scene.fittings.map((f) => (
          <FittingMesh
            key={f.id}
            fitting={f}
            materialId={scene.materialId}
            pickable={tool === 'select'}
            highlighted={highlightedIds?.has(f.id) ?? false}
          />
        ))}
      </group>

      {/* Schapsteunen ná fittings: anders verdwijnen ze in T-stukken op dezelfde knoop. */}
      <group>
        {(scene.plankMounts ?? []).map((mount) => {
          const plank = planks.find((p) => p.id === mount.plankId)
          if (!plank) return null
          const moving = plankMoveState?.plankId === plank.id && plankMovePreview != null
          const shown = moving ? movePlankHorizontal(plank, plankMovePreview!) : plank
          const pipe = scene.pipes.find((p) => p.id === mount.pipeId)
          const live =
            moving && pipe ? (buildPlankMountForPipe(shown, pipe) ?? mount) : mount
          return (
            <PlankMountMesh
              key={mount.id}
              mount={live}
              materialId={scene.materialId}
              highlighted={highlightedIds?.has(plank.id) ?? false}
              ghost={moving}
            />
          )
        })}
        {tool === 'plank' &&
          plankPreview &&
          buildPlankMounts(
            {
              id: 'plank-ghost',
              position: plankPreview.position,
              axis: plankPreview.axis,
              lengthMm: plankPreview.lengthMm,
              widthMm: plankPreview.widthMm,
              thicknessMm: plankPreview.thicknessMm,
              plane: plankPreview.plane,
              orientation: plankPreview.plane === 'xz' ? undefined : 'vertical',
              kind: plankPreview.kind === 'plate' ? 'plate' : undefined,
            },
            scene.pipes,
          ).map((mount) => (
            <PlankMountMesh
              key={`ghost-${mount.id}`}
              mount={mount}
              materialId={scene.materialId}
              ghost
            />
          ))}
      </group>

      <HingeDrawTool
        active={tool === 'hinge'}
        start={hingeStart}
        preview={hingePreview}
        previewEnd={hingePreviewEnd}
        pipes={scene.pipes}
        onPoint={handleHingePoint}
        onPreview={updateHingePreview}
        onPlace={placeHingeDraw}
        onCancel={cancelHingeDraw}
      />

      {tool === 'move' && moveState && movePreview && (
        <group>
          <Line
            points={[movePreview.start, movePreview.end]}
            color={movePreview.connected ? '#2d6a4f' : '#e76f51'}
            lineWidth={3}
            dashed={!movePreview.connected}
            dashSize={0.08}
            gapSize={0.05}
          />
          {movePreview.anchor && (
            <mesh position={movePreview.anchor} scale={0.06}>
              <sphereGeometry args={[1, 16, 16]} />
              <meshStandardMaterial color="#2d6a4f" emissive="#2d6a4f" emissiveIntensity={0.5} />
            </mesh>
          )}
        </group>
      )}

      {tool === 'move' && moveState && stretchPreview && (
        <group>
          {stretchPreview.changed.map((c) => (
            <Line
              key={c.id}
              points={[c.start, c.end]}
              color={stretchPreview.valid ? (c.id === moveState.pipeId ? '#2d6a4f' : '#52b788') : '#e76f51'}
              lineWidth={c.id === moveState.pipeId ? 3 : 2}
              dashed={!stretchPreview.valid || c.id !== moveState.pipeId}
              dashSize={0.08}
              gapSize={0.05}
            />
          ))}
        </group>
      )}

      <DrawPipeTool
        active={tool === 'draw'}
        start={drawStart}
        startPipeId={drawStartPipeId}
        groundY={groundY}
        preview={drawPreview}
        previewEnd={previewEnd}
        pipes={scene.pipes}
        onPoint={handleDrawPoint}
        onPreview={updateDrawPreview}
        onPlace={placeDraw}
        onCancel={cancelDraw}
      />

      {selection && selectedPipe && tool === 'select' && selection.kind === 'pipe' && (
        <Html position={selection.worldPosition} center zIndexRange={[100, 0]}>
          <RadialMenu
            items={[
              {
                id: 'duplicate',
                label: 'Dupliceer',
                icon: '⧉',
                onClick: () => duplicatePipe(selection.pipeId),
              },
              {
                id: 'delete',
                label: 'Verwijder',
                icon: '✕',
                variant: 'danger',
                onClick: () => deletePipe(selection.pipeId),
              },
              {
                id: 'close',
                label: 'Sluiten',
                icon: '○',
                onClick: () => onSelectionChange(null),
              },
            ]}
          />
        </Html>
      )}

      {selection && selectedPlank && tool === 'select' && selection.kind === 'plank' && (
        <Html position={selection.worldPosition} center zIndexRange={[100, 0]}>
          <RadialMenu
            items={[
              ...(canPlacePlankBeside(selectedPlank, -1, planks, scene.pipes)
                ? [
                    {
                      id: 'duplicate-left',
                      label: 'Leg ernaast ←',
                      icon: '⧉',
                      onClick: () => duplicatePlank(selection.plankId, -1),
                    },
                  ]
                : []),
              ...(canPlacePlankBeside(selectedPlank, 1, planks, scene.pipes)
                ? [
                    {
                      id: 'duplicate-right',
                      label: 'Leg ernaast →',
                      icon: '⧉',
                      onClick: () => duplicatePlank(selection.plankId, 1),
                    },
                  ]
                : []),
              {
                id: 'delete',
                label: 'Verwijder',
                icon: '✕',
                variant: 'danger',
                onClick: () => deletePlank(selection.plankId),
              },
              {
                id: 'close',
                label: 'Sluiten',
                icon: '○',
                onClick: () => onSelectionChange(null),
              },
            ]}
          />
        </Html>
      )}

      {selection && selectedAccessory && tool === 'select' && selection.kind === 'accessory' && (
        <Html position={selection.worldPosition} center zIndexRange={[100, 0]}>
          <RadialMenu
            items={[
              {
                id: 'delete',
                label: 'Verwijder',
                icon: '✕',
                variant: 'danger' as const,
                onClick: () => deleteAccessory(selection.accessoryId),
              },
              {
                id: 'close',
                label: 'Sluiten',
                icon: '○',
                onClick: () => onSelectionChange(null),
              },
            ]}
          />
        </Html>
      )}

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
        enableRotate={
          tool === 'pan' || tool === 'move'
            ? false
            : (tool === 'select' && !isDrawing) ||
              (tool === 'draw' && !drawStart) ||
              (tool === 'hinge' && !hingeStart) ||
              tool === 'plank'
        }
        enableZoom
        panSpeed={0.8}
        mouseButtons={
          tool === 'pan'
            ? { LEFT: MOUSE.PAN, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }
            : { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }
        }
        target={[0, (bounds.maxY + bounds.minY) / 2, 0]}
        minDistance={1}
        maxDistance={bounds.maxXZ * 6}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </>
  )
}
