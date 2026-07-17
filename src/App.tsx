import { useMemo, useState } from 'react'
import { DEFAULT_CONFIG } from './data/presets'
import { calculateKlimrekBom } from './lib/bom'
import { resolveBomHighlightIds } from './lib/bomHighlight'
import { buildSceneFromConfig } from './lib/scene'
import { ConfiguratorForm } from './components/ConfiguratorForm'
import { BomList } from './components/BomList'
import { FramePreview3D } from './components/FramePreview3D'
import { SceneEditor } from './components/SceneEditor'
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

  const resetEditorFromConfig = () => {
    setEditorScene(buildSceneFromConfig(config))
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <div>
            <p className="eyebrow">Steigerbuis configurator</p>
            <h1>Klimrek samenstellen</h1>
            <p className="subtitle">
              Stel je tuin-klimrek samen met onderdelen van{' '}
              <a href="https://www.steigerbuisgroothandel.nl/" target="_blank" rel="noopener noreferrer">
                Steigerbuisgroothandel.nl
              </a>
              . Configureer afmetingen, bekijk in 3D en pas aan in de editor.
            </p>
          </div>
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
      </header>

      {viewMode === 'configurator' ? (
        <main className="app-main">
          <div className="main-left">
            <ConfiguratorForm config={config} onChange={setConfig} />
          </div>
          <div className="main-center">
            <div className="preview-panel preview-panel-fill">
              <h2>3D voorbeeld</h2>
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
          Onderdelen en prijzen vind je op{' '}
          <a href="https://www.steigerbuisgroothandel.nl/" target="_blank" rel="noopener noreferrer">
            steigerbuisgroothandel.nl
          </a>
          . Buizen worden gratis op maat gezaagd.
        </p>
      </footer>
    </div>
  )
}

export default App
