import type { DimensionMode, KlimrekConfig } from '../types'
import { orderedBarLengthMm, POST_INSET_MM } from './scene'

export function configDimensionMode(
  config: Pick<KlimrekConfig, 'dimensionMode'>,
): DimensionMode {
  return config.dimensionMode ?? 'buitenmaat'
}

/**
 * Bestelbare liggerlengte voor een as (breedte of diepte), afhankelijk van
 * of config.width/depth de buitenmaat of de buislengte is.
 */
export function barLengthFromAxisMm(axisMm: number, mode: DimensionMode): number {
  return mode === 'buislengte' ? axisMm : orderedBarLengthMm(axisMm)
}

export function barLengthFromConfig(
  config: Pick<KlimrekConfig, 'width' | 'depth' | 'dimensionMode'>,
  axis: 'width' | 'depth',
): number {
  return barLengthFromAxisMm(config[axis], configDimensionMode(config))
}

/**
 * Resulterende buitenmaat / gat-middenafstand ≈ bestelbare buislengte + Ø
 * (centerline-scene + diameter-correctie, zelfde als plattegrond).
 */
export function outerFromBarLengthMm(barLengthMm: number, diameterMm: number): number {
  return Math.round((barLengthMm + diameterMm) * 10) / 10
}

/** Config-buitenmaat ↔ buislengte (zelfde constructie bij modeswitch). */
export function buitenmaatFromBarLengthMm(barLengthMm: number): number {
  return barLengthMm + POST_INSET_MM * 2
}

export function convertAxisForDimensionMode(
  axisMm: number,
  from: DimensionMode,
  to: DimensionMode,
): number {
  if (from === to) return axisMm
  if (from === 'buitenmaat' && to === 'buislengte') return orderedBarLengthMm(axisMm)
  return buitenmaatFromBarLengthMm(axisMm)
}

/** Wissel van maatmodus; rekent Breedte/Diepte om zodat de constructie gelijk blijft. */
export function withDimensionMode(
  config: KlimrekConfig,
  dimensionMode: DimensionMode,
): KlimrekConfig {
  const from = configDimensionMode(config)
  if (from === dimensionMode) {
    return config.dimensionMode === dimensionMode ? config : { ...config, dimensionMode }
  }
  return {
    ...config,
    dimensionMode,
    width: convertAxisForDimensionMode(config.width, from, dimensionMode),
    depth: convertAxisForDimensionMode(config.depth, from, dimensionMode),
  }
}
