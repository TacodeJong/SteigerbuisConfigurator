import { useMemo, useState } from 'react'
import { DEFAULT_CONFIG } from './data/presets'
import { calculateKlimrekBom } from './lib/bom'
import { resolveBomHighlightIds } from './lib/bomHighlight'
import { buildSceneFromConfig } from './lib/scene'
import { ConfiguratorForm } from './components/ConfiguratorForm'
import { BomList } from './components/BomList'
import { FramePreview3D } from './components/FramePreview3D'
import { SceneEditor } from './components/SceneEditor'
import { SuppliersMenu } from './components/SuppliersMenu'
import type { BomHighlight, KlimrekConfig, SceneModel, ViewMode } from './types'
import './App.css'

function App() {
  const [config, setConfig] = useState<KlimrekConfig>(DEFAULT_CONFIG)
  const [viewMode, setViewMode] = useState<ViewMode>('configurator')
  const [editorScene, setEditorScene] = useState<SceneModel | null>(null)

  const [bomHighlight, setBomHighlight] = useState<BomHighlight | null>(null)

  const previewScene = useMemo(() => buildSceneFromConfig(config), [config])
  const configBom = useMemo(() => calculateKlimrekBom(config), [config])
  const configHighlightIds = useMemo(
    () => resolveBomHighlightIds(previewScene, bomHighlight),
    [previewScene, bomHighlight],
  )

  const activeEditorScene = editorScene ?? previewScene

  const switchMode = (mode: ViewMode) => {
    if (mode === 'editor' && !editorScene) {
      setEditorScene(buildSceneFromConfig(config))
    }
    setViewMode(mode)
  }

  /** Bevestig overschrijven; geeft nieuwe scene terug (null = geannuleerd). Zet zelf niets. */
  const buildEditorSceneFromConfig = (): SceneModel | null => {
    if (
      editorScene !== null &&
      !window.confirm('Huidige editor-scene overschrijven met het configurator-model?')
    ) {
      return null
    }
    return buildSceneFromConfig(config)
  }

  /** Vervang editor-scene door huidige configurator; optioneel naar editor-tab. */
  const loadConfigIntoEditor = (switchToEditor: boolean): boolean => {
    const next = buildEditorSceneFromConfig()
    if (!next) return false
    setEditorScene(next)
    if (switchToEditor) setViewMode('editor')
    return true
  }

  /** Voor editor-toolbar: SceneEditor past toe via history (undo herstelt vorige scene). */
  const resetEditorFromConfig = (): SceneModel | null => buildEditorSceneFromConfig()
  const openConfigInEditor = () => {
    loadConfigIntoEditor(true)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <div>
            <p className="eyebrow">Steigerbuis configurator</p>
            <h1>Klimrek samenstellen</h1>
            <p className="subtitle">
              Stel je tuin-klimrek samen met steigerbuis-onderdelen. Configureer afmetingen, bekijk in
              3D en pas aan in de editor.
            </p>
          </div>
          <div className="header-actions">
            <SuppliersMenu
              variant="dropdown"
              hint="Vergelijk of bestel bij een van deze steigerbuisleveranciers."
            />
            <nav className="view-tabs" aria-label="Weergavemodus">
              <button
                type="button"
                className={viewMode === 'configurator' ? 'active' : ''}
                onClick={() => switchMode('configurator')}
              >
                Configurator
              </button>
              <button
                type="button"
                className={viewMode === 'editor' ? 'active' : ''}
                onClick={() => switchMode('editor')}
              >
                3D Editor
              </button>
            </nav>
          </div>
        </div>
      </header>

      {viewMode === 'configurator' ? (
        <main className="app-main">
          <div className="main-left">
            <ConfiguratorForm config={config} onChange={setConfig} />
          </div>
          <div className="main-center">
            <div className="preview-panel preview-panel-fill">
              <div className="preview-panel-header">
                <h2>3D voorbeeld</h2>
                <button
                  type="button"
                  className="bom-action-btn"
                  onClick={openConfigInEditor}
                  title="Laad dit configurator-model in de 3D-editor"
                >
                  Openen in 3D-editor
                </button>
              </div>
              <FramePreview3D
                scene={previewScene}
                config={config}
                highlightedIds={configHighlightIds}
              />
            </div>
          </div>
          <aside className="main-sidebar">
            <BomList
              bom={configBom}
              config={config}
              scene={previewScene}
              highlight={bomHighlight}
              onHighlightChange={setBomHighlight}
            />
          </aside>
        </main>
      ) : (
        <SceneEditor
          config={config}
          scene={activeEditorScene}
          onSceneChange={setEditorScene}
          onConfigChange={setConfig}
          onResetFromConfig={resetEditorFromConfig}
        />
      )}

      <footer className="app-footer">
        <p>
          Onderdelen en prijzen via een steigerbuisleverancier. Veel leveranciers zagen buizen gratis op
          maat.
        </p>
        <SuppliersMenu variant="dropdown" />
      </footer>
    </div>
  )
}

export default App
