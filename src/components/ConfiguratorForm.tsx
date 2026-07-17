import type { DimensionMode, KlimrekConfig } from '../types'
import { MATERIALS, PIPE_DIAMETERS } from '../data/catalog'
import { KLIMREK_PRESETS } from '../data/presets'
import { configEnvironment, withEnvironment } from '../lib/environment'
import {
  barLengthFromAxisMm,
  configDimensionMode,
  outerFromBarLengthMm,
  withDimensionMode,
} from '../lib/dimensions'
import { formatMm } from '../lib/bom'

interface ConfiguratorFormProps {
  config: KlimrekConfig
  onChange: (config: KlimrekConfig) => void
}

function axisHint(
  axisMm: number,
  diameterMm: number,
  mode: DimensionMode,
): string {
  const bar = barLengthFromAxisMm(axisMm, mode)
  const outer = outerFromBarLengthMm(bar, diameterMm)
  if (mode === 'buitenmaat') {
    return `Bestelbare liggerlengte: ${formatMm(bar)}`
  }
  return `Resulterende buitenmaat / gat-middenafstand ≈ ${formatMm(outer)} (buislengte + Ø)`
}

export function ConfiguratorForm({ config, onChange }: ConfiguratorFormProps) {
  const update = <K extends keyof KlimrekConfig>(key: K, value: KlimrekConfig[K]) => {
    onChange({ ...config, [key]: value })
  }

  const environment = configEnvironment(config)
  const dimensionMode = configDimensionMode(config)
  const isBuislengte = dimensionMode === 'buislengte'

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
        <div className="base-type-row dimension-mode-row" role="group" aria-label="Maatvoering">
          <button
            type="button"
            className={`base-type-btn${dimensionMode === 'buitenmaat' ? ' active' : ''}`}
            onClick={() => onChange(withDimensionMode(config, 'buitenmaat'))}
          >
            <strong>Buitenmaat leidend</strong>
            <span>Velden = gewenste buitenmaat; buislengte volgt</span>
          </button>
          <button
            type="button"
            className={`base-type-btn${dimensionMode === 'buislengte' ? ' active' : ''}`}
            onClick={() => onChange(withDimensionMode(config, 'buislengte'))}
          >
            <strong>Buislengte leidend</strong>
            <span>Velden = bestelbare lengte; footprint groeit met Ø</span>
          </button>
        </div>
        <p className="field-hint dimension-mode-intro">
          {isBuislengte
            ? 'Breedte en diepte zijn bestelbare buislengtes. Bij een grotere diameter wordt de constructie en footprint groter; de bestellengtes blijven gelijk.'
            : 'Breedte en diepte zijn de gewenste buitenmaten. Bestelbare liggerlengtes worden daaruit afgeleid (buitenmaat − 2×50 mm inset).'}
        </p>
        <div className="field-grid">
          <label>
            {isBuislengte ? 'Breedte — buislengte (mm)' : 'Breedte — buitenmaat (mm)'}
            <input
              type="number"
              min={isBuislengte ? 700 : 800}
              max={5000}
              step={100}
              value={config.width}
              onChange={(e) => update('width', Number(e.target.value))}
            />
            <span className="field-hint">{axisHint(config.width, config.diameter, dimensionMode)}</span>
          </label>
          <label>
            {isBuislengte ? 'Diepte — buislengte (mm)' : 'Diepte — buitenmaat (mm)'}
            <input
              type="number"
              min={isBuislengte ? 700 : 800}
              max={5000}
              step={100}
              value={config.depth}
              onChange={(e) => update('depth', Number(e.target.value))}
            />
            <span className="field-hint">{axisHint(config.depth, config.diameter, dimensionMode)}</span>
          </label>
          <label>
            {isBuislengte ? 'Hoogte — staanderlengte (mm)' : 'Hoogte (mm)'}
            <input
              type="number"
              min={1000}
              max={3500}
              step={100}
              value={config.height}
              onChange={(e) => update('height', Number(e.target.value))}
            />
            <span className="field-hint">
              {isBuislengte
                ? 'Lengte van de hoekstaander boven maaiveld (excl. eventueel grondanker).'
                : 'Hoogte van het rek boven maaiveld.'}
            </span>
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
        <h2>Omgeving</h2>
        <div className="base-type-row">
          <button
            type="button"
            className={`base-type-btn${environment === 'buiten' ? ' active' : ''}`}
            onClick={() => onChange(withEnvironment(config, 'buiten'))}
          >
            <strong>Buiten</strong>
            <span>In de tuin — verankerd met voetplaten of grondankers</span>
          </button>
          <button
            type="button"
            className={`base-type-btn${environment === 'binnen' ? ' active' : ''}`}
            onClick={() => onChange(withEnvironment(config, 'binnen'))}
          >
            <strong>Binnen</strong>
            <span>Los op de vloer op rubberen voetdoppen</span>
          </button>
        </div>
      </section>

      {environment === 'binnen' ? (
        <section className="form-section">
          <h2>Onderstel</h2>
          <p className="field-hint">
            Binnenopstelling: het rek staat los op de vloer op kunststof/rubberen voetdoppen (anti-slip).
            Geen voetplaten of grondankers nodig.
          </p>
        </section>
      ) : (
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
      )}

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
          {isBuislengte && (
            <span className="field-hint diameter-mode-hint">
              Diameter wijzigen houdt de buislengtes vast; footprint en gatafstand schalen mee.
            </span>
          )}
        </div>
      </section>
    </div>
  )
}
