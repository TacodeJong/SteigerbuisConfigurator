import { useCallback, useRef, useState } from 'react'
import type { KlimrekConfig, SceneModel } from '../types'

/** Maximaal aantal undo-stappen in de editor. */
export const EDITOR_HISTORY_LIMIT = 50

export interface EditorHistorySnapshot {
  scene: SceneModel
  config: KlimrekConfig
}

interface UseEditorHistoryOptions {
  scene: SceneModel
  config: KlimrekConfig
  onSceneChange: (scene: SceneModel) => void
  onConfigChange?: (config: KlimrekConfig) => void
}

function capStack(stack: EditorHistorySnapshot[]): EditorHistorySnapshot[] {
  return stack.length > EDITOR_HISTORY_LIMIT ? stack.slice(-EDITOR_HISTORY_LIMIT) : stack
}

/**
 * Klassieke undo/redo-stack voor de 3D-editor.
 *
 * Elke betekenisvolle scene/config-mutatie pusht de vorige snapshot op de undo-stack
 * en leegt de redo-stack. Selectie/camera/hover horen hier niet in.
 *
 * Laden vanuit configurator of modelbestand: wel een history-punt (undo herstelt
 * de vorige editor-scene), zodat het minst verwarrend is.
 */
export function useEditorHistory({
  scene,
  config,
  onSceneChange,
  onConfigChange,
}: UseEditorHistoryOptions) {
  const [undoStack, setUndoStack] = useState<EditorHistorySnapshot[]>([])
  const [redoStack, setRedoStack] = useState<EditorHistorySnapshot[]>([])

  const sceneRef = useRef(scene)
  const configRef = useRef(config)
  sceneRef.current = scene
  configRef.current = config

  const undoStackRef = useRef(undoStack)
  const redoStackRef = useRef(redoStack)

  const applySnapshot = useCallback(
    (snap: EditorHistorySnapshot) => {
      onConfigChange?.(snap.config)
      onSceneChange(snap.scene)
    },
    [onConfigChange, onSceneChange],
  )

  const pushCurrent = useCallback(() => {
    const entry: EditorHistorySnapshot = {
      scene: sceneRef.current,
      config: configRef.current,
    }
    const nextUndo = capStack([...undoStackRef.current, entry])
    undoStackRef.current = nextUndo
    redoStackRef.current = []
    setUndoStack(nextUndo)
    setRedoStack([])
  }, [])

  /** Scene-wijziging met history (typische edit-paden). */
  const setSceneWithHistory = useCallback(
    (nextScene: SceneModel) => {
      pushCurrent()
      onSceneChange(nextScene)
    },
    [pushCurrent, onSceneChange],
  )

  /** Scene + config samen (diameter, materiaal, verankering, model laden). */
  const commitWithHistory = useCallback(
    (nextScene: SceneModel, nextConfig: KlimrekConfig) => {
      pushCurrent()
      onConfigChange?.(nextConfig)
      onSceneChange(nextScene)
    },
    [pushCurrent, onConfigChange, onSceneChange],
  )

  const undo = useCallback(() => {
    const stack = undoStackRef.current
    if (stack.length === 0) return false
    const prev = stack[stack.length - 1]!
    const current: EditorHistorySnapshot = {
      scene: sceneRef.current,
      config: configRef.current,
    }
    const nextUndo = stack.slice(0, -1)
    const nextRedo = [...redoStackRef.current, current]
    undoStackRef.current = nextUndo
    redoStackRef.current = nextRedo
    setUndoStack(nextUndo)
    setRedoStack(nextRedo)
    applySnapshot(prev)
    return true
  }, [applySnapshot])

  const redo = useCallback(() => {
    const stack = redoStackRef.current
    if (stack.length === 0) return false
    const next = stack[stack.length - 1]!
    const current: EditorHistorySnapshot = {
      scene: sceneRef.current,
      config: configRef.current,
    }
    const nextRedo = stack.slice(0, -1)
    const nextUndo = capStack([...undoStackRef.current, current])
    redoStackRef.current = nextRedo
    undoStackRef.current = nextUndo
    setRedoStack(nextRedo)
    setUndoStack(nextUndo)
    applySnapshot(next)
    return true
  }, [applySnapshot])

  return {
    setSceneWithHistory,
    commitWithHistory,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  }
}
