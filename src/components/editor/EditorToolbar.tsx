import { useState } from 'react'
import type { EditorTool } from '../../types'
import type { PlankPlane } from '../../lib/planks'

const PLANK_PLANE_OPTIONS: { plane: PlankPlane; label: string; short: string; title: string }[] = [
  {
    plane: 'xz',
    label: 'Liggend',
    short: 'XZ',
    title: 'Liggend (XZ) — plank/plaat plat op liggers',
  },
  {
    plane: 'xy',
    label: 'Verticaal',
    short: 'XY',
    title: 'Verticaal (XY) — wandvlak, lengte langs X',
  },
  {
    plane: 'yz',
    label: 'Verticaal',
    short: 'YZ',
    title: 'Verticaal (YZ) — wandvlak, lengte langs Z',
  },
]

interface EditorToolbarProps {
  tool: EditorTool
  canDelete: boolean
  canUndo?: boolean
  canRedo?: boolean
  plankPlane?: PlankPlane
  planksEnabled?: boolean
  onToolChange: (tool: EditorTool) => void
  onPlankPlaneChange?: (plane: PlankPlane) => void
  onUndo?: () => void
  onRedo?: () => void
  onDelete: () => void
  onReset: () => void
}

export function EditorToolbar({
  tool,
  canDelete,
  canUndo = false,
  canRedo = false,
  plankPlane = 'xz',
  planksEnabled = true,
  onToolChange,
  onPlankPlaneChange,
  onUndo,
  onRedo,
  onDelete,
  onReset,
}: EditorToolbarProps) {
  const [expanded, setExpanded] = useState(false)
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  const mod = isMac ? '⌘' : 'Ctrl+'
  const undoTitle = `Ongedaan maken (${mod}Z)`
  const redoTitle = `Opnieuw uitvoeren (${isMac ? '⌘⇧Z' : 'Ctrl+Y / Ctrl+Shift+Z'})`
  const showPlankPlane = planksEnabled && tool === 'plank' && !!onPlankPlaneChange

  return (
    <div
      className={`editor-tool-drawer${expanded ? ' editor-tool-drawer--expanded' : ' editor-tool-drawer--collapsed'}`}
      role="toolbar"
      aria-label="Editor gereedschap"
    >
      <div className="editor-tool-drawer-rail">
        <button
          type="button"
          className="md-icon-btn editor-tool-drawer-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Gereedschap inklappen' : 'Gereedschap uitklappen'}
          title={expanded ? 'Inklappen' : 'Uitklappen'}
        >
          {expanded ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="m12 8-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" />
            </svg>
          )}
        </button>

        <div className="editor-toolbar-group">
          <button
            type="button"
            className="editor-tool"
            title={undoTitle}
            aria-label={undoTitle}
            disabled={!canUndo || !onUndo}
            onClick={onUndo}
          >
            <span className="tool-icon">↶</span>
            {expanded && <span>Ongedaan</span>}
          </button>
          <button
            type="button"
            className="editor-tool"
            title={redoTitle}
            aria-label={redoTitle}
            disabled={!canRedo || !onRedo}
            onClick={onRedo}
          >
            <span className="tool-icon">↷</span>
            {expanded && <span>Opnieuw</span>}
          </button>
        </div>

        <div className="editor-toolbar-divider" />

        <div className="editor-toolbar-group editor-toolbar-group--tools">
          <button
            type="button"
            className={`editor-tool${tool === 'select' ? ' active' : ''}`}
            title="Selecteren"
            aria-pressed={tool === 'select'}
            onClick={() => onToolChange('select')}
          >
            <span className="tool-icon">↖</span>
            {expanded && <span>Select</span>}
          </button>
          <button
            type="button"
            className={`editor-tool${tool === 'draw' ? ' active' : ''}`}
            title="Buis tekenen"
            aria-pressed={tool === 'draw'}
            onClick={() => onToolChange('draw')}
          >
            <span className="tool-icon">✎</span>
            {expanded && <span>Teken</span>}
          </button>
          <button
            type="button"
            className={`editor-tool${tool === 'move' ? ' active' : ''}`}
            title="Buis verplaatsen (sleep; blijft verbonden)"
            aria-pressed={tool === 'move'}
            onClick={() => onToolChange('move')}
          >
            <span className="tool-icon">✥</span>
            {expanded && <span>Verplaats</span>}
          </button>
          <button
            type="button"
            className={`editor-tool${tool === 'pan' ? ' active' : ''}`}
            title="Hand: sleep = draaien, Shift+sleep = pannen, scroll = zoomen"
            aria-pressed={tool === 'pan'}
            onClick={() => onToolChange('pan')}
          >
            <span className="tool-icon">✋</span>
            {expanded && <span>Hand</span>}
          </button>
          <button
            type="button"
            className={`editor-tool${tool === 'hinge' ? ' active' : ''}`}
            title="Schuine verbindingsbuis (oog + huls)"
            aria-pressed={tool === 'hinge'}
            onClick={() => onToolChange('hinge')}
          >
            <span className="tool-icon">⛓</span>
            {expanded && <span>Scharnier</span>}
          </button>
          {planksEnabled && (
            <button
              type="button"
              className={`editor-tool${tool === 'plank' ? ' active' : ''}`}
              title="Steigerplank of plaat plaatsen in een gekozen vlak"
              aria-pressed={tool === 'plank'}
              onClick={() => onToolChange('plank')}
            >
              <span className="tool-icon">▭</span>
              {expanded && <span>Plank</span>}
            </button>
          )}
          <button
            type="button"
            className="editor-tool danger"
            title="Verwijder geselecteerde buis"
            disabled={!canDelete}
            onClick={onDelete}
          >
            <span className="tool-icon">✕</span>
            {expanded && <span>Delete</span>}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="editor-tool-drawer-extra">
          {showPlankPlane && (
            <div className="editor-toolbar-group plank-plane-picker" role="group" aria-label="Plaatsingsvlak">
              <span className="toolbar-label">Vlak</span>
              {PLANK_PLANE_OPTIONS.map((opt) => (
                <button
                  key={opt.plane}
                  type="button"
                  className={`editor-tool compact${plankPlane === opt.plane ? ' active' : ''}`}
                  title={opt.title}
                  aria-pressed={plankPlane === opt.plane}
                  onClick={() => onPlankPlaneChange?.(opt.plane)}
                >
                  <span className="plane-label">{opt.label}</span>
                  <span className="plane-short">{opt.short}</span>
                </button>
              ))}
            </div>
          )}

          {showPlankPlane && <div className="editor-toolbar-divider" />}

          <button
            type="button"
            className="editor-tool subtle"
            title="Vervang de editor-scene door het huidige configurator-model"
            onClick={onReset}
          >
            <span className="tool-icon">↺</span>
            <span>Laden vanuit configurator</span>
          </button>
        </div>
      )}
    </div>
  )
}
