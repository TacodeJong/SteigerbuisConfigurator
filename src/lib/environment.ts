import type { KlimrekConfig, KlimrekEnvironment } from '../types'

/**
 * Omgeving van een config, ook voor oude opgeslagen configs zonder het
 * `environment`-veld (die zijn altijd buiten, tenzij baseType al 'vloerdop' is).
 */
export function configEnvironment(
  config: Pick<KlimrekConfig, 'environment' | 'baseType'>,
): KlimrekEnvironment {
  if (config.environment) return config.environment
  return config.baseType === 'vloerdop' ? 'binnen' : 'buiten'
}

export function isIndoor(config: Pick<KlimrekConfig, 'environment' | 'baseType'>): boolean {
  return configEnvironment(config) === 'binnen'
}

/**
 * Wissel van omgeving en houd baseType consistent:
 * binnen ⇒ 'vloerdop' (los op de vloer op voetdoppen);
 * buiten ⇒ terug naar 'voetplaat' (of behoud bestaand buiten-onderstel).
 */
export function withEnvironment(config: KlimrekConfig, environment: KlimrekEnvironment): KlimrekConfig {
  if (environment === 'binnen') {
    return { ...config, environment, baseType: 'vloerdop' }
  }
  return {
    ...config,
    environment,
    baseType: config.baseType === 'vloerdop' ? 'voetplaat' : config.baseType,
  }
}

/** Normaliseer geladen configs: vul `environment` in en repareer inconsistente combinaties. */
export function normalizeConfigEnvironment(config: KlimrekConfig): KlimrekConfig {
  const environment = configEnvironment(config)
  if (environment === 'binnen' && config.baseType !== 'vloerdop') {
    return { ...config, environment, baseType: 'vloerdop' }
  }
  if (config.environment !== environment) {
    return { ...config, environment }
  }
  return config
}

/** Vul ontbrekende `dimensionMode` (oude configs → buitenmaat). */
export function normalizeConfigDimensionMode(config: KlimrekConfig): KlimrekConfig {
  if (config.dimensionMode === 'buitenmaat' || config.dimensionMode === 'buislengte') {
    return config
  }
  return { ...config, dimensionMode: 'buitenmaat' }
}

/** Volledige normalisatie voor geladen/opgeslagen configs. */
export function normalizeConfig(config: KlimrekConfig): KlimrekConfig {
  return normalizeConfigDimensionMode(normalizeConfigEnvironment(config))
}
