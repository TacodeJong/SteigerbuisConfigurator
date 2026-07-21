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
import { CollapsibleSection } from './CollapsibleSection'

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

/** Vergelijk alleen de vorm-velden van een preset (niet materiaal/omgeving). */
function matchesPresetShape(config: KlimrekConfig, preset: KlimrekConfig): boolean {
  return (
    config.width === preset.width &&
    config.depth === preset.depth &&
    config.height === preset.height &&
    config.rungCount === preset.rungCount &&
    config.includeRoof === preset.includeRoof &&
    config.dimensionMode === preset.dimensionMode
  )
}

export function ConfiguratorForm({ config, onChange }: ConfiguratorFormProps) {
  const update = <K extends keyof KlimrekConfig>(key: K, value: KlimrekConfig[K]) => {
    onChange({ ...config, [key]: value })
  }

  const environment = configEnvironment(config)
  const dimensionMode = configDimensionMode(config)
  const isBuislengte = dimensionMode === 'buislengte'

  const applyPreset = (presetConfig: KlimrekConfig) => {
    const shaped = withEnvironment(presetConfig, environment)
    onChange({
      ...shaped,
      materialId: config.materialId,
      diameter: config.diameter,
      ...(environment === 'buiten'
        ? { baseType: config.baseType, anchorDepthMm: config.anchorDepthMm }
        : {}),
    })
  }

  return (
    <div className="sidebar-panels config-panel">
      <CollapsibleSection title="Omgeving" className="config-panel-section">
        <div className="base-type-row" role="group" aria-label="Omgeving">
          <button
            type="button"
            className={`base-type-btn${environment === 'buiten' ? ' active' : ''}`}
            onClick={() => onChange(withEnvironment(config, 'buiten'))}
          >
            <strong>Buiten</strong>
            <span>Tuin / terras — verankering nodig</span>
          </button>
          <button
            type="button"
            className={`base-type-btn${environment === 'binnen' ? ' active' : ''}`}
            onClick={() => onChange(withEnvironment(config, 'binnen'))}
          >
            <strong>Binnen</strong>
            <span>Op de vloer — voetdoppen</span>
          </button>
        </div>

        {environment === 'binnen' ? (
          <p className="field-hint config-subhint">
            Onderstel: los op kunststof/rubberen voetdoppen (anti-slip). Geen voetplaten of
            grondankers.
          </p>
        ) : (
          <div className="config-subsection">
            <p className="field-label">Verankering</p>
            <div className="base-type-row">
              <button
                type="button"
                className={`base-type-btn${config.baseType === 'voetplaat' ? ' active' : ''}`}
                onClick={() => update('baseType', 'voetplaat')}
              >
                <strong>Voetplaat</strong>
                <span>Ronde plaat op maaiveld</span>
              </button>
              <button
                type="button"
                className={`base-type-btn${config.baseType === 'grondanker' ? ' active' : ''}`}
                onClick={() => update('baseType', 'grondanker')}
              >
                <strong>Grondanker</strong>
                <span>Buis in betonpoer</span>
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
                  Aanbevolen 300–500 mm. De hoekstaander loopt onder maaiveld door.
                </span>
              </label>
            )}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Buis" className="config-panel-section">
        <div className="diameter-row">
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

        <div className="config-subsection">
          <p className="field-label">Materiaal & kleur</p>
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
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Startvorm" className="config-panel-section">
        <div className="preset-grid">
          {KLIMREK_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`preset-card${matchesPresetShape(config, preset.config) ? ' active' : ''}`}
              onClick={() => applyPreset(preset.config)}
            >
              <strong>{preset.name}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Afmetingen" className="config-panel-section">
        <div className="base-type-row dimension-mode-row" role="group" aria-label="Maatvoering">
          <button
            type="button"
            className={`base-type-btn${dimensionMode === 'buitenmaat' ? ' active' : ''}`}
            onClick={() => onChange(withDimensionMode(config, 'buitenmaat'))}
          >
            <strong>Buitenmaat leidend</strong>
            <span>Velden = gewenste buitenmaat</span>
          </button>
          <button
            type="button"
            className={`base-type-btn${dimensionMode === 'buislengte' ? ' active' : ''}`}
            onClick={() => onChange(withDimensionMode(config, 'buislengte'))}
          >
            <strong>Buislengte leidend</strong>
            <span>Velden = bestelbare lengte</span>
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
                : 'Hoogte van de constructie boven maaiveld.'}
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
          Dakvlak / bovenste platform
        </label>
      </CollapsibleSection>
    </div>
  )
}
