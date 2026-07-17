import type { EditorTool, MaterialId } from '../../types'
import { MATERIALS } from '../../data/catalog'

interface EditorToolbarProps {
  tool: EditorTool
  materialId: MaterialId
  canDelete: boolean
  onToolChange: (tool: EditorTool) => void
  onMaterialChange: (id: MaterialId) => void
  onDelete: () => void
  onReset: () => void
}

export function EditorToolbar({
  tool,
  materialId,
  canDelete,
  onToolChange,
  onMaterialChange,
  onDelete,
  onReset,
}: EditorToolbarProps) {
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Editor gereedschap">
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
          className="editor-tool danger"
          title="Verwijder geselecteerde buis"
          disabled={!canDelete}
          onClick={onDelete}
        >
          <span className="tool-icon">✕</span>
          <span>Delete</span>
        </button>
      </div>

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

      <button type="button" className="editor-tool subtle" title="Reset vanuit configurator" onClick={onReset}>
        <span className="tool-icon">↺</span>
        <span>Reset</span>
      </button>
    </div>
  )
}
