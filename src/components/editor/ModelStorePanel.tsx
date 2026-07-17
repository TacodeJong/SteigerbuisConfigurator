import { useEffect, useRef, useState } from 'react'
import type { KlimrekConfig, SceneModel } from '../../types'
import {
  deleteModel,
  exportModelToFile,
  importModelFromFile,
  listSavedModels,
  saveModel,
  upsertModel,
  type SavedModel,
} from '../../lib/modelStorage'

interface ModelStorePanelProps {
  scene: SceneModel
  config: KlimrekConfig
  onLoad: (model: SavedModel) => void
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ModelStorePanel({ scene, config, onLoad }: ModelStorePanelProps) {
  const [models, setModels] = useState<SavedModel[]>([])
  const [name, setName] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = () => setModels(listSavedModels())

  useEffect(() => {
    refresh()
  }, [])

  const handleSave = () => {
    saveModel(name, scene, config)
    setName('')
    refresh()
  }

  const handleDelete = (id: string) => {
    deleteModel(id)
    refresh()
  }

  const handleOpenFile = async (file: File) => {
    setImportError(null)
    try {
      const model = await importModelFromFile(file)
      upsertModel(model)
      refresh()
      onLoad(model)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Kon bestand niet laden')
    }
  }

  return (
    <section className="editor-panel form-section model-store">
      <h2>Mijn modellen</h2>
      <p className="model-store-intro">
        Modellen worden opgeslagen als bestand op schijf — zo kun je ze in elke browser openen.
      </p>

      <div className="model-save-row">
        <input
          type="text"
          placeholder="Modelnaam…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
          }}
        />
        <button type="button" className="model-save-btn" onClick={handleSave} title="Opslaan en downloaden als .steigerbuis.json">
          Opslaan
        </button>
      </div>

      <div className="model-file-actions">
        <button
          type="button"
          className="model-open-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          Openen van schijf…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.steigerbuis.json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleOpenFile(file)
            e.target.value = ''
          }}
        />
      </div>

      {importError && <p className="model-import-error">{importError}</p>}

      {models.length === 0 ? (
        <p className="model-empty">Nog geen recente modellen in deze browser.</p>
      ) : (
        <>
          <p className="model-recent-label">Recent in deze browser</p>
          <ul className="model-list">
            {models.map((m) => (
              <li key={m.id} className="model-item">
                <div className="model-item-info">
                  <span className="model-item-name">{m.name}</span>
                  <span className="model-item-meta">
                    {m.scene.pipes.length} buizen · {formatDate(m.savedAt)}
                  </span>
                </div>
                <div className="model-item-actions">
                  <button type="button" onClick={() => onLoad(m)}>
                    Laden
                  </button>
                  <button
                    type="button"
                    title="Opnieuw downloaden"
                    onClick={() => exportModelToFile(m)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="model-delete"
                    onClick={() => handleDelete(m.id)}
                    aria-label={`Verwijder ${m.name}`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
