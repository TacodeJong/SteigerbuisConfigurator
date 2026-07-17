import type { EditorTool, MaterialId } from '../../types'
import type { PlankPlane } from '../../lib/planks'
import { MATERIALS } from '../../data/catalog'

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
  materialId: MaterialId
  canDelete: boolean
  canUndo?: boolean
  canRedo?: boolean
  plankPlane?: PlankPlane
  onToolChange: (tool: EditorTool) => void
  onMaterialChange: (id: MaterialId) => void
  onPlankPlaneChange?: (plane: PlankPlane) => void
  onUndo?: () => void
  onRedo?: () => void
  onDelete: () => void
  onReset: () => void
}

export function EditorToolbar({
  tool,
  materialId,
  canDelete,
  canUndo = false,
  canRedo = false,
  plankPlane = 'xz',
  onToolChange,
  onMaterialChange,
  onPlankPlaneChange,
  onUndo,
  onRedo,
  onDelete,
  onReset,
}: EditorToolbarProps) {
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  const mod = isMac ? '⌘' : 'Ctrl+'
  const undoTitle = `Ongedaan maken (${mod}Z)`
  const redoTitle = `Opnieuw uitvoeren (${isMac ? '⌘⇧Z' : 'Ctrl+Y / Ctrl+Shift+Z'})`

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Editor gereedschap">
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
          <span>Ongedaan</span>
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
          <span>Opnieuw</span>
        </button>
      </div>

      <div className="editor-toolbar-divider" />

      <div className="editor-toolbar-group">
        <button
          type="button"
          className={`editor-tool${tool === 'select' ? ' active' : ''}`}
          title="Selecteren"
          onClick={() => onToolChange('select')}
        >
          <span className="tool-icon">↖</span>
          <span>Select</span>
        </button>
        <button
          type="button"
          className={`editor-tool${tool === 'draw' ? ' active' : ''}`}
          title="Buis tekenen"
          onClick={() => onToolChange('draw')}
        >
          <span className="tool-icon">✎</span>
          <span>Teken</span>
        </button>
        <button
          type="button"
          className={`editor-tool${tool === 'move' ? ' active' : ''}`}
          title="Buis verplaatsen (sleep; blijft verbonden)"
          onClick={() => onToolChange('move')}
        >
          <span className="tool-icon">✥</span>
          <span>Verplaats</span>
        </button>
        <button
          type="button"
          className={`editor-tool${tool === 'pan' ? ' active' : ''}`}
          title="Pannen (slepen om te verschuiven)"
          onClick={() => onToolChange('pan')}
        >
          <span className="tool-icon">✋</span>
          <span>Hand</span>
        </button>
        <button
          type="button"
          className={`editor-tool${tool === 'hinge' ? ' active' : ''}`}
          title="Schuine verbindingsbuis (oog + huls)"
          onClick={() => onToolChange('hinge')}
        >
          <span className="tool-icon">⛓</span>
          <span>Scharnier</span>
        </button>
        <button
          type="button"
          className={`editor-tool${tool === 'plank' ? ' active' : ''}`}
          title="Steigerplank of plaat plaatsen in een gekozen vlak"
          onClick={() => onToolChange('plank')}
        >
          <span className="tool-icon">▭</span>
          <span>Plank</span>
        </button>
        <button
          type="button"
          className="editor-tool danger"
          title="Verwijder geselecteerde buis"
          disabled={!canDelete}
          onClick={onDelete}
        >
          <span className="tool-icon">✕</span>
          <span>Delete</span>
        </button>
      </div>

      {tool === 'plank' && onPlankPlaneChange && (
        <>
          <div className="editor-toolbar-divider" />
          <div className="editor-toolbar-group plank-plane-picker" role="group" aria-label="Plaatsingsvlak">
            <span className="toolbar-label">Vlak</span>
            {PLANK_PLANE_OPTIONS.map((opt) => (
              <button
                key={opt.plane}
                type="button"
                className={`editor-tool compact${plankPlane === opt.plane ? ' active' : ''}`}
                title={opt.title}
                aria-pressed={plankPlane === opt.plane}
                onClick={() => onPlankPlaneChange(opt.plane)}
              >
                <span className="plane-label">{opt.label}</span>
                <span className="plane-short">{opt.short}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="editor-toolbar-divider" />

      <div className="editor-toolbar-group material-picker">
        <span className="toolbar-label">Kleur</span>
        {MATERIALS.filter((m) => m.outdoor || m.id === materialId).map((m) => (
          <button
            key={m.id}
            type="button"
            className={`material-swatch-btn${materialId === m.id ? ' active' : ''}`}
            title={m.name}
            onClick={() => onMaterialChange(m.id)}
          >
            <span className="swatch" style={{ background: m.color }} />
          </button>
        ))}
      </div>

      <div className="editor-toolbar-divider" />

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
  )
}
