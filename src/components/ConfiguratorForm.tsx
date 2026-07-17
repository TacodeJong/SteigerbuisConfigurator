import type { KlimrekConfig } from '../types'
import { MATERIALS, PIPE_DIAMETERS } from '../data/catalog'
import { KLIMREK_PRESETS } from '../data/presets'

interface ConfiguratorFormProps {
  config: KlimrekConfig
  onChange: (config: KlimrekConfig) => void
}

export function ConfiguratorForm({ config, onChange }: ConfiguratorFormProps) {
  const update = <K extends keyof KlimrekConfig>(key: K, value: KlimrekConfig[K]) => {
    onChange({ ...config, [key]: value })
  }

  return (
    <div className="config-form">
      <section className="form-section">
        <h2>Startpunt</h2>
        <div className="preset-grid">
          {KLIMREK_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`preset-card${
                JSON.stringify(preset.config) === JSON.stringify(config) ? ' active' : ''
              }`}
              onClick={() => onChange(preset.config)}
            >
              <strong>{preset.name}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="form-section">
        <h2>Afmetingen</h2>
        <div className="field-grid">
          <label>
            Breedte (mm)
            <input
              type="number"
              min={800}
              max={5000}
              step={100}
              value={config.width}
              onChange={(e) => update('width', Number(e.target.value))}
            />
          </label>
          <label>
            Diepte (mm)
            <input
              type="number"
              min={800}
              max={5000}
              step={100}
              value={config.depth}
              onChange={(e) => update('depth', Number(e.target.value))}
            />
          </label>
          <label>
            Hoogte (mm)
            <input
              type="number"
              min={1000}
              max={3500}
              step={100}
              value={config.height}
              onChange={(e) => update('height', Number(e.target.value))}
            />
          </label>
          <label>
            Aantal horizontale lagen
            <input
              type="number"
              min={2}
              max={8}
              value={config.rungCount}
              onChange={(e) => update('rungCount', Number(e.target.value))}
            />
          </label>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={config.includeRoof}
            onChange={(e) => update('includeRoof', e.target.checked)}
          />
          Dakvlak / speelplatform bovenop
        </label>
      </section>

      <section className="form-section">
        <h2>Verankering</h2>
        <div className="base-type-row">
          <button
            type="button"
            className={`base-type-btn${config.baseType === 'voetplaat' ? ' active' : ''}`}
            onClick={() => update('baseType', 'voetplaat')}
          >
            <strong>Voetplaat</strong>
            <span>Ronde plaat op maaiveld, geschroefd of gelast</span>
          </button>
          <button
            type="button"
            className={`base-type-btn${config.baseType === 'grondanker' ? ' active' : ''}`}
            onClick={() => update('baseType', 'grondanker')}
          >
            <strong>Grondanker</strong>
            <span>Buisdeel in beton — geen voetplaat nodig</span>
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
              onChange={(e) => update('anchorDepthMm', Number(e.target.value))}
            />
            <span className="field-hint">
              Aanbevolen 300–500 mm voor tuin-klimrekken. De hoekstaander loopt dit stuk onder maaiveld door
              en wordt in een betonpoer gegoten.
            </span>
          </label>
        )}
      </section>

      <section className="form-section">
        <h2>Materiaal & diameter</h2>
        <div className="material-grid">
          {MATERIALS.map((material) => (
            <button
              key={material.id}
              type="button"
              className={`material-card${config.materialId === material.id ? ' active' : ''}`}
              onClick={() => update('materialId', material.id)}
            >
              <span className="swatch" style={{ background: material.color }} />
              <span className="material-info">
                <strong>{material.name}</strong>
                <span>{material.description}</span>
              </span>
              {material.outdoor && <span className="badge">Buiten</span>}
            </button>
          ))}
        </div>

        <div className="diameter-row">
          <span className="field-label">Buisdiameter</span>
          <div className="diameter-options">
            {PIPE_DIAMETERS.map((d) => (
              <button
                key={d.value}
                type="button"
                className={`diameter-btn${config.diameter === d.value ? ' active' : ''}`}
                onClick={() => update('diameter', d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
